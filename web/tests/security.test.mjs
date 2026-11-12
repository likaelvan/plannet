import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const alice='00000000-0000-0000-0000-000000000001',bob='00000000-0000-0000-0000-000000000002';
test('database enforces account isolation, revision checks, recovery and deletion',async t=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values ('${alice}'),('${bob}');`);
 await db.exec(await fs.readFile(new URL('../../supabase/migrations/202611120001_profiles.sql',import.meta.url),'utf8'));
 await db.exec(await fs.readFile(new URL('../../supabase/migrations/202611120002_repeating_tasks.sql',import.meta.url),'utf8'));
 await db.exec(await fs.readFile(new URL('../../supabase/migrations/202611120003_calendar_repeats.sql',import.meta.url),'utf8'));
 const as=async(id)=>{await db.exec('reset role;set role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
 await as(alice);await db.query('insert into public.profiles(id,name,username) values($1,$2,$3)',[alice,'Alice','alice']);
 let row=(await db.query('select public.load_planner() as plan')).rows[0].plan;
 const original=structuredClone(row.data);row.data.tabs[0].name='Alice only';
 await db.query('select public.save_planner($1,$2)',[row.revision,JSON.stringify(row.data)]);
 await t.test('stale writes are rejected, prior revision retained',async()=>{await assert.rejects(db.query('select public.save_planner($1,$2)',[0,JSON.stringify(original)]),/REVISION_CONFLICT/);assert.equal((await db.query('select body from public.planner_history')).rows[0].body.tabs[0].name,'Personal');});
 await as(bob);await db.query('insert into public.profiles(id,name,username) values($1,$2,$3)',[bob,'Bob','bob']);await db.query('select public.load_planner()');
 await t.test('another account cannot read, update or spoof ownership',async()=>{assert.equal((await db.query('select * from public.planners where owner_id=$1',[alice])).rows.length,0);assert.equal((await db.query('select * from public.profiles where id=$1',[alice])).rows.length,0);assert.equal((await db.query('select * from public.planner_history')).rows.length,0);await assert.rejects(db.query('update public.planners set body=$1 where owner_id=$2',[JSON.stringify(original),alice]),/permission denied/);await assert.rejects(db.query('insert into public.profiles(id,name,username) values($1,$2,$3)',[alice,'Imposter','imposter']),/row-level security/);await assert.rejects(db.query('update public.profiles set username=$1 where id=$2',['alice',bob]),/unique/);});
 await t.test('malformed payloads do not replace saved data',async()=>{const bad=structuredClone(original);bad.tasks=[{id:'broken',title:'x'}];await assert.rejects(db.query('select public.save_planner($1,$2)',[0,JSON.stringify(bad)]));assert.equal((await db.query('select public.load_planner() as plan')).rows[0].plan.revision,0);});
 await t.test('repeat rules are validated without changing a saved revision',async()=>{
 const doc=structuredClone(original);doc.tasks=[{id:'repeat',title:'Laundry',tabId:'personal',categoryId:'general',parentId:null,deadline:'2026-11-16',hours:1,progress:'Not started',done:false,notes:'',repeat:{unit:'week',mode:'fixed',interval:2,weekday:1,paused:false}}];
 for(const value of [0,1.5,'2',null]){doc.tasks[0].repeat.interval=value;await assert.rejects(db.query('select public.save_planner($1,$2)',[0,JSON.stringify(doc)]));}
 doc.tasks[0].repeat.interval=2;await db.query('select public.save_planner($1,$2)',[0,JSON.stringify(doc)]);
 assert.equal((await db.query('select public.load_planner() as plan')).rows[0].plan.data.tasks[0].repeat.interval,2);
 });
 await db.exec('reset role;set role anon;');await db.query("select set_config('request.jwt.claim.sub','',false)");
 await t.test('anonymous callers cannot read data or invoke account functions',async()=>{await assert.rejects(db.query('select * from public.profiles'),/permission denied/);await assert.rejects(db.query('select public.load_planner()'),/permission denied/);await assert.rejects(db.query('select public.delete_my_account()'),/permission denied/);});
 await as(alice);await t.test('history is bounded to ten revisions',async()=>{for(let i=1;i<13;i++)await db.query('select public.save_planner($1,$2)',[i,JSON.stringify(original)]);assert.equal((await db.query('select count(*) as n from public.planner_history')).rows[0].n,10);});
 await as(bob);await db.query('select public.delete_my_account()');await db.exec('reset role;');
 await t.test('account deletion cascades only to its own data',async()=>{assert.equal((await db.query('select * from public.planners where owner_id=$1',[bob])).rows.length,0);assert.equal((await db.query('select * from public.planners where owner_id=$1',[alice])).rows.length,1);assert.equal((await db.query('select * from auth.users where id=$1',[bob])).rows.length,0);});
 await db.close();
});
