import {useAuthoritativeSync} from './useAuthoritativeSync';
import {doctorSubscription} from '../api/realtime';
import {DatePreview} from './DatePreview';
import {PatientIdentity} from './PatientIdentity';
import {usePanelSession,useSessionBranch} from '../auth/SessionProvider';
import {SourceSessionState} from '../auth/SourceSessionState';
import { useEffect,useRef,useState } from 'react';
import * as api from '../api/medical';
import { contexts,type Scope,type Directory } from '../api/reception';
import { signIn,RequestError } from '../api/booking';
import { stableOperationKey } from '../api/idempotency';
import { useNavigationLock } from './useNavigationLock';
import {WorklistTools} from './WorklistTools';
import {ArrowRight,Building2,ChevronRight,ClipboardCheck,FlaskConical,RefreshCw} from 'lucide-react';
const stateText:Record<string,string>={ORDERED:'Chờ tiếp nhận',ACCEPTED:'Đã tiếp nhận',PROCESSING:'Đang xử lý',RESULTED:'Chờ bác sĩ duyệt',REVIEWED:'Bác sĩ đã duyệt',REJECTED:'Đã từ chối',CANCELLED:'Đã hủy'};
export function LabPanel({onClinic,onNavigationLock}:{onClinic?:(name:string)=>void;onNavigationLock?:(reason:string|null)=>void}){
 const shared=usePanelSession(()=>run(login));
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[token,setToken]=useState(''),[directory,setDirectory]=useState<Directory|null>(null),[branch,setBranch]=useState('');
 const [orders,setOrders]=useState<api.Order[]|null>(null),[selected,setSelected]=useState(''),[reason,setReason]=useState(''),[source,setSource]=useState(''),[content,setContent]=useState('');
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const running=useRef(false),pending=useRef<(()=>Promise<api.Order>)|null>(null);const scope:Scope={token,clinic:directory?.id??'',branch};const order=orders?.find(x=>x.id===selected);
 const detailHeading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{
  if(!order)return;
  detailHeading.current?.focus({preventScroll:true});
  if(typeof window.matchMedia==='function'&&window.matchMedia('(max-width:760px)').matches)detailHeading.current?.scrollIntoView({block:'start'});
 },[order?.id]);
 const resultDirty=!!selected&&(source!==(order?.result?.sourceRef??'')||content!==(order?.result?.content??''));
 const scopeLocked=busy||uncertain||resultDirty;
 const [historyMode,setHistoryMode]=useState(false),[nextHistory,setNextHistory]=useState<string|null>(null),[from,setFrom]=useState(()=>new Date(Date.now()-30*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'})),[to,setTo]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'})),[versions,setVersions]=useState<NonNullable<api.Order['result']>[]>([]);
 async function loadOrders(history=historyMode,append=false,snapshot=scope){const page=history?await api.labHistory(snapshot,from,to,append?nextHistory??undefined:undefined):{items:await api.lab(snapshot),nextAfter:null};setOrders(old=>append?[...(old??[]),...page.items.filter(o=>!old?.some(x=>x.id===o.id))]:page.items);setNextHistory(page.nextAfter);}
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('');
 const filtered=orders?.filter(o=>(!filter||o.state===filter)&&(!query.trim()||`${o.patient?.fullName??''} ${o.patient?.patientCode??''} ${o.patient?.dateOfBirth??''} ${o.name} ${o.visitCode??''} ${o.encounterId} ${o.id}`.toLocaleLowerCase('vi-VN').includes(query.trim().toLocaleLowerCase('vi-VN'))))??[];
 const navigationReason=uncertain?'Thử lại thao tác kết quả đang chờ trước khi rời màn hình.':busy?'Đợi thao tác kết quả xử lý xong trước khi rời màn hình.':resultDirty?'Ghi phiên bản kết quả hoặc xóa nội dung đang sửa trước khi đổi chỉ định, địa điểm hoặc rời màn hình.':null;
 useNavigationLock(navigationReason,onNavigationLock);
 useAuthoritativeSync({key:scope.token+scope.clinic+scope.branch+historyMode+from+to,enabled:!!token&&!!branch&&!historyMode,blocked:scopeLocked,subscriptions:[doctorSubscription(scope,'medical')],refresh:async context=>{
  try{const rows=await api.lab(scope);if(!context.current()||running.current)return;setOrders(rows);setNextHistory(null);const chosen=rows.find(row=>row.id===selected);if(chosen){setContent(chosen.result?.content??'');setSource(chosen.result?.sourceRef??'');}setError('');}
  catch(e){if(context.current())setError('Chưa cập nhật được chỉ định. Hệ thống sẽ thử lại.');throw e;}
 },onDenied:()=>{setOrders(null);setError('Quyền truy cập chỉ định đã thay đổi.');}});
 async function run(work:()=>Promise<void>){if(running.current)return;running.current=true;setBusy(true);setError('');setMessage('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Chưa xác định kết quả');}finally{running.current=false;setBusy(false);}}
 async function login(){let auth:string;try{auth=shared?.session?.token??(await signIn(email,password)).data.accessToken;setEmail(shared?.session?.email??email);}finally{setPassword('');}const list=await contexts(auth);const ids=[...new Set(list.filter(m=>m.role==='DOCTOR').map(m=>m.clinicId))];const requested=new URLSearchParams(location.search).get('clinicId');const id=requested?(ids.includes(requested)?requested:null):ids.length===1?ids[0]:null;if(!id)throw new Error('Cần quyền Bác sĩ tại phòng khám được cấp.');const d=await api.labDirectory(auth,id);setToken(auth);setDirectory(d);onClinic?.(d.name);}
 useSessionBranch(shared,token,directory,branch,id=>run(()=>chooseBranch(id)));
 async function chooseBranch(id:string){setQuery('');setFilter('');setBranch(id);setOrders(null);setSelected('');setContent('');setSource('');setReason('');setVersions([]);if(id)await loadOrders(historyMode,false,{...scope,branch:id});}
 async function execute(action?:string){
  if(!pending.current){if(!order||!action)return;const snapshot={...scope},selectedOrder={...order},body={sourceRef:source,content,reason};const key=await stableOperationKey('medical-lab',{clinic:scope.clinic,branch,actorEmail:email,id:order.id,version:order.version,action,...body});pending.current=()=>action==='result'?api.result(snapshot,selectedOrder,body,key):api.transition(snapshot,selectedOrder,action,body.reason,key);}
  try{const updated=await pending.current();pending.current=null;setUncertain(false);setOrders(current=>current?.map(o=>o.id===updated.id?{...updated,patient:updated.patient??o.patient,visitCode:updated.visitCode??o.visitCode}:o)??[updated]);setMessage(updated.state==='RESULTED'?'Đã ghi kết quả có tác giả và nguồn. Chờ bác sĩ duyệt.':'Đã cập nhật chỉ định.');}
  catch(e){if(e instanceof RequestError&&e.status>=400&&e.status<500){pending.current=null;setUncertain(false);setOrders(null);throw new Error(e.message+' Tải lại danh sách chỉ định.');}setUncertain(true);throw e;}
 }
 function logout(){setToken('');setDirectory(null);setOrders(null);setContent('');setSource('');setReason('');setBranch('');setSelected('');pending.current=null;setUncertain(false);setError('');setMessage('');onClinic?.('Phòng khám theo phiên đăng nhập');}
 const branchName=directory?.branches.find(item=>item.id===branch)?.name;
 const pendingCount=orders?.filter(item=>item.state==='ORDERED').length??0;
 const processingCount=orders?.filter(item=>['ACCEPTED','PROCESSING'].includes(item.state)).length??0;
 const reviewCount=orders?.filter(item=>item.state==='RESULTED').length??0;
 return <section className="booking-panel reception-panel lab-panel" aria-labelledby="lab-title">
  <header className="task-panel-header lab-panel-header">
   <div className="lab-heading"><span className="lab-heading-icon"><FlaskConical size={24} aria-hidden="true"/></span><div><span className="eyebrow">Xét nghiệm</span><h1 id="lab-title">Kết quả xét nghiệm</h1><p>Tiếp nhận chỉ định, ghi kết quả và theo dõi bác sĩ duyệt.</p></div></div>
   {token&&<div className="lab-header-actions">
    {!shared&&<button type="button" disabled={scopeLocked} onClick={logout}>Đăng xuất bác sĩ</button>}
    <fieldset hidden={!!shared&&directory?.branches.filter(b=>b.active).length===1} disabled={scopeLocked}><label>Địa điểm xét nghiệm<select aria-label="Địa điểm xét nghiệm" value={branch} onChange={e=>void run(()=>chooseBranch(e.target.value))}><option value="">Chọn địa điểm được cấp</option>{directory?.branches.filter(x=>x.active).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></fieldset>
    {branch&&<button type="button" className="lab-refresh" aria-label="Tải lại chỉ định xét nghiệm" disabled={busy||uncertain||(resultDirty&&orders!==null)} onClick={()=>void run(async()=>{await loadOrders();})}><RefreshCw size={16} aria-hidden="true"/>Làm mới</button>}
   </div>}
  </header>
  {error&&<p role="alert" className="booking-error">{error}</p>}{message&&<p role="status" className="task-success">{message}</p>}{busy&&<p role="status">Đang xử lý xét nghiệm…</p>}
  {!token&&shared?<SourceSessionState error={error} retry={()=>void run(login)}/>:!token?<form className="booking-form" onSubmit={e=>{e.preventDefault();void run(login);}}>
   <label>Email bác sĩ<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>Mật khẩu bác sĩ<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="booking-primary" disabled={busy}>Đăng nhập bác sĩ</button>
  </form>:<>
   {uncertain&&<p role="status" className="navigation-lock">Yêu cầu được giữ nguyên để xác nhận lại. <button type="button" disabled={busy} onClick={()=>void run(()=>execute())}>Thử lại thao tác kết quả đang chờ</button></p>}
   {navigationReason&&!onNavigationLock&&<p role="status">{navigationReason}</p>}
   {resultDirty&&<details className="task-disclosure"><summary>Hủy thay đổi kết quả chưa ghi</summary><p>Nội dung đang sửa sẽ được thay bằng kết quả đã ghi tại máy chủ, nếu có. {orders===null?'Tải lại chỉ định để đối chiếu trước khi bỏ nội dung đang sửa.':''}</p>{order?.result&&<p className="result-content">Kết quả đã ghi: {order.result.content}</p>}<button type="button" disabled={busy||uncertain||!order} onClick={()=>{setContent(order?.result?.content??'');setSource(order?.result?.sourceRef??'');}}>Dùng lại kết quả đã ghi</button></details>}
   <div className="lab-view-toolbar"><div className="task-tabs lab-tabs" aria-label="Công việc kết quả"><button type="button" aria-pressed={!historyMode} disabled={scopeLocked} onClick={()=>void run(async()=>{setHistoryMode(false);setSelected('');setVersions([]);setOrders(null);await loadOrders(false);})}>Cần xử lý</button><button type="button" aria-pressed={historyMode} disabled={scopeLocked} onClick={()=>void run(async()=>{setHistoryMode(true);setSelected('');setVersions([]);setOrders(null);await loadOrders(true);})}>Lịch sử kết quả</button></div>{branchName&&<span className="lab-location"><Building2 size={15} aria-hidden="true"/>{branchName}</span>}</div>
   {branch&&!historyMode&&<div className="lab-summary" aria-label="Tổng hợp chỉ định đã tải"><div><span className="lab-summary-dot is-pending"/><span>Chờ tiếp nhận<strong>{orders?pendingCount:'—'}</strong></span></div><div><span className="lab-summary-dot is-processing"/><span>Đang thực hiện<strong>{orders?processingCount:'—'}</strong></span></div><div><span className="lab-summary-dot is-review"/><span>Chờ bác sĩ duyệt<strong>{orders?reviewCount:'—'}</strong></span></div></div>}
   {historyMode&&<form className="doctor-toolbar lab-history-filter" onSubmit={e=>{e.preventDefault();void run(async()=>{setSelected('');setVersions([]);await loadOrders(true);});}}><label>Từ ngày<input aria-label="Từ ngày" type="date" required disabled={scopeLocked} value={from} onChange={e=>setFrom(e.target.value)}/><DatePreview value={from}/></label><label>Đến ngày<input aria-label="Đến ngày" type="date" required disabled={scopeLocked} value={to} onChange={e=>setTo(e.target.value)}/><DatePreview value={to}/></label><button disabled={scopeLocked}>Tra lịch sử kết quả</button></form>}
   <div className="doctor-layout lab-layout">
    <fieldset className="reception-actions doctor-queue lab-worklist-panel" disabled={busy||uncertain}>
     <legend className="sr-only">Danh sách chỉ định xét nghiệm</legend>
     <div className="lab-worklist-heading"><h2>Danh sách chỉ định</h2><span className="lab-count">{orders?.length??'—'}</span></div>
     <WorklistTools query={query} onQuery={setQuery} state={filter} onState={setFilter} states={stateText} disabled={scopeLocked} count={filtered.length} total={orders?.length??0}/>
     {orders?.length===0&&<p role="status" className="lab-list-empty">{historyMode?'Không có chỉ định trong khoảng ngày này.':'Không có chỉ định cần xử lý.'}</p>}
     {orders&&filtered.length===0&&orders.length>0&&<p role="status" className="task-empty">Không có chỉ định khớp bộ lọc. Xóa bộ lọc để xem lại danh sách đã tải.</p>}
     <ul className="doctor-worklist" aria-label="Danh sách chỉ định xét nghiệm">{filtered.map(o=><li key={o.id} className={selected===o.id?'worklist-selected':''}>
      <button type="button" className="lab-order-select" disabled={resultDirty} onClick={()=>{setSelected(o.id);setVersions([]);setContent(o.result?.content??'');setSource(o.result?.sourceRef??'');setReason('');}} aria-label={'Chọn chỉ định '+o.name} aria-pressed={selected===o.id}><PatientIdentity patient={o.patient}/><span className="lab-order-name"><FlaskConical size={15} aria-hidden="true"/>{o.name}</span><span className="lab-order-footer"><span className="task-status" data-state={o.state}>{stateText[o.state]??o.state}</span><ChevronRight size={17} aria-hidden="true"/></span>{o.visitCode&&<span className="lab-visit-code">{o.visitCode}</span>}</button>
     </li>)}</ul>{historyMode&&nextHistory&&<button type="button" className="lab-load-more" disabled={scopeLocked} onClick={()=>void run(()=>loadOrders(true,true))}>Tải thêm lịch sử kết quả</button>}
    </fieldset>
    <fieldset className="reception-actions doctor-case lab-detail-panel" disabled={busy||uncertain} aria-label="Chi tiết chỉ định xét nghiệm">
     {order?<div className="task-card lab-order-detail">
      <header className="lab-detail-heading"><div><span className="eyebrow">Chỉ định đang chọn</span><h2 ref={detailHeading} tabIndex={-1}>{order.name}</h2></div><span className="task-status" data-state={order.state}>{stateText[order.state]??order.state}</span></header>
      <div className="lab-patient-summary"><PatientIdentity patient={order.patient}/>{order.visitCode&&<div className="lab-visit"><span>Mã lượt khám</span><strong>{order.visitCode}</strong></div>}</div>
      {['ORDERED','ACCEPTED','PROCESSING','RESULTED'].includes(order.state)&&<section className="lab-detail-section"><h3>Xử lý chỉ định</h3><label>Lý do xử lý xét nghiệm<textarea rows={2} placeholder="Nhập lý do thực hiện thao tác…" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {order.state==='ORDERED'&&<div className="task-button-row"><button type="button" className="booking-primary" disabled={!reason.trim()} onClick={()=>void run(()=>execute('accept'))}>Nhận chỉ định<ArrowRight size={15} aria-hidden="true"/></button><button type="button" disabled={!reason.trim()} onClick={()=>void run(()=>execute('reject'))}>Từ chối chỉ định có lý do</button></div>}
      {order.state==='ACCEPTED'&&<button type="button" className="booking-primary" disabled={!reason.trim()} onClick={()=>void run(()=>execute('process'))}>Bắt đầu xử lý xét nghiệm</button>}
      </section>}
      {['PROCESSING','RESULTED'].includes(order.state)&&<section className="lab-detail-section lab-result-section"><h3>Nhập kết quả</h3><label>Nguồn kết quả<input placeholder="Mã phiếu hoặc nguồn cung cấp kết quả" maxLength={200} value={source} onChange={e=>setSource(e.target.value)}/></label><label>Nội dung kết quả<textarea rows={7} className="lab-result-input" placeholder="Nhập các chỉ số và nội dung kết quả xét nghiệm…" maxLength={8000} value={content} onChange={e=>setContent(e.target.value)}/></label><div className="lab-result-actions"><span>Kết quả đã ghi sẽ được gửi để bác sĩ duyệt.</span><button type="button" className="booking-primary" disabled={!reason.trim()||!source.trim()||!content.trim()} onClick={()=>void run(()=>execute('result'))}><ClipboardCheck size={16} aria-hidden="true"/>Ghi phiên bản kết quả</button></div></section>}
      {['REVIEWED','RESULTED'].includes(order.state)&&order.result&&<article className="booking-confirm lab-recorded-result"><h3>Kết quả đã ghi</h3><p>Nguồn: {order.result.sourceRef}</p><p className="result-content">{order.result.content}</p></article>}{order.result&&<details className="task-disclosure"><summary>Các phiên bản kết quả đã ghi</summary><button type="button" disabled={busy} onClick={()=>void run(async()=>setVersions(await api.resultHistory(scope,order.id)))}>Tải các phiên bản kết quả</button>{versions.map(v=><article key={v.id}><h3>Phiên bản {v.version}</h3><p>{new Date(v.createdAt).toLocaleString('vi-VN')} · {v.sourceRef}</p><p className="result-content">{v.content}</p></article>)}</details>}
     </div>:<div className="lab-selection-empty"><span className="lab-empty-icon"><FlaskConical size={28} aria-hidden="true"/></span><h2>{!branch?'Chọn địa điểm xét nghiệm':historyMode?'Chọn chỉ định để xem kết quả':'Chọn chỉ định cần xử lý'}</h2><p>{!branch?'Chọn địa điểm được cấp để tải danh sách chỉ định.':historyMode?'Chọn một chỉ định để xem kết quả và các phiên bản đã ghi.':'Chọn một chỉ định trong danh sách để xem thông tin và ghi kết quả.'}</p>{!historyMode&&<ol className="lab-workflow"><li><span>1</span>Tiếp nhận</li><li><span>2</span>Thực hiện</li><li><span>3</span>Ghi kết quả</li></ol>}</div>}
    </fieldset>
   </div>
  </>}
 </section>;
}
