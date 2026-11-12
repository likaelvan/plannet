const CACHE='plannet-shell-__CACHE_VERSION__';
const ASSETS=__ASSETS__;
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
// A new worker waits for old app windows to close: no mid-edit reloads.
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('plannet-shell-')&&key!==CACHE).map(key=>caches.delete(key)))));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 // Never cache authentication, API responses, or planner/profile data.
 if(event.request.mode==='navigate'){event.respondWith(caches.match('/index.html').then(cached=>cached||fetch(event.request)));return;}
 if(!ASSETS.includes(url.pathname))return;
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(event.request)));
});
