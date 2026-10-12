// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {StrictMode} from 'react';
import {SessionProvider,useSession} from '../auth/SessionProvider';
import {PatientLoginPage,WorkspaceLoginPage} from '../auth/LoginPage';
import {loginUrl,patientReturnTo,workspaceReturnTo} from '../auth/returnTo';
import * as booking from '../api/booking';
import {current} from '../api/configuration';
import {contexts} from '../api/reception';
import {requestJson} from '../api/client';
import {readStoredSession,storeSession} from '../auth/storedSession';

vi.mock('../api/booking',()=>({signIn:vi.fn(),refreshAuth:vi.fn(),logoutAuth:vi.fn()}));
vi.mock('../api/configuration',()=>({current:vi.fn()}));
vi.mock('../api/reception',()=>({contexts:vi.fn()}));
vi.mock('../api/client',()=>({requestJson:vi.fn()}));

const staffContext={membershipId:'membership',clinicId:'clinic-a',role:'DOCTOR',allBranches:true,branchIds:[],version:1};

beforeEach(()=>{
 sessionStorage.clear();
 window.history.replaceState(null,'','/public');
 vi.resetAllMocks();
 vi.mocked(booking.logoutAuth).mockResolvedValue({data:null} as never);
 vi.mocked(requestJson).mockResolvedValue({ok:true,status:200,data:{patientId:'patient-a'}} as never);
 vi.mocked(booking.signIn).mockImplementation(async(email:string)=>({data:{
  accessToken:email.startsWith('dual')?'dual-token':email.startsWith('staff')?'staff-token':'patient-token',
  refreshToken:email.startsWith('dual')?'dual-refresh':email.startsWith('staff')?'staff-refresh':'patient-refresh',
  email,
  fullName:email.startsWith('staff')||email.startsWith('dual')?'Bác sĩ Kiểm thử':'Bệnh nhân Kiểm thử'
 }}));
 vi.mocked(current).mockImplementation(async(token:string)=>({
  userId:token==='dual-token'?'dual-user':token==='staff-token'?'staff-user':'patient-user',
  legacyRoles:token==='staff-token'?['ROLE_DOCTOR']:['ROLE_PATIENT'],
  platformOperator:false
 }) as never);
 vi.mocked(contexts).mockImplementation(async(token:string)=>token==='staff-token'||token==='dual-token'?[staffContext] as never:[]);
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});

it('keeps returnTo inside the correct product boundary',()=>{
 window.history.replaceState(null,'','/public');
 expect(patientReturnTo('/dat-lich?doctor=d1')).toBe('/dat-lich?doctor=d1');
 expect(patientReturnTo('/workspace?view=doctor')).toBeNull();
 expect(patientReturnTo('https://evil.example/steal')).toBeNull();
 expect(workspaceReturnTo('/workspace?view=doctor&clinicId=clinic-a')).toBe('/workspace?view=doctor&clinicId=clinic-a');
 expect(workspaceReturnTo('/tai-khoan/lich-kham')).toBeNull();
 expect(loginUrl('workspace','https://evil.example/steal')).toBe('/workspace/login');
});

it('renders separate Patient and Workspace login surfaces without a product selector',()=>{
 const {unmount}=render(<SessionProvider><PatientLoginPage brandName="Phòng khám kiểm thử"/></SessionProvider>);
 expect(screen.getByRole('heading',{name:'Đăng nhập'})).toBeTruthy();
 expect(screen.getByText(/^Tài khoản bệnh nhân$/i)).toBeTruthy();
 expect(screen.queryByText('Clinic Workspace')).toBeNull();
 expect(screen.getByRole('link',{name:'Tạo tài khoản'})).toBeTruthy();
 unmount();
 window.history.replaceState(null,'','/workspace/login');
 render(<SessionProvider><WorkspaceLoginPage brandName="Phòng khám kiểm thử"/></SessionProvider>);
 expect(screen.getByText('Clinic Workspace')).toBeTruthy();
 expect(screen.queryByRole('link',{name:'Tạo tài khoản'})).toBeNull();
 expect(screen.queryByText('Tài khoản bệnh nhân')).toBeNull();
});

it('rejects a pure patient account at Workspace login',async()=>{
 window.history.replaceState(null,'','/workspace/login');
 const user=userEvent.setup();
 render(<SessionProvider><WorkspaceLoginPage/></SessionProvider>);
 await user.type(screen.getByLabelText('Email'),'patient@test.invalid');
 await user.type(screen.getByLabelText('Mật khẩu'),'test-password');
 await user.click(screen.getByRole('button',{name:'Đăng nhập'}));
 expect((await screen.findByRole('alert')).textContent).toContain('không có quyền truy cập không gian làm việc');
 expect(location.pathname).toBe('/workspace/login');
});

it('rejects a staff identity at Patient login when it has no linked patient profile',async()=>{
 window.history.replaceState(null,'','/dang-nhap');
 vi.mocked(requestJson).mockResolvedValueOnce({ok:false,status:404,message:'Not found'} as never);
 const user=userEvent.setup();
 render(<SessionProvider><PatientLoginPage/></SessionProvider>);
 await user.type(screen.getByLabelText('Email'),'staff@test.invalid');
 await user.type(screen.getByLabelText('Mật khẩu'),'test-password');
 await user.click(screen.getByRole('button',{name:'Đăng nhập'}));
 expect((await screen.findByRole('alert')).textContent).toContain('chưa có hồ sơ bệnh nhân');
 expect(location.pathname).toBe('/dang-nhap');
 expect(booking.logoutAuth).toHaveBeenCalledWith('staff-refresh');
});

function ChannelHarness(){
 const auth=useSession()!;
 return <div>
  <output aria-label="patient-session">{auth.patientSession?.email??'none'}</output>
  <output aria-label="workspace-session">{auth.workspaceSession?.email??'none'}</output>
  <output aria-label="workspace-restoring">{String(auth.workspaceRestoring)}</output>
  <output aria-label="restore-error">{auth.restorationError}</output>
  <button onClick={auth.retryRestoration}>Retry restore</button>
  <button onClick={()=>void auth.authenticatePatient('patient@test.invalid','test-password')}>Patient in</button>
  <button onClick={()=>void auth.authenticateWorkspace('staff@test.invalid','test-password')}>Workspace in</button>
  <button onClick={()=>void auth.authenticatePatient('dual@test.invalid','test-password')}>Dual patient in</button>
  <button onClick={()=>void auth.authenticateWorkspace('dual@test.invalid','test-password')}>Dual workspace in</button>
  <button onClick={()=>auth.signOutPatient()}>Patient out</button>
  <button onClick={()=>auth.signOutWorkspace()}>Workspace out</button>
 </div>;
}

const expiringToken=()=> 'header.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+31}))+'.signature';
it.each([0,503])('keeps an active session and retries renewal when provider fails with %s',async status=>{
 vi.useFakeTimers();
 vi.mocked(booking.signIn).mockResolvedValue({data:{accessToken:expiringToken(),refreshToken:'original-refresh',email:'patient@test.invalid'}});
 vi.mocked(booking.refreshAuth).mockRejectedValueOnce(Object.assign(new Error('Unavailable'),{status})).mockResolvedValue({data:{accessToken:'renewed-token',refreshToken:'renewed-refresh'}});
 render(<SessionProvider><ChannelHarness/></SessionProvider>);
 await act(async()=>screen.getByRole('button',{name:'Patient in'}).click());
 await act(async()=>vi.advanceTimersByTimeAsync(2000));
 expect(screen.getByLabelText('patient-session').textContent).toBe('patient@test.invalid');
 expect(readStoredSession('patient')?.refreshToken).toBe('original-refresh');
 await act(async()=>vi.advanceTimersByTimeAsync(15000));
 expect(readStoredSession('patient')?.refreshToken).toBe('renewed-refresh');
 expect(booking.refreshAuth).toHaveBeenCalledTimes(2);
});
it('preserves a rotated refresh token if permission verification fails after renewal',async()=>{
 vi.useFakeTimers();
 vi.mocked(booking.signIn).mockResolvedValue({data:{accessToken:expiringToken(),refreshToken:'original-refresh',email:'patient@test.invalid'}});
 vi.mocked(booking.refreshAuth).mockResolvedValueOnce({data:{accessToken:'rotated-token',refreshToken:'rotated-refresh'}}).mockResolvedValue({data:{accessToken:'renewed-token',refreshToken:'renewed-refresh'}});
 const originalCurrent=vi.mocked(current).getMockImplementation()!;
 vi.mocked(current).mockImplementation(async token=>{if(token==='rotated-token')throw Object.assign(new Error('Unavailable'),{status:503});return originalCurrent(token);});
 render(<SessionProvider><ChannelHarness/></SessionProvider>);
 await act(async()=>screen.getByRole('button',{name:'Patient in'}).click());
 await act(async()=>vi.advanceTimersByTimeAsync(2000));
 expect(readStoredSession('patient')?.refreshToken).toBe('rotated-refresh');
 expect(screen.getByLabelText('patient-session').textContent).toBe('patient@test.invalid');
 await act(async()=>vi.advanceTimersByTimeAsync(15000));
 expect(booking.refreshAuth).toHaveBeenLastCalledWith('rotated-refresh');
 expect(readStoredSession('patient')?.refreshToken).toBe('renewed-refresh');
});
it('clears an active session when renewal explicitly returns 401',async()=>{
 vi.useFakeTimers();
 vi.mocked(booking.signIn).mockResolvedValue({data:{accessToken:expiringToken(),refreshToken:'original-refresh',email:'patient@test.invalid'}});
 vi.mocked(booking.refreshAuth).mockRejectedValue(Object.assign(new Error('Revoked'),{status:401}));
 render(<SessionProvider><ChannelHarness/></SessionProvider>);
 await act(async()=>screen.getByRole('button',{name:'Patient in'}).click());
 await act(async()=>vi.advanceTimersByTimeAsync(2000));
 expect(screen.getByLabelText('patient-session').textContent).toBe('none');
 expect(readStoredSession('patient')).toBeNull();
 await act(async()=>vi.advanceTimersByTimeAsync(30000));
 expect(booking.refreshAuth).toHaveBeenCalledTimes(1);
});

it('keeps Patient and Workspace sessions independent in the same SPA',async()=>{
 const user=userEvent.setup();
 render(<SessionProvider><ChannelHarness/></SessionProvider>);
 await user.click(screen.getByRole('button',{name:'Patient in'}));
 await waitFor(()=>expect(screen.getByLabelText('patient-session').textContent).toBe('patient@test.invalid'));
 await user.click(screen.getByRole('button',{name:'Workspace in'}));
 await waitFor(()=>expect(screen.getByLabelText('workspace-session').textContent).toBe('staff@test.invalid'));
 expect(screen.getByLabelText('patient-session').textContent).toBe('patient@test.invalid');

 await user.click(screen.getByRole('button',{name:'Patient out'}));
 await waitFor(()=>expect(screen.getByLabelText('patient-session').textContent).toBe('none'));
 expect(screen.getByLabelText('workspace-session').textContent).toBe('staff@test.invalid');
 expect(booking.logoutAuth).toHaveBeenCalledWith('patient-refresh');

 await user.click(screen.getByRole('button',{name:'Workspace out'}));
 await waitFor(()=>expect(screen.getByLabelText('workspace-session').textContent).toBe('none'));
 expect(booking.logoutAuth).toHaveBeenCalledWith('staff-refresh');
});

it('restores both channels after a reload and keeps logout cleared on the next reload',async()=>{
 const user=userEvent.setup(),view=render(<SessionProvider><ChannelHarness/></SessionProvider>);
 await user.click(screen.getByRole('button',{name:'Patient in'}));
 await user.click(screen.getByRole('button',{name:'Workspace in'}));
 await waitFor(()=>expect(readStoredSession('workspace')?.email).toBe('staff@test.invalid'));
 expect(JSON.parse(sessionStorage.getItem('clinic.session.workspace.v1')!)).not.toHaveProperty('contexts');
 view.unmount();
 const restored=render(<SessionProvider><ChannelHarness/></SessionProvider>);
 await waitFor(()=>expect(screen.getByLabelText('workspace-session').textContent).toBe('staff@test.invalid'));
 expect(screen.getByLabelText('patient-session').textContent).toBe('patient@test.invalid');
 expect(booking.signIn).toHaveBeenCalledTimes(2);
 await user.click(screen.getByRole('button',{name:'Workspace out'}));
 restored.unmount();
 render(<SessionProvider><ChannelHarness/></SessionProvider>);
 await waitFor(()=>expect(screen.getByLabelText('patient-session').textContent).toBe('patient@test.invalid'));
 expect(screen.getByLabelText('workspace-session').textContent).toBe('none');
 expect(readStoredSession('workspace')).toBeNull();
});

it('renews an expired saved access token exactly once under StrictMode',async()=>{
 window.history.replaceState(null,'','/workspace?view=doctor');
 storeSession('workspace',{token:'expired-token',refreshToken:'old-refresh',email:'staff@test.invalid'});
 vi.mocked(current).mockRejectedValueOnce(Object.assign(new Error('Expired'),{status:401}));
 vi.mocked(booking.refreshAuth).mockResolvedValue({data:{accessToken:'staff-token',refreshToken:'rotated-refresh'}});
 render(<StrictMode><SessionProvider><ChannelHarness/></SessionProvider></StrictMode>);
 await waitFor(()=>expect(screen.getByLabelText('workspace-session').textContent).toBe('staff@test.invalid'));
 expect(booking.refreshAuth).toHaveBeenCalledTimes(1);
 expect(booking.refreshAuth).toHaveBeenCalledWith('old-refresh');
 expect(readStoredSession('workspace')?.refreshToken).toBe('rotated-refresh');
});

it('discards revoked workspace rights while restoring the independent patient session',async()=>{
 storeSession('workspace',{token:'staff-token',refreshToken:'staff-refresh',email:'staff@test.invalid'});
 storeSession('patient',{token:'patient-token',refreshToken:'patient-refresh',email:'patient@test.invalid'});
 vi.mocked(contexts).mockResolvedValue([]);
 render(<SessionProvider><ChannelHarness/></SessionProvider>);
 await waitFor(()=>expect(screen.getByLabelText('patient-session').textContent).toBe('patient@test.invalid'));
 await waitFor(()=>expect(screen.getByLabelText('workspace-restoring').textContent).toBe('false'));
 expect(readStoredSession('workspace')).toBeNull();
 expect(screen.getByLabelText('workspace-session').textContent).toBe('none');
});

it('keeps saved credentials on a service outage and restores on retry',async()=>{
 window.history.replaceState(null,'','/workspace');
 storeSession('workspace',{token:'staff-token',email:'staff@test.invalid'});
 vi.mocked(current).mockRejectedValueOnce(Object.assign(new Error('Offline'),{status:0}));
 const user=userEvent.setup();render(<SessionProvider><ChannelHarness/></SessionProvider>);
 await waitFor(()=>expect(screen.getByLabelText('restore-error').textContent).toContain('Chưa kết nối'));
 expect(readStoredSession('workspace')?.token).toBe('staff-token');
 await user.click(screen.getByRole('button',{name:'Retry restore'}));
 await waitFor(()=>expect(screen.getByLabelText('workspace-session').textContent).toBe('staff@test.invalid'));
 expect(screen.getByLabelText('workspace-restoring').textContent).toBe('false');
});

it('does not resurrect a session when logout races with restoration',async()=>{
 storeSession('workspace',{token:'staff-token',refreshToken:'staff-refresh',email:'staff@test.invalid'});
 let finish!:()=>void;
 vi.mocked(current).mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve({userId:'staff-user',legacyRoles:[],platformOperator:false});}));
 const user=userEvent.setup();render(<SessionProvider><ChannelHarness/></SessionProvider>);
 await user.click(screen.getByRole('button',{name:'Workspace out'}));
 await act(async()=>finish());
 expect(screen.getByLabelText('workspace-session').textContent).toBe('none');
 expect(readStoredSession('workspace')).toBeNull();
});

it('invalidates only the active channel when a dual identity receives identical access tokens',async()=>{
 const user=userEvent.setup();
 render(<SessionProvider><ChannelHarness/></SessionProvider>);
 await user.click(screen.getByRole('button',{name:'Dual patient in'}));
 await user.click(screen.getByRole('button',{name:'Dual workspace in'}));
 await waitFor(()=>expect(screen.getByLabelText('patient-session').textContent).toBe('dual@test.invalid'));
 await waitFor(()=>expect(screen.getByLabelText('workspace-session').textContent).toBe('dual@test.invalid'));

 window.history.replaceState(null,'','/public');
 await act(async()=>window.dispatchEvent(new CustomEvent('clinic:session-invalid',{detail:{authorization:'Bearer dual-token'}})));
 await waitFor(()=>expect(screen.getByLabelText('patient-session').textContent).toBe('none'));
 expect(screen.getByLabelText('workspace-session').textContent).toBe('dual@test.invalid');

 await user.click(screen.getByRole('button',{name:'Dual patient in'}));
 await waitFor(()=>expect(screen.getByLabelText('patient-session').textContent).toBe('dual@test.invalid'));
 window.history.replaceState(null,'','/workspace');
 await act(async()=>window.dispatchEvent(new CustomEvent('clinic:session-invalid',{detail:{authorization:'Bearer dual-token'}})));
 await waitFor(()=>expect(screen.getByLabelText('workspace-session').textContent).toBe('none'));
 expect(screen.getByLabelText('patient-session').textContent).toBe('dual@test.invalid');
});
