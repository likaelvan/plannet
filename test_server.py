import copy
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import server

class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.old=server.DB;server.DB=Path(self.temp.name)/'test.sqlite3'
    def tearDown(self):server.DB=self.old;self.temp.cleanup()
    def test_persistence_and_stale_save(self):
        first=server.read_state();first['data']['tasks'][0]['done']=True
        self.assertEqual(server.write_state(first['data'],0)['revision'],1)
        self.assertTrue(server.read_state()['data']['tasks'][0]['done'])
        self.assertIsNone(server.write_state(server.seed(),0))
        self.assertTrue(server.read_state()['data']['tasks'][0]['done'])
    def test_nested_tasks_and_cycles(self):
        d=server.seed();parent=d['tasks'][0];child=copy.deepcopy(parent);child.update(id='child',parentId=parent['id']);d['tasks'].append(child)
        self.assertEqual(server.validate(d),d)
        parent['parentId']='child'
        with self.assertRaises(ValueError):server.validate(d)
    def test_invalid_cross_tab_parent(self):
        d=server.seed();d['tasks'][-1]['parentId']=d['tasks'][0]['id']
        with self.assertRaises(ValueError):server.validate(d)
    def test_dates_hours_and_duplicate_ids(self):
        for field,value in [('deadline','2026-02-30'),('hours',-1),('hours',float('nan')),('done','false'),('title','   ')]:
            d=server.seed();d['tasks'][0][field]=value
            with self.subTest(field=field,value=value),self.assertRaises(ValueError):server.validate(d)
        d=server.seed();d['tasks'].append(copy.deepcopy(d['tasks'][0]))
        with self.assertRaises(ValueError):server.validate(d)
    def test_empty_planner_is_valid(self):self.assertEqual(server.validate({'tabs':[],'categories':[],'tasks':[]})['tasks'],[])
    def test_http_and_origin_protection(self):
        srv=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{srv.server_port}'
        try:
            with urlopen(base) as r:self.assertIn(b'Plannet',r.read())
            with urlopen(base+'/api/state') as r:payload=json.load(r)
            payload['data']['tasks'][0]['notes']='Saved through HTTP'
            request=Request(base+'/api/state',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'},method='POST')
            with urlopen(request) as r:self.assertEqual(json.load(r)['revision'],1)
            with self.assertRaises(HTTPError) as err:urlopen(request)
            self.assertEqual(err.exception.code,409)
            request.add_header('Origin','https://untrusted.example')
            with self.assertRaises(HTTPError) as err:urlopen(request)
            self.assertEqual(err.exception.code,403)
        finally:srv.shutdown();srv.server_close();thread.join()

if __name__=='__main__':unittest.main()
