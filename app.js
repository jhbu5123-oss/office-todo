'use strict';
const C=TodoCore, KEY='office-todo.v1', $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=C.empty(), view='today', chosen=null, query='', sort='manual', picking=false, picks=new Set(), drag=null, date=C.day(), timer, startupError='', blocked=false, conflict=false;
const completedOpen=new Set();
const iconPaths={
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
 star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2m-8 3h2"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 complete:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 folder:'<path d="M3 8V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 pencil:'<path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5"/>',
 grip:'<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
 up:'<path d="m6 14 6-6 6 6"/>',down:'<path d="m6 10 6 6 6-6"/>'
};
const icon=name=>`<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]||iconPaths.folder}</svg>`;
const system=[['today','sun','오늘 할 일'],['important','star','중요'],['planned','calendar','계획된 일정'],['all','list','전체'],['completed','complete','완료']];
const titleOf=v=>system.find(s=>s[0]===v)?.[2]||(v==='trash'?'휴지통':state.lists.find(l=>l.id===v)?.name||'작업');
const listOf=id=>state.lists.find(l=>l.id===id);
const getTask=id=>state.tasks.find(t=>t.id===id);
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('#toast').hidden=true,4500);}
function save(){return Cloud.save(state);}
function commit(full=true){save();render(full);}
function navItem(v,iconName,label,count){
 const list=listOf(v),movable=list&&v!=='inbox';
 const button=`<button class="nav-item ${view===v?'active':''}" data-view="${esc(v)}" ${view===v?'aria-current="page"':''} title="${esc(label)}"><span class="nav-icon">${icon(iconName)}</span><span class="nav-text">${esc(label)}</span>${v==='completed'?'':`<span class="badge">${count||''}</span>`}</button>`;
 if(!list)return button;
 return `<div class="nav-row ${view===v?'active':''}" data-list-id="${esc(v)}" ${movable?'draggable="true" data-list-drag="'+esc(v)+'"':''}>${movable?`<span class="drag-grip" aria-hidden="true" title="끌어서 순서 변경 (Alt + ↑/↓도 가능)">${icon('grip')}</span>`:''}${button}<button class="list-menu" data-list-menu="${esc(v)}" aria-label="${esc(label)} 카테고리 메뉴" aria-haspopup="dialog" title="카테고리 메뉴">${icon('more')}</button></div>`;
}
function renderNav(){
 let html=system.map(([v,i,n])=>navItem(v,i,n,state.tasks.filter(t=>C.matches(t,v,date)).length)).join('')+'<div class="divider"></div>';
 const listItem=l=>navItem(l.id,'folder',l.name,state.tasks.filter(t=>!t.deleted&&!t.done&&t.list===l.id).length);
 const lists=group=>state.lists.filter(l=>l.id!=='inbox'&&(l.group||'')===group).map(listItem).join('');
 html+=listItem(listOf('inbox'))+`<div class="list-zone" data-list-zone="">${lists('')}</div>`;
 for(const g of state.groups){html+=`<div class="group-title"><span>${esc(g.name)}</span><button data-edit-group="${esc(g.id)}" aria-label="${esc(g.name)} 그룹 수정">${icon('more')}</button></div><div class="list-zone" data-list-zone="${esc(g.id)}">${lists(g.id)||'<span class="empty-group">카테고리를 여기로 끌어오세요</span>'}</div>`;}
 html+='<div class="divider"></div>'+navItem('trash','trash','휴지통',state.tasks.filter(t=>t.deleted).length);$('#nav').innerHTML=html;
}
function visible(){return state.tasks.filter(t=>C.matches(t,view,date)&&(!query||(t.title+' '+t.note+' '+t.steps.map(s=>s.title).join(' ')).toLocaleLowerCase().includes(query.toLocaleLowerCase()))).sort((a,b)=>{
 if(a.done!==b.done)return Number(a.done)-Number(b.done);
 if(sort==='due'||view==='planned'&&sort==='manual')return C.dueKey(a).localeCompare(C.dueKey(b))||a.order-b.order;
 if(sort==='important')return Number(b.important)-Number(a.important)||a.order-b.order;
 if(sort==='created')return b.created.localeCompare(a.created);
 if(sort==='title')return a.title.localeCompare(b.title,'ko');return a.order-b.order;
 });}
function dueLabel(value){if(value===date)return '오늘';if(value===presetDue('tomorrow',date))return '내일';return value+' ('+'일월화수목금토'[new Date(value+'T12:00:00Z').getUTCDay()]+')';}
function row(t){const steps=t.steps.length?`☑ ${t.steps.filter(s=>s.done).length}/${t.steps.length}`:'';return `<article class="task ${t.done?'done':''} ${chosen===t.id?'selected':''}" data-task="${esc(t.id)}" tabindex="0" aria-label="${esc(t.title)}" draggable="${!picking&&view!=='trash'}">${picking?`<input type="checkbox" data-pick="${esc(t.id)}" aria-label="선택" ${picks.has(t.id)?'checked':''}>`:''}<button class="check" data-complete="${esc(t.id)}" aria-label="${t.done?'완료 취소':'완료'}" ${t.deleted?'disabled':''}>${t.done?'✓':''}</button><div class="task-body"><div class="task-title">${esc(t.title)}</div><div class="task-meta"><span>${esc(listOf(t.list)?.name)}</span>${t.due?`<span class="${C.isOverdue(t)?'overdue':''}"><span class="due-icon">${icon('calendar')}</span> ${esc(dueLabel(t.due))}${C.isOverdue(t)?' · 기한 초과':''}</span>`:''}${t.myDay===date?'<span>☼ 오늘</span>':''}${t.repeat?'<span>↻ 반복</span>':''}${t.reminder?'<span>◷ 알림</span>':''}${steps?`<span>${steps}</span>`:''}${t.note?'<span>≡ 메모</span>':''}</div></div>${t.deleted?`<button data-restore="${esc(t.id)}">복원</button>`:`<button class="star ${t.important?'on':''}" data-star="${esc(t.id)}" aria-label="중요 표시" aria-pressed="${t.important}">${t.important?'★':'☆'}</button>`}</article>`;}
function render(detail=true){
 document.body.classList.toggle('dark',state.settings.theme==='dark');document.body.dataset.color=state.settings.color||'blue';renderNav();const editable=!!listOf(view)&&!query;$('#view-title').innerHTML=esc(query?'검색 결과':titleOf(view))+(editable?icon('pencil'):'');$('#view-title').disabled=!editable;$('#view-title').title=editable?'카테고리 이름 바꾸기':'';$('#view-title').setAttribute('aria-label',editable?titleOf(view)+' 카테고리 이름 바꾸기':query?'검색 결과':titleOf(view));$('#date-label').textContent=query?`${titleOf(view)}에서 “${query}” 검색`:new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date());
 $('#main').className='main '+(listOf(view)?.color||'blue');$('#list-settings').hidden=!listOf(view);$('#suggest').hidden=view!=='today';
 const tasks=visible();$('#task-count').textContent=`${tasks.filter(t=>!t.done).length}개의 할 일${tasks.some(t=>t.done)?' · 완료 '+tasks.filter(t=>t.done).length+'개':''}`;
 const active=tasks.filter(t=>!t.done),done=tasks.filter(t=>t.done),foldable=view!=='completed'&&view!=='trash';
 $('#tasks').innerHTML=(foldable?active.map(row).join('')+(done.length?`<button type="button" class="complete-heading" id="toggle-completed" aria-expanded="${completedOpen.has(view)}" aria-controls="completed-tasks">${icon(completedOpen.has(view)?'down':'up')} 완료한 작업 · ${done.length}</button><div id="completed-tasks" ${completedOpen.has(view)?'':'hidden'}>${done.map(row).join('')}</div>`:''):tasks.map(row).join(''))||`<div class="empty"><div class="empty-icon">${icon(view==='today'?'sun':view==='completed'?'complete':view==='trash'?'trash':'folder')}</div><h2>${query?'검색 결과가 없습니다':view==='today'?'오늘은 무엇을 해볼까요?':view==='completed'?'작은 완료가 쌓이는 곳':view==='trash'?'휴지통이 비어 있습니다':'할 일을 정리해 보세요'}</h2><p>${query?'검색어를 바꾸거나 다른 목록을 확인하세요.':view==='today'?'새로운 할 일을 적거나 추천에서 골라보세요.<br>오늘의 업무를 하나씩 완성해 보세요.':view==='trash'?'삭제한 작업은 이곳에서 복원할 수 있습니다.':'아래 입력창에서 첫 번째 할 일을 추가하세요.'}</p></div>`;
 $('.add-wrap').hidden=['completed','trash'].includes(view);$('#new-title').placeholder=listOf(view)?`${listOf(view).name}에 할 일 추가`:'할 일 추가';$('#select-all').textContent=picking?'선택 종료':'여러 항목 선택';$('#bulk').hidden=!picking;
 $('#bulk').innerHTML=`<span>${picks.size}개 선택</span><button data-bulk="all">전체 선택</button>${view==='trash'?'<button data-bulk="restore">복원</button>':'<button data-bulk="complete">완료</button><button data-bulk="today">오늘 추가</button><button data-bulk="move">이동</button><button data-bulk="delete" class="danger">삭제</button>'}`;
 if(detail)renderDetail();
}
function repeatOptions(t){return [['','반복 안 함'],['day','매일'],['weekday','평일마다'],['week','매주'],['month','매월'],['year','매년']].map(([v,n])=>`<option value="${v}" ${t.repeat?.unit===v?'selected':''}>${n}</option>`).join('');}
function renderDetail(){
 const t=getTask(chosen);$('#detail').hidden=!t;if(!t)return;
 $('#detail').innerHTML=`<div class="detail-top"><span>${t.deleted?'삭제된 작업':'작업 상세'}</span><button class="icon" id="close-detail" aria-label="상세 닫기">×</button></div><div class="card"><textarea class="title-edit" id="edit-title" maxlength="1000" aria-label="작업 제목">${esc(t.title)}</textarea><div id="step-list">${t.steps.map(s=>`<div class="step ${s.done?'done':''}"><input type="checkbox" data-step="${esc(s.id)}" aria-label="${esc(s.title)} 완료" ${s.done?'checked':''}><span>${esc(s.title)}</span><button data-remove-step="${esc(s.id)}" aria-label="단계 삭제">×</button></div>`).join('')}</div><form class="step-form" id="add-step"><input maxlength="1000" placeholder="＋ 단계 추가" aria-label="단계 추가"><button>추가</button></form></div>
 <div class="card"><button class="wide" id="toggle-day">☼ ${t.myDay===date?'오늘 할 일에서 제거':'오늘 할 일에 추가'}</button><button class="wide" id="toggle-important">${t.important?'★ 중요 표시 해제':'☆ 중요 표시'}</button><button class="wide" id="detail-complete">✓ ${t.done?'완료 취소':'완료 처리'}</button></div>
 <div class="card"><label><span class="label-icon">${icon('calendar')} 기한</span><input id="edit-due" type="date" value="${esc(t.due)}"></label><label>◷ 알림 일시 (한국시간)<input id="edit-reminder" type="datetime-local" value="${esc(t.reminder)}"></label><p class="muted">알림은 이 페이지가 열려 있을 때 앱 안에 표시됩니다.</p><label>↻ 반복<select id="edit-repeat">${repeatOptions(t)}</select></label>${t.repeat&&t.repeat.unit!=='weekday'?`<label>반복 간격 (1~365)<input id="edit-interval" type="number" min="1" max="365" value="${t.repeat.interval}"></label>`:''}<label><span class="label-icon">${icon('folder')} 목록</span><select id="edit-list">${state.lists.map(l=>`<option value="${esc(l.id)}" ${l.id===t.list?'selected':''}>${esc(l.name)}</option>`).join('')}</select></label></div>
 <div class="card"><textarea class="note" id="edit-note" maxlength="20000" placeholder="메모 추가" aria-label="메모">${esc(t.note)}</textarea></div><p class="muted">만든 날짜 ${esc(t.created.slice(0,10))}${t.done?' · 완료됨':''}</p><button class="danger" id="delete-task">${icon('trash')} ${t.deleted?'영구 삭제':'작업 삭제'}</button>${t.deleted?'<button id="restore-task">복원</button>':''}`;
 if(t.deleted)$('#detail').querySelectorAll('input,textarea,select,form button,.wide').forEach(e=>e.disabled=true);
}
function showDialog(html){$('#dialog-body').innerHTML=html;$('#dialog').showModal();$('#dialog').querySelector('[autofocus]')?.focus();}
const head=title=>`<div class="dialog-head"><h2>${esc(title)}</h2><button class="icon" data-close aria-label="닫기">×</button></div>`;
function settings(){showDialog(head('설정 및 백업')+`<p>나의 업무 · To Do <b>v1.6.8</b><br>로그인한 계정의 Supabase 서버에 저장됩니다. 다른 기기의 변경은 약 15초마다 확인합니다. 서버에 저장됨 표시를 확인한 후 종료하세요.</p><div class="settings-row"><span>화면 테마</span><button id="theme-toggle">${state.settings.theme==='dark'?'밝게 보기':'어둡게 보기'}</button></div><div class="theme-colors"><p id="theme-color-label">화면 테마 색상</p><div class="theme-options" role="group" aria-labelledby="theme-color-label">${[['blue','블루'],['teal','그린'],['purple','라벤더'],['rose','로즈'],['sand','샌드'],['slate','슬레이트 블루'],['chatgpt','차콜 그레이']].map(([value,label])=>`<button type="button" data-theme-color="${value}" aria-pressed="${(state.settings.color||'blue')===value}"><span class="swatch ${value}" aria-hidden="true"></span>${label}</button>`).join('')}</div><p>선택한 색상은 전체 화면에 적용되며 계정에 저장됩니다.</p></div><div class="settings-row"><span>전체 데이터 백업</span><button id="export">JSON 내려받기</button></div><div class="settings-row"><span>백업 파일 복원</span><button id="import">파일 선택</button></div>${blocked?'<div class="settings-row"><span>읽지 못한 저장 원본</span><button id="export-raw">원본 내려받기</button></div>':''}<p>${state.tasks.filter(t=>!t.deleted).length}개 작업 · ${state.lists.length}개 목록<br>검색: Ctrl/Cmd + K · 새 작업: Alt + N · 패널 닫기: Esc</p><p>기존 브라우저 버전의 JSON 백업도 복원할 수 있습니다. 복원하면 현재 계정의 서버 데이터를 교체합니다. 작업 내용은 GitHub 저장소로 전송되지 않습니다.</p>${conflict?'<p class="danger">다른 탭 변경 감지: 현재 내용을 백업한 후 새로고침하세요.</p>':''}`);}
function download(name,data){const url=URL.createObjectURL(new Blob([data],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function listDialog(id){
 const l=listOf(id);
 showDialog(head(l?'카테고리 설정':'새 카테고리')+`<form id="list-form" data-id="${esc(id||'')}"><label>카테고리 이름<input name="name" required maxlength="200" value="${esc(l?.name||'')}" autofocus></label>${id==='inbox'?'<p>기본 작업 목록은 이름과 색상을 바꿀 수 있습니다.</p>':`<label>그룹<select name="group"><option value="">그룹 없음</option>${state.groups.map(g=>`<option value="${esc(g.id)}" ${l?.group===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label>`}<label>색상<select name="color">${[['blue','블루'],['teal','그린'],['purple','라벤더'],['rose','로즈'],['sand','샌드'],['slate','슬레이트 블루'],['chatgpt','차콜 그레이']].map(([v,n])=>`<option value="${v}" ${l?.color===v?'selected':''}>${n}</option>`).join('')}</select></label><div class="dialog-actions">${l&&id!=='inbox'?`<button type="button" data-delete-list="${esc(id)}" class="danger delete-action">${icon('trash')} 카테고리 삭제</button>`:''}<button type="button" data-close>취소</button><button class="primary">저장</button></div></form>`);
}
function renameListDialog(id){
 const l=listOf(id);if(!l)return;
 showDialog(head('카테고리 이름 바꾸기')+`<form id="rename-list-form" data-id="${esc(id)}"><label>새 이름<input name="name" required maxlength="200" value="${esc(l.name)}" autofocus></label><div class="dialog-actions"><button type="button" data-close>취소</button><button class="primary">저장</button></div></form>`);
 $('#rename-list-form input').select();
}
function listPeers(id){const l=listOf(id);return l?state.lists.filter(x=>x.id!=='inbox'&&(x.group||'')===(l.group||'')):[];}
function shiftList(id,direction){
 const peers=listPeers(id),index=peers.findIndex(l=>l.id===id),target=peers[index+direction];
 if(!target||!C.moveList(state,id,target.id,direction>0))return;
 commit(false);$('#nav').querySelector(`[data-view="${CSS.escape(id)}"]`)?.focus();toast('카테고리 순서를 변경했습니다.');
}
function listMenu(id){
 const l=listOf(id);if(!l)return;const peers=listPeers(id),index=peers.indexOf(l);
 showDialog(head(l.name)+`<div class="category-actions"><button data-rename-list="${esc(id)}">${icon('pencil')} 이름 바꾸기</button><button data-list-settings="${esc(id)}">${icon('folder')} 카테고리 설정</button>${id==='inbox'?'<p>기본 작업 목록은 삭제하거나 이동할 수 없습니다.</p>':`<button data-shift-list="${esc(id)}" data-direction="-1" ${index===0?'disabled':''}>${icon('up')} 위로 이동</button><button data-shift-list="${esc(id)}" data-direction="1" ${index===peers.length-1?'disabled':''}>${icon('down')} 아래로 이동</button><button data-delete-list="${esc(id)}" class="delete-action">${icon('trash')} 카테고리 삭제</button><p>사이드바에서 끌어 순서를 바꿀 수 있습니다.<br>키보드: 카테고리 선택 후 Alt + ↑ / ↓</p>`}</div>`);
}
function deleteListDialog(id){
 const l=listOf(id);if(!l||id==='inbox')return;
 const tasks=state.tasks.filter(t=>t.list===id),done=tasks.filter(t=>t.done).length,trashed=tasks.filter(t=>t.deleted).length;
 showDialog(head('카테고리 삭제')+`<p class="delete-question"><strong>‘${esc(l.name)}’ 목록을 삭제하시겠습니까?</strong></p><p>목록에 포함된 <strong>모든 할 일 ${tasks.length}개</strong>도 함께 삭제됩니다.<br>완료된 항목 ${done}개 · 휴지통 항목 ${trashed}개 포함</p><p class="delete-warning">삭제 후에는 복원할 수 없습니다.</p><div class="dialog-actions"><button type="button" data-close autofocus>취소</button><button type="button" class="danger-button" data-confirm-delete-list="${esc(id)}">예, 모두 삭제</button></div>`);
}
function confirmDeleteList(id){
 if(!C.deleteList(state,id))return;
 if(view===id){view='inbox';query='';$('#search').value='';}
 if(!getTask(chosen))chosen=null;
 picks=new Set([...picks].filter(id=>getTask(id)));picking=false;
 $('#dialog').close();commit();toast('카테고리와 포함된 모든 할 일을 삭제했습니다.');
}
function groupDialog(id){const g=state.groups.find(x=>x.id===id);showDialog(head(g?'그룹 수정':'새 그룹')+`<form id="group-form" data-id="${esc(id||'')}"><label>그룹 이름<input name="name" required maxlength="200" value="${esc(g?.name||'')}"></label><div class="dialog-actions">${g?'<button type="button" id="delete-group" class="danger">그룹 해제</button>':''}<button class="primary">저장</button></div></form>`);}
function recommendations(){const ts=state.tasks.filter(t=>!t.done&&!t.deleted&&t.myDay!==date).sort((a,b)=>Number(b.important)-Number(a.important)||C.dueKey(a).localeCompare(C.dueKey(b))).slice(0,20);showDialog(head('오늘 할 일 추천')+'<p>중요한 작업과 기한이 가까운 작업을 먼저 확인하세요.</p>'+ts.map(t=>`<div class="recommend"><span>${esc(t.title)}<br><small class="muted">${esc(t.due?t.due:listOf(t.list)?.name)}</small></span><button data-recommend="${esc(t.id)}">＋ 추가</button></div>`).join('')+(!ts.length?'<p>추가할 미완료 작업이 없습니다.</p>':''));}
function setDueOpen(open){$('#due-popover').hidden=!open;$('#toggle-new-due').setAttribute('aria-expanded',String(open));if(open)$('#due-popover [data-due-preset]').focus();}
function updateNewDue(){const value=$('#new-due').value;$('#new-due-label').textContent=value;$('#new-due-label').hidden=!value;$('#toggle-new-due').classList.toggle('has-due',!!value);$('#toggle-new-due').title=value?'기한: '+value:'기한 설정';$('#toggle-new-due').setAttribute('aria-label',value?'기한 변경: '+value:'기한 설정');}
function presetDue(preset,today=C.day()){
 const d=new Date(today+'T12:00:00Z');
 const offset=preset==='tomorrow'?1:preset==='next-week'?((8-d.getUTCDay())%7||7):0;
 d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);
}
$('#due-popover').addEventListener('click',e=>{const button=e.target.closest('[data-due-preset]');if(!button)return;$('#new-due').value=presetDue(button.dataset.duePreset);updateNewDue();setDueOpen(false);$('#toggle-new-due').focus();});
$('#toggle-new-due').onclick=()=>setDueOpen($('#due-popover').hidden);
$('#new-due').addEventListener('change',updateNewDue);
$('#close-new-due').onclick=()=>{setDueOpen(false);$('#toggle-new-due').focus();};
$('#clear-new-due').onclick=()=>{$('#new-due').value='';updateNewDue();setDueOpen(false);$('#toggle-new-due').focus();};
document.addEventListener('click',e=>{if(!e.target.closest('.due-control'))setDueOpen(false);});
$('#due-popover').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();setDueOpen(false);$('#toggle-new-due').focus();}if(e.key==='Enter'&&e.target.id==='new-due'){e.preventDefault();setDueOpen(false);$('#toggle-new-due').focus();}});
$('#add-task').addEventListener('submit',e=>{e.preventDefault();const input=$('#new-title'),text=input.value.trim();if(!text)return;const t=C.task(text,listOf(view)?view:'inbox');if(view==='today')t.myDay=date;if(view==='important')t.important=true;t.due=$('#new-due').value||(view==='planned'?date:'');if(t.due&&!C.validDate(t.due)){toast('기한 날짜를 확인해 주세요.');return;}t.anchor=t.due?Number(t.due.slice(-2)):null;state.tasks.push(t);input.value='';$('#new-due').value='';updateNewDue();setDueOpen(false);commit(false);input.focus();});
$('#search').addEventListener('input',e=>{query=e.target.value;render(false);});$('#sort').addEventListener('change',e=>{sort=e.target.value;render(false);});
$('#nav').addEventListener('click',e=>{
 const menu=e.target.closest('[data-list-menu]');if(menu)return listMenu(menu.dataset.listMenu);
 const g=e.target.closest('[data-edit-group]');if(g)return groupDialog(g.dataset.editGroup);
 const b=e.target.closest('[data-view]');if(!b)return;
 view=b.dataset.view;chosen=null;picks.clear();picking=false;query='';$('#search').value='';$('#sidebar').classList.remove('open');render();
});
$('#nav').addEventListener('keydown',e=>{
 const b=e.target.closest('[data-view]');if(!b||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
 if(!listOf(b.dataset.view)||b.dataset.view==='inbox')return;
 e.preventDefault();shiftList(b.dataset.view,e.key==='ArrowUp'?-1:1);
});
$('#tasks').addEventListener('click',e=>{if(e.target.closest('#toggle-completed')){completedOpen.has(view)?completedOpen.delete(view):completedOpen.add(view);render(false);$('#toggle-completed')?.focus();return;}const rowEl=e.target.closest('[data-task]');if(!rowEl)return;const t=getTask(rowEl.dataset.task);if(e.target.closest('[data-pick]')){e.target.checked?picks.add(t.id):picks.delete(t.id);render(false);return;}if(e.target.closest('[data-complete]'))C.complete(state,t,date);else if(e.target.closest('[data-star]'))t.important=!t.important;else if(e.target.closest('[data-restore]'))t.deleted=null;else{chosen=t.id;render();return;}commit();});
$('#tasks').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-task]')){chosen=e.target.dataset.task;render();$('#edit-title')?.focus();}});
$('#tasks').addEventListener('contextmenu',e=>{const r=e.target.closest('[data-task]');if(r){e.preventDefault();chosen=r.dataset.task;render();}});
function clearDropMarks(){document.querySelectorAll('.drop-before,.drop-after,.drop-task,.drop-zone-active').forEach(el=>el.classList.remove('drop-before','drop-after','drop-task','drop-zone-active'));}
function endDrag(){clearDropMarks();document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));drag=null;}
$('#tasks').addEventListener('dragstart',e=>{
 const r=e.target.closest('[data-task]'),t=r&&getTask(r.dataset.task);
 if(!t||t.deleted||picking){e.preventDefault();return;}
 drag={type:'task',id:t.id};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',t.id);
});
$('#tasks').addEventListener('dragover',e=>{if(drag?.type==='task'&&sort==='manual'){e.preventDefault();e.dataTransfer.dropEffect='move';}});
$('#tasks').addEventListener('drop',e=>{
 e.preventDefault();const r=e.target.closest('[data-task]');if(!r||drag?.type!=='task'||sort!=='manual')return endDrag();
 const target=getTask(r.dataset.task),t=getTask(drag.id);if(!t||!target||t.id===target.id)return endDrag();
 const all=state.tasks.filter(x=>x.id!==t.id).sort((a,b)=>a.order-b.order);all.splice(all.findIndex(x=>x.id===target.id),0,t);all.forEach((x,i)=>x.order=i);endDrag();commit(false);
});
$('#nav').addEventListener('dragstart',e=>{
 const r=e.target.closest('[data-list-drag]');if(!r||e.target.closest('.list-menu')){e.preventDefault();return;}
 drag={type:'list',id:r.dataset.listDrag};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',drag.id);r.classList.add('dragging');
});
$('#nav').addEventListener('dragover',e=>{
 clearDropMarks();if(!drag)return;
 const r=e.target.closest('[data-list-id]'),zone=e.target.closest('[data-list-zone]'),trash=e.target.closest('[data-view="trash"]');
 if(drag.type==='task'&&trash){e.preventDefault();e.dataTransfer.dropEffect='move';trash.classList.add('drop-task');}
 else if(drag.type==='task'&&r){e.preventDefault();e.dataTransfer.dropEffect='move';r.classList.add('drop-task');}
 else if(drag.type==='list'&&r&&r.dataset.listId!=='inbox'&&r.dataset.listId!==drag.id){e.preventDefault();e.dataTransfer.dropEffect='move';const rect=r.getBoundingClientRect();r.classList.add(e.clientY>=rect.top+rect.height/2?'drop-after':'drop-before');}
 else if(drag.type==='list'&&!r&&zone){e.preventDefault();e.dataTransfer.dropEffect='move';zone.classList.add('drop-zone-active');}
});
$('#nav').addEventListener('dragleave',e=>{if(!$('#nav').contains(e.relatedTarget))clearDropMarks();});
$('#nav').addEventListener('drop',e=>{
 e.preventDefault();const r=e.target.closest('[data-list-id]'),zone=e.target.closest('[data-list-zone]'),trash=e.target.closest('[data-view="trash"]');let changed=false;
 if(drag?.type==='task'&&trash){const t=getTask(drag.id);if(t&&!t.deleted){t.deleted=new Date().toISOString();if(chosen===t.id)chosen=null;picks.delete(t.id);changed=true;}}
 else if(drag?.type==='task'&&r){const t=getTask(drag.id);if(t&&!t.deleted&&t.list!==r.dataset.listId){t.list=r.dataset.listId;changed=true;}}
 else if(drag?.type==='list'&&r){const rect=r.getBoundingClientRect();changed=C.moveList(state,drag.id,r.dataset.listId,e.clientY>=rect.top+rect.height/2);}
 else if(drag?.type==='list'&&zone)changed=C.moveListToGroup(state,drag.id,zone.dataset.listZone);
 endDrag();if(changed){commit();toast('이동했습니다. 서버 저장 완료 표시를 확인하세요.');}
});
 document.addEventListener('dragend',endDrag);document.addEventListener('drop',endDrag);
$('#detail').addEventListener('change',e=>{const t=getTask(chosen);if(!t||t.deleted)return;const el=e.target;switch(el.id){case 'edit-due':if(el.value&&!C.validDate(el.value))return;t.due=el.value;delete t.dueTime;t.anchor=t.due?Number(t.due.slice(-2)):null;break;case 'edit-reminder':t.reminder=el.value;break;case 'edit-repeat':t.repeat=el.value?{unit:el.value,interval:1}:null;t.anchor=t.due?Number(t.due.slice(-2)):null;break;case 'edit-interval':if(!el.checkValidity()){el.reportValidity();return;}t.repeat.interval=Number(el.value);break;case 'edit-list':t.list=el.value;break;default:if(el.dataset.step)t.steps.find(s=>s.id===el.dataset.step).done=el.checked;else return;}commit();});
$('#detail').addEventListener('input',e=>{const t=getTask(chosen);if(!t||t.deleted)return;if(e.target.id==='edit-title'){if(!e.target.value.trim())return;t.title=e.target.value;}else if(e.target.id==='edit-note')t.note=e.target.value;else return;save();render(false);});
$('#detail').addEventListener('focusout',e=>{if(e.target.id==='edit-title'&&!e.target.value.trim())e.target.value=getTask(chosen)?.title||'';});
$('#detail').addEventListener('submit',e=>{if(e.target.id!=='add-step')return;e.preventDefault();const input=e.target.querySelector('input');if(!input.value.trim())return;getTask(chosen).steps.push({id:C.uid(),title:input.value.trim(),done:false});commit();$('#add-step input').focus();});
$('#detail').addEventListener('click',e=>{const t=getTask(chosen),el=e.target.closest('button');if(!el||!t)return;if(t.deleted&&!['close-detail','restore-task','delete-task'].includes(el.id))return;switch(el.id){case 'close-detail':chosen=null;render();return;case 'toggle-day':t.myDay=t.myDay===date?'':date;break;case 'toggle-important':t.important=!t.important;break;case 'detail-complete':C.complete(state,t,date);break;case 'restore-task':t.deleted=null;break;case 'delete-task':if(t.deleted){if(!confirm('이 작업을 영구 삭제할까요? 복원할 수 없습니다.'))return;state.tasks=state.tasks.filter(x=>x.id!==t.id);}else t.deleted=new Date().toISOString();chosen=null;break;default:if(el.dataset.removeStep)t.steps=t.steps.filter(s=>s.id!==el.dataset.removeStep);else return;}commit();});
$('#select-all').onclick=()=>{picking=!picking;picks.clear();render(false);};$('#bulk').onclick=e=>{const action=e.target.dataset.bulk;if(!action)return;if(action==='all'){visible().forEach(t=>picks.add(t.id));render(false);return;}if(!picks.size)return;if(action==='move'){showDialog(head('선택한 작업 이동')+`<form id="move-form"><label>이동할 목록<select name="list">${state.lists.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label><button class="primary">이동</button></form>`);return;}state.tasks.filter(t=>picks.has(t.id)).forEach(t=>{if(action==='complete'&&!t.done)C.complete(state,t,date);if(action==='today')t.myDay=date;if(action==='delete')t.deleted=new Date().toISOString();if(action==='restore')t.deleted=null;});picks.clear();chosen=null;commit();};
$('#settings').onclick=settings;$('#add-list').onclick=()=>listDialog();$('#add-group').onclick=()=>groupDialog();$('#list-settings').onclick=()=>listMenu(view);$('#view-title').onclick=()=>renameListDialog(view);$('#list-settings').innerHTML=icon('more');$('#suggest').onclick=recommendations;$('#show-nav').onclick=()=>$('#sidebar').classList.add('open');$('#hide-nav').onclick=()=>$('#sidebar').classList.remove('open');
$('#dialog').addEventListener('click',e=>{const el=e.target.closest('button');if(!el)return;if(el.hasAttribute('data-close')){$('#dialog').close();return;}if(el.dataset.themeColor){state.settings.color=el.dataset.themeColor;commit();$('#dialog').querySelectorAll('[data-theme-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeColor===state.settings.color)));return;}if(el.dataset.renameList)return renameListDialog(el.dataset.renameList);
 if(el.dataset.listSettings)return listDialog(el.dataset.listSettings);
 if(el.dataset.deleteList)return deleteListDialog(el.dataset.deleteList);
 if(el.dataset.confirmDeleteList)return confirmDeleteList(el.dataset.confirmDeleteList);
 if(el.dataset.shiftList){shiftList(el.dataset.shiftList,Number(el.dataset.direction));return listMenu(el.dataset.shiftList);}
 if(el.dataset.recommend){getTask(el.dataset.recommend).myDay=date;commit();el.textContent='추가됨';el.disabled=true;return;}switch(el.id){case 'theme-toggle':state.settings.theme=state.settings.theme==='dark'?'light':'dark';commit();$('#dialog').close();settings();break;case 'export':download('office-todo-backup-'+date+'.json',JSON.stringify(state,null,2));toast('백업 파일을 내려받았습니다.');break;case 'export-raw':try{download('office-todo-original.json',localStorage.getItem(KEY)||'');}catch{toast('원본을 읽을 수 없습니다.');}break;case 'import':$('#import-file').click();break;case 'delete-group':{const id=$('#group-form').dataset.id;state.lists.forEach(l=>{if(l.group===id)l.group='';});state.groups=state.groups.filter(g=>g.id!==id);$('#dialog').close();commit();break;}}});
$('#dialog').addEventListener('submit',e=>{
 e.preventDefault();const f=e.target,data=new FormData(f);
 if(['list-form','rename-list-form','group-form'].includes(f.id)){
  const input=f.elements.name,name=input.value.trim();if(!name){input.setCustomValidity('이름을 입력하세요.');input.reportValidity();return;}input.setCustomValidity('');
  if(f.id==='rename-list-form'){const l=listOf(f.dataset.id);if(!l)return;l.name=name;}
  else if(f.id==='list-form'){const existing=listOf(f.dataset.id),l=existing||{id:C.uid()};Object.assign(l,{name,group:f.dataset.id==='inbox'?'':data.get('group'),color:data.get('color')});if(!existing)state.lists.push(l);view=l.id;query='';$('#search').value='';}
  else {const g=state.groups.find(g=>g.id===f.dataset.id);if(g)g.name=name;else state.groups.push({id:C.uid(),name});}
 }else if(f.id==='move-form'){state.tasks.filter(t=>picks.has(t.id)).forEach(t=>t.list=data.get('list'));picks.clear();}else return;
 $('#dialog').close();commit();
});
$('#dialog').addEventListener('input',e=>{if(e.target.name==='name')e.target.setCustomValidity('');});
$('#import-file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>20000000)throw Error('20MB 이하의 백업 파일을 선택하세요.');const incoming=C.validate(JSON.parse(await f.text()));if(!confirm('백업 파일 내용으로 현재 데이터를 교체할까요? 현재 데이터 백업을 먼저 권장합니다.'))return;const fresh=structuredClone(incoming);fresh.revision=C.uid();state=fresh;blocked=false;conflict=false;chosen=null;view='today';picks.clear();picking=false;$('#dialog').close();save();render();toast('백업 내용을 불러왔습니다. 서버 저장 완료 표시를 확인하세요.');}catch(err){toast(err.message||'백업을 복원하지 못했습니다.');}finally{e.target.value='';}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus();}if(e.altKey&&e.key.toLowerCase()==='n'){e.preventDefault();$('#new-title').focus();}if(e.key==='Escape'&&!$('#dialog').open){chosen=null;$('#sidebar').classList.remove('open');render();}});
const notified=new Set();setInterval(()=>{const today=C.day();if(date!==today){date=today;render();}const now=Date.now();const due=state.tasks.filter(t=>!t.deleted&&!t.done&&t.reminder&&!notified.has(t.id+'|'+t.reminder)&&Date.parse(t.reminder+':00+09:00')<=now);if(due.length){due.forEach(t=>notified.add(t.id+'|'+t.reminder));toast('알림: '+due.slice(0,3).map(t=>t.title).join(', ')+(due.length>3?' 외 '+(due.length-3)+'건':''));}},15000);
render();if(startupError){$('#save-status').textContent='저장 데이터 확인 필요';showDialog(head('저장 데이터 확인')+'<p>'+esc(startupError)+'</p><button data-close class="primary">확인</button>');}
