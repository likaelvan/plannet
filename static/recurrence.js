/* Shared by the desktop and web builds. Calendar math uses UTC date-only values. */
globalThis.PlannetRepeat=(()=>{
 const dayMs=86400000;
 function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Choose a valid first due date.');const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==value)throw Error('Choose a valid first due date.');return d;}
 const iso=d=>d.toISOString().slice(0,10);
 function validate(rule){if(!rule||!['day','week','month','year'].includes(rule.unit)||!['fixed','after'].includes(rule.mode)||!Number.isInteger(rule.interval)||rule.interval<1||rule.interval>365||typeof rule.paused!=='boolean'||!Number.isInteger(rule.weekday)||rule.weekday<0||rule.weekday>6)throw Error('Invalid repeat settings.');return rule;}
 function align(value,rule){validate(rule);const d=date(value);if(rule.unit==='week'&&rule.mode==='fixed')d.setUTCDate(d.getUTCDate()+(rule.weekday-d.getUTCDay()+7)%7);return iso(d);}
 function nextDate(deadline,rule,completed){validate(rule);if(['month','year'].includes(rule.unit)){
 const base=date(rule.mode==='after'?completed:deadline),anchor=date(rule.mode==='after'?completed:(rule.anchorDate||deadline)),now=date(completed);
 const step=rule.interval*(rule.unit==='year'?12:1);let count=1,next;
 do{next=new Date(base);next.setUTCDate(1);next.setUTCMonth(base.getUTCMonth()+step*count++);const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();next.setUTCDate(Math.min(anchor.getUTCDate(),last));}while(rule.mode==='fixed'&&next<=now);
 return iso(next);
 }const step=rule.interval*(rule.unit==='week'?7:1);const base=date(rule.mode==='after'?completed:deadline),now=date(completed);let next=base.valueOf()+step*dayMs;if(rule.mode==='fixed'&&next<=now.valueOf())next+= (Math.floor((now.valueOf()-next)/(step*dayMs))+1)*step*dayMs;return iso(new Date(next));}
 function finish(data,id,done,completed,newId,skip=false){
  const task=data.tasks.find(t=>t.id===id);if(!task)throw Error('Task no longer exists.');const wasDone=task.done;task.done=done;
  if(!done){delete task.completedOn;delete task.skipped;return null;}
  task.completedOn=completed;if(skip)task.skipped=true;
  if(wasDone||!task.repeat||task.repeat.paused||task.nextOccurrenceId)return null;
  if(['month','year'].includes(task.repeat.unit)&&!task.repeat.anchorDate)task.repeat.anchorDate=task.deadline;
  const next={...structuredClone(task),id:newId(),done:false,progress:'Not started',deadline:nextDate(task.deadline,task.repeat,completed),seriesId:task.seriesId||task.id};
  delete next.nextOccurrenceId;delete next.completedOn;delete next.skipped;
  task.seriesId=next.seriesId;task.nextOccurrenceId=next.id;data.tasks.push(next);
  // New occurrences belong to the task's tab, but don't extend a dated timed schedule automatically.
  return next;
 }
 function label(task){const r=task.repeat;if(!r)return '';const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const text=r.interval===1?{day:'Daily',week:'Weekly',month:'Monthly',year:'Yearly'}[r.unit]:`Every ${r.interval} ${r.unit}s`;return `${task.skipped?'Skipped · ':''}${text}${r.unit==='week'&&r.mode==='fixed'?` · ${days[r.weekday]}`:''}${r.mode==='after'?' after completion':''}${r.paused?' · Paused':''}`;}
 return {validate,align,nextDate,finish,label};
})();

globalThis.PlannetTimer={
 rows(plan,tasks,now=Date.now()){
  const run=plan.runtime;if(!run)return [];
  let cursor=run.startedAt+run.delayMs,unknown=false;
  return plan.taskIds.map(id=>tasks.find(t=>t.id===id)).filter(Boolean).map(task=>{
   const start=cursor;if(task.hours==null)unknown=true;else cursor+=Math.round(task.hours*3600000);
   return {task,start,end:cursor,unknown,overdue:!task.done&&!unknown&&(run.pausedAt??now)>cursor};
  });
 },
 toggle(plan,now=Date.now()){
  if(!plan.runtime){plan.runtime={startedAt:now,delayMs:0,pausedAt:null};return;}
  const run=plan.runtime;if(run.pausedAt==null)run.pausedAt=now;
  else {run.delayMs+=Math.max(0,now-run.pausedAt);run.pausedAt=null;}
 }
};
