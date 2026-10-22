/* Shared domain logic; no external dependencies. */
(function(root){
'use strict';
const uid=()=>globalThis.crypto?.randomUUID?.() || 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const day=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const parse=s=>new Date(s+'T12:00:00Z');
const iso=d=>d.toISOString().slice(0,10);
const validDate=s=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(+parse(s)) && iso(parse(s))===s;
const dueKey=t=>t.due||t.reminder.slice(0,10)||'9999';
const isOverdue=(t,now=new Date())=>!!t.due&&!t.done&&t.due<day(now);
function advance(date,repeat,anchor){
 const d=parse(date),n=repeat.interval||1;
 if(repeat.unit==='weekday'){do{d.setUTCDate(d.getUTCDate()+1);}while([0,6].includes(d.getUTCDay()));}
 else if(['month','year'].includes(repeat.unit)){
  const desired=anchor||d.getUTCDate();d.setUTCDate(1);
  if(repeat.unit==='month')d.setUTCMonth(d.getUTCMonth()+n);else d.setUTCFullYear(d.getUTCFullYear()+n);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(desired,last));
 }else d.setUTCDate(d.getUTCDate()+n*(repeat.unit==='week'?7:1));
 return iso(d);
}
function nextDue(task,today=day()){
 let date=task.due||today;
 do {const next=advance(date,task.repeat,task.anchor||parse(date).getUTCDate());if(next<=date)throw Error('Invalid recurrence');date=next;}while(date<=today);
 return date;
}
function empty(){return {version:1,revision:'',groups:[],lists:[{id:'inbox',name:'작업',group:'',color:'blue'}],tasks:[],settings:{theme:'light',color:'blue'}};}
function task(title,list='inbox',today=day()){return {id:uid(),title,list,done:false,important:false,myDay:'',due:'',reminder:'',repeat:null,anchor:null,note:'',steps:[],created:new Date().toISOString(),order:Date.now(),deleted:null,completed:null,series:uid(),nextId:null};}
function complete(state,t,today=day()){
 if(t.done){t.done=false;t.completed=null;return;}
 t.done=true;t.completed=new Date().toISOString();
 if(t.repeat&&!t.nextId){const next={...structuredClone(t),id:uid(),done:false,completed:null,deleted:null,myDay:'',due:nextDue(t,today),reminder:'',steps:t.steps.map(s=>({...s,id:uid(),done:false})),created:new Date().toISOString(),order:Date.now(),nextId:null};next.anchor=t.anchor||(t.due?parse(t.due).getUTCDate():parse(today).getUTCDate());t.nextId=next.id;state.tasks.push(next);}
}
function matches(t,view,today=day()){
 if(view==='trash')return !!t.deleted;
 if(t.deleted)return false;
 if(view==='today')return !t.done&&t.myDay===today;
 if(view==='important')return !t.done&&t.important;
 if(view==='planned')return !t.done&&!!(t.due||t.reminder);
 if(view==='all')return !t.done;
 if(view==='completed')return t.done;
 return t.list===view;
}
// List array order is persisted in the existing server payload and JSON backups.
function moveList(state,id,targetId,after=false){
 const list=state.lists.find(l=>l.id===id),target=state.lists.find(l=>l.id===targetId);
 if(!list||!target||id==='inbox'||targetId==='inbox'||id===targetId)return false;
 const previous=state.lists.map(l=>l.id),group=list.group;
 state.lists=state.lists.filter(l=>l.id!==id);
 state.lists.splice(state.lists.indexOf(target)+(after?1:0),0,list);
 list.group=target.group;
 return previous.some((id,index)=>id!==state.lists[index].id)||group!==list.group;
}
function moveListToGroup(state,id,group){
 const list=state.lists.find(l=>l.id===id);
 if(!list||id==='inbox'||(group&&!state.groups.some(g=>g.id===group)))return false;
 const peers=state.lists.filter(l=>l.id!==id&&l.id!=='inbox'&&l.group===group);
 if(peers.length)return moveList(state,id,peers.at(-1).id,true);
 if(list.group===group)return false;
 list.group=group;return true;
}
function deleteList(state,id){
 if(id==='inbox'||!state.lists.some(l=>l.id===id))return false;
 state.tasks=state.tasks.filter(t=>t.list!==id);
 state.lists=state.lists.filter(l=>l.id!==id);
 return true;
}
function validate(s){
 const fail=()=>{throw Error('지원하지 않거나 손상된 백업 파일입니다.');};
 if(!s||s.version!==1||!Array.isArray(s.tasks)||!Array.isArray(s.lists)||!Array.isArray(s.groups)||!s.settings)fail();
 if(s.tasks.length>50000||s.lists.length>1000||s.groups.length>1000)fail();
 const ids=new Set();const id=x=>{if(typeof x!=='string'||!x||x.length>200||ids.has(x))fail();ids.add(x);};
 const str=(x,max=20000)=>{if(typeof x!=='string'||x.length>max)fail();};
 s.groups.forEach(g=>{id(g.id);str(g.name,200);});
 s.lists.forEach(l=>{id(l.id);str(l.name,200);if(!['blue','teal','purple','rose','sand'].includes(l.color))fail();if(l.group&&!s.groups.some(g=>g.id===l.group))fail();});
 if(!s.lists.some(l=>l.id==='inbox'))fail();
 s.tasks.forEach(t=>{id(t.id);str(t.title,1000);str(t.note);str(t.reminder,30);str(t.created,50);str(t.series,200);if(!s.lists.some(l=>l.id===t.list)||typeof t.done!=='boolean'||typeof t.important!=='boolean')fail();
 for(const key of ['due','myDay'])if(t[key]!==''&&!validDate(t[key]))fail();
 delete t.dueTime; // Retire v1.5 deadline times; keep the date.
 if(t.reminder&&(typeof t.reminder!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t.reminder)||!validDate(t.reminder.slice(0,10))||+t.reminder.slice(11,13)>23||+t.reminder.slice(14)>59))fail();
 if(t.repeat&&(!['day','weekday','week','month','year'].includes(t.repeat.unit)||!Number.isInteger(t.repeat.interval)||t.repeat.interval<1||t.repeat.interval>365))fail();
 if(t.anchor!=null&&(!Number.isInteger(t.anchor)||t.anchor<1||t.anchor>31))fail();
 if(!Array.isArray(t.steps)||t.steps.length>500||!Number.isFinite(t.order))fail();t.steps.forEach(st=>{id(st.id);str(st.title,1000);if(typeof st.done!=='boolean')fail();});
 for(const k of ['created','completed','deleted'])if(t[k]!=null&&(typeof t[k]!=='string'||Number.isNaN(Date.parse(t[k]))))fail();
 if(t.nextId!=null)str(t.nextId,200);
 });
 if(!['light','dark'].includes(s.settings.theme))fail();if(!['blue','teal','purple','rose','sand'].includes(s.settings.color))s.settings.color='blue';return s;
}
root.TodoCore={uid,day,validDate,dueKey,isOverdue,advance,nextDue,empty,task,complete,matches,moveList,moveListToGroup,deleteList,validate};
if(typeof module!=='undefined')module.exports=root.TodoCore;
})(globalThis);
