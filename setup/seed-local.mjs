import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const configPath=path.join(root,'.runtime/main/config.json');
let cfg=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
if(!cfg.bundleDevelopment||!cfg.nativePostgres)throw Error('Local development configuration required');
if(cfg.currentDataSnapshot)throw Error('Use setup/link-snapshot-test-accounts.mjs --verify for restored snapshot accounts.');
const password=process.env.CLINIC_TEST_PASSWORD;
if(!password)throw Error('Set CLINIC_TEST_PASSWORD before creating test accounts');
const save=()=>fs.writeFileSync(configPath,JSON.stringify(cfg,null,2)+'\n');
const base='http://127.0.0.1:'+cfg.ports.gateway;
async function api(module,url,token='',body,method=body?'POST':'GET'){
 const response=await fetch(base+'/s1/'+module+url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json','Idempotency-Key':randomUUID()}:{} )},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const text=await response.text();const result=text?JSON.parse(text):undefined;
 if(!response.ok)throw Error(module+' '+url+' HTTP '+response.status+': '+JSON.stringify(result));
 return result;
}
function sql(input){execFileSync(cfg.psqlPath,['-X','-w','-h',cfg.databaseHost,'-p',String(cfg.databasePort),'-U',cfg.databaseUser,'-d',cfg.databaseName,'-v','ON_ERROR_STOP=1'],{input,env:{...process.env,PGPASSWORD:cfg.databasePassword},stdio:['pipe','ignore','inherit']});}
const groups=[['admin','quantri','Quản trị','ADMIN','ROLE_ADMIN'],['staff','nhanvien','Nhân viên','STAFF','ROLE_RECEPTIONIST'],['doctor','bacsi','Bác sĩ','DOCTOR','ROLE_DOCTOR'],['patient','benhnhan','Bệnh nhân','PATIENT','ROLE_PATIENT'],['platform','kiemduyet','Kiểm duyệt','PLATFORM','ROLE_ADMIN']];
cfg.localTestAccounts??={};cfg.accounts??={};cfg.demoPassword=password;
const tokens={};
for(const [key,prefix,label,role,legacyRole] of groups){
 for(let index=1;index<=2;index++){
  const accountKey=key+index,email=prefix+index+'@gmail.com',fullName=label+' '+index+' (kiểm thử)';
  if(!cfg.localTestAccounts[accountKey]){
   const response=await api('auth','/api/auth/register','',{email,password,fullName});
   cfg.localTestAccounts[accountKey]={email,fullName,userId:response.data.userId,role,legacyRole};save();
  }
  const account=cfg.localTestAccounts[accountKey];
  if(!/^[a-f0-9-]{36}$/.test(account.userId))throw Error('Invalid user ID');
  sql(`BEGIN; DELETE FROM identity.user_roles WHERE user_id='${account.userId}'; INSERT INTO identity.user_roles(user_id,role_id) SELECT '${account.userId}',id FROM identity.roles WHERE code='${legacyRole}'; COMMIT;`);
  const login=await api('auth','/api/auth/login','',{email,password});tokens[accountKey]=login.data.accessToken;
  console.log('Created/verified '+email+' ('+role+')');
 }
}
for(const [key,accountKey] of [['owner','admin1'],['reception','staff1'],['doctor','doctor1'],['patient','patient1'],['platform','platform1']])cfg.accounts[key]={...cfg.localTestAccounts[accountKey],password};
save();
sql('INSERT INTO iam.platform_operators(user_id) VALUES '+[1,2].map(i=>`('${cfg.localTestAccounts['platform'+i].userId}')`).join(',')+' ON CONFLICT DO NOTHING;');
execFileSync(process.execPath,[path.join(root,'setup/seed-demo.mjs')],{stdio:'inherit'});
cfg=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
const memberBase='/api/clinics/'+cfg.clinic+'/memberships';
for(const [accountKey,role] of [['admin2','ADMIN'],['staff2','STAFF'],['doctor2','DOCTOR']]){
 const account=cfg.localTestAccounts[accountKey];
 const list=await api('identity',memberBase,tokens.admin1);
 let membership=list.find(m=>m.userId===account.userId&&m.role===role&&m.status!=='REVOKED');
 if(!membership)membership=await api('identity',memberBase,tokens.admin1,{userId:account.userId,role,allBranches:role==='ADMIN',reason:'Local test setup'});
 if(membership.status==='INVITED')membership=await api('identity','/api/memberships/'+membership.id+'/activate',tokens[accountKey],{});
 if(!membership.allBranches&&!membership.branchIds.includes(cfg.branch))await api('identity',memberBase+'/'+membership.id+'/branches',tokens.admin1,{branchId:cfg.branch,reason:'Local test setup'});
}
const doctorBase='/api/clinics/'+cfg.clinic+'/branches/'+cfg.branch+'/doctor-affiliations';
let doctor=(await api('doctor',doctorBase,tokens.admin1)).find(d=>d.userId===cfg.localTestAccounts.doctor2.userId);
if(!doctor)doctor=await api('doctor',doctorBase,tokens.admin1,{userId:cfg.localTestAccounts.doctor2.userId,displayName:'Bác sĩ 2',specialtyCode:'GEN',specialtyName:'Nội tổng quát',effectiveFrom:'2026-01-01',publicVisible:true});
const schedules=(await api('doctor',doctorBase+'/'+doctor.id+'/schedules',tokens.admin1)).schedules;
for(let day=1;day<=7;day++)if(!schedules.some(s=>s.dayOfWeek===day))await api('doctor',doctorBase+'/'+doctor.id+'/schedules',tokens.admin1,{dayOfWeek:day,startTime:'08:00',endTime:'17:00',effectiveFrom:'2026-01-01',timezone:'Asia/Ho_Chi_Minh',active:true});
for(let index=1;index<=2;index++){
 const account=cfg.localTestAccounts['patient'+index];
 let profile;try{profile=await api('patient','/api/me/patient-profile',tokens['patient'+index]);}catch(error){if(!error.message.includes('HTTP 404'))throw error;}
 if(!profile?.patientId)await api('patient','/api/me/patient-profile',tokens['patient'+index],{fullName:account.fullName,dateOfBirth:'1995-01-0'+index,sex:index===1?'MALE':'FEMALE',phone:'000000000'+index,email:account.email,expectedVersion:0},'PUT');
}
const results=[];
for(const [key,account] of Object.entries(cfg.localTestAccounts)){
 const current=await api('identity','/api/me/current',tokens[key]);
 const contexts=await api('identity','/api/me/contexts',tokens[key]);
 if(account.role==='PLATFORM'&&!current.platformOperator)throw Error('Platform permission missing: '+account.email);
 if(['ADMIN','STAFF','DOCTOR'].includes(account.role)&&!contexts.some(c=>c.role===account.role&&c.clinicId===cfg.clinic&&(c.allBranches||c.branchIds.includes(cfg.branch))))throw Error('Clinic permission missing: '+account.email);
 results.push({email:account.email,role:account.role,login:'PASS',contexts:contexts.map(c=>c.role),platformOperator:current.platformOperator});
}
fs.writeFileSync(path.join(root,'.runtime/main/account-verification.json'),JSON.stringify(results,null,2)+'\n');
console.log('All '+results.length+' local accounts passed login and permission checks.');
execFileSync(process.execPath,[path.join(root,'setup/seed-local-content.mjs')],{stdio:'inherit'});
