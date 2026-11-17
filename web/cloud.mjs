import {createClient} from '@supabase/supabase-js';
import {watchLogin,magicLinkOptions,startGoogleLogin} from './login.mjs';
import {openCache,PlannerStore,ConflictError,LocalConflictError,migratePlanner} from './store.mjs';
const config=__PUBLIC_CONFIG__, $=s=>document.querySelector(s);
let client,session,profile,store,cache,signup=true,email='',started=false,transitioning=false,mode='saved',imported=null;
const configured=Boolean(config.url&&config.key);
const project=config.url?new URL(config.url).hostname:'unconfigured';
function message(text){$('#account-message').textContent=text;}
function download(data,name='plannet-backup'){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify({app:'Plannet',exportedAt:new Date().toISOString(),data},null,2)],{type:'application/json'}));a.href=url;a.download=`${name}-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function syncMessage(state){mode=state;const labels={saved:'Synced to your account',pending:'Saved on this device · sync pending',offline:'Saved on this device · cloud unavailable',syncing:'Syncing…',conflict:'Sync conflict · local copy preserved'};$('#cloud-status').textContent=labels[state]||state;$('#resolve-conflict').hidden=state!=='conflict';if(started)$('#save-state').textContent=labels[state]||state;}
function setBusy(form,busy){form.querySelectorAll('button,input').forEach(el=>el.disabled=busy);}
async function action(form,fn,target='#account-message'){setBusy(form,true);$(target).textContent='';try{await fn();}catch(e){$(target).textContent=e.message||'Something went wrong. Please retry.';}finally{setBusy(form,false);}}
function profileValues(prefix){return {name:$(`#${prefix}-name`).value.trim(),username:$(`#${prefix}-username`).value.trim().toLowerCase(),birthdate:$(`#${prefix}-birthdate`).value||null};}
async function saveProfile(values){const query=profile?client.from('profiles').update(values).eq('id',session.user.id):client.from('profiles').insert({id:session.user.id,...values});const {data,error}=await query.select().single();if(error)throw Error(error.code==='23505'?'That username is already taken. Choose another.':error.message);profile=data;return data;}
async function signOut(){transitioning=true;try{await client.auth.signOut({scope:'local'});}finally{location.reload();}}
async function ensureSession(){const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session||data.session.user.id!==session.user.id)throw Error('Please sign in again before syncing.');}
async function remoteLoad(){await ensureSession();const {data,error}=await client.rpc('load_planner');if(error)throw error;return data;}
async function remoteSave(data,revision){await ensureSession();const result=await client.rpc('save_planner',{expected_revision:revision,new_body:data});if(result.error){if(result.error.message.includes('REVISION_CONFLICT'))throw new ConflictError();throw result.error;}return result.data;}
async function sync(){if(!store)return;try{const result=await store.sync();if(result?.dirty&&!result.conflict&&navigator.onLine)setTimeout(sync,1000);}catch(e){if(!(e instanceof ConflictError))console.info('Cloud sync unavailable; draft retained.');}}
async function startPlanner(){
 if(started)return;const owner=session.user.id;
 store=new PlannerStore({cache,owner,remote:{load:remoteLoad,save:remoteSave},changed:syncMessage});
 await store.load();started=true;
 window.PlannetPreferences={getItem:key=>localStorage.getItem(`plannet:${project}:${owner}:${key}`),setItem:(key,value)=>localStorage.setItem(`plannet:${project}:${owner}:${key}`,value)};
 window.PlannetPreferences.setItem('plannet-name',profile.name);
 window.CloudStore={statusText:()=>({saved:'● Synced',pending:'Saved locally · pending sync',offline:'Saved locally · offline',conflict:'Sync conflict',syncing:'Syncing…'}[mode]),request:async(_url,options)=>{
  try{let item;if(options?.method==='POST'){const payload=JSON.parse(options.body);item=await store.save(payload.data,payload.revision);queueMicrotask(sync);}else item=await store.load();return new Response(JSON.stringify({revision:item.version,data:item.data}),{status:200,headers:{'Content-Type':'application/json'}});}catch(e){return new Response(JSON.stringify({error:e.message}),{status:e instanceof LocalConflictError?409:503});}
 }};
 $('#cloud-profile-entry').hidden=false;$('#user-name').readOnly=true;$('#user-name').title='Change your name in Account details';$('#account-gate').hidden=true;document.body.classList.add('signed-in');$('#account-label').textContent=`@${profile.username}`;
 const script=document.createElement('script');script.src='/planner.js';document.body.append(script);await sync();
}
async function authenticated(next){
 session=next;cache=await openCache(`plannet-${project}`);
 const {data,error}=await client.from('profiles').select('id,name,username,birthdate').eq('id',session.user.id).maybeSingle();
 if(error){const cachedProfile=await cache.read(`profile:${session.user.id}`);if(!cachedProfile)throw error;profile=cachedProfile;}else profile=data;
 $('#google-login').hidden=true;$('#email-form').hidden=true;$('#link-sent').hidden=true;
 if(!profile){$('#onboarding-form').hidden=false;$('#account-heading').textContent='Make this space yours';$('#onboarding-name').value=session.user.user_metadata?.full_name||'';message('Signed in. Choose your name and username.');return;}
 await cache.update(`profile:${session.user.id}`,()=>profile);$('#onboarding-form').hidden=true;await startPlanner();
}
$('#choose-signup').onclick=()=>{signup=true;$('#choose-signup').setAttribute('aria-pressed','true');$('#choose-login').setAttribute('aria-pressed','false');};
$('#choose-login').onclick=()=>{signup=false;$('#choose-signup').setAttribute('aria-pressed','false');$('#choose-login').setAttribute('aria-pressed','true');};
$('#google-signin').onclick=()=>{if(!configured)return message('Connect Supabase first; see the setup guide.');action($('#google-login'),async()=>{message('Opening Google sign-in…');await startGoogleLogin(client,location.origin);});};
$('#email-form').onsubmit=e=>{e.preventDefault();if(!configured)return message('Connect Supabase first; see the setup guide.');action(e.target,async()=>{email=$('#login-email').value.trim();const {error}=await client.auth.signInWithOtp(magicLinkOptions(email,signup,location.origin));if(error)throw error;$('#email-form').hidden=true;$('#link-sent').hidden=false;$('#sent-email').textContent=email;message('Open the newest sign-in link in your email. It will bring you back to Plannet.');});};
$('#change-email').onclick=()=>{$('#email-form').hidden=false;$('#link-sent').hidden=true;message('Enter your email to request a fresh link. You may need to wait before sending again.');};
$('#onboarding-form').onsubmit=e=>{e.preventDefault();action(e.target,async()=>{await saveProfile(profileValues('onboarding'));await cache.update(`profile:${session.user.id}`,()=>profile);await startPlanner();});};
$('#onboarding-signout').onclick=signOut;$('#signout').onclick=signOut;
document.querySelectorAll('[data-cloud-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#privacy-open').onclick=()=>$('#privacy-dialog').showModal();
$('#sync-now').onclick=async()=>{await sync();if(mode==='saved')window.dispatchEvent(new Event('plannet-refresh'));};
$('#account-settings').onclick=()=>{$('#zone-dialog').close();$('#account-email').textContent=session.user.email;$('#cloud-name').value=profile.name;$('#cloud-username').value=profile.username;$('#cloud-birthdate').value=profile.birthdate||'';$('#cloud-account-dialog').showModal();};
$('#cloud-profile-form').onsubmit=e=>{e.preventDefault();action(e.target,async()=>{await saveProfile(profileValues('cloud'));await cache.update(`profile:${session.user.id}`,()=>profile);window.PlannetPreferences.setItem('plannet-name',profile.name);window.dispatchEvent(new CustomEvent('plannet-profile-updated',{detail:{name:profile.name}}));$('#profile-message').textContent='Profile saved.';$('#account-label').textContent=`@${profile.username}`;},'#profile-message');};
$('#history-open').onclick=async()=>{const host=$('#cloud-history');host.textContent='Loading…';const {data,error}=await client.from('planner_history').select('revision,saved_at').order('revision',{ascending:false}).limit(10);host.textContent=error?error.message:data.length?'':'No previous saves yet.';if(error)return;for(const row of data){const button=document.createElement('button');button.className='history-item';button.textContent=`Revision ${row.revision} · ${new Date(row.saved_at).toLocaleString()}`;button.onclick=async()=>{const result=await client.from('planner_history').select('body').eq('revision',row.revision).single();if(result.error){host.textContent=result.error.message;return;}download(result.data.body,`plannet-revision-${row.revision}`);};host.append(button);}};
$('#delete-account').onclick=async()=>{if($('#delete-account-confirm').value!=='DELETE')return;$('#delete-account').disabled=true;try{const {error}=await client.rpc('delete_my_account');if(error)throw error;await cache.update(session.user.id,()=>null);await cache.update(`profile:${session.user.id}`,()=>null);await signOut();}catch(e){$('#profile-message').textContent=e.message;$('#delete-account').disabled=false;}};
$('#resolve-conflict').onclick=()=>{$('#conflict-confirm').checked=false;$('#conflict-dialog').showModal();};
$('#conflict-export').onclick=async()=>download((await store.read()).data,'plannet-local-draft');
$('#conflict-use-cloud').onclick=async()=>{if(!$('#conflict-confirm').checked){$('#conflict-message').textContent='Download your local copy and confirm before replacing it.';return;}try{const local=await store.read();await store.useCloud(local.version);location.reload();}catch(e){$('#conflict-message').textContent=e.message;}};
$('#import-open').onclick=()=>{imported=null;$('#import-file').value='';$('#import-confirm').checked=false;$('#import-summary').textContent='';$('#import-dialog').showModal();};
$('#import-file').onchange=async()=>{imported=null;try{const file=$('#import-file').files[0];if(!file)return;if(file.size>1500000)throw Error('Backup exceeds the import size limit.');imported=migratePlanner(JSON.parse(await file.text()).data);$('#import-summary').textContent=`${imported.tabs.length} tabs · ${imported.tasks.length} tasks`;$('#import-message').textContent='';}catch(e){$('#import-message').textContent=e.message;}};
$('#import-apply').onclick=async()=>{if(!imported||!$('#import-confirm').checked){$('#import-message').textContent='Choose a valid backup and confirm replacement.';return;}try{const old=await store.read();if(old.conflict)throw new ConflictError();await store.save(imported,old.version);await sync();location.reload();}catch(e){$('#import-message').textContent=e.message;}};
let installPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install-app').hidden=false;});$('#install-app').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#install-app').hidden=true;}};
window.addEventListener('online',sync);setInterval(()=>{if(navigator.onLine)sync();},30000);
document.querySelectorAll('#onboarding-birthdate,#cloud-birthdate').forEach(el=>el.max=new Date().toISOString().slice(0,10));
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
if(!configured){$('#configuration-note').hidden=false;$('#send-link').disabled=true;$('#google-signin').disabled=true;}
else {
 client=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});
 const callbackFailed=new URLSearchParams(location.hash.slice(1)).has('error')||new URLSearchParams(location.search).has('error');
 await watchLogin(client,async next=>{
  if(transitioning)return;
  if(session&&next?.user?.id!==session.user.id){transitioning=true;document.body.classList.remove('signed-in');location.reload();return;}
  if(next)await authenticated(next);
 },()=>message('Could not finish signing in. Try Google again or request a fresh email link while connected to the internet.'));
 // The SDK consumes valid callback tokens; remove any remaining auth fragment from the address bar.
 if(/(?:access_token|refresh_token|error)=/.test(location.hash))history.replaceState(null,'',location.pathname+location.search);
 if(callbackFailed&&!session)message('Sign-in was cancelled or could not be completed. Try Google again or request a new email link.');
}
