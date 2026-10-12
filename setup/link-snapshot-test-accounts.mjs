import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const configPath=path.join(root,'.runtime/main/config.json');
const cfg=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
if(!cfg.bundleDevelopment||!cfg.nativePostgres||!cfg.currentDataSnapshot)throw Error('Restored local snapshot required');
const accounts=Object.values(cfg.localTestAccounts??{});
if(accounts.length!==10||accounts.some(account=>!/^[a-f0-9-]{36}$/.test(account.userId)))throw Error('Expected the ten existing local test accounts');
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
function sql(query,db=cfg.databaseName){
 return execFileSync(cfg.psqlPath,['-X','-w','-q','-At','-h',cfg.databaseHost,'-p',String(cfg.databasePort),'-U',cfg.databaseUser,'-d',db,'-v','ON_ERROR_STOP=1'],{input:Buffer.from(query,'utf8'),env:{...process.env,PGPASSWORD:cfg.databasePassword??'',PGCLIENTENCODING:'UTF8'},encoding:'utf8',maxBuffer:4*1024*1024,stdio:['pipe','pipe','inherit']}).trim();
}
const base='http://127.0.0.1:'+cfg.ports.gateway;
async function api(module,url,token='',body,method=body?'POST':'GET'){
 const response=await fetch(base+'/s1/'+module+url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json','Idempotency-Key':randomUUID()}:{} )},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const text=await response.text(),result=text?JSON.parse(text):undefined;
 if(!response.ok)throw Error(module+' '+url+' HTTP '+response.status+': '+JSON.stringify(result));
 return result;
}
if(!process.argv.includes('--verify')){
 const source=cfg.currentDataSnapshot.previousDatabase;
 if(source===cfg.databaseName||!/^[a-z][a-z0-9_]{0,62}$/.test(source))throw Error('Invalid previous database');
 const ids=accounts.map(account=>literal(account.userId)).join(',');
 const users=JSON.parse(sql('SELECT coalesce(json_agg(u),\'[]\'::json) FROM identity.users u WHERE id IN ('+ids+');',source));
 if(users.length!==accounts.length)throw Error('Previous database does not contain all test accounts');
 const existing=JSON.parse(sql('SELECT coalesce(json_agg(u),\'[]\'::json) FROM (SELECT id,email FROM identity.users WHERE email IN ('+accounts.map(account=>literal(account.email)).join(',')+')) u;'));
 for(const user of existing)if(!accounts.some(account=>account.userId===user.id&&account.email===user.email))throw Error('An imported account already uses a test email; no account was overwritten');
 const owner=sql('SELECT owner_user_id FROM clinic.clinics WHERE id='+literal(cfg.clinic)+';');
 if(!/^[a-f0-9-]{36}$/.test(owner))throw Error('Snapshot clinic owner was not found');
 // Use the restored database's account-code sequence to avoid collisions with source accounts.
 let query='BEGIN; INSERT INTO identity.users(id,email,password_hash,full_name,phone,status,created_at,updated_at) SELECT id,email,password_hash,full_name,phone,status,created_at,updated_at FROM json_populate_recordset(NULL::identity.users,'+literal(JSON.stringify(users))+'::json) WHERE id NOT IN (SELECT id FROM identity.users) ON CONFLICT(id) DO NOTHING;';
 for(const account of accounts){
  const user=literal(account.userId);
  query+='INSERT INTO identity.user_roles(user_id,role_id) SELECT '+user+',id FROM identity.roles WHERE code='+literal(account.legacyRole)+' ON CONFLICT DO NOTHING;';
  if(account.role==='PLATFORM')query+='INSERT INTO iam.platform_operators(user_id) VALUES('+user+') ON CONFLICT DO NOTHING;';
  if(['ADMIN','STAFF','DOCTOR'].includes(account.role)){
   const role=literal(account.role),clinic=literal(cfg.clinic);
   query+='INSERT INTO iam.memberships(id,user_id,clinic_id,role,status,all_branches,invited_by,activated_at) SELECT '+literal(randomUUID())+','+user+','+clinic+','+role+',\'ACTIVE\','+(account.role==='ADMIN')+','+literal(owner)+',now() WHERE NOT EXISTS(SELECT 1 FROM iam.memberships WHERE user_id='+user+' AND clinic_id='+clinic+' AND role='+role+' AND status<>\'REVOKED\');';
   if(account.role!=='ADMIN')query+='INSERT INTO iam.membership_branch_grants(id,membership_id,user_id,clinic_id,branch_id,granted_by) SELECT '+literal(randomUUID())+',m.id,m.user_id,m.clinic_id,'+literal(cfg.branch)+','+literal(owner)+' FROM iam.memberships m WHERE m.user_id='+user+' AND m.clinic_id='+clinic+' AND m.role='+role+' AND m.status=\'ACTIVE\' ON CONFLICT(membership_id,branch_id) DO NOTHING;';
  }
 }
 sql(query+'COMMIT;');
 console.log('Copied all 10 requested test accounts and assigned roles in the restored clinic. Password hashes were preserved.');
}else{
 const password=process.env.CLINIC_TEST_PASSWORD;
 if(!password)throw Error('Set CLINIC_TEST_PASSWORD for account verification');
 const tokens={};
 for(const [key,account] of Object.entries(cfg.localTestAccounts))tokens[key]=(await api('auth','/api/auth/login','',{email:account.email,password})).data.accessToken;
 const doctorBase='/api/clinics/'+cfg.clinic+'/branches/'+cfg.branch+'/doctor-affiliations';
 for(let index=1;index<=2;index++){
  const account=cfg.localTestAccounts['doctor'+index];
  let affiliation=(await api('doctor',doctorBase,tokens.admin1)).find(item=>item.userId===account.userId);
  if(!affiliation)affiliation=await api('doctor',doctorBase,tokens.admin1,{userId:account.userId,displayName:'Bác sĩ kiểm thử '+index,specialtyCode:'GEN',specialtyName:'Nội tổng quát',effectiveFrom:'2026-01-01',publicVisible:false});
  const schedule=(await api('doctor',doctorBase+'/'+affiliation.id+'/schedules',tokens.admin1)).schedules;
  for(let day=1;day<=7;day++)if(!schedule.some(item=>item.dayOfWeek===day))await api('doctor',doctorBase+'/'+affiliation.id+'/schedules',tokens.admin1,{dayOfWeek:day,startTime:'08:00',endTime:'17:00',effectiveFrom:'2026-01-01',timezone:'Asia/Ho_Chi_Minh',active:true});
  const patient=cfg.localTestAccounts['patient'+index];
  let profile;try{profile=await api('patient','/api/me/patient-profile',tokens['patient'+index]);}catch(error){if(!error.message.includes('HTTP 404'))throw error;}
  if(!profile?.patientId)await api('patient','/api/me/patient-profile',tokens['patient'+index],{fullName:patient.fullName,dateOfBirth:'1995-01-0'+index,sex:index===1?'MALE':'FEMALE',phone:'000000000'+index,email:patient.email,expectedVersion:0},'PUT');
 }
 const results=[];
 for(const [key,account] of Object.entries(cfg.localTestAccounts)){
  const current=await api('identity','/api/me/current',tokens[key]),contexts=await api('identity','/api/me/contexts',tokens[key]);
  if(account.role==='PLATFORM'&&!current.platformOperator)throw Error('Platform permission missing: '+account.email);
  if(['ADMIN','STAFF','DOCTOR'].includes(account.role)&&!contexts.some(context=>context.role===account.role&&context.clinicId===cfg.clinic&&(context.allBranches||context.branchIds.includes(cfg.branch))))throw Error('Clinic permission missing: '+account.email);
  results.push({email:account.email,role:account.role,login:'PASS',permission:'PASS'});
 }
 fs.writeFileSync(path.join(root,'.runtime/main/account-verification.json'),JSON.stringify(results,null,2)+'\n');
 console.log('All '+results.length+' accounts passed login and permission checks in the restored clinic.');
}
