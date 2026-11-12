import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'dist');
try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
const url=process.env.PLANNET_SUPABASE_URL||'',key=process.env.PLANNET_SUPABASE_PUBLISHABLE_KEY||'';
if(Boolean(url)!==Boolean(key))throw Error('Set both public Supabase variables, or leave both blank for the setup preview.');
if(url&&(!url.startsWith('https://')||new URL(url).pathname!=='/'||new URL(url).search||new URL(url).username))throw Error('Use your HTTPS Supabase project origin.');
if(key&&!key.startsWith('sb_publishable_')){let payload;try{payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());}catch{}if(payload?.role!=='anon')throw Error('Only a public publishable/anon key may be bundled. Never use a service-role or secret key.');}
await fs.mkdir(out,{recursive:true});
const read=name=>fs.readFile(path.join(root,name),'utf8');
let html=await read('static/index.html');
html=html.replace('<script defer src="/app.js"></script>','<meta name="theme-color" content="#6650bd"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon-192.png"><link rel="stylesheet" href="/mobile.css"><script type="module" src="/cloud.js"></script>');
html=html.replace('<link rel="stylesheet" href="/themes.css">','').replace('</head>','<link rel="stylesheet" href="/themes.css"></head>');
html=html.replace('<body>','<body>\n'+await read('web/account.html'));
const toolbar='<div class="cloud-toolbar"><span id="cloud-status" role="status">Opening your account…</span><button id="resolve-conflict" hidden>Resolve conflict</button><button id="sync-now">Sync</button><button id="import-open">Import backup</button><button id="install-app" hidden>Install app</button><button id="signout">Sign out</button></div>';
html=html.replace('<main>',toolbar+'<main>').replace('Saved on this computer ·','Private account ·');
html=html.replace(/<h3>Your data stays here<\/h3><p>.*?<\/p>/,'<h3>Your account and backups</h3><p>Edits save to this device first, then sync to your private account. The sync status shows whether changes have reached the cloud. Use Backup regularly. Import backup can bring in your desktop planner. Account settings include previous revisions and account deletion.</p>');
await fs.writeFile(path.join(out,'index.html'),html);
let js=await read('static/app.js');
if((js.match(/fetch\('\/api\/state'/g)||[]).length!==2)throw Error('Planner storage adapter changed; review the cloud build.');
js=js.replaceAll("fetch('/api/state'","window.CloudStore.request('/api/state'").replaceAll('localStorage.','window.PlannetPreferences.').replaceAll("'● All changes saved'",'window.CloudStore.statusText()');
js=js.replace('load().catch',"window.addEventListener('plannet-refresh',()=>{if(!saving&&!document.querySelector('dialog[open]'))load().catch(e=>notify(e.message));});\nload().catch");
js=js.replace('Make sure the Plannet server is running, then refresh this page.','Reconnect to the internet, then refresh. Your local drafts are kept on this device.');
await fs.writeFile(path.join(out,'planner.js'),js);
for(const [source,target] of [['static/style.css','style.css'],['static/themes.css','themes.css'],['static/recurrence.js','recurrence.js'],['static/favicon.svg','favicon.svg'],['web/mobile.css','mobile.css']])await fs.copyFile(path.join(root,source),path.join(out,target));
await build({entryPoints:[path.join(root,'web/cloud.mjs')],bundle:true,format:'esm',target:['es2022'],minify:true,outfile:path.join(out,'cloud.js'),define:{__PUBLIC_CONFIG__:JSON.stringify({url,key})}});
// Generate code-native launcher artwork. No external image service or runtime dependency.
function png(size){const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++){const row=y*(size*4+1);for(let x=0;x<size;x++){const px=x/size,py=y/size,ring=Math.abs(Math.hypot(px-.5,py-.5)-.235)<.019,pen=Math.abs(px+py-.99)<.04&&px>.48&&px<.79,orbit=Math.abs(((px-.5)*.7+(py-.5)*.7))<.018&&Math.hypot(px-.5,py-.5)<.33;const ink=ring||pen||orbit;const rgb=ink?[255,255,255]:[105,82,190];for(let c=0;c<3;c++)raw[row+x*4+c+1]=rgb[c];raw[row+x*4+4]=255;}}
 const crc=buf=>{let n=0xffffffff;for(const b of buf){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};const chunk=(type,body)=>{const b=Buffer.concat([Buffer.from(type),body]),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(body.length);sum.writeUInt32BE(crc(b));return Buffer.concat([len,b,sum]);};const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
for(const size of [192,512])await fs.writeFile(path.join(out,`icon-${size}.png`),png(size));
await fs.writeFile(path.join(out,'manifest.webmanifest'),JSON.stringify({id:'/',name:'Plannet',short_name:'Plannet',description:'Your private task planner',start_url:'/',scope:'/',display:'standalone',background_color:'#f4f6fc',theme_color:'#6650bd',icons:[192,512].map(size=>({src:`/icon-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:'any maskable'}))},null,2));
const assets=['/','/index.html','/style.css','/themes.css','/recurrence.js','/mobile.css','/planner.js','/cloud.js','/favicon.svg','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
const hash=createHash('sha256');for(const name of assets.filter(x=>x!=='/'))hash.update(await fs.readFile(path.join(out,name.slice(1))));
const worker=(await read('web/sw.js')).replace('__CACHE_VERSION__',hash.digest('hex').slice(0,16)).replace('__ASSETS__',JSON.stringify(assets));await fs.writeFile(path.join(out,'sw.js'),worker);
const connect=url?` ${new URL(url).origin}`:'';
await fs.writeFile(path.join(out,'_headers'),`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'${connect}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n`);
console.log(`Built dist/ (${configuredText()}).`);function configuredText(){return url?'Supabase connected by public configuration':'setup preview; accounts disabled until configured';}
