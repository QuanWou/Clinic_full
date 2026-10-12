import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const configPath=path.join(root,'.runtime/main/config.json');
const cfg=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^﻿/,''));
if(cfg.bundleDevelopment!==true)throw Error('Development config required');
if(cfg.currentDataSnapshot)throw Error('Snapshot data is already complete. Use link-snapshot-test-accounts.mjs for test accounts instead of demo seeding.');
const save=()=>fs.writeFileSync(configPath,JSON.stringify(cfg,null,2)+'\n');
const base='http://127.0.0.1:'+cfg.ports.gateway;
async function api(module,url,token='',body,method=body?'POST':'GET'){
 const response=await fetch(base+'/s1/'+module+url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json','Idempotency-Key':randomUUID()}:{} )},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const text=await response.text();
 const result=text?JSON.parse(text):undefined;
 if(!response.ok)throw Error(module+' '+url+' HTTP '+response.status+': '+JSON.stringify(result));
 return result;
}
const tokens={};
cfg.accounts??={};cfg.demoPassword??='Team-'+randomBytes(12).toString('hex');save();
for(const [key,name] of [['owner','Quản trị Demo'],['reception','Tiếp nhận Demo'],['doctor','Bác sĩ Demo'],['patient','Bệnh nhân Demo'],['platform','Kiểm duyệt Demo']]){
 const email=cfg.accounts[key]?.email??key+'@clinic-demo.local';
 if(!cfg.accounts[key]){
  const r=await api('auth','/api/auth/register','',{email,password:cfg.demoPassword,fullName:name});
  cfg.accounts[key]={email,password:cfg.demoPassword,fullName:name,userId:r.data.userId};save();
 }
 const r=await api('auth','/api/auth/login','',{email,password:cfg.demoPassword});tokens[key]=r.data.accessToken;
}
function sql(query){
 if(cfg.nativePostgres){
  execFileSync(cfg.psqlPath,['-X','-w','-h',cfg.databaseHost,'-p',String(cfg.databasePort),'-U',cfg.databaseUser,'-d',cfg.databaseName,'-v','ON_ERROR_STOP=1'],{input:Buffer.from(query,'utf8'),env:{...process.env,PGPASSWORD:cfg.databasePassword,PGCLIENTENCODING:'UTF8'},stdio:['pipe','ignore','inherit']});
 }else{
  execFileSync('docker.exe',['compose','-p','clinic-team-dev','--env-file',path.join(root,'.runtime/main/docker.env'),'-f',path.join(root,'setup/docker-compose.dev.yml'),'exec','-T','postgres','psql','-X','-U','postgres','-d',cfg.databaseName,'-v','ON_ERROR_STOP=1'],{input:query,stdio:['pipe','ignore','inherit']});
 }
}
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
sql("INSERT INTO iam.platform_operators(user_id) VALUES('"+cfg.accounts.platform.userId+"') ON CONFLICT DO NOTHING;");
if(!cfg.clinic){
 const c=await api('clinic','/api/clinics',tokens.owner,{name:'Phòng khám Demo',slug:'clinic-team-demo',publicDescription:'Dữ liệu giả lập cho nhóm phát triển.',contactName:'Quản trị Demo',contactEmail:cfg.accounts.owner.email,contactPhone:'0000000000',license:{licenseNumber:'DEMO-NOT-A-LICENSE',issuingAuthority:'DEMO',scopeSummary:'Synthetic development fixture',evidenceRef:'demo/team',validUntil:'2030-12-31'}});
 cfg.clinic=c.id;save();
}
await api('clinic','/api/clinics/'+cfg.clinic+'/owner-membership',tokens.owner,{});
let c=await api('clinic','/api/clinics/'+cfg.clinic,tokens.owner);
if(!cfg.branch){
 const b=await api('clinic','/api/clinics/'+cfg.clinic+'/branches',tokens.owner,{name:'Chi nhánh Demo',address:'Địa chỉ giả lập',openingHours:'08:00–17:00',active:true,expectedVersion:c.version});cfg.branch=b.branches[0].id;save();
}
for(const [key,role] of [['reception','STAFF'],['doctor','DOCTOR']]){
 const url='/api/clinics/'+cfg.clinic+'/memberships';
 const list=await api('identity',url,tokens.owner);
 let m=list.find(x=>x.userId===cfg.accounts[key].userId&&x.role===role&&x.status!=='REVOKED');
 if(!m)m=await api('identity',url,tokens.owner,{userId:cfg.accounts[key].userId,role,allBranches:false,reason:'Synthetic team demo'});
 if(m.status==='INVITED')m=await api('identity','/api/memberships/'+m.id+'/activate',tokens[key],{});
 if(!m.branchIds.includes(cfg.branch))await api('identity',url+'/'+m.id+'/branches',tokens.owner,{branchId:cfg.branch,reason:'Synthetic team demo'});
}
const dbase='/api/clinics/'+cfg.clinic+'/branches/'+cfg.branch+'/doctor-affiliations';
let docs=await api('doctor',dbase,tokens.owner);
let d=docs.find(x=>x.userId===cfg.accounts.doctor.userId);
if(!d)d=await api('doctor',dbase,tokens.owner,{userId:cfg.accounts.doctor.userId,displayName:'Bác sĩ Demo',specialtyCode:'GEN',specialtyName:'Nội tổng quát',effectiveFrom:'2026-01-01',publicVisible:true});
const schedules=(await api('doctor',dbase+'/'+d.id+'/schedules',tokens.owner)).schedules;
for(let day=1;day<=7;day++)if(!schedules.some(x=>x.dayOfWeek===day))await api('doctor',dbase+'/'+d.id+'/schedules',tokens.owner,{dayOfWeek:day,startTime:'08:00',endTime:'17:00',effectiveFrom:'2026-01-01',timezone:'Asia/Ho_Chi_Minh',active:true});
const cb='/api/clinics/'+cfg.clinic;
const offerings=await api('catalog',cb+'/offerings',tokens.owner);
let o=offerings.find(x=>x.code==='DEMO-GEN');
if(!o)o=await api('catalog',cb+'/offerings',tokens.owner,{code:'DEMO-GEN',name:'Khám tổng quát Demo',description:'Dịch vụ giả lập',specialtyCode:'GEN',active:true});
const assignments=await api('catalog',cb+'/branches/'+cfg.branch+'/offerings',tokens.owner);
if(!assignments.some(x=>x.offering.id===o.id))await api('catalog',cb+'/branches/'+cfg.branch+'/offerings',tokens.owner,{offeringId:o.id,durationMinutes:30,active:true,publicVisible:true});
const prices=await api('catalog',cb+'/branches/'+cfg.branch+'/offerings/'+o.id+'/price-versions',tokens.owner);
if(!prices.length)await api('catalog',cb+'/branches/'+cfg.branch+'/price-versions',tokens.owner,{offeringId:o.id,amountVnd:150000,effectiveFrom:'2026-01-01T00:00:00Z'});
const pbase='/api/clinics/'+cfg.clinic+'/branches/'+cfg.branch+'/service-points';
if(!(await api('encounter',pbase,tokens.reception)).length)await api('encounter',pbase,tokens.owner,{code:'DEMO01',name:'Phòng khám Demo'});
if(!cfg.demoPatientCreated){await api('patient','/api/me/patient-profile',tokens.patient,{fullName:'Bệnh nhân Demo',dateOfBirth:'1995-01-01',sex:'MALE',phone:'0000000001',email:cfg.accounts.patient.email,expectedVersion:0},'PUT');cfg.demoPatientCreated=true;save();}
c=await api('clinic',cb,tokens.owner);
if(c.reviewStatus==='DRAFT')await api('clinic',cb+'/submit',tokens.owner,{});
c=await api('clinic',cb,tokens.owner);
if(c.reviewStatus==='SUBMITTED')await api('clinic','/api/platform/clinics/'+cfg.clinic+'/approve',tokens.platform,{reason:'Synthetic development fixture only',evidenceVerified:true});
c=await api('clinic',cb,tokens.owner);
if(c.publicationStatus==='UNPUBLISHED')await api('clinic','/api/platform/clinics/'+cfg.clinic+'/publish',tokens.platform,{reason:'Synthetic local demo'});
console.log('Waiting for the published clinic projection before creating demo web content...');
let projected=false;
for(let attempt=0;attempt<90;attempt++){
 try{await api('search','/api/public/clinics/'+cfg.clinic);projected=true;break;}
 catch(error){if(!error.message.includes('HTTP 404:'))throw error;}
 await new Promise(resolve=>setTimeout(resolve,1000));
}
if(!projected)throw Error('Published clinic projection did not arrive; check doctor-service relay logs.');
const specialtySlug='noi-tong-quat';
const content={
 clinic:{heroMessage:'Phòng khám Demo',shortIntroduction:'Phòng khám giả lập dành cho nhóm phát triển.',detailedIntroduction:'Dữ liệu này được tạo để kiểm thử giao diện và quy trình đặt lịch trên máy cá nhân.',facilities:'Chi nhánh và phòng khám giả lập.',careProcess:'Đặt lịch, tiếp nhận, khám và thanh toán trong môi trường demo.'},
 specialties:[{specialtyId:'DEMO-GEN',databaseName:'Nội tổng quát',displayName:'Nội tổng quát',slug:specialtySlug,shortDescription:'Khám tổng quát trong môi trường demo.',description:'Chuyên khoa giả lập để thử quy trình đặt lịch.',commonConditions:[],keyExpertise:[],doctorCount:1,cta:'Xem bác sĩ'}],
 doctors:[{sourceDoctorId:d.practitionerId,doctorId:d.practitionerId,code:'DEMO-DOCTOR',displayName:'Bác sĩ Demo',title:'Bác sĩ',specialtyName:'Nội tổng quát',specialtySlug,headline:'Bác sĩ giả lập',summary:'Hồ sơ dùng cho kiểm thử phần mềm.',expertise:[],consultationAreas:[],education:[],experience:[],cta:'Đặt lịch khám'}],
 services:[{offeringId:o.id,code:o.code,name:o.name,specialtyName:'Nội tổng quát',specialtySlug,description:'Dịch vụ khám tổng quát giả lập.',suitableFor:'Kiểm thử đặt lịch trong môi trường demo.',preparation:'Thông tin giả lập, không phải hướng dẫn y tế.',cta:'Đặt lịch khám'}],
 dataset:{classification:'SYNTHETIC',note:'Dữ liệu demo cho nhóm phát triển, không phải phòng khám thực tế.',publicDoctorCount:1}
};
const payload=JSON.stringify(content),hash=createHash('sha256').update(payload).digest('hex');
sql('INSERT INTO search_v2.public_web_content(clinic_id,content,source_label,source_sha256) VALUES('+literal(cfg.clinic)+','+literal(payload)+'::jsonb,'+literal('setup/seed-demo.mjs')+','+literal(hash)+') ON CONFLICT(clinic_id) DO NOTHING;');
const publishedContent=await api('search','/api/public/clinics/'+cfg.clinic+'/content');
if(!publishedContent?.clinic||!Array.isArray(publishedContent.specialties)||!Array.isArray(publishedContent.doctors)||!Array.isArray(publishedContent.services))throw Error('Public web content is incomplete.');
console.log('Public content endpoint verified: HTTP 200.');
console.log('Demo ready. Accounts: '+Object.values(cfg.accounts).map(a=>a.email).join(', '));
console.log('Password for this local demo: '+cfg.demoPassword);
console.log('Restart with setup/stop-dev.ps1 then setup/start-dev.ps1 to apply the public clinic ID.');
