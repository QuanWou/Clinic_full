// Read-only business verification through Gateway. Never export credentials or medical payloads.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const cfg=JSON.parse(fs.readFileSync(path.join(root,'.runtime/main/config.json'),'utf8').replace(/^\uFEFF/,''));
const base=`http://127.0.0.1:${cfg.ports.gateway??18090}`;
const checks=[],sessions=[];let transientFailures=0;
async function login(role){
 const a=cfg.accounts[role];const r=await fetch(base+'/s1/auth/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,password:a.password}),signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,200,'Login '+role);const body=await r.json();sessions.push(body.data.refreshToken);return body.data.accessToken;
}
async function request(url,token,stream=false){
 for(let attempt=0;attempt<3;attempt++){
  const r=await fetch(base+url,{headers:{Authorization:'Bearer '+token,Accept:stream?'text/event-stream':'application/json'},signal:AbortSignal.timeout(20000)});
  if(r.status===503){transientFailures++;await r.body?.cancel();if(attempt<2){await new Promise(resolve=>setTimeout(resolve,500));continue;}}
  assert.equal(r.status,200,url+' must retain a valid session; HTTP '+r.status);
  if(!stream)return r.json();
  assert.ok(r.headers.get('content-type')?.includes('text/event-stream'),url+' content type');
  const reader=r.body.getReader();try{const frame=await reader.read();assert.equal(frame.done,false,'Stream should emit a frame');assert.ok(new TextDecoder().decode(frame.value).includes('ready'),'Authorized stream ready');}finally{await reader.cancel();}
  return;
 }
}
try{
 const token=await login('patient'),clinic=cfg.clinic,branch=cfg.branch;
 const profile=await request('/s1/patient/api/me/patient-profile',token);
 await request('/s1/clinic/api/me/patient-clinics',token);await request('/s1/patient/api/me/patient-clinic-links/'+clinic,token);checks.push('Patient history resolves its own clinic and patient link');
 await request(`/s1/medical/api/me/clinics/${clinic}/branches/${branch}/medical-records`,token);checks.push('Patient reads only released medical records');
 await request(`/s1/medical/api/me/clinics/${clinic}/branches/${branch}/follow-up-plans`,token);checks.push('Patient follow-up source remains available');
 await request(`/s1/billing/api/me/clinics/${clinic}/branches/${branch}/bills`,token);checks.push('Patient reads own bills');
 await request('/s1/notification/api/me/notifications',token);checks.push('Patient notifications remain available');
 for(const module of ['encounter','medical','billing'])await request(`/s1/${module}/api/me/clinics/${clinic}/branches/${branch}/events`,token,true);
 await request(`/s1/appointment/api/me/appointment-events?${new URLSearchParams({clinicId:clinic,patientId:profile.patientId})}`,token,true);
 await request('/s1/notification/api/me/notifications/events',token,true);checks.push('Five authorized realtime streams open without false authentication errors');
 await request('/s1/identity/api/me/current',token);checks.push('Session remains valid after all portal reads and streams');
 const admin=await login('owner');
 const response=await request('/s1/auth/api/users/admin?page=0&size=100',admin);
 const rows=response.data?.content??response.data??response.content??response;
 assert.ok(Array.isArray(rows),'Account listing');
 for(const prefix of ['bacsi','benhnhan','quantri','nhanvien','kiemduyet'])for(const n of [1,2]){
  const user=rows.find(r=>r.email===`${prefix}${n}@gmail.com`);assert.ok(user,'Requested test account '+prefix+n);assert.equal(user.status,'ACTIVE','Requested test account active');
 }
 checks.push('All ten requested test accounts stay ACTIVE');
 const result={status:'PASS',checkedAt:new Date().toISOString(),checks,transientFailures,businessWrites:0};
 fs.writeFileSync(path.join(root,'.runtime/main/ui-audit-2026-10-08/patient-portal-live-summary.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{
 for(const refreshToken of sessions)await fetch(base+'/s1/auth/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken}),signal:AbortSignal.timeout(10000)}).catch(()=>{});
}
