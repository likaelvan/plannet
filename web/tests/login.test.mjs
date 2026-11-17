import test from 'node:test';import assert from 'node:assert/strict';import {watchLogin,magicLinkOptions} from '../login.mjs';
test('email link returns to exact current origin with explicit signup mode',()=>{assert.deepEqual(magicLinkOptions('sample@example.com',false,'http://127.0.0.1:4173'),{email:'sample@example.com',options:{shouldCreateUser:false,emailRedirectTo:'http://127.0.0.1:4173/'}});assert.equal(magicLinkOptions('sample@example.com',true,'https://plannet.example').options.shouldCreateUser,true);});
test('callback session opens profile once despite initial and refresh events',async()=>{const user={user:{id:'alice'}};let callback;const seen=[];const client={auth:{onAuthStateChange:fn=>{callback=fn;},getSession:async()=>{callback('SIGNED_IN',user);return {data:{session:user},error:null};}}};await watchLogin(client,async s=>seen.push(s.user.id),()=>assert.fail());callback('TOKEN_REFRESHED',user);await new Promise(r=>setTimeout(r,20));assert.deepEqual(seen,['alice']);});
test('original waiting tab handles login from another tab and signout',async()=>{let callback;const seen=[];const client={auth:{onAuthStateChange:fn=>callback=fn,getSession:async()=>({data:{session:null},error:null})}};await watchLogin(client,async s=>seen.push(s?.user?.id||null),()=>assert.fail());callback('SIGNED_IN',{user:{id:'alice'}});callback('SIGNED_OUT',null);await new Promise(r=>setTimeout(r,20));assert.deepEqual(seen,[null,'alice',null]);});
test('failed session lookup gives a retry error without opening a profile',async()=>{let failures=0;await watchLogin({auth:{onAuthStateChange:()=>{},getSession:async()=>({error:Error('invalid link')})}},()=>assert.fail(),()=>failures++);assert.equal(failures,1);});

test('Google login returns to this app origin and propagates provider errors',async()=>{
 const {googleLoginOptions,startGoogleLogin}=await import('../login.mjs');
 const options=googleLoginOptions('https://plannet-test.pages.dev');
 assert.equal(options.provider,'google');assert.equal(options.options.redirectTo,'https://plannet-test.pages.dev/');
 assert.equal(options.options.queryParams.prompt,'select_account');
 assert.equal(googleLoginOptions('http://127.0.0.1:4173').options.redirectTo,'http://127.0.0.1:4173/');
 assert.throws(()=>googleLoginOptions('http://example.com'));
 let received;await startGoogleLogin({auth:{signInWithOAuth:async args=>{received=args;return {error:null};}}},'https://plannet-test.pages.dev');assert.deepEqual(received,options);
 await assert.rejects(startGoogleLogin({auth:{signInWithOAuth:async()=>({error:new Error('Provider disabled')})}},'https://plannet-test.pages.dev'),/Provider disabled/);
});

test('PKCE client sends a code challenge instead of requesting tokens in the redirect',async()=>{
 const {createClient}=await import('@supabase/supabase-js');
 const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const client=createClient('https://example.supabase.co','test-public-key',{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:false,storage}});
 const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:'https://plannet.pages.dev/',skipBrowserRedirect:true}});
 assert.equal(error,null);const url=new URL(data.url);assert.ok(url.searchParams.get('code_challenge'));assert.equal(url.searchParams.get('code_challenge_method'),'s256');assert.equal(url.searchParams.get('redirect_to'),'https://plannet.pages.dev/');assert.ok([...values.keys()].some(k=>k.endsWith('-code-verifier')));
});
