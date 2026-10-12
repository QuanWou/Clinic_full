import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
assert.ok(process.argv.includes('--live-qa'),'Use --live-qa to create and cancel one local test appointment');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'.runtime/main/config.json'),'utf8').replace(/^\uFEFF/,''));
const out=path.join(root,'.runtime/main/ui-audit-2026-10-08');
const run=randomUUID(),tokens={},profiles={};
const report={status:'RUNNING',checkedAt:new Date().toISOString(),checks:[],realMoneyTransferred:false};
let booking,winner;
async function api(module,route,role,method='GET',body,key,status=200){
 const response=await fetch(`http://127.0.0.1:${cfg.ports.gateway}/s1/${module}${route}`,{method,signal:AbortSignal.timeout(20000),headers:{...(tokens[role]?{Authorization:`Bearer ${tokens[role]}`}:{ }),...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();
 if(status!==null)assert.equal(response.status,status,`${module} ${method} ${route}: ${data.detail??data.message??data.reason??''}`);
 return {status:response.status,data};
}
const check=name=>report.checks.push(name);
const owned=role=>({clinicId:cfg.clinic,patientId:profiles[role].patientId});
const reason='Kiểm thử luồng đặt lịch ngày 08/10/2026';
try{
 for(const [role,email] of [['a','benhnhan1@gmail.com'],['b','benhnhan2@gmail.com']]){
  tokens[role]=(await api('auth','/api/auth/login',role,'POST',{email,password:cfg.accounts.patient.password})).data.data.accessToken;
  profiles[role]=(await api('patient','/api/me/patient-profile',role)).data;
 }
 const options=(await api('appointment',`/api/public/booking-options?clinicId=${cfg.clinic}&branchId=${cfg.branch}`)).data;
 const doctor=options.doctors.find(d=>d.schedules.length);
 assert.ok(doctor,'At least one bookable doctor is required');
 const offering=options.offerings.find(o=>o.specialtyCode===doctor.specialtyCode);
 assert.ok(offering,'A matching service is required');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
 let date;
 for(let offset=1;offset<=14;offset++){
  const day=new Date(today+'T00:00:00Z');day.setUTCDate(day.getUTCDate()+offset);const value=day.toISOString().slice(0,10),weekday=day.getUTCDay()||7;
  if(doctor.schedules.some(s=>s.dayOfWeek===weekday&&s.effectiveFrom<=value&&(!s.effectiveUntil||s.effectiveUntil>=value))){date=value;break;}
 }
 assert.ok(date,'A future scheduled day is required');
 const query=new URLSearchParams({clinicId:cfg.clinic,branchId:cfg.branch,doctorId:doctor.doctorId,offeringId:offering.offeringId,date});
 const slots=(await api('appointment','/api/public/availability?'+query)).data;
 assert.ok(slots.length>=2,'Two available slots are required for the reschedule test');
 const holdInput=role=>({...owned(role),branchId:cfg.branch,doctorId:doctor.doctorId,offeringId:offering.offeringId,slotId:slots[0].slotId});
 const raced=await Promise.all(['a','b'].map(role=>api('appointment','/api/appointments/holds',role,'POST',holdInput(role),`${run}-${role}`,null)));
 assert.deepEqual(raced.map(r=>r.status).sort(),[201,409]);winner=raced[0].status===201?'a':'b';const loser=winner==='a'?'b':'a';
 check('Two patient accounts compete through Gateway; exactly one holds the last place');
 const hold=raced[winner==='a'?0:1].data;
 assert.equal((await api('appointment','/api/appointments/holds',winner,'POST',holdInput(winner),`${run}-${winner}`,201)).data.holdId,hold.holdId);
 check('Replaying the hold key returns the same reservation');
 const confirm={...owned(winner),holdId:hold.holdId};
 booking=(await api('appointment','/api/appointments',winner,'POST',confirm,`${run}-confirm`,201)).data;
 assert.equal((await api('appointment','/api/appointments',winner,'POST',confirm,`${run}-confirm`,201)).data.id,booking.id);
 check('Confirmation replay creates one appointment');
 await api('appointment',`/api/me/appointments?clinicId=${cfg.clinic}&patientId=${profiles[winner].patientId}`,loser,'GET',undefined,undefined,403);
 await api('appointment',`/api/appointments/${booking.id}/cancel`,loser,'POST',{...owned(winner),reason},undefined,403);
 check('Changing patient IDs does not let another account list or cancel the appointment');
 const moved=(await api('appointment',`/api/appointments/${booking.id}/reschedule-holds`,winner,'POST',{...holdInput(winner),slotId:slots[1].slotId},`${run}-move-hold`,201)).data;
 const moveInput={...owned(winner),newHoldId:moved.holdId,reason,correlationId:`${run}-move`};
 booking=(await api('appointment',`/api/appointments/${booking.id}/reschedule`,winner,'POST',moveInput)).data;
 assert.equal(booking.slotId,slots[1].slotId);
 assert.equal((await api('appointment',`/api/appointments/${booking.id}/reschedule`,winner,'POST',moveInput)).data.id,booking.id);
 check('Reschedule consumes the new hold and repeated submission retains one appointment');
 const cancellation={...owned(winner),reason,correlationId:`${run}-cancel`};
 booking=(await api('appointment',`/api/appointments/${booking.id}/cancel`,winner,'POST',cancellation)).data;
 assert.equal(booking.status,'CANCELLED');
 assert.equal((await api('appointment',`/api/appointments/${booking.id}/cancel`,winner,'POST',cancellation)).data.id,booking.id);
 const reopened=(await api('appointment','/api/public/availability?'+query)).data;
 assert.ok([slots[0].slotId,slots[1].slotId].every(id=>reopened.some(s=>s.slotId===id&&s.remaining===1)));
 check('Cancel replay is stable and both original and replacement places become available');
 report.status='PASS';report.appointmentId=booking.id;
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}
finally{
 if(booking&&winner&&booking.status==='CONFIRMED'){
  try{booking=(await api('appointment',`/api/appointments/${booking.id}/cancel`,winner,'POST',{...owned(winner),reason:'Kết thúc kiểm thử đặt lịch',correlationId:`${run}-cleanup`})).data;report.cleanup=booking.status;}catch{report.cleanup='REQUIRES_REVIEW';}
 }
 fs.writeFileSync(path.join(out,'booking-live-summary.json'),JSON.stringify(report,null,2));
 console.log(`${report.status}: ${report.checks.length} booking workflow checks${report.error?'; '+report.error:''}`);
}
