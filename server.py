"""Plannet: a dependency-free, local task planner."""
import argparse
from contextlib import contextmanager
import datetime as dt
import json
import mimetypes
import os
from pathlib import Path
import sqlite3
import threading
import webbrowser
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('PLAN_NET_DB', str(ROOT / 'data' / 'plan-net.sqlite3')))
STATUSES = {'Not started', 'In progress', 'Waiting', 'On hold'}

def seed():
    tabs = [{'id': x.lower(), 'name': x, 'color': color} for x, color in [('Personal','#db754b'), ('Work','#6689b2'), ('Learning','#9583bc'), ('Content','#629b84')]]
    groups = {'personal':['Home','Self care','Hobbies'], 'work':['Projects','Meetings','Other'], 'learning':['Certifications','Development','Other'], 'content':['Ideas','In production','Published']}
    categories = [{'id': f'{tab}-{i}', 'tabId':tab, 'name':name} for tab, names in groups.items() for i,name in enumerate(names)]
    tasks=[]
    for i,(title,tab,cat) in enumerate([('Cleaning','personal',0),('Change litter sand','personal',0),('Haircut','personal',1),('Badminton','personal',2),('Ranking anime','content',0),('Tier list','content',0)]):
        tasks.append({'id':f'starter-{i}', 'tabId':tab, 'categoryId':f'{tab}-{cat}', 'parentId':None, 'title':title, 'deadline':'', 'hours':None, 'progress':'Not started', 'done':False, 'notes':''})
    return {'tabs':tabs,'categories':categories,'tasks':tasks}

def validate(data):
    if not isinstance(data,dict) or set(data) not in ({'tabs','categories','tasks'}, {'tabs','categories','tasks','dayPlans'}): raise ValueError('Invalid planner data.')
    for key in data:
        if not isinstance(data[key],list) or len(data[key])>10000: raise ValueError('Invalid record count.')
    def ids(items):
        result={}
        for item in items:
            if not isinstance(item,dict) or not isinstance(item.get('id'),str) or not 1<=len(item['id'])<=100 or item['id'] in result: raise ValueError('Each record needs a unique ID.')
            result[item['id']]=item
        return result
    tabs=ids(data['tabs']); cats=ids(data['categories']); tasks=ids(data['tasks'])
    def text(item,key,limit,required=False):
        v=item.get(key)
        if not isinstance(v,str) or len(v)>limit or (required and not v.strip()): raise ValueError(f'Invalid {key}.')
    for tab in tabs.values():
        text(tab,'name',60,True); text(tab,'color',7,True)
        if len(tab['color'])!=7 or tab['color'][0]!='#' or any(c not in '0123456789abcdefABCDEF' for c in tab['color'][1:]): raise ValueError('Invalid tab color.')
    for cat in cats.values():
        text(cat,'name',80,True)
        if cat.get('tabId') not in tabs: raise ValueError('Category tab does not exist.')
    for task in tasks.values():
        text(task,'title',2000,True);text(task,'notes',10000);text(task,'deadline',10)
        if task.get('tabId') not in tabs or task.get('categoryId') not in cats or cats[task['categoryId']]['tabId']!=task['tabId']: raise ValueError('Invalid task category.')
        if type(task.get('done')) is not bool or task.get('progress') not in STATUSES: raise ValueError('Invalid task status.')
        h=task.get('hours')
        if h is not None and (type(h) not in (int,float) or not 0<=h<=100000): raise ValueError('Hours must be between 0 and 100,000.')
        if task['deadline']:
            try:
                parsed=dt.date.fromisoformat(task['deadline'])
                if parsed.isoformat()!=task['deadline']: raise ValueError()
            except ValueError: raise ValueError('Use a valid deadline date.')
        repeat=task.get('repeat')
        if repeat is not None:
            if not isinstance(repeat,dict) or repeat.get('unit') not in ('day','week','month','year') or repeat.get('mode') not in ('fixed','after') or type(repeat.get('interval')) is not int or not 1<=repeat['interval']<=365 or type(repeat.get('weekday')) is not int or not 0<=repeat['weekday']<=6 or type(repeat.get('paused')) is not bool or not task['deadline']: raise ValueError('Invalid repeating task settings.')
        for key in ('nextOccurrenceId','seriesId'):
            if key in task and (not isinstance(task[key],str) or not 1<=len(task[key])<=100): raise ValueError('Invalid repeat history.')
        if 'skipped' in task and type(task['skipped']) is not bool: raise ValueError('Invalid skipped state.')
        parent=task.get('parentId')
        if parent is not None:
            if parent not in tasks or tasks[parent]['tabId']!=task['tabId'] or tasks[parent]['categoryId']!=task['categoryId']: raise ValueError('Subtasks must stay with their parent category.')
        visited={task['id']}
        while parent is not None:
            if parent in visited or len(visited)>50: raise ValueError('Task nesting is circular or too deep.')
            visited.add(parent); parent=tasks[parent].get('parentId')
    for tab in tabs.values():
        if 'timed' in tab and type(tab['timed']) is not bool: raise ValueError('Invalid tab schedule mode.')
        if tab.get('timed') and not isinstance(tab.get('schedule'),dict): raise ValueError('Timed tabs need a schedule.')
        if 'schedule' in tab and not isinstance(tab['schedule'],dict): raise ValueError('Invalid schedule.')
    plans=ids(data.get('dayPlans',[]))
    dates=set()
    for plan in [*plans.values(),*[t['schedule'] for t in tabs.values() if 'schedule' in t]]:
        text(plan,'date',10,True);text(plan,'start',5,True)
        try:
            if dt.date.fromisoformat(plan['date']).isoformat()!=plan['date']: raise ValueError()
            if dt.time.fromisoformat(plan['start']).strftime('%H:%M')!=plan['start']: raise ValueError()
        except ValueError: raise ValueError('Invalid day plan date or start time.')
        runtime=plan.get('runtime')
        if runtime is not None:
            if not isinstance(runtime,dict) or any(type(runtime.get(k)) not in (int,float) or not 0<=runtime[k]<=8640000000000000 for k in ('startedAt','delayMs')) or (runtime.get('pausedAt') is not None and (type(runtime['pausedAt']) not in (int,float) or not 0<=runtime['pausedAt']<=8640000000000000)): raise ValueError('Invalid timer state.')
        task_ids=plan.get('taskIds')
        if not isinstance(task_ids,list) or any(not isinstance(x,str) for x in task_ids) or len(task_ids)!=len(set(task_ids)) or any(x not in tasks for x in task_ids): raise ValueError('Invalid day plan tasks.')
    return data

def migrate_day_plans(data):
    for plan in data.get('dayPlans',[]):
        tab_id=str(uuid.uuid4())
        data['tabs'].append({'id':tab_id,'name':f"Schedule · {plan['date']}",'color':'#7560c9','timed':True,'schedule':{'date':plan['date'],'start':plan['start'],'taskIds':list(plan['taskIds'])}})
        data['categories'].append({'id':str(uuid.uuid4()),'tabId':tab_id,'name':'General'})
    data['dayPlans']=[]

@contextmanager
def connection():
    DB.parent.mkdir(parents=True,exist_ok=True)
    con=sqlite3.connect(DB,timeout=10)
    con.execute('CREATE TABLE IF NOT EXISTS planner (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL)')
    con.execute('INSERT OR IGNORE INTO planner VALUES (1,0,?)',(json.dumps(seed()),));con.commit()
    try:
        with con:
            yield con
    finally:
        con.close()

def read_state():
    with connection() as con:
        revision,body=con.execute('SELECT revision,body FROM planner WHERE id=1').fetchone()
    data=json.loads(body)
    if data.get('dayPlans'):
        migrate_day_plans(data)
        result=write_state(data,revision)
        return result if result else read_state()
    return {'revision':revision,'data':data}

def write_state(data,revision):
    validate(data)
    if type(revision) is not int: raise ValueError('Invalid revision.')
    with connection() as con:
        changed=con.execute('UPDATE planner SET body=?, revision=revision+1 WHERE id=1 AND revision=?',(json.dumps(data),revision)).rowcount
        if not changed: return None
    return {'revision':revision+1,'data':data}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt,*args):
        if args and str(args[1] if len(args)>1 else '').startswith('5'): super().log_message(fmt,*args)
    def reply(self,status,payload):
        body=json.dumps(payload).encode()
        self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def allowed(self):
        host=self.headers.get('Host','')
        return host in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
    def do_GET(self):
        if not self.allowed():return self.reply(403,{'error':'Use the local Plannet address.'})
        path=urlparse(self.path).path
        if path=='/api/state':return self.reply(200,read_state())
        files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg','/recurrence.js':'recurrence.js','/themes.css':'themes.css'}
        if path not in files:return self.reply(404,{'error':'Not found.'})
        file=ROOT/'static'/files[path];body=file.read_bytes()
        self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(file)[0] or 'text/plain');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-cache');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");self.end_headers();self.wfile.write(body)
    def do_POST(self):
        if not self.allowed():return self.reply(403,{'error':'Invalid host.'})
        origin=self.headers.get('Origin')
        if origin and origin not in {f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}:return self.reply(403,{'error':'Invalid origin.'})
        if urlparse(self.path).path!='/api/state':return self.reply(404,{'error':'Not found.'})
        if self.headers.get_content_type()!='application/json':return self.reply(415,{'error':'JSON required.'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=5_000_000:raise ValueError('Invalid request size.')
            body=json.loads(self.rfile.read(length));result=write_state(body['data'],body['revision'])
            if result is None:return self.reply(409,{'error':'This planner changed in another window. Reload and try again.'})
            self.reply(200,result)
        except (ValueError,KeyError,TypeError) as e:self.reply(400,{'error':str(e)})
        except sqlite3.Error:self.reply(503,{'error':'Could not save to the database. Please try again.'})

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);parser.add_argument('--open',action='store_true');args=parser.parse_args()
    read_state()
    try: server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    except OSError:raise SystemExit(f'Port {args.port} is already in use. Close the other server or use --port 8766.')
    url=f'http://127.0.0.1:{args.port}';print(f'Plannet is running at {url}\nData: {DB}\nPress Ctrl+C to stop.',flush=True)
    if args.open:threading.Timer(.6,lambda:webbrowser.open(url)).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
