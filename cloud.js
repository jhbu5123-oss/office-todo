'use strict';
const Cloud = (() => {
 const url='https://ussgodnqzqrpdqdutsov.supabase.co', key='sb_publishable_FXBhYUFhuvAD5JZMnGnJwQ_gyZsQ_L8';
 let session=null, revision=0, pending=null, running=false, debounce, failed=false, ready=false;
 const authBox=document.getElementById('auth-screen'), app=document.querySelector('.app');
 const status=t=>document.getElementById('save-status').textContent=t;
 async function request(path, options={}, authenticated=true){
  if(authenticated && session && session.expires_at<Date.now()/1000+60) await refresh();
  const response=await fetch(url+path,{...options,signal:AbortSignal.timeout(20000),headers:{apikey:key,'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+session.access_token}:{}),...options.headers}});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={message:text};}
  if(!response.ok)throw Object.assign(new Error(data.msg||data.message||data.error_description||'서버 요청 실패'),{status:response.status});return data;
 }
 function keep(s){session=s;session.expires_at=s.expires_at||Math.floor(Date.now()/1000)+s.expires_in;sessionStorage.setItem('office-todo.auth',JSON.stringify(session));}
 async function refresh(){const s=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})},false);keep(s);}
 async function read(){const rows=await request('/rest/v1/todo_state?select=payload,revision&owner_id=eq.'+encodeURIComponent(session.user.id));return rows[0]||{payload:TodoCore.empty(),revision:0};}
 async function enter(){const row=await read();TodoCore.validate(row.payload);revision=row.revision;state=row.payload;chosen=null;render();ready=true;authBox.hidden=true;app.hidden=false;app.inert=false;status('서버에서 불러옴');}
 function problem(error){document.getElementById("dialog")?.close?.();failed=true;app.inert=true;document.getElementById('sync-error').hidden=false;document.getElementById('sync-message').textContent=error.message.includes('TODO_CONFLICT')?'다른 기기에서 먼저 변경했습니다. 현재 내용을 백업한 뒤 서버 내용을 다시 불러오세요.':'서버 저장 또는 연결에 실패했습니다. 현재 화면의 변경은 아직 서버에 저장되지 않았습니다. 연결 확인 후 다시 시도하세요.';document.getElementById('sync-retry').hidden=error.message.includes('TODO_CONFLICT');status('저장되지 않음 · 확인 필요');}
 async function flush(){clearTimeout(debounce);if(running||failed||!pending)return;running=true;
  try{while(pending){const snapshot=pending;pending=null;status('서버에 저장 중…');try{const next=await request('/rest/v1/rpc/save_todo_state',{method:'POST',body:JSON.stringify({expected_revision:revision,new_payload:snapshot})});revision=next;}catch(e){if(!pending)pending=snapshot;throw e;}}status('서버에 저장됨');}
  catch(e){problem(e);}finally{running=false;}
 }
 function save(data){if(!ready||failed)return false;pending=structuredClone(data);status('저장 대기 중…');clearTimeout(debounce);debounce=setTimeout(flush,400);return true;}
 async function poll(){if(!ready||pending||running||failed||document.hidden)return;running=true;try{const row=await read();if(row.revision!==revision){if(pending){throw Error('TODO_CONFLICT');}TodoCore.validate(row.payload);revision=row.revision;state=row.payload;chosen=null;render();status('다른 기기 변경 반영됨');}}catch(e){problem(e);}finally{running=false;if(pending&&!failed)flush();}}
 document.getElementById('login-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;document.getElementById('auth-error').textContent='로그인 중…';try{const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:document.getElementById('login-email').value.trim(),password:document.getElementById('login-password').value})},false);keep(s);document.getElementById('login-password').value='';await enter();document.getElementById('auth-error').textContent='';}catch(e){document.getElementById('auth-error').textContent='로그인 또는 데이터 조회 실패: '+e.message+' (SQL 설정과 계정을 확인하세요.)';}finally{button.disabled=false;}};
 document.getElementById('logout').onclick=async()=>{await flush();if(pending||running||failed){toast('저장 완료 또는 오류 해결 후 로그아웃해 주세요.');return;}try{await request('/auth/v1/logout',{method:'POST'});}catch{}sessionStorage.removeItem('office-todo.auth');location.reload();};
 document.getElementById('sync-backup').onclick=()=>download('office-todo-unsaved-'+TodoCore.day()+'.json',JSON.stringify(state,null,2));
 document.getElementById('sync-retry').onclick=async()=>{failed=false;document.getElementById('sync-error').hidden=true;if(pending)await flush();else await poll();if(!failed)app.inert=false;};
 document.getElementById('sync-reload').onclick=()=>{if(confirm('현재 미저장 변경을 버리고 서버 데이터를 불러올까요? 필요한 경우 먼저 백업하세요.'))location.reload();};
 window.addEventListener('beforeunload',e=>{if(pending||running||failed){e.preventDefault();e.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();else poll();});setInterval(poll,15000);
 async function start(){try{const raw=sessionStorage.getItem('office-todo.auth');if(raw){session=JSON.parse(raw);await enter();}}catch(e){document.getElementById('auth-error').textContent='자동 로그인 또는 조회 실패. 다시 로그인해 주세요.';}}
 return {save,start};
})();
Cloud.start();
