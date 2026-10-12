import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Bell,X} from 'lucide-react';
import {getNotifications,getUnreadNotificationCount,markNotificationRead,type Notification} from '../api/booking';
import {notificationSubscription} from '../api/realtime';
import {useAuthoritativeSync} from './useAuthoritativeSync';

/** List replacement and persisted read state make reconnect and duplicate delivery idempotent. */
export function NotificationInbox({token}:{token:string}){
 const [rows,setRows]=useState<Notification[]>([]),[open,setOpen]=useState(false),[error,setError]=useState(''),[reading,setReading]=useState(false);
 const [unread,setUnread]=useState(0),epoch=useRef(0);
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLElement>(null),closeButton=useRef<HTMLButtonElement>(null);
 const panelId=useId();
 const [position,setPosition]=useState({left:16,top:16,width:360,maxHeight:480});
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{
   const anchor=trigger.current?.getBoundingClientRect();if(!anchor)return;
   const margin=16,gap=10,width=Math.min(384,window.innerWidth-margin*2);
   const below=window.innerHeight-anchor.bottom-gap-margin,above=anchor.top-gap-margin;
   const upwards=below<180&&above>below;
   const maxHeight=Math.max(80,Math.min(520,upwards?above:below));
   const height=Math.min(panel.current?.scrollHeight??maxHeight,maxHeight);
   setPosition({left:Math.max(margin,Math.min(anchor.right-width,window.innerWidth-width-margin)),top:Math.max(margin,upwards?anchor.top-gap-height:anchor.bottom+gap),width,maxHeight});
  };
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open,rows,error]);
 useEffect(()=>{
  if(!open)return;
  closeButton.current?.focus();
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!panel.current?.contains(event.target)&&!trigger.current?.contains(event.target))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 useEffect(()=>{epoch.current++;setRows([]);setUnread(0);setReading(false);setOpen(false);setError('');return()=>{epoch.current++;};},[token]);
 useAuthoritativeSync({key:token,enabled:!!token,initial:true,blocked:reading,subscriptions:[notificationSubscription(token)],refresh:async context=>{
  try{const [rows,count]=await Promise.all([getNotifications(token),getUnreadNotificationCount(token)]);if(!Array.isArray(rows)||!Number.isFinite(count.count))throw new Error('Invalid inbox response');if(context.current()){setRows(rows);setUnread(count.count);setError('');}}catch(e){if(context.current())setError('Chưa cập nhật được thông báo. Hệ thống sẽ thử lại.');throw e;}
 },onDenied:()=>{epoch.current++;setRows([]);setUnread(0);setOpen(false);}});
 async function read(id:string){const current=epoch.current;setReading(true);try{await markNotificationRead(token,id);const [rows,count]=await Promise.all([getNotifications(token),getUnreadNotificationCount(token)]);if(current===epoch.current){setRows(rows);setUnread(count.count);setError('');}}catch{if(current===epoch.current)setError('Chưa ghi nhận được trạng thái đã đọc.');}finally{if(current===epoch.current)setReading(false);}}
 return <div className="notification-inbox"><button ref={trigger} className="notification-trigger" type="button" aria-label={'Thông báo, '+unread+' chưa đọc'} aria-expanded={open} aria-controls={open?panelId:undefined} aria-haspopup="dialog" onClick={()=>setOpen(value=>!value)}><Bell size={20} aria-hidden="true"/>{unread>0&&<span className="notification-count">{unread>99?'99+':unread}</span>}</button>
  {open&&createPortal(<section ref={panel} id={panelId} className="notification-popover" style={position} role="dialog" aria-labelledby={panelId+'-title'}>
   <header className="notification-heading"><div><h2 id={panelId+'-title'}>Thông báo</h2><p>{unread>0?unread+' thông báo chưa đọc':'Bạn đã xem tất cả thông báo'}</p></div><button ref={closeButton} className="notification-close" type="button" aria-label="Đóng thông báo" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={18} aria-hidden="true"/></button></header>
   {error&&<p className="notification-error" role="alert">{error}</p>}
   {!rows.length&&!error&&<div className="notification-empty"><Bell size={26} aria-hidden="true"/><p>Chưa có thông báo.</p><span>Thông báo mới sẽ xuất hiện tại đây.</span></div>}
   {!!rows.length&&<ul className="notification-list">{rows.map(row=><li key={row.id} className={row.read_at?'':'notification-unread'}><p>{row.message}</p><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('vi-VN')}</time>{!row.read_at&&<button className="notification-read" type="button" disabled={reading} onClick={()=>void read(row.id)}>Đánh dấu đã đọc</button>}</li>)}</ul>}
  </section>,document.body)}
 </div>;
}
