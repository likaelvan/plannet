import test from 'node:test';
import assert from 'node:assert/strict';
import '../../static/recurrence.js';
const R=globalThis.PlannetRepeat;
const daily={unit:'day',mode:'fixed',interval:1,weekday:1,paused:false};
test('calendar repeats cross leap days and skip missed dates without backlog',()=>{
 assert.equal(R.nextDate('2024-02-28',daily,'2024-02-28'),'2024-02-29');
 assert.equal(R.nextDate('2024-02-29',daily,'2024-02-29'),'2024-03-01');
 assert.equal(R.nextDate('2026-11-01',daily,'2026-11-12'),'2026-11-13');
 const fortnight={...daily,unit:'week',interval:2};
 assert.equal(R.align('2026-11-12',fortnight),'2026-11-16');
 assert.equal(R.nextDate('2026-11-02',fortnight,'2026-11-19'),'2026-11-30');
 assert.equal(R.nextDate('2026-11-02',{...fortnight,mode:'after'},'2026-11-19'),'2026-12-03');
 assert.throws(()=>R.align('2026-02-30',daily));
});
test('completion preserves history, prevents duplicate successors, leaves schedules and subtasks alone',()=>{
 const task={id:'a',title:'Laundry',deadline:'2026-11-12',repeat:daily,done:false,progress:'In progress'};
 const data={tasks:[task,{id:'child',parentId:'a',done:false}],tabs:[{schedule:{taskIds:['a']}}]};
 const next=R.finish(data,'a',true,'2026-11-12',()=> 'b');
 assert.equal(next.deadline,'2026-11-13');assert.equal(next.done,false);
 assert.equal(task.completedOn,'2026-11-12');assert.equal(task.nextOccurrenceId,'b');
 assert.equal(R.finish(data,'a',true,'2026-11-12',()=> 'c'),null);
 R.finish(data,'a',false,'2026-11-12',()=> 'c');R.finish(data,'a',true,'2026-11-12',()=> 'c');
 assert.equal(data.tasks.length,3);assert.deepEqual(data.tabs[0].schedule.taskIds,['a']);assert.equal(data.tasks[1].done,false);
 R.finish(data,'b',true,'2026-11-13',()=> 'c',true);assert.equal(next.skipped,true);assert.equal(data.tasks.at(-1).skipped,undefined);
});
test('paused tasks finish without generating a successor',()=>{
 const data={tasks:[{id:'a',deadline:'2026-11-12',repeat:{...daily,paused:true},done:false}]};
 assert.equal(R.finish(data,'a',true,'2026-11-12',()=> 'b'),null);assert.equal(data.tasks.length,1);
});

test('monthly and yearly repeats retain calendar anchors through short months',()=>{
 const month={...daily,unit:'month',anchorDate:'2026-01-31'};
 assert.equal(R.nextDate('2026-01-31',month,'2026-01-31'),'2026-02-28');
 assert.equal(R.nextDate('2026-02-28',month,'2026-02-28'),'2026-03-31');
 assert.equal(R.nextDate('2026-01-31',month,'2026-04-15'),'2026-04-30');
 const year={...daily,unit:'year',anchorDate:'2024-02-29'};
 assert.equal(R.nextDate('2024-02-29',year,'2024-02-29'),'2025-02-28');
 assert.equal(R.nextDate('2027-02-28',year,'2027-02-28'),'2028-02-29');
 assert.equal(R.nextDate('2026-01-31',{...month,mode:'after'},'2026-02-10'),'2026-03-10');
});
test('timer persists start, freezes while paused, resumes without counting pause, and detects overdue',()=>{
 const T=globalThis.PlannetTimer,p={taskIds:['a','b']},tasks=[{id:'a',hours:1,done:false},{id:'b',hours:0.5,done:false}];
 assert.deepEqual(T.rows(p,tasks,0),[]);T.toggle(p,1000);
 assert.equal(T.rows(p,tasks,3601001)[0].overdue,true);tasks[0].done=true;
 assert.equal(T.rows(p,tasks,3601001)[0].overdue,false);
 T.toggle(p,4000000);assert.equal(T.rows(p,tasks,9000000)[1].overdue,false);
 const reload=JSON.parse(JSON.stringify(p));T.toggle(reload,9000000);
 assert.equal(reload.runtime.delayMs,5000000);assert.equal(T.rows(reload,tasks,10000000)[1].overdue,false);
 assert.equal(T.rows(reload,tasks,11000000)[1].overdue,true);
 tasks.push({id:'c',hours:null,done:false});reload.taskIds.push('c');assert.equal(T.rows(reload,tasks,99999999)[2].overdue,false);
});
