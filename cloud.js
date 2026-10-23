'use strict';
const Cloud = (() => {
 const url='https://ussgodnqzqrpdqdutsov.supabase.co', key='sb_publishable_FXBhYUFhuvAD5JZMnGnJwQ_gyZsQ_L8';
 const AUTH_KEY='office-todo.auth',RECOVERY_KEY='office-todo.recovery';
 const byId=id=>document.getElementById(id),authBox=byId('auth-screen'),app=document.querySelector('.app');
 let session=null,revision=0,pending=null,running=false,debounce,failed=false,ready=false,authBusy=false,recovery=false,mode='login',started,refreshing;
 const EMAIL_KEY='office-todo.remembered-email';
 const remember=byId('remember-email');
 function restoreEmail(){
  let email='';try{email=localStorage.getItem(EMAIL_KEY)||'';}catch{}
  if(email.length>254)email='';
  byId('login-email').value=email;remember.checked=!!email;
 }
 restoreEmail();
 remember.addEventListener('change',()=>{if(!remember.checked){try{localStorage.removeItem(EMAIL_KEY);}catch{message('저장된 아이디를 지우지 못했습니다. 브라우저의 사이트 데이터를 삭제해 주세요.',true);}}});
 function saveEmail(email){try{if(remember.checked)localStorage.setItem(EMAIL_KEY,email);else localStorage.removeItem(EMAIL_KEY);}catch{remember.checked=false;}}
 const status=t=>byId('save-status').textContent=t;
 function message(text='',error=false){const el=byId(error?'auth-error':'auth-message');el.textContent=text;el.hidden=!text;}
 function clearMessages(){message();message('',true);}
 function setBusy(busy){authBusy=busy;authBox.setAttribute('aria-busy',String(busy));authBox.querySelectorAll('button').forEach(b=>b.disabled=busy);}
 function setMode(next,text=''){
  if(!['login','signup','recover','resend','reset'].includes(next))return;
  if(next==='reset'&&(!recovery||!session))next='recover';
  const emailIds={login:'login-email',signup:'signup-email',recover:'recover-email',resend:'resend-email'};
  const email=byId(emailIds[mode])?.value.trim()||'';
  mode=next;clearMessages();
  const content={login:['로그인','내 계정의 할 일을 이어서 관리하세요.'],signup:['동료 회원가입','관리자가 사용을 허용한 이메일로 가입하세요.'],recover:['비밀번호 찾기','가입한 이메일로 비밀번호 재설정 링크를 보내드립니다.'],resend:['인증 메일 다시 받기','가입할 때 사용한 이메일을 입력하세요.'],reset:['새 비밀번호 설정','아래에 새로운 비밀번호를 입력하세요.']};
  byId('auth-title').textContent=content[next][0];byId('auth-description').textContent=content[next][1];
  for(const name of ['login','signup','recover','resend','reset'])byId(name+'-form').hidden=name!==next;
  byId('auth-tabs').hidden=!['login','signup'].includes(next);
  document.querySelectorAll('[data-auth-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.authMode===next)));
  if(emailIds[next]&&email)byId(emailIds[next]).value=email;
  if(next==='reset')byId('reset-email').textContent=session.user.email||'';
  message(text);byId(next==='reset'?'reset-password':emailIds[next])?.focus();
 }
 function authError(error){
  const code=String(error.code||''),text=String(error.message||'');
  if(text.includes('TODO_SIGNUP_NOT_ALLOWED'))return '관리자가 사용을 허용한 이메일로만 가입할 수 있습니다. 이메일 등록을 관리자에게 요청하세요.';
  if(code==='signup_disabled'||/signups? not allowed|signup.*disabled/i.test(text))return '현재 신규 가입을 받지 않고 있습니다. 관리자에게 문의해 주세요.';
  if(code==='email_not_confirmed'||/email not confirmed/i.test(text))return '이메일 인증을 완료한 후 로그인하세요. 메일이 없다면 인증 메일 다시 받기를 이용하세요.';
  if(code==='invalid_credentials'||/invalid login credentials/i.test(text))return '이메일 또는 비밀번호를 확인하세요.';
  if(error.status===429||/rate.limit|too many|only request this after/i.test(text)||code.includes('rate_limit'))return '요청이 많습니다. 잠시 기다린 뒤 다시 시도하세요.';
  if(code==='same_password'||/different from the old/i.test(text))return '기존 비밀번호와 다른 새 비밀번호를 입력하세요.';
  if(code==='weak_password'||/password.*(weak|least|contain)/i.test(text))return '비밀번호가 보안 기준에 맞지 않습니다. 더 길고 다양한 문자를 사용해 주세요.';
  if(code==='user_already_exists'||/already registered/i.test(text))return '이미 가입한 이메일이라면 로그인하거나 비밀번호 찾기를 이용하세요.';
  if(code==='email_address_not_authorized'||code==='unexpected_failure'||/sending.*email|email.*(not authorized|send)/i.test(text))return '메일을 보내지 못했습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.';
  if(code==='AUTH_LINK_INVALID'||code==='otp_expired'||error.status===401||/expired|invalid.*(token|jwt)/i.test(text))return '인증 링크가 만료되었거나 유효하지 않습니다. 메일을 다시 요청해 주세요.';
  if(code==='WEB_ADDRESS_REQUIRED')return '배포된 웹사이트 주소에서 이용해 주세요.';
  if(code==='RECOVERY_REQUIRED')return '비밀번호 재설정 메일의 링크를 먼저 열어 주세요.';
  if(error.name==='TypeError'||error.name==='TimeoutError'||error.name==='AbortError')return '서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.';
  return '요청을 처리하지 못했습니다. 입력 내용을 확인하거나 잠시 후 다시 시도하세요.';
 }
 async function request(path,options={},authenticated=true){
  if(authenticated&&!session)throw Error('LOGIN_REQUIRED');
  if(authenticated&&session.expires_at<Date.now()/1000+60)await refresh();
  const response=await fetch(url+path,{...options,signal:AbortSignal.timeout(20000),headers:{apikey:key,'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+session.access_token}:{}),...options.headers}});
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data={message:raw};}
  if(!response.ok)throw Object.assign(new Error(data.msg||data.message||data.error_description||'서버 요청 실패'),{status:response.status,code:data.error_code||data.code||data.error});
  return data;
 }
 function keep(s){
  if(!s||typeof s.access_token!=='string'||!s.access_token||typeof s.refresh_token!=='string'||!s.refresh_token||typeof s.user?.id!=='string')throw Object.assign(Error('Invalid session'),{code:'AUTH_LINK_INVALID'});
  const now=Math.floor(Date.now()/1000),expires=Number(s.expires_at),duration=Number(s.expires_in);
  session={...s,expires_at:Number.isFinite(expires)&&expires>0?expires:now+(Number.isFinite(duration)&&duration>0?duration:3600)};
  sessionStorage.setItem(AUTH_KEY,JSON.stringify(session));
 }
 async function refresh(){
  if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})},false).then(keep).finally(()=>refreshing=null);
  return refreshing;
 }
 function clearSession(){
  session=null;ready=false;recovery=false;pending=null;revision=0;failed=false;clearTimeout(debounce);
  sessionStorage.removeItem(AUTH_KEY);sessionStorage.removeItem(RECOVERY_KEY);
  restoreEmail();byId('login-password').value='';
  state=TodoCore.empty();chosen=null;
  if(typeof view!=='undefined')view='today';if(typeof query!=='undefined')query='';if(typeof picks!=='undefined')picks.clear();if(typeof picking!=='undefined')picking=false;
  app.hidden=true;app.inert=true;authBox.hidden=false;byId('sync-error').hidden=true;
 }
 function redirectUrl(){
  const page=new URL(location.href);
  if(!['https:','http:'].includes(page.protocol))throw Object.assign(Error('Web URL required'),{code:'WEB_ADDRESS_REQUIRED'});
  return page.origin+page.pathname;
 }
 const emailPath=path=>path+'?redirect_to='+encodeURIComponent(redirectUrl());
 async function read(){const rows=await request('/rest/v1/todo_state?select=payload,revision&owner_id=eq.'+encodeURIComponent(session.user.id));return rows[0]||{payload:TodoCore.empty(),revision:0};}
 async function enter(){
  ready=false;const row=await read();TodoCore.validate(row.payload);revision=row.revision;state=row.payload;chosen=null;render();ready=true;
  authBox.hidden=true;app.hidden=false;app.inert=false;byId('account-email').textContent=session.user.email||'내 계정';byId('account-email').title=session.user.email||'';status('서버에서 불러옴');
 }
 function problem(error){
  byId('dialog')?.close?.();failed=true;app.inert=true;byId('sync-error').hidden=false;
  byId('sync-message').textContent=error.message.includes('TODO_CONFLICT')?'다른 기기에서 먼저 변경했습니다. 현재 내용을 백업한 뒤 서버 내용을 다시 불러오세요.':'서버 저장 또는 연결에 실패했습니다. 현재 화면의 변경은 아직 서버에 저장되지 않았습니다. 연결 확인 후 다시 시도하세요.';
  byId('sync-retry').hidden=error.message.includes('TODO_CONFLICT');status('저장되지 않음 · 확인 필요');
 }
 async function flush(){
  clearTimeout(debounce);if(running||failed||!pending)return;running=true;
  try{while(pending){const snapshot=pending;pending=null;status('서버에 저장 중…');try{revision=await request('/rest/v1/rpc/save_todo_state',{method:'POST',body:JSON.stringify({expected_revision:revision,new_payload:snapshot})});}catch(e){if(!pending)pending=snapshot;throw e;}}status('서버에 저장됨');}
  catch(e){problem(e);}finally{running=false;}
 }
 function save(data){if(!ready||failed||recovery)return false;pending=structuredClone(data);status('저장 대기 중…');clearTimeout(debounce);debounce=setTimeout(flush,400);return true;}
 async function poll(){
  if(!ready||pending||running||failed||authBusy||recovery||document.hidden)return;running=true;
  try{const row=await read();if(row.revision!==revision){if(pending)throw Error('TODO_CONFLICT');TodoCore.validate(row.payload);revision=row.revision;state=row.payload;chosen=null;render();status('다른 기기 변경 반영됨');}}
  catch(e){problem(e);}finally{running=false;if(pending&&!failed)flush();}
 }
 function passwordPair(passwordId,confirmId){
  const p=byId(passwordId),c=byId(confirmId);p.setCustomValidity('');c.setCustomValidity('');
  if(p.value.length<8){p.setCustomValidity('비밀번호를 8자 이상 입력하세요.');p.reportValidity();return null;}
  if(p.value!==c.value){c.setCustomValidity('비밀번호가 일치하지 않습니다.');c.reportValidity();return null;}
  return p.value;
 }
 function bindForm(id,action){
  byId(id).onsubmit=async e=>{e.preventDefault();if(authBusy||!e.target.reportValidity())return;clearMessages();setBusy(true);try{await action();}catch(error){message(authError(error),true);}finally{setBusy(false);}};
 }
 document.querySelectorAll('[data-auth-mode]').forEach(b=>b.onclick=()=>{if(!authBusy)setMode(b.dataset.authMode);});
 for(const prefix of ['signup','reset'])for(const suffix of ['password','confirm'])byId(prefix+'-'+suffix).addEventListener('input',()=>{byId(prefix+'-password').setCustomValidity('');byId(prefix+'-confirm').setCustomValidity('');});
 bindForm('login-form',async()=>{
  const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:byId('login-email').value.trim(),password:byId('login-password').value})},false);
  keep(s);saveEmail(byId('login-email').value.trim());recovery=false;sessionStorage.removeItem(RECOVERY_KEY);byId('login-password').value='';
  try{await enter();}catch(e){clearSession();message('로그인은 되었지만 할 일을 불러오지 못했습니다. 잠시 후 다시 로그인하거나 관리자에게 문의하세요.',true);}
 });
 bindForm('signup-form',async()=>{
  const password=passwordPair('signup-password','signup-confirm');if(!password)return;
  const email=byId('signup-email').value.trim();
  const result=await request(emailPath('/auth/v1/signup'),{method:'POST',body:JSON.stringify({email,password})},false);
  byId('signup-password').value='';byId('signup-confirm').value='';byId('login-email').value=email;
  if(result?.access_token){keep(result);recovery=false;sessionStorage.removeItem(RECOVERY_KEY);await enter();toast('가입이 완료되었습니다.');}
  else setMode('login','가입 요청을 접수했습니다. 새로 가입했다면 받은 메일에서 이메일 인증을 완료한 뒤 로그인하세요. 이미 가입했다면 기존 비밀번호로 로그인하세요.');
 });
 bindForm('recover-form',async()=>{
  await request(emailPath('/auth/v1/recover'),{method:'POST',body:JSON.stringify({email:byId('recover-email').value.trim()})},false);
  message('등록된 이메일이면 재설정 메일이 발송됩니다. 받은 편지함과 스팸함을 확인하고, 가장 최근 메일의 링크를 열어 주세요.');
 });
 bindForm('resend-form',async()=>{
  await request(emailPath('/auth/v1/resend'),{method:'POST',body:JSON.stringify({email:byId('resend-email').value.trim(),type:'signup'})},false);
  message('인증이 필요한 계정이면 메일이 발송됩니다. 받은 편지함과 스팸함을 확인해 주세요.');
 });
 bindForm('reset-form',async()=>{
  if(!recovery||!session)throw Object.assign(Error('Recovery required'),{code:'RECOVERY_REQUIRED'});
  const password=passwordPair('reset-password','reset-confirm');if(!password)return;
  const email=session.user.email||'';
  await request('/auth/v1/user',{method:'PUT',body:JSON.stringify({password})});
  try{await request('/auth/v1/logout?scope=local',{method:'POST'});}catch{}
  byId('reset-password').value='';byId('reset-confirm').value='';clearSession();byId('login-email').value=email;
  setMode('login','비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.');
 });
 byId('cancel-reset').onclick=async()=>{
  if(authBusy)return;setBusy(true);
  try{if(session)await request('/auth/v1/logout?scope=local',{method:'POST'});}catch{}
  finally{clearSession();setMode('login');setBusy(false);}
 };
 byId('logout').onclick=async()=>{
  await flush();if(pending||running||failed){toast('저장 완료 또는 오류 해결 후 로그아웃해 주세요.');return;}
  try{await request('/auth/v1/logout?scope=local',{method:'POST'});}catch{}
  clearSession();location.reload();
 };
 byId('sync-backup').onclick=()=>download('office-todo-unsaved-'+TodoCore.day()+'.json',JSON.stringify(state,null,2));
 byId('sync-retry').onclick=async()=>{failed=false;byId('sync-error').hidden=true;if(pending)await flush();else await poll();if(!failed)app.inert=false;};
 byId('sync-reload').onclick=()=>{if(confirm('현재 미저장 변경을 버리고 서버 데이터를 불러올까요? 필요한 경우 먼저 백업하세요.'))location.reload();};
 window.addEventListener('beforeunload',e=>{if(pending||running||failed){e.preventDefault();e.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();else poll();});setInterval(poll,15000);
 async function initialize(){
  setMode('login');setBusy(true);
  try{
   const fragment=new URLSearchParams(location.hash?.slice(1)||'');
   if(['access_token','refresh_token','error','error_code','type'].some(k=>fragment.has(k))){
    // Remove credentials from the address bar before any API request or app view.
    history.replaceState(null,'',location.pathname+location.search);clearSession();
    const type=fragment.get('type');
    if(fragment.has('error')||fragment.has('error_code')||!['signup','recovery'].includes(type)||!fragment.get('access_token')||!fragment.get('refresh_token'))throw Object.assign(Error('Invalid link'),{code:'AUTH_LINK_INVALID'});
    const access=fragment.get('access_token');
    const user=await request('/auth/v1/user',{headers:{Authorization:'Bearer '+access}},false);
    keep({access_token:access,refresh_token:fragment.get('refresh_token'),expires_in:Number(fragment.get('expires_in'))||3600,expires_at:Number(fragment.get('expires_at'))||undefined,user});
    if(type==='recovery'){recovery=true;sessionStorage.setItem(RECOVERY_KEY,user.id);setMode('reset');return;}
    await enter();toast('이메일 인증이 완료되었습니다.');return;
   }
   const raw=sessionStorage.getItem(AUTH_KEY);
   if(raw){
    keep(JSON.parse(raw));
    const recoveryOwner=sessionStorage.getItem(RECOVERY_KEY);
    if(recoveryOwner){
     const user=await request('/auth/v1/user');
     if(recoveryOwner!==user.id||session.user.id!==user.id)throw Object.assign(Error('Invalid link'),{code:'AUTH_LINK_INVALID'});
     session.user=user;keep(session);recovery=true;setMode('reset');return;
    }
    await enter();
   }
  }catch(e){clearSession();setMode('login');message(e.code==='AUTH_LINK_INVALID'||e.status===401?authError(e):'로그인 상태를 확인하지 못했습니다. 다시 로그인하거나 인증 메일을 새로 요청하세요.',true);}
  finally{setBusy(false);}
 }
 function start(){return started||(started=initialize());}
 return {save,start};
})();
Cloud.start();
