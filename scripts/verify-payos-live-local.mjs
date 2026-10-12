import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHmac,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

assert.ok(process.argv.includes('--create-unpaid-link'),'Pass --create-unpaid-link to test a link without transferring money.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime=path.join(root,'.runtime/main');
const cfg=JSON.parse(fs.readFileSync(path.join(runtime,'config.json'),'utf8').replace(/^\uFEFF/,''));
const testPassword=process.env.CLINIC_TEST_PASSWORD??cfg.demoPassword??cfg.accounts?.reception?.password;
assert.ok(testPassword,'Set CLINIC_TEST_PASSWORD or configure a local test account password.');
const statePath=path.join(runtime,'payos-live-state.json');
const reportPath=path.join(runtime,'payos-live-verification.json');
const state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{checks:[]};
const phase=process.argv[process.argv.indexOf('--phase')+1];
assert.ok(['create','check','cancel'].includes(phase),'Use --phase create, check or cancel.');
const origin=`http://127.0.0.1:${cfg.ports.gateway}`;
const billBase=`/s1/billing/api/clinics/${cfg.clinic}/branches/${cfg.branch}/bills`;
const save=()=>fs.writeFileSync(statePath,JSON.stringify(state,null,2));
const check=name=>{if(!state.checks.includes(name))state.checks.push(name);save();console.log('PASS: '+name);};
async function request(route,{token,method='GET',body,key,status=200}={}){
 const r=await fetch(origin+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,status,`Unexpected HTTP at ${route.split('?')[0]}`);return r.json();
}
async function login(email){const v=await request('/s1/auth/api/auth/login',{method:'POST',body:{email,password:testPassword}});return v.data.accessToken;}
const token=await login('nhanvien1@gmail.com');
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const signature=data=>createHmac('sha256',cfg.payments.PAYOS_CHECKSUM_KEY).update(Object.keys(data).sort().map(k=>{
 const v=data[k];return k+'='+(v==null||['null','undefined'].includes(v)?'':typeof v==='object'?JSON.stringify(sorted(v)):String(v));
}).join('&')).digest('hex');
async function cancelProvider(){
 if(!state.orderCode||state.providerCancelled)return;
 const r=await fetch(cfg.payments.PAYOS_BASE_URL+`/v2/payment-requests/${state.orderCode}/cancel`,{method:'POST',headers:{'Content-Type':'application/json','x-client-id':cfg.payments.PAYOS_CLIENT_ID,'x-api-key':cfg.payments.PAYOS_API_KEY},body:JSON.stringify({cancellationReason:'Kiem tra tich hop - khong thu tien'}),signal:AbortSignal.timeout(15000)});
 const proof=await r.json();assert.equal(proof.code,'00','Provider cancellation failed');assert.equal(proof.signature,signature(proof.data),'Invalid provider cancellation signature');assert.equal(proof.data.status,'CANCELLED');
 state.providerCancelled=true;save();
}
try{
 if(phase==='create'){
  assert.ok(!state.cancelled,'This recorded live run is already complete.');
  if(!state.bill){
   const bills=await request(billBase,{token});
   for(const b of bills.filter(b=>b.remainingVnd>0).sort((a,b)=>a.remainingVnd-b.remainingVnd)){
    const intents=await request(`${billBase}/${b.id}/online-payments`,{token});
    if(intents.some(i=>['CREATING','PENDING','REVIEW_REQUIRED'].includes(i.status)))continue;
    state.bill={id:b.id,version:b.version,remainingVnd:b.remainingVnd,paidVnd:b.paidVnd};
    state.receiptsBefore=(await request(`${billBase}/${b.id}/payments`,{token})).length;state.key='payos-integration-'+randomUUID();save();break;
   }
  }
  assert.ok(state.bill,'No unreserved invoice is available for an unpaid-link test.');
  const methods=await request(`${billBase}/${state.bill.id}/payment-methods`,{token});
  assert.ok(methods.find(m=>m.code==='PAYOS')?.available);assert.ok(!methods.some(m=>m.code==='VNPAY'));check('PayOS enabled; VNPAY absent from payment choices');
  const input={method:'PAYOS',expectedVersion:state.bill.version};
  if(!state.launch){state.launch=await request(`${billBase}/${state.bill.id}/payment-display`,{token,method:'POST',body:input,key:state.key});save();}
  assert.equal(state.launch.status,'PENDING','The backend did not receive a verified usable payOS link');
  const intents=await request(`${billBase}/${state.bill.id}/online-payments`,{token});state.intentId=intents.find(i=>i.provider==='PAYOS'&&i.status==='PENDING')?.id;assert.ok(state.intentId);
  const sql=`select provider_order_code from billing_v2.payment_intents where id='${state.intentId}' and clinic_id='${cfg.clinic}' and branch_id='${cfg.branch}';`;
  state.orderCode=execFileSync(cfg.psqlPath,['-X','-w','-h',cfg.databaseHost,'-p',String(cfg.databasePort),'-U',cfg.databaseUser,'-d',cfg.databaseName,'-At','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGPASSWORD:cfg.databasePassword},input:sql,encoding:'utf8'}).trim();assert.match(state.orderCode,/^\d+$/);save();
  const repeat=await request(`${billBase}/${state.bill.id}/payment-display`,{token,method:'POST',body:input,key:state.key});assert.equal(repeat.status,'PENDING');
  assert.equal((await request(`${billBase}/${state.bill.id}/online-payments`,{token})).filter(i=>i.status==='PENDING').length,1);check('Repeated staff request keeps one provider intent');
 }
 if(phase==='check'||phase==='cancel')assert.ok(state.launch?.displayUrl,'Run create first.');
 if(phase==='cancel'){await cancelProvider();check('Provider cancellation signature and CANCELLED status verified');}
 const displayToken=new URL(state.launch.displayUrl).pathname.split('/').at(-1);
 const view=await request(`/s1/billing/api/public/payment-displays/${displayToken}`);
 assert.equal(view.amountVnd,state.bill.remainingVnd);assert.equal(view.status,phase==='cancel'?'CANCELLED':'PENDING');
 if(phase!=='cancel'){assert.ok(view.qrCode);assert.ok(view.checkoutUrl?.startsWith('https://pay.payos.vn/'));check('Public customer display shows signed provider QR and correct amount');}
 else{state.cancelled=true;save();check('Billing reconciles the cancelled link without collecting money');}
 const bill=await request(`${billBase}/${state.bill.id}`,{token});assert.equal(bill.remainingVnd,state.bill.remainingVnd);assert.equal(bill.paidVnd,state.bill.paidVnd);assert.equal((await request(`${billBase}/${state.bill.id}/payments`,{token})).length,state.receiptsBefore);check('Invoice balance and receipt count remain unchanged');
 if(phase==='check'){
  await request(`/s1/billing/api/public/payments/clinics/${cfg.clinic}/branches/${cfg.branch}/payos/webhook`,{method:'POST',body:{data:{orderCode:Number(state.orderCode),amount:state.bill.remainingVnd,currency:'VND',code:'00'},signature:'invalid-signature'},status:422});check('Invalid webhook signature rejected');
  const reopened=await request(`${billBase}/${state.bill.id}/payment-display`,{token,method:'POST',body:{method:'PAYOS',expectedVersion:state.bill.version},key:state.key+'-changed'});
  assert.equal(reopened.status,'PENDING');
  assert.equal((await request(`${billBase}/${state.bill.id}/online-payments`,{token})).filter(i=>i.status==='PENDING').length,1);
  check('Reopening a pending payment reuses the provider intent');
 }
 fs.writeFileSync(reportPath,JSON.stringify({status:state.cancelled?'PASS':'IN_PROGRESS',checkedAt:new Date().toISOString(),checks:state.checks,realMoneyTransferred:false,realPaymentConfirmationTested:false,liveLinkCancelled:!!state.cancelled},null,2));
}catch(e){
 if(state.orderCode&&!state.cancelled){try{await cancelProvider();}catch{/* Preserve private state for a safe retry. */}}
 fs.writeFileSync(reportPath,JSON.stringify({status:'FAIL',phase,checks:state.checks,error:e.message,realMoneyTransferred:false},null,2));console.error(e.message);process.exitCode=1;
}
