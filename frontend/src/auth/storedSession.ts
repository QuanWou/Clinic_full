import {refreshAuth} from '../api/booking';
import {current} from '../api/configuration';
import {contexts} from '../api/reception';
import {requestJson} from '../api/client';
import type {UserSession} from './access';

export type SessionChannel='patient'|'workspace';
export type StoredSession=Pick<UserSession,'token'|'refreshToken'|'email'|'displayName'>;
const key=(channel:SessionChannel)=>'clinic.session.'+channel+'.v1';
const patientBase=import.meta.env.VITE_PATIENT_URL??'/s1/patient';

/** Keep credentials for this browser tab, never cached permissions or passwords. */
export function storeSession(channel:SessionChannel,session:StoredSession|null){
 try{
  if(!session){sessionStorage.removeItem(key(channel));return;}
  const {token,refreshToken,email,displayName}=session;
  sessionStorage.setItem(key(channel),JSON.stringify({token,refreshToken,email,displayName}));
 }catch{/* Storage may be disabled; the current in-memory session still works. */}
}
export function readStoredSession(channel:SessionChannel):StoredSession|null{
 try{
  const value=JSON.parse(sessionStorage.getItem(key(channel))??'null');
  if(!value)return null;
  if(typeof value.token!=='string'||!value.token.trim()||typeof value.email!=='string'){
   storeSession(channel,null);return null;
  }
  return {token:value.token,email:value.email,refreshToken:typeof value.refreshToken==='string'?value.refreshToken:undefined,displayName:typeof value.displayName==='string'?value.displayName:undefined};
 }catch{storeSession(channel,null);return null;}
}
export const sessionErrorStatus=(error:unknown)=>typeof error==='object'&&error!==null&&'status' in error?error.status:undefined;

export async function restoreStoredSession(channel:SessionChannel,saved:StoredSession):Promise<UserSession>{
 let credentials=saved;
 let actor,grants;
 try{
  [actor,grants]=await Promise.all([current(credentials.token),contexts(credentials.token)]);
 }catch(error){
  if(sessionErrorStatus(error)!==401||!credentials.refreshToken)throw error;
  const response=await refreshAuth(credentials.refreshToken);
  credentials={token:response.data.accessToken,refreshToken:response.data.refreshToken??credentials.refreshToken,email:response.data.email??credentials.email,displayName:response.data.fullName??credentials.displayName};
  // Preserve a rotated refresh token even if the permission service needs a retry.
  if(readStoredSession(channel)?.token===saved.token)storeSession(channel,credentials);
  [actor,grants]=await Promise.all([current(credentials.token),contexts(credentials.token)]);
 }
 if(channel==='workspace'&&!grants.length&&!actor.platformOperator)throw Object.assign(new Error('Quyền truy cập không gian làm việc đã hết hiệu lực.'),{status:403});
 if(channel==='patient'&&(grants.length||actor.platformOperator)){
  const profile=await requestJson<unknown>(patientBase+'/api/me/patient-profile',{headers:{Authorization:'Bearer '+credentials.token}});
  if(!profile.ok)throw Object.assign(new Error(profile.message??'Chưa xác minh được hồ sơ bệnh nhân.'),{status:profile.status===404?403:profile.status});
 }
 return {...credentials,actor,contexts:grants};
}
