import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'.runtime/main/config.json'),'utf8').replace(/^\uFEFF/,''));
if(!cfg.bundleDevelopment||!cfg.nativePostgres||!cfg.clinic)throw Error('Initialized local clinic required');
if(cfg.currentDataSnapshot)throw Error('Snapshot public content is already restored; demo content must not replace it.');
const base=`http://127.0.0.1:${cfg.ports.gateway}/s1/search/api/public/clinics/${cfg.clinic}`;
async function get(url){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`HTTP ${response.status}: ${url}`);return response.json();}
const doctors=await get(base+'/doctors');
const offerings=await get(base+'/offerings');
if(doctors.length!==2||offerings.length<1)throw Error('Expected two local test doctors and at least one service');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/operating-clinic/annhien-canonical.json'),'utf8'));
const content={
 clinic:{
  heroMessage:'Chăm sóc sức khỏe bắt đầu từ một cuộc hẹn đúng người, đúng thời điểm.',
  shortIntroduction:'Phòng khám demo dùng để kiểm tra đặt lịch, tiếp nhận, khám và thu phí trong dự án.',
  detailedIntroduction:'Đây là phòng khám giả lập dành cho việc chạy thử hệ thống. Các tài khoản bác sĩ, nhân viên và bệnh nhân đã được thiết lập để kiểm tra từng vai trò.',
  facilities:'Khu tiếp đón, khu chờ và phòng khám được minh họa bằng các tài nguyên có sẵn của dự án.',
  careProcess:'Đặt lịch → tiếp nhận → khám → xem hồ sơ được phát hành.',
  media:manifest.clinic.media
 },
 specialties:[{specialtyId:'GEN',databaseName:'Nội tổng quát',displayName:'Nội tổng quát',slug:'noi-tong-quat',shortDescription:'Chuyên khoa demo để kiểm tra lịch của hai bác sĩ.',description:'Chuyên khoa mẫu phục vụ kiểm tra các chức năng của dự án.',commonConditions:[],keyExpertise:[],doctorCount:doctors.length,cta:'Xem bác sĩ'}],
 doctors:doctors.map((doctor,index)=>({sourceDoctorId:doctor.doctorId,doctorId:doctor.doctorId,code:'DEMO-BS'+(index+1),displayName:doctor.displayName,title:'Bác sĩ',specialtyName:doctor.specialtyName,specialtySlug:'noi-tong-quat',yearsExperience:null,headline:'Bác sĩ Nội tổng quát',summary:'Hồ sơ bác sĩ giả lập để kiểm tra lịch làm việc và màn hình khám.',expertise:[],consultationAreas:['Nội tổng quát'],education:[],experience:[],cta:'Đặt lịch khám',imageUrl:null,imageKind:'illustration'})),
 services:offerings.map(offering=>({offeringId:offering.offeringId,code:offering.code,name:offering.name,specialtyName:'Nội tổng quát',specialtySlug:'noi-tong-quat',description:'Dịch vụ mẫu phục vụ kiểm thử đặt lịch và tính phí.',suitableFor:'Dữ liệu kiểm thử dự án.',preparation:'Chọn một ngày làm việc và khung giờ còn trống trên trang đặt lịch.',cta:'Đặt lịch khám'})),
 dataset:{classification:'local-development-synthetic',note:'Dữ liệu giả lập để chạy thử dự án.',legacyDoctorCount:0,publicDoctorCount:doctors.length}
};
const payload=JSON.stringify(content),literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const hash=createHash('sha256').update(payload).digest('hex');
const sql=`INSERT INTO search_v2.public_web_content(clinic_id,content,source_label,source_sha256) VALUES (${literal(cfg.clinic)},${literal(payload)}::jsonb,'setup/seed-local-content.mjs',${literal(hash)}) ON CONFLICT(clinic_id) DO UPDATE SET content=excluded.content,source_label=excluded.source_label,source_sha256=excluded.source_sha256,imported_at=now();`;
execFileSync(cfg.psqlPath,['-X','-w','-h',cfg.databaseHost,'-p',String(cfg.databasePort),'-U',cfg.databaseUser,'-d',cfg.databaseName,'-v','ON_ERROR_STOP=1'],{input:Buffer.from(sql,'utf8'),env:{...process.env,PGPASSWORD:cfg.databasePassword,PGCLIENTENCODING:'UTF8'},stdio:['pipe','ignore','inherit']});
const tomorrow=new Date(Date.now()+86400000);
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(tomorrow);
const availability=[];
for(const doctor of doctors){
 const query=new URLSearchParams({clinicId:cfg.clinic,branchId:cfg.branch,offeringId:offerings[0].offeringId,doctorId:doctor.doctorId,date});
 const result=await get(`http://127.0.0.1:${cfg.ports.gateway}/s1/appointment/api/public/availability/evaluate?${query}`);
 if(!result.available||!result.slots.length)throw Error('No available booking slots for '+doctor.displayName+': '+result.reason);
 availability.push({doctor:doctor.displayName,date,slots:result.slots.length,firstSlot:result.slots[0].startsAt});
}
fs.writeFileSync(path.join(root,'.runtime/main/booking-verification.json'),JSON.stringify(availability,null,2)+'\n');
console.log('Public content ready; both doctors have '+availability[0].slots+' booking slots on '+date+'.');
