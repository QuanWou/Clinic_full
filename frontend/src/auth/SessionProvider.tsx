import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {logoutAuth,refreshAuth,signIn} from '../api/booking';
import {requestJson} from '../api/client';
import {contexts} from '../api/reception';
import {current} from '../api/configuration';
import type {UserSession} from './access';
import {readStoredSession,restoreStoredSession,sessionErrorStatus,storeSession,type StoredSession} from './storedSession';
import {navigateLocal,initializeNavigation,guardHistory} from './navigation';
export {navigateLocal} from './navigation';

type Channel='patient'|'workspace';
type SessionContextValue={
 session:UserSession|null;
 patientSession:UserSession|null;
 workspaceSession:UserSession|null;
 patientRestoring:boolean;
 workspaceRestoring:boolean;
 restorationError:string;
 retryRestoration:()=>void;
 publicVersion:number;
 notice:string;
 authenticate:(email:string,password:string,fullName?:string)=>Promise<UserSession>;
 authenticatePatient:(email:string,password:string,fullName?:string)=>Promise<UserSession>;
 authenticateWorkspace:(email:string,password:string)=>Promise<UserSession>;
 signOut:(notice?:string)=>void;
 signOutPatient:(notice?:string)=>void;
 signOutWorkspace:(notice?:string)=>void;
 refresh:()=>Promise<UserSession|null>;
 refreshPatient:()=>Promise<UserSession|null>;
 refreshWorkspace:()=>Promise<UserSession|null>;
 navigate:(url:string,replace?:boolean)=>void;
};
const SessionContext=createContext<SessionContextValue|null>(null);
export function useSession(){return useContext(SessionContext);}
export function useLocation(){
 const [location,setLocation]=useState(()=>typeof window==='undefined'?'/':window.location.pathname+window.location.search);
 useEffect(()=>{const update=(event:Event)=>{if(event.type==='popstate'&&!guardHistory(event as PopStateEvent))return;setLocation(window.location.pathname+window.location.search);};window.addEventListener('popstate',update);window.addEventListener('clinic:navigate',update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener('clinic:navigate',update);};},[]);
 return location;
}
const channelFor=(location:string):Channel=>/^\/(workspace|platform)(\/|$)/.test(location.split('?')[0])?'workspace':'patient';
const patientBase=import.meta.env.VITE_PATIENT_URL??'/s1/patient';

export function SessionProvider({children}:{children:ReactNode}){
 useEffect(()=>{initializeNavigation();},[]);
 const location=useLocation();
 const channel=channelFor(location);
 const [patientSession,setPatientSession]=useState<UserSession|null>(null);
 const [workspaceSession,setWorkspaceSession]=useState<UserSession|null>(null);
 const [patientNotice,setPatientNotice]=useState(''),[workspaceNotice,setWorkspaceNotice]=useState('');
 const [publicVersion,setPublicVersion]=useState(0);
 const patientActive=useRef<UserSession|null>(null),workspaceActive=useRef<UserSession|null>(null);
 const patientGeneration=useRef(0),workspaceGeneration=useRef(0);
 const renewalRetries=useRef<Partial<Record<Channel,ReturnType<typeof setTimeout>>>>({});
 useEffect(()=>()=>{Object.values(renewalRetries.current).forEach(clearTimeout);},[]);
 const [saved]=useState(()=>({patient:readStoredSession('patient'),workspace:readStoredSession('workspace')}));
 const restoring=useRef<Record<Channel,StoredSession|null>>(saved);
 const restorePromises=useRef<Partial<Record<Channel,Promise<UserSession>>>>({});
 const [restoreState,setRestoreState]=useState(()=>({patient:saved.patient?'loading':'ready',workspace:saved.workspace?'loading':'ready'}));
 const [restoreErrors,setRestoreErrors]=useState({patient:'',workspace:''});
 const [restoreAttempt,setRestoreAttempt]=useState(0);

 const clearPatient=useCallback((message='')=>{
  clearTimeout(renewalRetries.current.patient);delete renewalRetries.current.patient;
  patientGeneration.current++;
  patientActive.current=null;
  restoring.current.patient=null;storeSession('patient',null);
  setRestoreState(previous=>({...previous,patient:'ready'}));
  setRestoreErrors(previous=>({...previous,patient:''}));
  setPatientSession(null);
  setPatientNotice(message);
  setPublicVersion(value=>value+1);
 },[]);
 const clearWorkspace=useCallback((message='')=>{
  clearTimeout(renewalRetries.current.workspace);delete renewalRetries.current.workspace;
  workspaceGeneration.current++;
  workspaceActive.current=null;
  restoring.current.workspace=null;storeSession('workspace',null);
  setRestoreState(previous=>({...previous,workspace:'ready'}));
  setRestoreErrors(previous=>({...previous,workspace:''}));
  setWorkspaceSession(null);
  setWorkspaceNotice(message);
 },[]);

 useEffect(()=>{
  let canceled=false;
  for(const target of ['patient','workspace'] as const){
   const credentials=restoring.current[target];if(!credentials)continue;
   const active=target==='patient'?patientActive:workspaceActive;
   const generation=target==='patient'?patientGeneration:workspaceGeneration;
   const version=generation.current;
   // StrictMode mounts effects twice; share the same refresh request.
   const promise=restorePromises.current[target]??=restoreStoredSession(target,credentials);
   void promise.then(user=>{
    if(canceled||version!==generation.current)return;
    active.current=user;restoring.current[target]=null;storeSession(target,user);
    if(target==='patient')setPatientSession(user);else setWorkspaceSession(user);
    setRestoreState(previous=>({...previous,[target]:'ready'}));
    setRestoreErrors(previous=>({...previous,[target]:''}));
   }).catch(error=>{
    if(canceled||version!==generation.current)return;
    const status=sessionErrorStatus(error);
    if(status===401||status===403){
     if(target==='patient')clearPatient('Phiên bệnh nhân đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.');
     else clearWorkspace('Phiên làm việc đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.');
    }else{
     restoring.current[target]=readStoredSession(target)??credentials;
     setRestoreState(previous=>({...previous,[target]:'error'}));
     setRestoreErrors(previous=>({...previous,[target]:'Chưa kết nối được để khôi phục phiên đăng nhập. Vui lòng thử lại.'}));
    }
   });
  }
  return()=>{canceled=true;};
 },[restoreAttempt,clearPatient,clearWorkspace]);

 const retryRestoration=useCallback(()=>{
  delete restorePromises.current[channel];
  setRestoreErrors(previous=>({...previous,[channel]:''}));
  setRestoreState(previous=>({...previous,[channel]:'loading'}));
  setRestoreAttempt(value=>value+1);
 },[channel]);

 const resolveSession=useCallback(async(email:string,password:string,fullName?:string)=>{
  const response=await signIn(email,password,fullName);
  const token=response.data.accessToken;
  const [actor,grants]=await Promise.all([current(token),contexts(token)]);
  return {token,refreshToken:response.data.refreshToken,email:response.data.email??email,displayName:response.data.fullName??fullName,actor,contexts:grants} satisfies UserSession;
 },[]);

 const authenticatePatient=useCallback(async(email:string,password:string,fullName?:string)=>{
  const version=++patientGeneration.current;
  const user=await resolveSession(email,password,fullName);
  if(user.contexts.length||user.actor.platformOperator){
   const profile=await requestJson<unknown>(patientBase+'/api/me/patient-profile',{headers:{Authorization:'Bearer '+user.token}});
   if(!profile.ok){
    if(user.refreshToken)void logoutAuth(user.refreshToken).catch(()=>{});
    throw new Error('Tài khoản này chưa có hồ sơ bệnh nhân được liên kết. Vui lòng sử dụng tài khoản bệnh nhân hoặc liên hệ phòng khám.');
   }
  }
  if(version!==patientGeneration.current)throw new Error('Lần đăng nhập này đã kết thúc.');
  if(patientActive.current&&patientActive.current.actor.userId!==user.actor.userId)setPublicVersion(value=>value+1);
  patientActive.current=user;restoring.current.patient=null;storeSession('patient',user);setRestoreState(previous=>({...previous,patient:'ready'}));setPatientSession(user);setPatientNotice('');return user;
 },[resolveSession]);

 const authenticateWorkspace=useCallback(async(email:string,password:string)=>{
  const version=++workspaceGeneration.current;
  const user=await resolveSession(email,password);
  if(!user.contexts.length&&!user.actor.platformOperator){
   if(user.refreshToken)void logoutAuth(user.refreshToken).catch(()=>{});
   throw new Error('Tài khoản không có quyền truy cập không gian làm việc của phòng khám.');
  }
  if(version!==workspaceGeneration.current)throw new Error('Lần đăng nhập này đã kết thúc.');
  workspaceActive.current=user;restoring.current.workspace=null;storeSession('workspace',user);setRestoreState(previous=>({...previous,workspace:'ready'}));setWorkspaceSession(user);setWorkspaceNotice('');return user;
 },[resolveSession]);

 const refreshChannel=useCallback(async(target:Channel)=>{
  const active=target==='patient'?patientActive:workspaceActive;
  const versionRef=target==='patient'?patientGeneration:workspaceGeneration;
  const previous=active.current,version=versionRef.current;if(!previous)return null;
  const [actor,grants]=await Promise.all([current(previous.token),contexts(previous.token)]);
  if(version!==versionRef.current)return null;
  if(target==='workspace'&&!grants.length&&!actor.platformOperator){clearWorkspace('Quyền truy cập không gian làm việc đã hết hiệu lực. Vui lòng đăng nhập lại.');return null;}
  if(JSON.stringify(actor)===JSON.stringify(previous.actor)&&JSON.stringify(grants)===JSON.stringify(previous.contexts))return previous;
  const user={...previous,actor,contexts:grants};active.current=user;
  if(target==='patient')setPatientSession(user);else setWorkspaceSession(user);
  return user;
 },[clearWorkspace]);

 const refreshPatient=useCallback(()=>refreshChannel('patient'),[refreshChannel]);
 const refreshWorkspace=useCallback(()=>refreshChannel('workspace'),[refreshChannel]);

 const renewChannel=useCallback(async(target:Channel):Promise<UserSession|null>=>{
  const active=target==='patient'?patientActive:workspaceActive;
  const versionRef=target==='patient'?patientGeneration:workspaceGeneration;
  const previous=active.current,version=versionRef.current;
  if(!previous)return null;
  clearTimeout(renewalRetries.current[target]);delete renewalRetries.current[target];
  if(!previous.refreshToken)return refreshChannel(target);
  try{
   const response=await refreshAuth(previous.refreshToken);
   const token=response.data.accessToken;
   if(version!==versionRef.current)return null;
   // Persist rotation before checking dependencies so a temporary outage cannot lose it.
   const credentials={...previous,token,refreshToken:response.data.refreshToken??previous.refreshToken,email:response.data.email??previous.email,displayName:response.data.fullName??previous.displayName};
   active.current=credentials;storeSession(target,credentials);
   const [actor,grants]=await Promise.all([current(token),contexts(token)]);
   if(version!==versionRef.current)return null;
   if(target==='workspace'&&!grants.length&&!actor.platformOperator){clearWorkspace('Quyền truy cập không gian làm việc đã hết hiệu lực. Vui lòng đăng nhập lại.');return null;}
   if(target==='patient'&&(grants.length||actor.platformOperator)){
    const profile=await requestJson<unknown>(patientBase+'/api/me/patient-profile',{headers:{Authorization:'Bearer '+token}});
    if(!profile.ok){
     if([401,403,404].includes(profile.status)){clearPatient('Tài khoản không còn có quyền truy cập hồ sơ bệnh nhân. Vui lòng đăng nhập lại.');return null;}
     throw Object.assign(new Error('Patient profile verification unavailable'),{status:profile.status});
    }
   }
   if(version!==versionRef.current)return null;
   const user={...credentials,actor,contexts:grants};
   active.current=user;
   storeSession(target,user);
   if(target==='patient'){setPatientSession(user);setPatientNotice('');}else{setWorkspaceSession(user);setWorkspaceNotice('');}
   return user;
  }catch(error){
   if(version!==versionRef.current)return null;
   const status=sessionErrorStatus(error);
   if(status!==401&&status!==403){
    const message='Chưa kết nối được để gia hạn phiên. Hệ thống sẽ thử lại.';
    if(target==='patient')setPatientNotice(message);else setWorkspaceNotice(message);
    renewalRetries.current[target]=setTimeout(()=>{if(version===versionRef.current)void renewChannel(target);},15000);
    return null;
   }
   if(target==='patient')clearPatient('Phiên bệnh nhân đã hết hạn. Vui lòng đăng nhập lại.');
   else clearWorkspace('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
   return null;
  }
 },[refreshChannel,clearPatient,clearWorkspace]);

 const signOutPatient=useCallback((message='')=>{
  const refreshToken=patientActive.current?.refreshToken??restoring.current.patient?.refreshToken;
  if(refreshToken)void logoutAuth(refreshToken).catch(()=>{});
  clearPatient(message);
 },[clearPatient]);
 const signOutWorkspace=useCallback((message='')=>{
  const refreshToken=workspaceActive.current?.refreshToken??restoring.current.workspace?.refreshToken;
  if(refreshToken)void logoutAuth(refreshToken).catch(()=>{});
  clearWorkspace(message);
 },[clearWorkspace]);

 useEffect(()=>{
  const invalid=(event:Event)=>{
   const authorization=(event as CustomEvent).detail?.authorization;
   const patientMatch=!!patientActive.current&&authorization==='Bearer '+patientActive.current.token;
   const workspaceMatch=!!workspaceActive.current&&authorization==='Bearer '+workspaceActive.current.token;
   if(patientMatch&&workspaceMatch){
    if(channelFor(window.location.pathname+window.location.search)==='workspace')clearWorkspace('Phiên làm việc đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.');
    else clearPatient('Phiên bệnh nhân đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.');
    return;
   }
   if(patientMatch)clearPatient('Phiên bệnh nhân đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.');
   if(workspaceMatch)clearWorkspace('Phiên làm việc đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.');
  };
  window.addEventListener('clinic:session-invalid',invalid);
  return()=>window.removeEventListener('clinic:session-invalid',invalid);
 },[clearPatient,clearWorkspace]);

 useEffect(()=>{
  const timers:ReturnType<typeof setTimeout>[]=[];
  const arm=(target:Channel,user:UserSession|null)=>{
   if(!user)return;
   try{
    const payload=JSON.parse(atob(user.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if(typeof payload.exp==='number')timers.push(setTimeout(()=>void renewChannel(target),Math.max(0,payload.exp*1000-Date.now()-30000)));
   }catch{/* Server remains the authentication authority. */}
  };
  arm('patient',patientSession);arm('workspace',workspaceSession);
  return()=>timers.forEach(clearTimeout);
 },[patientSession?.token,workspaceSession?.token,renewChannel]);

 useEffect(()=>{
  if(!patientSession&&!workspaceSession)return;
  const verify=()=>{
   if(document.visibilityState==='hidden')return;
   if(patientActive.current)void refreshPatient().catch(()=>{/* Destination APIs remain authoritative. */});
   if(workspaceActive.current)void refreshWorkspace().catch(()=>{/* Destination APIs remain authoritative. */});
  };
  window.addEventListener('focus',verify);document.addEventListener('visibilitychange',verify);
  const permissions=setInterval(verify,45000);
  return()=>{clearInterval(permissions);window.removeEventListener('focus',verify);document.removeEventListener('visibilitychange',verify);};
 },[patientSession?.token,workspaceSession?.token,refreshPatient,refreshWorkspace]);

 const session=channel==='workspace'?workspaceSession:patientSession;
 const notice=channel==='workspace'?workspaceNotice:patientNotice;
 const authenticate=channel==='workspace'?authenticateWorkspace:authenticatePatient;
 const signOut=channel==='workspace'?signOutWorkspace:signOutPatient;
 const refresh=channel==='workspace'?refreshWorkspace:refreshPatient;
 const patientRestoring=restoreState.patient!=='ready',workspaceRestoring=restoreState.workspace!=='ready';
 const restorationError=restoreErrors[channel];
 const value=useMemo(()=>({
  session,patientSession,workspaceSession,patientRestoring,workspaceRestoring,restorationError,retryRestoration,publicVersion,notice,authenticate,authenticatePatient,authenticateWorkspace,
  signOut,signOutPatient,signOutWorkspace,refresh,refreshPatient,refreshWorkspace,navigate:navigateLocal
 }),[session,patientSession,workspaceSession,patientRestoring,workspaceRestoring,restorationError,retryRestoration,publicVersion,notice,authenticate,authenticatePatient,authenticateWorkspace,signOut,signOutPatient,signOutWorkspace,refresh,refreshPatient,refreshWorkspace]);
 return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Load each source with the session for the current product channel; standalone component tests keep their own harnesses. */
export function usePanelSession(load:()=>Promise<void>){
 const shared=useSession(),latest=useRef(load);latest.current=load;
 useEffect(()=>{let mounted=true;if(shared?.session)queueMicrotask(()=>{if(mounted)void latest.current();});return()=>{mounted=false;};},[shared?.session?.token,JSON.stringify(shared?.session?.contexts),shared?.session?.actor.platformOperator]);
 return shared;
}
export function useSessionBranch(shared:ReturnType<typeof useSession>,token:string,directory:{id:string;branches:{id:string;active?:boolean}[]}|null,branch:string,choose:(id:string)=>Promise<void>){
 const latest=useRef(choose);latest.current=choose;
 useEffect(()=>{let mounted=true;const branches=directory?.branches.filter(b=>b.active!==false)??[];if(shared&&token&&directory){if(branch&&!branches.some(b=>b.id===branch))queueMicrotask(()=>{if(mounted)void latest.current('');});else if(!branch&&branches.length===1)queueMicrotask(()=>{if(mounted)void latest.current(branches[0].id);});}return()=>{mounted=false;};},[!!shared,token,directory?.id,JSON.stringify(directory?.branches),branch]);
}
