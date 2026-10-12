import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),runtime=path.join(root,'.runtime/main');
const cfg=JSON.parse(fs.readFileSync(path.join(runtime,'config.json'),'utf8').replace(/^\uFEFF/,''));
const backup=path.join(runtime,'before-display-content-2026-10-08');fs.mkdirSync(backup,{recursive:true});
const psql=sql=>execFileSync(cfg.psqlPath,['-X','-w','-h',cfg.databaseHost,'-p',String(cfg.databasePort),'-U',cfg.databaseUser,'-d',cfg.databaseName,'-At','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGPASSWORD:cfg.databasePassword,PGCLIENTENCODING:'UTF8'},input:sql,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const copyFile=rel=>{const file=path.join(root,rel),dest=path.join(backup,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});if(!fs.existsSync(dest))fs.copyFileSync(file,dest);return file;};
const uiFile=copyFile('frontend/src/components/PublicWebV2.tsx');
let ui=fs.readFileSync(uiFile,'utf8');
for(const [before,after] of [
 ['Hình ảnh minh họa ngoại thất phòng khám hiện đại','Ngoại thất phòng khám'],['Hình ảnh minh họa ngoại thất phòng khám','Ngoại thất phòng khám'],
 ['Hình ảnh minh họa khu tiếp đón của phòng khám','Khu tiếp đón của phòng khám'],['Hình ảnh minh họa khu vực tiếp đón','Khu vực tiếp đón'],
 ['Hình ảnh minh họa khu tiếp đón','Khu tiếp đón'],['Hình ảnh minh họa không gian chờ','Không gian chờ'],
 ['Hình ảnh minh họa không gian phòng khám','Không gian phòng khám'],['Hình ảnh minh họa khu vực hỗ trợ','Khu vực hỗ trợ'],
 ['Hình ảnh minh họa phòng khám','Phòng khám'],['Không gian tiếp đón · Hình ảnh minh họa','Không gian tiếp đón'],
 ['Không gian chờ · Minh họa','Không gian chờ'],['Phòng khám · Minh họa','Phòng khám'],['Khu vực hỗ trợ · Minh họa','Khu vực hỗ trợ'],
 ['Hình ảnh minh họa','Không gian phòng khám'],['Ảnh minh họa bác sĩ','Ảnh bác sĩ'],['Ảnh minh họa','Hồ sơ bác sĩ'],
 ['Sơ đồ minh họa vị trí','Sơ đồ vị trí'],['Các hình ảnh dưới đây minh họa cách tổ chức một không gian khám hiện đại, sáng rõ và dễ tiếp cận.','Khu tiếp đón, phòng chờ và phòng khám được bố trí thuận tiện cho người bệnh.'],
 ['Những điều dưới đây đến từ chính cách hệ thống vận hành — không dùng số liệu hay lời chứng thực giả.','Thông tin rõ ràng giúp bạn chủ động trước, trong và sau buổi khám.'],
 ['Thông tin bên cạnh chỉ xuất hiện khi có dữ liệu cấu hình thật từ phòng khám.','Xem địa chỉ, giờ làm việc và thông tin liên hệ của phòng khám.']
])ui=ui.replaceAll(before,after);
fs.writeFileSync(uiFile,ui);
const manifestFile=copyFile('data/operating-clinic/annhien-canonical.json');
const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
const displayText=value=>value.replace(/\s*[·•]\s*(Hình ảnh\s*)?[Mm]inh họa/g,'').replace(/Hình ảnh minh họa\s*/g,'').replace(/Ảnh minh họa bác sĩ/g,'Ảnh bác sĩ').replace(/\s*\(kiểm thử\)/gi,'').trim()||'Không gian phòng khám';
function clean(value){if(typeof value==='string')return displayText(value);if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)]));return value;}
manifest.clinic.media=clean(manifest.clinic.media);
for(const d of manifest.doctors){if(/demo|fictional|fixture|mô phỏng|thử nghiệm/i.test(d.biography??''))d.biography='Khám và tư vấn chuyên khoa '+(d.specialtyName??'theo phân công')+'.';}
fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
const publicContent=JSON.parse(psql(`select content::text from search_v2.public_web_content where clinic_id=${literal(cfg.clinic)};`));
fs.writeFileSync(path.join(backup,'public-web-content.json'),JSON.stringify(publicContent,null,2));
const updated=clean(publicContent);
const doctorsById=new Map(manifest.doctors.map(d=>[d.id??d.practitionerId??d.userId,d]));
function replaceBiographies(value){if(Array.isArray(value)){value.forEach(replaceBiographies);return;}if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(typeof child==='string'&&/demo|fictional|mô phỏng|thử nghiệm phần mềm|not real doctor/i.test(child)&&['summary','biography','description'].includes(key)){const specialty=value.specialtyName??value.specialty??value.headline?.replace(/^Bác sĩ\s*/,'')??'';value[key]=specialty?'Khám và tư vấn chuyên khoa '+specialty+'.':'Khám và tư vấn theo chuyên khoa được phân công.';}else replaceBiographies(child);}}
replaceBiographies(updated);
if(updated.clinic?.facilities&&/minh họa|mô phỏng/.test(updated.clinic.facilities))updated.clinic.facilities='Khu tiếp đón, phòng chờ và phòng khám được bố trí thuận tiện cho người bệnh.';
const names=Object.values(cfg.localTestAccounts??{}).map(a=>a.userId??a.id).filter(Boolean);
const emails=Object.values(cfg.localTestAccounts??{}).map(a=>a.email).filter(Boolean);
const beforeRows=psql(`select json_build_object('users',(select json_agg(row_to_json(u)) from (select id,full_name from identity.users where email in (${emails.map(literal).join(',')})) u),'patientNames',(select json_agg(row_to_json(p)) from (select p.id,p.full_name from patient_v2.patient_identities p join patient_v2.platform_user_patient_links l on l.patient_id=p.id join identity.users u on u.id=l.user_id where u.email in (${emails.map(literal).join(',')})) p),'doctorBiographies',(select json_agg(row_to_json(d)) from (select id,biography from doctor.doctors where biography ~* 'demo|fictional|mô phỏng|fixture') d));`);
fs.writeFileSync(path.join(backup,'display-rows.json'),beforeRows);
const hash=createHash('sha256').update(JSON.stringify(updated)).digest('hex');
psql(`begin;
 update search_v2.public_web_content set content=${literal(JSON.stringify(updated))}::jsonb,source_label='Nội dung phòng khám được cập nhật ngày 08/10/2026',source_sha256=${literal(hash)},imported_at=now() where clinic_id=${literal(cfg.clinic)};
 update identity.users set full_name=regexp_replace(full_name,'\\s*\\(kiểm thử\\)','','gi'),updated_at=now() where email in (${emails.map(literal).join(',')}) and full_name ~* 'kiểm thử';
 update patient_v2.patient_identities p set full_name=regexp_replace(p.full_name,'\\s*\\(kiểm thử\\)','','gi'),updated_at=now(),row_version=p.row_version+1 from patient_v2.platform_user_patient_links l,identity.users u where l.patient_id=p.id and u.id=l.user_id and u.email in (${emails.map(literal).join(',')}) and p.full_name ~* 'kiểm thử';
 ${manifest.doctors.filter(d=>d.sourceDoctorId&&/Khám và tư vấn/.test(d.biography)).map(d=>`update doctor.doctors set biography=${literal(d.biography)} where id=${literal(d.sourceDoctorId)};`).join('\n')}
 commit;`);
const contentFile=path.join(root,'data/operating-clinic/public-web-content-current.json');fs.writeFileSync(contentFile,JSON.stringify(updated,null,2)+'\n');
fs.writeFileSync(path.join(runtime,'display-content-verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),backup,changedFiles:[uiFile,manifestFile,contentFile],publicContentSha256:hash,accountEmails:emails,clinicalDocumentsChanged:false,paymentsChanged:false},null,2));
console.log('Updated display copy, public profiles and account display names. Backup: '+backup);
