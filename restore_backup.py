"""Restore a JSON backup, preserving the current database as a timestamped backup."""
import argparse
from contextlib import closing
import datetime
import json
import sqlite3
import server

if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Restore a Plannet backup. Close the app first.')
    parser.add_argument('backup');args=parser.parse_args()
    with open(args.backup,encoding='utf-8') as f:payload=json.load(f)
    data=server.validate(payload['data'])
    with server.connection() as con:
        target=server.DB.with_name('before-restore-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.sqlite3')
        with closing(sqlite3.connect(target)) as backup:con.backup(backup)
    result=server.write_state(data,server.read_state()['revision'])
    if result is None:raise SystemExit('Planner changed during restore. Close all app windows and try again.')
    print(f'Restored. Previous data preserved at {target}')
