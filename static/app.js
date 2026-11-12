const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data, revision, saving=false, view='overview', editingTask=null, editingTab=null, editingCategory=null;
let collapsed=new Set();try{collapsed=new Set(JSON.parse(localStorage.getItem('plan-net-folds')||'[]'));}catch{}
const uid=()=>crypto.randomUUID();
let selectedZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
try{const savedZone=localStorage.getItem('plannet-timezone');if(savedZone){new Intl.DateTimeFormat('en',{timeZone:savedZone}).format();selectedZone=savedZone;}}catch{}
const today=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:selectedZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>parts.find(p=>p.type===t).value;return `${part('year')}-${part('month')}-${part('day')}`;};
let displayName='',greetingLanguage='auto';
try{displayName=localStorage.getItem('plannet-name')||'';greetingLanguage=localStorage.getItem('plannet-language')||'auto';}catch{}
function languageForZone(zone){
 if(zone==='Asia/Manila')return 'fil';
 if(zone==='Asia/Tokyo')return 'ja';
 if(['Asia/Shanghai','Asia/Chongqing','Asia/Chungking','Asia/Harbin','Asia/Hong_Kong','Asia/Macau','Asia/Macao','Asia/Taipei','Asia/Urumqi'].includes(zone))return 'zh';
 if(/^(Europe\/Madrid|Africa\/Ceuta|Atlantic\/Canary|America\/(Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ciudad_Juarez|Ojinaga|Hermosillo|Mazatlan|Bahia_Banderas|Tijuana|Bogota|Lima|Santiago|Punta_Arenas|Caracas|Argentina\/.*|Buenos_Aires|Cordoba|Mendoza|Jujuy|Catamarca|La_Paz|Asuncion|Montevideo|Guayaquil|Guatemala|El_Salvador|Managua|Tegucigalpa|Costa_Rica|Panama|Havana|Santo_Domingo|Puerto_Rico)|Pacific\/(Galapagos|Easter))$/.test(zone))return 'es';
 return 'en';
}
function greetingFor(language,hour,name){
 const period=hour>=5&&hour<12?0:hour>=12&&hour<18?1:2;
 const greetings={en:['Good morning','Good afternoon','Good evening'],fil:['Magandang umaga','Magandang hapon','Magandang gabi'],ja:['おはようございます','こんにちは','こんばんは'],zh:['早上好','下午好','晚上好'],es:['Buenos días','Buenas tardes','Buenas noches']};
 const greeting=(greetings[language]||greetings.en)[period];
 return name?language==='ja'?`${name}さん、${greeting}`:language==='zh'?`${greeting}，${name}`:`${greeting}, ${name}`:greeting;
}
function updateClock(){
 const now=new Date();const language=greetingLanguage==='auto'?languageForZone(selectedZone):greetingLanguage;
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:selectedZone,hour:'numeric',hourCycle:'h23'}).format(now));
 $('#greeting').textContent=greetingFor(language,hour,displayName);$('#greeting').lang=language;
 $('#today-label').textContent=now.toLocaleDateString(undefined,{timeZone:selectedZone,weekday:'long',month:'long',day:'numeric'}).toUpperCase();
 const city=selectedZone.split('/').pop().replaceAll('_',' ');
 const timeParts=new Intl.DateTimeFormat('en-US',{timeZone:selectedZone,hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(now);
 const time=timeParts.filter(p=>p.type!=='dayPeriod').map(p=>p.value).join('').trim();const period=timeParts.find(p=>p.type==='dayPeriod')?.value||'';
 $('#clock-button').innerHTML=`<span class="clock-face">${esc(time)}<small>${esc(period)}</small></span><span class="clock-place">${esc(city)}</span>`;
 $('#clock-button').setAttribute('aria-label',`${time} ${period}, ${city}`);$('#timezone').textContent=selectedZone;
}

function timedOverdue(task){return data?.tabs.some(tab=>tab.timed&&tab.schedule?.runtime&&PlannetTimer.rows(tab.schedule,data.tasks).some(r=>r.task.id===task.id&&r.overdue));}
const alertFor=t=>t.done?'complete':timedOverdue(t)?'overdue':!t.deadline?'undated':t.deadline===today()?'today':t.deadline<today()?'overdue':'upcoming';
const status=t=>t.done?'Complete':timedOverdue(t)?'Overdue':t.progress;
const byId=id=>data.tasks.find(t=>t.id===id);
function descendants(id, source=data){const found=new Set([id]);let size;do{size=found.size;source.tasks.forEach(t=>{if(found.has(t.parentId))found.add(t.id);});}while(size!==found.size);return found;}
function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').hidden=true,5000);}
function updateSaveVisibility(){const el=$('#save-state');el.hidden=['● All changes saved','Synced to your account'].includes(el.textContent);}
new MutationObserver(updateSaveVisibility).observe($('#save-state'),{childList:true,characterData:true,subtree:true});
async function load(){const r=await fetch('/api/state');if(!r.ok)throw Error('Could not open your planner.');const payload=await r.json();data=payload.data;revision=payload.revision;$('#save-state').textContent='● All changes saved';render();}
async function commit(change){
 if(saving){notify('Finishing the previous save. Please try again in a moment.');return false;}
 saving=true;$('#save-state').textContent='Saving…';const next=structuredClone(data);
 try{change(next);for(const plan of [...(next.dayPlans||[]),...next.tabs.map(t=>t.schedule).filter(Boolean)])plan.taskIds=plan.taskIds.filter(id=>next.tasks.some(t=>t.id===id));const r=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,data:next})});const result=await r.json();if(!r.ok){if(r.status===409)await load();throw Error(result.error||'Could not save.');}data=result.data;revision=result.revision;$('#save-state').textContent='● All changes saved';render();return true;}
 catch(e){$('#save-state').textContent='Save failed — try again';notify(e.message);return false;}
 finally{saving=false;}
}
function order(a,b){const rank={today:0,overdue:1,upcoming:2,undated:3,complete:4};return rank[alertFor(a)]-rank[alertFor(b)]||(a.deadline||'9999').localeCompare(b.deadline||'9999')||data.tasks.indexOf(a)-data.tasks.indexOf(b);}
function matches(t){const q=$('#search').value.trim().toLowerCase();const s=$('#status-filter').value;return (!q||`${t.title} ${t.notes}`.toLowerCase().includes(q))&&(s==='all'||status(t)===s)&&($('#show-done').checked||s==='Complete'||view==='complete'||!t.done);}
function dateLabel(t){if(!t.deadline)return '';const d=new Date(t.deadline+'T12:00:00');const kind=alertFor(t);return kind==='today'?'Due today':`${kind==='overdue'?'Overdue · ':''}${d.toLocaleDateString(undefined,{month:'short',day:'numeric',...(d.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})})}`;}
function taskRow(t,depth=0,flat=false,context=false){
 const children=data.tasks.filter(c=>c.parentId===t.id);const expanded=!collapsed.has(t.id);const tab=data.tabs.find(x=>x.id===t.tabId);const category=data.categories.find(x=>x.id===t.categoryId);const parent=byId(t.parentId);
 const visibleChildren=children.filter(c=>matches(c)||[...descendants(c.id)].some(id=>matches(byId(id))));
 const openChildren=children.filter(c=>!c.done).length;
 return `<article class="task ${t.done?'is-done':''} ${context?'context-task':''}" style="--depth:${Math.min(depth,8)}"><div class="task-main"><div class="task-leading">${children.length&&!flat?`<button class="fold" data-action="fold" data-id="${esc(t.id)}" aria-label="${expanded?'Collapse':'Expand'} subtasks" aria-expanded="${expanded}"><span class="triangle ${expanded?'':'right'}" aria-hidden="true"></span></button>`:'<span class="fold-space"></span>'}<input type="checkbox" class="task-check" data-action="done" data-id="${esc(t.id)}" ${t.done?'checked':''} aria-label="Complete ${esc(t.title)}"></div><div class="task-body">${flat?`<div class="breadcrumb"><i style="background:${esc(tab.color)}"></i>${esc(tab.name)} <span>/</span> ${esc(category.name)}${parent?` <span>/</span> ${esc(parent.title)}`:''}</div>`:''}<button class="task-title" data-action="edit" data-id="${esc(t.id)}">${esc(t.title)}</button>${t.repeat?`<span class="repeat-tag">↻ ${esc(PlannetRepeat.label(t))}</span>`:''}${t.notes?`<p class="task-note">${esc(t.notes)}</p>`:''}${children.length?`<span class="child-count">${children.length-openChildren}/${children.length} subtasks</span>`:''}</div><div class="task-status"><span class="status-pill ${t.done?'status-complete':t.progress==='In progress'?'status-active':t.progress==='Waiting'?'status-waiting':''}">${esc(status(t))}</span></div><div class="task-deadline">${t.deadline?`<span class="badge ${alertFor(t)}">${esc(dateLabel(t))}</span>`:'<span class="cell-empty">—</span>'}</div><div class="task-hours">${t.hours!==null?durationLabel(Math.round(t.hours*60)):'<span class="cell-empty">—</span>'}</div><div class="task-actions"><button data-action="subtask" data-id="${esc(t.id)}" title="Add subtask" aria-label="Add subtask to ${esc(t.title)}">＋</button><button data-action="edit" data-id="${esc(t.id)}" title="Edit task" aria-label="Edit ${esc(t.title)}">✎</button><button class="delete-icon" data-action="delete" data-id="${esc(t.id)}" title="Delete task" aria-label="Delete ${esc(t.title)}">×</button></div></div>${!flat&&expanded?visibleChildren.sort(order).map(c=>taskRow(c,depth+1,false,!matches(c))).join(''):''}</article>`;
}
function render(){
 if(!data)return;
 if(!['overview','today','overdue','open','complete'].includes(view)&&!data.tabs.some(t=>t.id===view))view='overview';
 updateClock();
 for(const k of ['today','overdue'])$(`#count-${k}`).textContent=data.tasks.filter(t=>alertFor(t)===k).length;
 $('#count-open').textContent=data.tasks.filter(t=>!t.done).length;$('#count-complete').textContent=data.tasks.filter(t=>t.done).length;
 document.querySelectorAll('.stat').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));
 $('#tabs').innerHTML=`<button class="tab ${['overview','today','overdue','open','complete'].includes(view)?'selected':''}" data-tab="overview"><span>◫</span> Overview</button><span class="tab-divider"></span>${data.tabs.map(t=>`<button class="tab ${view===t.id?'selected':''}" data-tab="${esc(t.id)}"><i style="background:${esc(t.color)}"></i>${esc(t.name)}${t.timed?'<span class="timed-clock" title="Timed tab"><svg class="small-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2" stroke-linecap="round"/></svg></span>':''}<small>${data.tasks.filter(x=>x.tabId===t.id&&!x.done).length}</small></button>`).join('')}<button class="tab add-tab" data-tab="new" title="New tab" aria-label="New tab"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg></button>`;
 const tab=data.tabs.find(t=>t.id===view);$('#manage-tab').hidden=!tab;$('#remove-tab').hidden=!tab;$('#new-category').hidden=!tab;
 const scheduled=!!tab?.timed;
 $('.filters').hidden=scheduled;$('#day-plan').hidden=!scheduled;$('#task-list').hidden=scheduled;$('#new-category').hidden=!tab||scheduled;
 if(scheduled){$('#view-title').textContent=tab.name;$('#view-caption').textContent='Timed schedule · plan as far ahead as you need.';renderDayPlan();return;}
 const names={overview:'The bigger picture',today:'A little focus for today',overdue:'Time to catch up',open:'Everything in motion',complete:'Look how far you’ve come'};
 $('#view-title').textContent=tab?tab.name:names[view];$('#view-caption').textContent=tab?'Your tasks, organized into a little more clarity.':'Tasks and subtasks across all your spaces. Today comes first.';
 const candidates=data.tasks.filter(t=>tab?t.tabId===tab.id:view==='today'?alertFor(t)==='today':view==='overdue'?alertFor(t)==='overdue':view==='open'?!t.done:view==='complete'?t.done:true);
 const visible=candidates.filter(matches);$('#result-count').textContent=`${visible.length} item${visible.length===1?'':'s'}`;
 if(tab){const categories=data.categories.filter(c=>c.tabId===tab.id);$('#task-list').innerHTML=categories.length?categories.map(c=>{const roots=data.tasks.filter(t=>t.categoryId===c.id&&!t.parentId).filter(t=>matches(t)||[...descendants(t.id)].some(id=>matches(byId(id))));const open=data.tasks.filter(t=>t.categoryId===c.id&&!t.done).length;const folded=collapsed.has(c.id);return `<section class="category"><div class="category-head"><button class="category-name" data-action="fold" data-id="${esc(c.id)}" aria-expanded="${!folded}"><span class="triangle ${folded?'right':''}" aria-hidden="true"></span>${esc(c.name)}<small>${open} open</small></button><div><button class="text-button" data-action="new-in-category" data-id="${esc(c.id)}">＋ Task</button><button class="icon-button" data-action="edit-category" data-id="${esc(c.id)}" aria-label="Edit category ${esc(c.name)}">•••</button></div></div>${folded?'':roots.length?roots.sort(order).map(t=>taskRow(t,0,false,!matches(t))).join(''):`<button class="category-empty" data-action="new-in-category" data-id="${esc(c.id)}">${data.tasks.some(t=>t.categoryId===c.id)?'No tasks match this view.':'A little room for something new.'} <span>＋ Add a task</span></button>`}</section>`;}).join(''):'<div class="empty"><div class="empty-symbol">＋</div><h3>Give this space a starting point.</h3><p>Add a category above, then your first task.</p></div>';}
 else $('#task-list').innerHTML=visible.length?`<div class="overview-list">${visible.sort(order).map(t=>taskRow(t,0,true)).join('')}</div>`:`<div class="empty"><div class="empty-symbol">✳</div><h3>${view==='today'?'A little breathing room.':'Nothing here just yet.'}</h3><p>${view==='today'?'No unfinished tasks are due today.':'Add a task or adjust your filters to see more.'}</p></div>`;
 $('#task-list').insertAdjacentHTML('afterbegin','<div class="task-column-head" aria-hidden="true"><span></span><span>Task</span><span>Status</span><span>Deadline</span><span>Duration</span><span class="actions-heading">Actions</span></div>');
}
function options(items,selected){return items.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name||x.title)}</option>`).join('');}
function taskCategories(selected){$('#task-category').innerHTML=options(data.categories.filter(c=>c.tabId===$('#task-tab').value),selected);taskParents();}
function taskParents(selected){const excluded=editingTask?descendants(editingTask):new Set();$('#task-parent').innerHTML='<option value="">None — standalone task</option>'+options(data.tasks.filter(t=>t.tabId===$('#task-tab').value&&t.categoryId===$('#task-category').value&&!excluded.has(t.id)),selected);}
function openTask(id=null,parentId=null,categoryId=null){
 if(!data.tabs.length){notify('Add a tab first to give your task a home.');openTab();return;}
 const t=id?byId(id):null,parent=parentId?byId(parentId):null;editingTask=id;
 const tabId=t?.tabId||parent?.tabId||data.categories.find(c=>c.id===categoryId)?.tabId||(data.tabs.some(x=>x.id===view)?view:data.tabs[0].id);
 $('#task-form').reset();$('#task-dialog-title').textContent=t?'Edit task':parent?'New subtask':'New task';$('#task-title').value=t?.title||'';
 $('#task-tab').innerHTML=options(data.tabs,tabId);taskCategories(t?.categoryId||parent?.categoryId||categoryId);taskParents(t?.parentId||parentId||'');
 $('#task-date').value=t?.deadline||'';$('#task-hours').value=t?.hours==null?'':Math.floor(Math.round(t.hours*60)/60);$('#task-minutes').value=t?.hours==null?'':Math.round(t.hours*60)%60;$('#task-progress').value=t?.progress||'Not started';$('#task-notes').value=t?.notes||'';setupRepeatForm(t);
 $('#task-form-note').textContent=t&&descendants(t.id).size>1?'Moving this task also moves its subtasks to the selected tab and category.':'Subtasks have their own deadlines and completion status.';
 if(!$('#task-category').options.length){notify('Add a category in this tab first.');view=tabId;render();openCategory();return;}
 $('#task-dialog').showModal();$('#task-title').focus();
}
function openTab(id=null){editingTab=id;const t=data.tabs.find(x=>x.id===id);$('#tab-dialog-title').textContent=t?'Edit tab':'New tab';$('#tab-name').value=t?.name||'';$('#tab-color').value=t?.color||'#db754b';$('#tab-timed').checked=!!t?.timed;$('#delete-tab').hidden=!t;$('#tab-reorder').hidden=!t;$('#move-left').disabled=!t||data.tabs.indexOf(t)===0;$('#move-right').disabled=!t||data.tabs.indexOf(t)===data.tabs.length-1;$('#tab-dialog').showModal();$('#tab-name').focus();}
function openCategory(id=null){editingCategory=id;const c=data.categories.find(x=>x.id===id);$('#category-dialog-title').textContent=c?'Edit category':'New category';$('#category-name').value=c?.name||'';$('#delete-category').hidden=!c;$('#category-dialog').showModal();$('#category-name').focus();}
function confirmDelete(title,text){$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;$('#confirm-dialog').showModal();return new Promise(resolve=>{let handled=false;const finish=v=>{if(handled)return;handled=true;$('#confirm-dialog').close();resolve(v);};$('#confirm-delete').onclick=()=>finish(true);$('#confirm-cancel').onclick=()=>finish(false);$('#confirm-dialog').oncancel=e=>{e.preventDefault();finish(false);};});}

$('#tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(!b)return;if(b.dataset.tab==='new')return openTab();view=b.dataset.tab;$('#status-filter').value='all';render();};
document.querySelectorAll('.stat').forEach(b=>b.onclick=()=>{view=b.dataset.view;$('#status-filter').value='all';render();});
$('.brand').onclick=e=>{e.preventDefault();view='overview';render();};
for(const id of ['search','status-filter','show-done'])$('#'+id).addEventListener('input',render);
$('#new-task').onclick=()=>openTask();$('#new-category').onclick=()=>openCategory();$('#manage-tab').onclick=()=>openTab(view);$('#help').onclick=()=>{$('#zone-dialog').close();$('#help-dialog').showModal();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#task-tab').onchange=()=>taskCategories();$('#task-category').onchange=()=>taskParents();
$('#task-list').onclick=async e=>{
 const b=e.target.closest('[data-action]');if(!b)return;const {action,id}=b.dataset;
 if(action==='fold'){collapsed.has(id)?collapsed.delete(id):collapsed.add(id);try{localStorage.setItem('plan-net-folds',JSON.stringify([...collapsed]));}catch{}render();}
 if(action==='edit')openTask(id);
 if(action==='subtask')openTask(null,id);
 if(action==='new-in-category')openTask(null,null,id);
 if(action==='edit-category')openCategory(id);
 if(action==='done'){const value=b.checked;const ok=await completeTask(id,value);if(!ok)render();}
 if(action==='delete'){const t=byId(id),ids=descendants(id);if(await confirmDelete('Delete this task?',`“${t.title}”${ids.size>1?` and its ${ids.size-1} subtask(s)`:''} will be permanently removed from this planner.`))await commit(d=>d.tasks=d.tasks.filter(t=>!ids.has(t.id)));}
};
$('#task-form').onsubmit=async e=>{
 e.preventDefault();const title=$('#task-title').value.trim();if(!title)return notify('Give your task a description.');
 const task={...(editingTask?byId(editingTask):{}),id:editingTask||uid(),title,tabId:$('#task-tab').value,categoryId:$('#task-category').value,parentId:$('#task-parent').value||null,deadline:$('#task-date').value,hours:$('#task-hours').value===''&&$('#task-minutes').value===''?null:(Number($('#task-hours').value)*60+Number($('#task-minutes').value))/60,progress:$('#task-progress').value,notes:$('#task-notes').value.trim(),done:editingTask?byId(editingTask).done:false};
 try{task.repeat=readRepeatForm();if(task.repeat)task.deadline=PlannetRepeat.align(task.deadline,task.repeat);}catch(error){return notify(error.message);}
 if(!task.categoryId)return notify('Choose a category first.');
 const ids=editingTask?descendants(editingTask):new Set();const ok=await commit(d=>{if(editingTask){d.tasks=d.tasks.map(t=>t.id===task.id?task:ids.has(t.id)?{...t,tabId:task.tabId,categoryId:task.categoryId}:t);}else {d.tasks.push(task);const tab=d.tabs.find(t=>t.id===task.tabId);if(tab?.timed&&tab.schedule&&!tab.schedule.taskIds.includes(task.id))tab.schedule.taskIds.push(task.id);}});
 if(ok){$('#task-dialog').close();if(task.parentId)collapsed.delete(task.parentId);collapsed.delete(task.categoryId);render();notify(editingTask?'Task updated.':'A new plan, ready when you are.');}
};
$('#tab-form').onsubmit=async e=>{e.preventDefault();const name=$('#tab-name').value.trim();if(!name)return;const id=editingTab||uid(),color=$('#tab-color').value,timed=$('#tab-timed').checked;const ok=await commit(d=>{let tab=d.tabs.find(t=>t.id===id);if(tab)Object.assign(tab,{name,color,timed});else{tab={id,name,color,timed};d.tabs.push(tab);d.categories.push({id:uid(),tabId:id,name:'General'});}if(timed&&!tab.schedule)tab.schedule={date:today(),start:'09:00',taskIds:d.tasks.filter(t=>t.tabId===id&&!t.done&&!t.parentId).map(t=>t.id)};});if(ok){view=id;render();$('#tab-dialog').close();}};
for(const [sel,delta] of [['move-left',-1],['move-right',1]])$('#'+sel).onclick=async()=>{const ok=await commit(d=>{const i=d.tabs.findIndex(t=>t.id===editingTab),j=i+delta;if(j>=0&&j<d.tabs.length)[d.tabs[i],d.tabs[j]]=[d.tabs[j],d.tabs[i]];});if(ok){const i=data.tabs.findIndex(t=>t.id===editingTab);$('#move-left').disabled=i===0;$('#move-right').disabled=i===data.tabs.length-1;}};
async function deleteTab(id){const t=data.tabs.find(t=>t.id===id),count=data.tasks.filter(t=>t.tabId===id).length;if(await confirmDelete('Delete this tab?',`“${t.name}” and all its categories and ${count} task(s), including subtasks, will be removed.`)){if(await commit(d=>{d.tabs=d.tabs.filter(t=>t.id!==id);d.categories=d.categories.filter(c=>c.tabId!==id);d.tasks=d.tasks.filter(t=>t.tabId!==id);})){view='overview';render();$('#tab-dialog').close();}}}
$('#delete-tab').onclick=()=>deleteTab(editingTab);
$('#remove-tab').onclick=()=>deleteTab(view);
$('#category-form').onsubmit=async e=>{e.preventDefault();const name=$('#category-name').value.trim();if(!name)return;const ok=await commit(d=>{if(editingCategory)d.categories.find(c=>c.id===editingCategory).name=name;else d.categories.push({id:uid(),tabId:view,name});});if(ok)$('#category-dialog').close();};
$('#delete-category').onclick=async()=>{const id=editingCategory,c=data.categories.find(c=>c.id===id),count=data.tasks.filter(t=>t.categoryId===id).length;if(await confirmDelete('Delete this category?',`“${c.name}” and ${count} task(s), including subtasks, will be removed.`)){if(await commit(d=>{d.categories=d.categories.filter(c=>c.id!==id);d.tasks=d.tasks.filter(t=>t.categoryId!==id);}))$('#category-dialog').close();}};
$('#backup').onclick=()=>{if(!data)return;const blob=new Blob([JSON.stringify({app:'Plannet',exportedAt:new Date().toISOString(),data},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`plannet-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Backup downloaded.');};
const zones=[...new Set(['UTC',selectedZone,...(Intl.supportedValuesOf?Intl.supportedValuesOf('timeZone'):['Asia/Manila','Asia/Tokyo','Europe/London','America/New_York','Australia/Sydney'])])].sort();
$('#zone-options').innerHTML=zones.map(z=>`<option value="${esc(z)}">${esc(z.split('/').pop().replaceAll('_',' '))}</option>`).join('');
function openPreferences(){$('#zone-input').value=selectedZone;$('#user-name').value=displayName;$('#greeting-language').value=greetingLanguage;$('#zone-error').textContent='';$('#zone-dialog').showModal();}
$('#profile-button').onclick=openPreferences;
$('#device-zone').onclick=()=>{$('#zone-input').value=Intl.DateTimeFormat().resolvedOptions().timeZone;$('#zone-error').textContent='';};
$('#zone-form').onsubmit=e=>{e.preventDefault();const raw=$('#zone-input').value.trim();const normalized=raw.toLowerCase().replaceAll(' ','_');const aliases={philippines:'Asia/Manila',japan:'Asia/Tokyo',uk:'Europe/London'};let zone=aliases[normalized]||zones.find(z=>z.toLowerCase()===normalized)||zones.find(z=>z.toLowerCase().split('/').pop()===normalized);if(!zone){try{zone=new Intl.DateTimeFormat('en',{timeZone:raw}).resolvedOptions().timeZone;}catch{}}if(!zone){$('#zone-error').textContent='Choose a time zone from the suggestions, or enter a city such as Manila.';return;}selectedZone=zone;displayName=$('#user-name').value.trim();greetingLanguage=$('#greeting-language').value;try{localStorage.setItem('plannet-timezone',zone);localStorage.setItem('plannet-name',displayName);localStorage.setItem('plannet-language',greetingLanguage);}catch{}lastDay=today();render();$('#zone-dialog').close();notify('Profile preferences saved.');};
let lastDay=today();updateClock();setInterval(()=>{updateClock();if(data&&!saving&&!dragState&&!document.querySelector('dialog[open]')&&(today()!==lastDay||data.tabs.some(t=>t.schedule?.runtime))){lastDay=today();render();}},15000);


function durationLabel(minutes){const h=Math.floor(minutes/60),m=minutes%60;return [h?`${h}h`:'',m?`${m}m`:''].filter(Boolean).join(' ')||'0m';}
function currentPlan(){return data.tabs.find(t=>t.id===view)?.schedule;}
function scheduleRows(plan){let cursor=Number(plan.start.slice(0,2))*60+Number(plan.start.slice(3));let missing=0;const rows=plan.taskIds.map(id=>byId(id)).filter(Boolean).map(task=>{const start=cursor;if(task.hours==null)missing++;else cursor+=Math.round(task.hours*60);return {task,start,end:cursor,unknown:missing>0};});return {rows,finish:cursor,missing,total:rows.reduce((n,r)=>n+Math.round((r.task.hours||0)*60),0)};}
function planTime(minutes){const day=Math.floor(minutes/1440),m=minutes%1440,h=Math.floor(m/60);return `${h%12||12}:${String(m%60).padStart(2,'0')} ${h<12?'AM':'PM'}${day?` (+${day} day${day===1?'':'s'})`:''}`;}
async function changePlan(fn){const tabId=view;await commit(d=>{const tab=d.tabs.find(t=>t.id===tabId);if(tab?.schedule)fn(tab.schedule);});}
function scheduleStamp(minutes,date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Math.floor(minutes/1440));return `${d.toLocaleDateString(undefined,{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'})} · ${planTime(minutes%1440)}`;}
$('#plan-new').onclick=()=>openTask();
function liveStamp(ms){return new Intl.DateTimeFormat(undefined,{timeZone:selectedZone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(ms);}
$('#plan-run').onclick=async()=>{const p=currentPlan();if(!p.runtime&&(!p.taskIds.length||p.taskIds.some(id=>byId(id)?.hours==null)))return notify('Add tasks and set all durations before starting.');await changePlan(p=>PlannetTimer.toggle(p));};
function renderDayPlan(){
 const plan=currentPlan(),schedule=scheduleRows(plan);const live=PlannetTimer.rows(plan,data.tasks);const run=plan.runtime;$('#plan-run').textContent=!run?'Start':run.pausedAt==null?'Pause':'Continue';$('#plan-run-status').textContent=!run?'Ready · Start begins the timeline now':run.pausedAt==null?'Running · unfinished tasks turn overdue after their finish time':'Paused · Continue shifts the timeline by the pause duration';$('#plan-date').disabled=!!run;$('#plan-start').disabled=!!run;const startParts=run?new Intl.DateTimeFormat('en-CA',{timeZone:selectedZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(run.startedAt):null;const part=k=>startParts.find(p=>p.type===k).value;$('#plan-date').value=run?`${part('year')}-${part('month')}-${part('day')}`:plan.date;$('#plan-start').value=run?`${part('hour')}:${part('minute')}`:plan.start;$('#plan-zone').textContent=selectedZone;
 $('#plan-total').textContent=durationLabel(schedule.total);$('#plan-finish').textContent=schedule.missing?'Add missing durations':run&&live.length?liveStamp(live.at(-1).end):scheduleStamp(schedule.finish,plan.date);
 $('#plan-hint').textContent=schedule.missing?`${schedule.missing} task(s) need a duration before the finish estimate is complete.`:'Add or edit tasks anytime; durations and order recalculate the timeline. Pause first if you want to plan without the timer advancing. Calendar deadlines remain independent.';
 const available=data.tasks.filter(t=>!t.done&&!plan.taskIds.includes(t.id));$('#plan-task').innerHTML='<option value="">Choose a task from any tab…</option>'+available.map(t=>`<option value="${esc(t.id)}">${esc(data.tabs.find(x=>x.id===t.tabId)?.name)} / ${esc(t.title)}</option>`).join('');$('#plan-add').disabled=!available.length;
 $('#plan-rows').innerHTML=schedule.rows.length?schedule.rows.map((r,i)=>`<div class="plan-row ${live[i]?.overdue?'schedule-overdue':''}" data-task-id="${esc(r.task.id)}"><button class="drag-handle" data-drag-id="${esc(r.task.id)}" aria-label="Reorder ${esc(r.task.title)}" title="Drag to reorder · use arrow keys when focused"><svg class="small-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="8" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg></button><input type="checkbox" data-plan-action="done" data-id="${esc(r.task.id)}" ${r.task.done?'checked':''} aria-label="Complete ${esc(r.task.title)}"><button class="task-title ${r.task.done?'plan-done':''}" data-plan-action="edit" data-id="${esc(r.task.id)}">${esc(r.task.title)}</button><span>${r.task.hours==null?'Set duration':durationLabel(Math.round(r.task.hours*60))}</span><span class="plan-slot">${r.unknown?'Awaiting duration':live[i]?`${liveStamp(live[i].start)} → ${liveStamp(live[i].end)}`:`${scheduleStamp(r.start,plan.date)} → ${scheduleStamp(r.end,plan.date)}`}${live[i]?.overdue?'<span class="schedule-alert">Overdue</span>':''}</span><div class="plan-buttons"><button data-plan-action="remove" data-id="${esc(r.task.id)}" aria-label="Remove ${esc(r.task.title)} from schedule">×</button></div></div>`).join(''):'<p class="plan-empty">Add a new task to start this schedule, or include an existing task from another tab.</p>';
}
$('#plan-date').onchange=()=>{if(!$('#plan-date').value)return;const date=$('#plan-date').value;changePlan(p=>p.date=date);};
$('#plan-start').onchange=()=>{const start=$('#plan-start').value;if(start)changePlan(p=>p.start=start);};
$('#plan-add').onclick=()=>{const id=$('#plan-task').value;if(id)changePlan(p=>{if(!p.taskIds.includes(id))p.taskIds.push(id);});};
$('#plan-rows').onclick=async e=>{const b=e.target.closest('[data-plan-action]');if(!b)return;const {planAction:action,id}=b.dataset;if(action==='edit')return openTask(id);if(action==='done')return completeTask(id,b.checked);await changePlan(p=>{if(action==='remove')p.taskIds=p.taskIds.filter(x=>x!==id);});};


function reordered(ids,id,target,after=false){const next=ids.filter(x=>x!==id);if(!ids.includes(id)||!next.includes(target))return [...ids];next.splice(next.indexOf(target)+(after?1:0),0,id);return next;}
let dragState=null;
const planRows=$('#plan-rows');
function clearDrag(){document.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(el=>el.classList.remove('dragging','drop-before','drop-after'));dragState=null;}
planRows.addEventListener('pointerdown',e=>{const handle=e.target.closest('[data-drag-id]');if(!handle||e.button!==0||saving)return;dragState={id:handle.dataset.dragId,tabId:view,x:e.clientX,y:e.clientY,active:false,target:null,after:false};handle.setPointerCapture(e.pointerId);});
planRows.addEventListener('pointermove',e=>{if(!dragState)return;if(!dragState.active&&Math.hypot(e.clientX-dragState.x,e.clientY-dragState.y)<5)return;dragState.active=true;e.preventDefault();const rows=[...planRows.querySelectorAll('.plan-row')];rows.forEach(row=>{row.classList.remove('drop-before','drop-after');row.classList.toggle('dragging',row.dataset.taskId===dragState.id);});const candidates=rows.filter(row=>row.dataset.taskId!==dragState.id);const target=candidates.reduce((best,row)=>{const rect=row.getBoundingClientRect(),distance=Math.abs(e.clientY-(rect.top+rect.height/2));return !best||distance<best.distance?{row,rect,distance}:best;},null);if(target){dragState.target=target.row.dataset.taskId;dragState.after=e.clientY>target.rect.top+target.rect.height/2;target.row.classList.add(dragState.after?'drop-after':'drop-before');}if(e.clientY<80)window.scrollBy(0,-12);else if(e.clientY>innerHeight-80)window.scrollBy(0,12);});
planRows.addEventListener('pointerup',async()=>{const move=dragState;clearDrag();if(move?.active&&move.target&&move.tabId===view){await changePlan(p=>p.taskIds=reordered(p.taskIds,move.id,move.target,move.after));notify('Task order saved.');}});
planRows.addEventListener('pointercancel',clearDrag);
planRows.addEventListener('keydown',async e=>{const handle=e.target.closest('[data-drag-id]');if(!handle)return;if(e.key==='Escape'){clearDrag();return;}if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const id=handle.dataset.dragId,ids=currentPlan().taskIds,i=ids.indexOf(id),j=i+(e.key==='ArrowUp'?-1:1);if(j<0||j>=ids.length)return;await changePlan(p=>p.taskIds=reordered(p.taskIds,id,ids[j],j>i));[...planRows.querySelectorAll('[data-drag-id]')].find(h=>h.dataset.dragId===id)?.focus();});


function updateRepeatFields(){const enabled=!!$('#task-repeat').value;$('#repeat-details').hidden=!enabled;$('#task-date').required=enabled;$('#repeat-weekday-label').hidden=!enabled||$('#task-repeat').value!=='week'||$('#repeat-mode').value!=='fixed';if(enabled&&!$('#task-date').value)$('#task-date').value=today();}
function setupRepeatForm(t){const r=t?.repeat;$('#task-repeat').value=r?.unit||'';$('#repeat-interval').value=r?.interval||1;$('#repeat-mode').value=r?.mode||'fixed';$('#repeat-weekday').value=r?.weekday??new Date((t?.deadline||today())+'T12:00:00Z').getUTCDay();$('#repeat-paused').checked=!!r?.paused;$('#repeat-skip').hidden=!r||!!t?.done;$('#repeat-next').hidden=!t?.nextOccurrenceId||!byId(t.nextOccurrenceId);$('#repeat-history-note').hidden=!t?.nextOccurrenceId;updateRepeatFields();}
function readRepeatForm(){if(!$('#task-repeat').value)return null;const old=editingTask?byId(editingTask):null;return PlannetRepeat.validate({...((old?.deadline===$('#task-date').value&&old?.repeat?.unit===$('#task-repeat').value&&old?.repeat?.anchorDate)?{anchorDate:old.repeat.anchorDate}:{}),unit:$('#task-repeat').value,interval:Number($('#repeat-interval').value),mode:$('#repeat-mode').value,weekday:Number($('#repeat-weekday').value),paused:$('#repeat-paused').checked});}
for(const id of ['task-repeat','repeat-mode'])$('#'+id).onchange=updateRepeatFields;
async function completeTask(id,value,skip=false){let next;const ok=await commit(d=>next=PlannetRepeat.finish(d,id,value,today(),uid,skip));if(ok&&next)notify(`${skip?'Skipped':'Completed'}. Next occurrence: ${next.deadline}.`);return ok;}
$('#repeat-skip').onclick=async()=>{if(editingTask&&await completeTask(editingTask,true,true))$('#task-dialog').close();};
$('#repeat-next').onclick=()=>{const next=byId(editingTask)?.nextOccurrenceId;if(next&&byId(next)){ $('#task-dialog').close();openTask(next);}};
let theme='light';try{theme=localStorage.getItem('plannet-theme')||'light';}catch{}
function applyTheme(value){theme=['light','dark','sage'].includes(value)?value:'light';document.documentElement.dataset.theme=theme;const names={light:'Light',dark:'Dark',sage:'Sage'};$('#theme-toggle').textContent={light:'☀',dark:'☾',sage:'❧'}[theme];$('#theme-toggle').title=`Theme: ${names[theme]}. Switch theme`;$('#theme-toggle').setAttribute('aria-label',`Theme: ${names[theme]}. Switch theme`);document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===theme)));try{localStorage.setItem('plannet-theme',theme);}catch{}}
$('#theme-toggle').onclick=()=>applyTheme(['light','dark','sage'][(['light','dark','sage'].indexOf(theme)+1)%3]);
document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>applyTheme(b.dataset.themeChoice));applyTheme(theme);
window.addEventListener('plannet-profile-updated',e=>{displayName=e.detail.name;$('#user-name').value=displayName;updateClock();});

load().catch(e=>{$('#save-state').textContent='Not connected';$('#task-list').innerHTML='<div class="empty"><h3>Could not open your planner.</h3><p>Make sure the Plannet server is running, then refresh this page.</p></div>';notify(e.message);});
