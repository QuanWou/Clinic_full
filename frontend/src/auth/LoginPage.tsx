import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRight,Building2,ClipboardList,Eye,EyeOff,House,LockKeyhole,Mail,ShieldCheck,Stethoscope,UserRound,X} from 'lucide-react';
import {clinicContexts,workspaceUrl} from './access';
import {useLocation,useSession} from './SessionProvider';
import {patientReturnTo,workspaceReturnTo} from './returnTo';

function PasswordField({value,onChange,disabled,decorated=false}:{value:string;onChange:(value:string)=>void;disabled:boolean;decorated?:boolean}){
 const [show,setShow]=useState(false);
 return <label>Mật khẩu<div className={'password-field'+(decorated?' workspace-entry-input':'')}>{decorated&&<LockKeyhole className="workspace-entry-field-icon" size={20} aria-hidden="true"/>}<input required type={show?'text':'password'} autoComplete="current-password" placeholder={decorated?'Nhập mật khẩu':undefined} disabled={disabled} minLength={8} maxLength={100} value={value} onChange={e=>onChange(e.target.value)}/><button type="button" disabled={disabled} aria-label={show?'Ẩn mật khẩu':'Hiện mật khẩu'} onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={decorated?19:17}/>:<Eye size={decorated?19:17}/>}</button></div></label>;
}

export function PatientAuthPanel(){
 const auth=useSession()!,location=useLocation();
 const register=window.location.pathname==='/public/register';
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[fullName,setFullName]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const params=new URLSearchParams(location.split('?')[1]??'');
 const returnTo=patientReturnTo(params.get('returnTo'));
 useEffect(()=>{
  if(auth.patientSession)auth.navigate(returnTo??'/tai-khoan/lich-kham',true);
 },[auth.patientSession?.token,returnTo]);

 async function submit(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   await auth.authenticatePatient(email.trim(),password,register?fullName.trim():undefined);
   setPassword('');
   auth.navigate(returnTo??'/tai-khoan/lich-kham',true);
  }catch(e){setPassword('');setError(e instanceof Error?e.message:'Chưa đăng nhập được. Vui lòng thử lại.');}
  finally{setBusy(false);}
 }
 const target=returnTo?'?'+new URLSearchParams({returnTo}):'';
 return <section className="public-section public-auth-shell" aria-labelledby="patient-login-title">
   <div className="public-auth-intro">
    <span className="eyebrow">TÀI KHOẢN BỆNH NHÂN</span>
    <h1 id="patient-login-title">{register?'Tạo tài khoản':'Đăng nhập'}</h1>
    <p>{register?'Tạo tài khoản để đặt lịch và quản lý thông tin khám của bạn trong cùng hệ thống của phòng khám.':'Đăng nhập để quản lý lịch khám, hồ sơ khám và hóa đơn của bạn.'}</p>
    <ul><li>Quản lý lịch khám tại phòng khám</li><li>Xem hồ sơ đã hoàn tất</li><li>Theo dõi hóa đơn và lịch tái khám</li></ul>
   </div>
   <div className="public-auth-form-panel">
    <div className="public-auth-form-head"><span className="booking-section-kicker">{register?'Tạo tài khoản':'Đăng nhập'}</span><h2>{register?'Thông tin tài khoản mới':'Chào mừng bạn quay lại'}</h2><p>{register?'Nhập thông tin cơ bản để bắt đầu.':'Sử dụng tài khoản bệnh nhân của bạn để tiếp tục.'}</p></div>
    {error&&<p className="login-notice" role="alert">{error}</p>}
    {auth.notice&&!error&&<p className="login-notice" role="status">{auth.notice}</p>}
    <form className="login-form public-auth-form" onSubmit={submit}>
     <fieldset disabled={busy}>
      {register&&<label>Họ tên<input required autoComplete="name" maxLength={180} value={fullName} onChange={e=>setFullName(e.target.value)}/></label>}
      <label>Email<input required type="email" autoComplete="username" maxLength={180} value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <PasswordField value={password} onChange={setPassword} disabled={busy}/>
      <button className="booking-primary login-submit" disabled={busy}>{busy?'Đang xử lý…':register?'Tạo tài khoản':'Đăng nhập'}<ArrowRight size={17}/></button>
     </fieldset>
    </form>
    <p className="login-register">{register?'Đã có tài khoản? ':'Chưa có tài khoản? '}<a href={(register?'/public/login':'/public/register')+target} onClick={e=>{e.preventDefault();auth.navigate((register?'/public/login':'/public/register')+target);}}>{register?'Đăng nhập':'Tạo tài khoản'}</a></p>
   </div>
 </section>;
}

/** Compatibility export for focused auth tests; routing now renders PatientAuthPanel inside PublicShell. */
export function PatientLoginPage(_props:{brandName?:string}={}){ return <PatientAuthPanel/>; }

export function WorkspaceLoginPage({brandName='Phòng khám'}:{brandName?:string}){
 const auth=useSession()!,location=useLocation();
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [help,setHelp]=useState<'password'|'account'|'security'|null>(null),helpDialog=useRef<HTMLDialogElement>(null);
 const params=new URLSearchParams(location.split('?')[1]??'');
 const returnTo=workspaceReturnTo(params.get('returnTo'));
 useEffect(()=>{document.title='Đăng nhập Workspace | '+brandName;},[brandName]);
 useEffect(()=>{const dialog=helpDialog.current;if(!help||!dialog)return;dialog.showModal();return()=>dialog.close();},[help]);

 useEffect(()=>{
  if(!auth.workspaceSession)return;
  auth.navigate(returnTo??workspaceUrl(auth.workspaceSession),true);
 },[auth.workspaceSession?.token,returnTo]);

 async function submit(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const user=await auth.authenticateWorkspace(email.trim(),password);setPassword('');
   if(returnTo){
    const url=new URL(returnTo,window.location.origin),requested=url.searchParams.get('clinicId');
    if(requested&&!clinicContexts(user,requested).clinic){auth.signOutWorkspace();throw new Error('Tài khoản không có quyền truy cập không gian làm việc của phòng khám.');}
   }
   auth.navigate(returnTo??workspaceUrl(user),true);
  }catch(e){setPassword('');setError(e instanceof Error?e.message:'Chưa đăng nhập được. Vui lòng thử lại.');}
  finally{setBusy(false);}
 }
 return <div className="login-page login-workspace workspace-entry">
  <header className="workspace-entry-header"><a className="workspace-entry-brand" href="/public" onClick={e=>{e.preventDefault();auth.navigate('/public');}}><span className="workspace-entry-cross" aria-hidden="true"/><strong>{brandName}</strong></a><a className="workspace-entry-home" href="/public" onClick={e=>{e.preventDefault();auth.navigate('/public');}}><House size={20} aria-hidden="true"/>Về trang chủ</a></header>
  <main id="main-content" className="workspace-entry-body">
   <section className="workspace-entry-hero" aria-labelledby="workspace-welcome-title">
    <div className="workspace-entry-hero-copy"><span className="workspace-entry-kicker">CHĂM SÓC SỨC KHỎE</span><h2 id="workspace-welcome-title">An tâm sức khỏe.<br/>Trọn vẹn cuộc sống.</h2><p>Tận tâm chăm sóc, kết nối đội ngũ.</p></div>
    <figure className="workspace-entry-photo"><img src="/images/generated/clinic-corridor-ai.png" alt="Không gian hành lang và khu vực chờ của phòng khám" width={1536} height={1024} fetchPriority="high" decoding="async"/><figcaption><span><Building2 size={28} aria-hidden="true"/></span><div><strong>Không gian chăm sóc</strong><p>Hiện đại, nhẹ nhàng và gần gũi</p></div></figcaption></figure>
    <div className="workspace-entry-features"><div><span><Stethoscope size={26} aria-hidden="true"/></span><strong>Phối hợp chăm sóc</strong></div><div><span><ClipboardList size={26} aria-hidden="true"/></span><strong>Quản lý công việc</strong></div></div>
   </section>
   <div className="workspace-entry-form-region">
   <section className="login-card workspace-login-card" aria-labelledby="workspace-login-title">
    <div className="workspace-entry-welcome"><span className="workspace-entry-avatar" aria-hidden="true"><UserRound size={38} fill="currentColor"/></span><h1 id="workspace-login-title" aria-label="Đăng nhập">Chào mừng trở lại</h1><p>Đăng nhập vào không gian làm việc của phòng khám.</p></div>
    {error&&<p className="login-notice" role="alert">{error}</p>}
    {auth.notice&&!error&&<p className="login-notice" role="status">{auth.notice}</p>}
    <form className="login-form" onSubmit={submit}>
     <fieldset disabled={busy}>
      <label>Email<span className="workspace-entry-input"><Mail className="workspace-entry-field-icon" size={20} aria-hidden="true"/><input required type="email" autoComplete="username" placeholder="Nhập email của bạn" maxLength={180} value={email} onChange={e=>setEmail(e.target.value)}/></span></label>
      <PasswordField value={password} onChange={setPassword} disabled={busy} decorated/>
      <div className="workspace-entry-assist"><span><ShieldCheck size={15} aria-hidden="true"/>Clinic Workspace</span><button type="button" onClick={()=>setHelp('password')}>Quên mật khẩu?</button></div>
      <button className="booking-primary login-submit" disabled={busy}>{busy?'Đang xác minh…':'Đăng nhập'}<ArrowRight size={17}/></button>
     </fieldset>
    </form>
    <p className="workspace-entry-account-help">Chưa có tài khoản? <button type="button" onClick={()=>setHelp('account')}>Liên hệ quản trị</button></p>
    <p className="login-card-footer"><ShieldCheck size={20} aria-hidden="true"/>Truy cập công việc theo quyền được phân công</p>
   </section>
   </div>
  </main>
  <footer className="workspace-entry-footer"><span>© {new Date().getFullYear()} {brandName}</span><nav aria-label="Hỗ trợ đăng nhập"><a href="/lien-he" onClick={e=>{e.preventDefault();auth.navigate('/lien-he');}}>Hỗ trợ</a><button type="button" onClick={()=>setHelp('security')}>Bảo mật tài khoản</button></nav></footer>
  {help&&<dialog ref={helpDialog} className="workspace-entry-dialog" aria-labelledby="workspace-entry-help-title" onCancel={e=>{e.preventDefault();setHelp(null);}} onClick={e=>{if(e.target===e.currentTarget)setHelp(null);}}><div className="workspace-entry-dialog-heading"><h2 id="workspace-entry-help-title">{help==='password'?'Quên mật khẩu?':help==='account'?'Tài khoản Workspace':'Bảo mật tài khoản'}</h2><button type="button" aria-label="Đóng hướng dẫn" onClick={()=>setHelp(null)}><X size={20}/></button></div>{help==='password'?<><p>Liên hệ quản trị phòng khám để đặt lại mật khẩu cho tài khoản nhân viên của bạn.</p><p>Cung cấp email đăng nhập để quản trị xác định đúng tài khoản cần hỗ trợ.</p></>:help==='account'?<><p>Tài khoản Workspace được cấp bởi quản trị phòng khám theo vai trò và phạm vi làm việc.</p><p>Liên hệ quản trị để được tạo tài khoản hoặc bổ sung quyền trước khi đăng nhập.</p></>:<><p>Giữ kín mật khẩu và đăng xuất khi sử dụng máy tính dùng chung.</p><p>Bạn có thể thu hồi phiên đăng nhập trong phần Cài đặt tài khoản của Workspace.</p></>}</dialog>}
 </div>;
}
