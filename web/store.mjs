// Account-scoped local drafts. Never replace a dirty draft with a cloud response.
export class ConflictError extends Error { constructor(message='Another device has newer changes. Your local copy is preserved.') {super(message);this.name='ConflictError';} }
export class LocalConflictError extends Error { constructor(){super('This planner changed in another browser tab. Reload and retry.');this.name='LocalConflictError';} }
export function emptyPlanner(){
 const names=['Personal','Work','Learning','Content'];
 return {tabs:names.map((name,i)=>({id:`tab-${i}`,name,color:['#db754b','#6689b2','#9583bc','#629b84'][i]})),categories:names.map((_,i)=>({id:`category-${i}`,tabId:`tab-${i}`,name:'General'})),tasks:[],dayPlans:[]};
}
export function validatePlanner(data){
 if(!data||!Array.isArray(data.tabs)||!Array.isArray(data.categories)||!Array.isArray(data.tasks))throw Error('Invalid planner backup.');
 if(JSON.stringify(data).length>1000000)throw Error('Planner is too large (1 MB limit).');
 const ids=items=>{const set=new Set();for(const t of items){if(!t||typeof t.id!=='string'||!t.id||set.has(t.id))throw Error('Duplicate or invalid IDs.');set.add(t.id);}return set;};
 const tabs=ids(data.tabs),cats=ids(data.categories),tasks=ids(data.tasks);
 for(const t of data.tabs)if(typeof t.name!=='string'||!t.name.trim()||!/^#[0-9a-f]{6}$/i.test(t.color))throw Error('Invalid tab.');
 for(const c of data.categories)if(!tabs.has(c.tabId)||typeof c.name!=='string')throw Error('Invalid category.');
 const taskMap=new Map(data.tasks.map(t=>[t.id,t]));
 for(const t of data.tasks){
  if(!tabs.has(t.tabId)||!cats.has(t.categoryId)||data.categories.find(c=>c.id===t.categoryId).tabId!==t.tabId||typeof t.title!=='string'||!t.title.trim()||typeof t.notes!=='string'||typeof t.done!=='boolean'||!['Not started','In progress','Waiting','On hold'].includes(t.progress)||!(t.hours===null||(typeof t.hours==='number'&&Number.isFinite(t.hours)&&t.hours>=0&&t.hours<=100000)))throw Error('Invalid task.');
  if(typeof t.deadline!=='string'||(t.deadline&&(!/^\d{4}-\d{2}-\d{2}$/.test(t.deadline)||Number.isNaN(Date.parse(t.deadline)))))throw Error('Invalid deadline.');
  const r=t.repeat;if(r!=null&&(!r||!['day','week','month','year'].includes(r.unit)||!['fixed','after'].includes(r.mode)||!Number.isInteger(r.interval)||r.interval<1||r.interval>365||!Number.isInteger(r.weekday)||r.weekday<0||r.weekday>6||typeof r.paused!=='boolean'||!t.deadline))throw Error('Invalid repeat settings.');
  let parent=t.parentId;const visited=new Set([t.id]);while(parent){const p=taskMap.get(parent);if(!p||visited.has(parent)||visited.size>50||p.tabId!==t.tabId||p.categoryId!==t.categoryId)throw Error('Invalid subtask relationship.');visited.add(parent);parent=p.parentId;}
 }
 for(const p of [...(data.dayPlans||[]),...data.tabs.map(t=>t.schedule).filter(Boolean)])if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||Number.isNaN(Date.parse(p.date))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start)||!Array.isArray(p.taskIds)||new Set(p.taskIds).size!==p.taskIds.length||p.taskIds.some(id=>!tasks.has(id)))throw Error('Invalid schedule.');
 for(const tab of data.tabs){const r=tab.schedule?.runtime;if(r!=null&&(!r||['startedAt','delayMs'].some(k=>typeof r[k]!=='number'||!Number.isFinite(r[k])||r[k]<0||r[k]>8640000000000000)||(r.pausedAt!=null&&(typeof r.pausedAt!=='number'||!Number.isFinite(r.pausedAt)||r.pausedAt<0||r.pausedAt>8640000000000000))))throw Error('Invalid timer state.');}
 return data;
}
export function migratePlanner(data){
 validatePlanner(data);const next=structuredClone(data);
 for(const plan of next.dayPlans||[]){const id=crypto.randomUUID();next.tabs.push({id,name:`Schedule · ${plan.date}`,color:'#7560c9',timed:true,schedule:{date:plan.date,start:plan.start,taskIds:[...plan.taskIds]}});next.categories.push({id:crypto.randomUUID(),tabId:id,name:'General'});}
 next.dayPlans=[];return next;
}
export function openCache(name){
 return new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('accounts');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;resolve({
  read(key){return new Promise((ok,fail)=>{const tx=db.transaction('accounts'),r=tx.objectStore('accounts').get(key);r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);});},
  update(key,fn){return new Promise((ok,fail)=>{const tx=db.transaction('accounts','readwrite'),store=tx.objectStore('accounts'),r=store.get(key);let value,error; r.onsuccess=()=>{try{value=fn(r.result);if(value!==undefined)store.put(value,key);}catch(e){error=e;tx.abort();}};tx.oncomplete=()=>ok(value);tx.onabort=()=>fail(error||tx.error||Error('Local save failed'));tx.onerror=()=>{};});},
  close(){db.close();}
 });};});
}
export class PlannerStore{
 constructor({cache,owner,remote,changed=()=>{}}){this.cache=cache;this.owner=owner;this.remote=remote;this.changed=changed;this.running=null;}
 async read(){return this.cache.read(this.owner);}
 async load(){
  let local=await this.read();
  if(local?.dirty)return local;
  let cloud;try{cloud=await this.remote.load();}catch(e){if(local){this.changed('offline');return local;}throw e;}
  validatePlanner(cloud.data);
  const result=await this.cache.update(this.owner,current=>current?.dirty?current:current&&current.base>=cloud.revision?current:({data:cloud.data,base:cloud.revision,version:(current?.version||0)+1,dirty:false,conflict:false}));this.changed(result.dirty?'pending':'saved');return result;
 }
 async save(data,version){
  validatePlanner(data);
  const result=await this.cache.update(this.owner,old=>{if(!old||old.version!==version)throw new LocalConflictError();return {...old,data:structuredClone(data),version:old.version+1,dirty:true};});
  this.changed(result.conflict?'conflict':'pending');return result;
 }
 async sync(){
  if(this.running)return this.running;
  const run=async()=>{
   const local=await this.read();if(!local?.dirty)return this.load();if(local.conflict){this.changed('conflict');throw new ConflictError();}
   this.changed('syncing');
   let cloud;try{cloud=await this.remote.save(local.data,local.base);}catch(e){if(e instanceof ConflictError){await this.cache.update(this.owner,current=>({...current,conflict:true}));this.changed('conflict');}else this.changed('offline');throw e;}
   const saved=await this.cache.update(this.owner,current=>({...current,base:cloud.revision,dirty:current.version!==local.version,conflict:false}));
   this.changed(saved.dirty?'pending':'saved');return saved;
  };
  this.running=(globalThis.navigator?.locks?navigator.locks.request(`plannet-sync:${this.owner}`,run):run()).finally(()=>this.running=null);return this.running;
 }
 async useCloud(expectedVersion){
  const cloud=await this.remote.load();validatePlanner(cloud.data);
  const result=await this.cache.update(this.owner,current=>{if(current.version!==expectedVersion||cloud.revision<current.base)throw new LocalConflictError();return {data:cloud.data,base:cloud.revision,version:current.version+1,dirty:false,conflict:false};});this.changed('saved');return result;
 }
}
