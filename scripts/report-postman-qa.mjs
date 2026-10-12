import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'docs/kiem-thu-va-huong-dan-2026-10-08');
const raw=JSON.parse(fs.readFileSync(path.join(root,'.runtime/main/postman-qa/newman-raw.json'),'utf8'));
const cases=JSON.parse(fs.readFileSync(path.join(out,'test-cases.json'),'utf8'));
const configPath=path.join(root,'.runtime/main/config.json');
const cfg=fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,'')):{};
const localPasswords=[process.env.CLINIC_TEST_PASSWORD,process.env.CLINIC_QA_NEW_PASSWORD,cfg.demoPassword,...Object.values(cfg.accounts??{}).map(account=>account.password),...(raw.environment?.values??[]).filter(variable=>/password/i.test(variable.key)).map(variable=>variable.value)].filter(value=>typeof value==='string'&&value.length>0).sort((a,b)=>b.length-a.length);
const redact=value=>localPasswords.reduce((text,password)=>text.replaceAll(password,'[MẬT KHẨU ĐÃ LOẠI BỎ]'),String(value??'').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[TOKEN ĐÃ LOẠI BỎ]'));
// Newman repeats the parent item for pm.sendRequest subrequests. Count one case
// per collection item while retaining HTTP totals from Newman's execution stats.
const caseExecutions=[...new Map(raw.run.executions.map(e=>[e.item.name.split(' ')[0],e])).values()];
const results=caseExecutions.map(e=>{
 const id=e.item.name.split(' ')[0],definition=cases.find(c=>c.id===id);
 const assertions=(e.assertions??[]).map(a=>({name:redact(a.assertion),passed:!a.error,...(a.error?{message:redact(a.error.message)}:{})}));
 return {id,name:definition?.name??e.item.name,group:definition?.group,method:definition?.method,url:definition?.url,expected:definition?.expected,actual:e.response?.code??null,responseTimeMs:e.response?.responseTime??null,passed:assertions.every(a=>a.passed)&&!!e.response,assertions};
});
const s=raw.run.stats;
const summary={checkedAt:raw.run.timings.completed?new Date(raw.run.timings.completed).toISOString():new Date().toISOString(),collectionItems:results.length,httpRequests:s.requests.total,assertions:s.assertions.total,passedAssertions:s.assertions.total-s.assertions.failed,failedAssertions:s.assertions.failed,passedCases:results.filter(r=>r.passed).length,failedCases:results.filter(r=>!r.passed).length,executionErrors:s.requests.failed,postmanCli:'1.70.0',executionMethod:'Official Postman CLI và Newman chạy collection cục bộ; không điều khiển ứng dụng Postman desktop',secretsRemoved:true};
const findings=[
 {id:'F01',priority:'Cao',cases:'DI01 DI02',problem:'Thu hồi phiên Identity chưa đồng bộ với Authentication',actual:'IAM từ chối token cũ nhưng /users/me và /auth/refresh của Auth vẫn trả 200.',effect:'Token cũ hoặc refresh token có thể tiếp tục được dùng ở Authentication; cần epoch hoặc revoked-before dùng chung và thu hồi refresh.'},
 {id:'F02',priority:'Vừa',cases:'AC03 AC04 AC05 AC25 GW04',problem:'Sai mã HTTP khi thiếu quyền Account Admin',actual:'Nhận 401, trong khi tài khoản đã đăng nhập cần nhận 403.',effect:'Đã chặn truy cập, nhưng frontend và client khó phân biệt thiếu quyền với hết phiên.'},
 {id:'F03',priority:'Vừa',cases:'DI03',problem:'Vai trò không hợp lệ trả lỗi 500',actual:'Chuỗi enum role sai làm API trả 500 thay vì 400.',effect:'Cần xử lý lỗi deserialize đầu vào và trả JSON lỗi có mã ổn định.'},
 {id:'F04',priority:'Vừa',cases:'RG01 RG02',problem:'accountCode thiếu trong phản hồi đăng ký',actual:'accountCode null ngay sau đăng ký; đọc lại hoặc đăng nhập có mã TK.',effect:'Dùng entity trả về từ saveAndFlush hoặc đồng bộ trường được sinh trước khi map DTO.'},
 {id:'F05',priority:'Thấp',cases:'DI04',problem:'Email đăng nhập chưa chuẩn hóa nhất quán',actual:'Email chữ hoa không đăng nhập được dù bản chữ thường tồn tại.',effect:'Chuẩn hóa trim và chữ thường thống nhất khi đăng ký, đăng nhập và quản trị tài khoản.'}
];
const corrections={
 F01:'Thu hồi phiên đồng bộ cutoff giữa Auth và IAM, thu hồi toàn bộ refresh token. Token cũ bị chặn ở cả hai dịch vụ; phiên đăng nhập mới vẫn hoạt động.',
 F02:'Trả JSON 403 cho người đã đăng nhập nhưng thiếu quyền; thiếu hoặc hết phiên vẫn trả 401.',
 F03:'Role không hợp lệ trả JSON 400; không làm API trả lỗi máy chủ.',
 F04:'Dùng entity đã lưu và flush trước khi tạo DTO; phản hồi đăng ký có accountCode ngay.',
 F05:'Chuẩn hóa trim/chữ thường và tra email không phân biệt chữ hoa, đồng thời giữ kiểm tra email trùng.'
};
for(const finding of findings){
 const linked=finding.cases.split(' ').map(id=>results.find(r=>r.id===id));
 finding.previousActual=finding.actual;
 finding.status=linked.every(r=>r?.passed)?'Đã sửa và kiểm thử đạt':'Cần kiểm tra lại';
 finding.actual=corrections[finding.id];
 finding.effect='Kết quả đối chiếu: '+linked.map(r=>r?`${r.id}: HTTP ${r.actual}, ${r.passed?'đạt':'chưa đạt'}`:'thiếu ca').join('; ')+'.';
}
const report={summary,findings,results};
fs.writeFileSync(path.join(out,'Ket-qua-kiem-thu.json'),JSON.stringify(report,null,2)+'\n');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kết quả kiểm thử Identity Gateway Authentication Account</title><style>body{font:16px/1.55 system-ui;margin:0;color:#183c29;background:#f7faf6}main{max-width:1180px;margin:40px auto;padding:0 24px}h1{font-size:30px}h2{margin-top:36px}p{max-width:900px}.summary{display:flex;flex-wrap:wrap;gap:12px}.summary span{background:white;border:1px solid #d8e1d7;border-radius:8px;padding:14px 20px}table{width:100%;border-collapse:collapse;background:white;font-size:14px}td,th{text-align:left;vertical-align:top;padding:10px;border:1px solid #d8e1d7}th{background:#edf4e7}.fail{color:#b62c21}.pass{color:#27683f}code{font-size:12px;overflow-wrap:anywhere}details{margin:12px 0}summary{cursor:pointer;font-weight:600}small{color:#4e6257}@media print{body{background:white}main{margin:0;max-width:none}.summary{gap:6px}details{display:block}}</style><main><h1>Kết quả kiểm thử API của dự án phòng khám</h1><p>Phạm vi: Identity Service, API Gateway, Authentication và Account. Thực thi trên dịch vụ đang chạy tại localhost qua Postman CLI 1.70.0 và Newman. Báo cáo được xuất cục bộ ngày ${esc(new Date(summary.checkedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))}.</p><div class="summary"><span><b>${summary.collectionItems}</b> ca kiểm thử</span><span><b>${summary.httpRequests}</b> yêu cầu HTTP</span><span class="pass"><b>${summary.passedCases}</b> ca đạt</span><span class="fail"><b>${summary.failedCases}</b> ca chưa đạt</span><span><b>${summary.passedAssertions}/${summary.assertions}</b> assertion đạt</span></div><p>Hai yêu cầu HTTP bổ sung nằm trong ca chạy refresh đồng thời. Giữ các assertion theo hợp đồng bảo mật; token cũ sau khi đổi quyền hoặc thu hồi phiên phải bị từ chối. Không đưa token, password hash hay nội dung hồ sơ bệnh án vào báo cáo.</p><h2>Vấn đề đã khắc phục và kiểm chứng</h2><table><thead><tr><th>Mã và mức ưu tiên</th><th>Vấn đề</th><th>Kết quả sau khi sửa</th></tr></thead><tbody>${findings.map(f=>`<tr><td>${esc(f.id)}<br>${esc(f.priority)}<br><small>${esc(f.cases)}</small></td><td>${esc(f.problem)}</td><td><b>${esc(f.status)}</b><br>${esc(f.actual)}<br>${esc(f.effect)}</td></tr>`).join('')}</tbody></table><h2>Chi tiết từng ca</h2><p>Bấm tên nhóm để xem các ca. URL giữ ở dạng biến giống file import Postman.</p>${[...new Set(results.map(r=>r.group))].map(group=>`<details open><summary>${esc(group)}</summary><table><thead><tr><th>Mã và thao tác</th><th>Yêu cầu</th><th>HTTP mong đợi và thực tế</th><th>Assertion</th></tr></thead><tbody>${results.filter(r=>r.group===group).map(r=>`<tr><td class="${r.passed?'pass':'fail'}"><b>${esc(r.id)}</b> ${esc(r.name)}<br>${r.passed?'Đạt':'Chưa đạt'}</td><td>${esc(r.method)}<br><code>${esc(r.url)}</code></td><td>${esc(r.expected)} → ${esc(r.actual)}<br><small>${esc(r.responseTimeMs)} ms</small></td><td>${r.assertions.map(a=>`<div class="${a.passed?'pass':'fail'}">${a.passed?'✓':'✗'} ${esc(a.name)}${a.message?'<br><small>'+esc(a.message)+'</small>':''}</div>`).join('')}</td></tr>`).join('')}</tbody></table></details>`).join('')}<h2>Cách chạy lại</h2><p>Import collection và environment JSON vào Postman, chọn môi trường Clinic Local, kiểm tra dịch vụ đang chạy rồi Run toàn bộ collection theo thứ tự 00 đến 08. Tài khoản Postman được tạo riêng mỗi lần chạy; bước cuối khóa tài khoản và thu hồi membership của chúng. Không đổi ID fixture sang tài khoản đang sử dụng.</p></main></html>`;
fs.writeFileSync(path.join(out,'Ket-qua-kiem-thu.html'),html);
const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
const headers=['Mã','Nhóm','Tên ca','Phương thức','URL','HTTP mong đợi','HTTP thực tế','Thời gian ms','Kết quả','Assertion không đạt'];
const rows=results.map(r=>[r.id,r.group,r.name,r.method,r.url,r.expected,r.actual,r.responseTimeMs,r.passed?'Đạt':'Chưa đạt',r.assertions.filter(a=>!a.passed).map(a=>a.name+': '+a.message).join(' | ')]);
fs.writeFileSync(path.join(out,'Danh-sach-ca-kiem-thu.csv'),'\uFEFF'+[headers,...rows].map(r=>r.map(csv).join(',')).join('\r\n')+'\r\n');
const cli=fs.readFileSync(path.join(root,'.runtime/main/ui-audit-2026-10-08/postman-cli.log'),'utf8').replace(/\u001b\[[0-9;]*m/g,'');
fs.writeFileSync(path.join(out,'Nhat-ky-Postman-CLI.txt'),redact(cli));
console.log(JSON.stringify({summary,failed:results.filter(r=>!r.passed).map(r=>({id:r.id,actual:r.actual,errors:r.assertions.filter(a=>!a.passed).map(a=>a.message)}))},null,2));
