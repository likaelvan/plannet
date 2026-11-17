export function magicLinkOptions(email,signup,origin){return {email,options:{shouldCreateUser:signup,emailRedirectTo:new URL('/',origin).href}};}

// Auth callbacks must not await Supabase calls while its session lock is held.
// Defer them, serialize profile startup, and ignore repeated token-refresh events.
export async function watchLogin(client,onSession,onError){
 let lastId,queue=Promise.resolve();
 const deliver=next=>{queue=queue.then(async()=>{const id=next?.user?.id||null;if(id===lastId)return;try{await onSession(next);lastId=id;}catch{onError();}});return queue;};
 client.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>deliver(next),0);});
 try{const result=await client.auth.getSession();if(result.error)throw result.error;await deliver(result.data.session);}catch{onError();}
}

export function googleLoginOptions(origin){
 const url=new URL(origin);
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Google sign-in requires HTTPS.');
 return {provider:'google',options:{redirectTo:new URL('/',url.origin).href,queryParams:{prompt:'select_account'}}};
}
export async function startGoogleLogin(client,origin){
 const {error}=await client.auth.signInWithOAuth(googleLoginOptions(origin));
 if(error)throw error;
}
