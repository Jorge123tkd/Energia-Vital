#!/usr/bin/env python3
"""Fictitious request/project/work linkage and stock invariants."""
from pathlib import Path
import sqlite3
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
root=Path(__file__).resolve().parents[1]/'migrations'
for n in range(1,27):
    db.executescript(next(root.glob(f'{n:03d}_*.sql')).read_text())
db.execute("INSERT INTO admin_users(id,email,password_hash,role) VALUES('a','a@invalid.test','fake','admin'),('o','o@invalid.test','fake','operator')")
db.execute("INSERT INTO requests(id,type,title,status) VALUES('r1','installation','Trabajo uno','approved'),('r2','installation','Trabajo dos','approved')")
db.execute("INSERT INTO brigades(id,name,leader_name,created_by,created_at,updated_at) VALUES('b1','Brigada uno','Jefe uno','a','2026-11-21','2026-11-21'),('b2','Brigada dos','Jefe dos','a','2026-11-21','2026-11-21')")
def work(id,brigade,request,status,day):
    db.execute('INSERT INTO brigade_work(id,brigade_id,request_id,title,work_date,status,requested_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',(id,brigade,request,'Trabajo',day,status,'a','2026-11-21','2026-11-21'))
work('w1','b1','r1','scheduled','2026-12-01')
work('w2','b2','r1','scheduled','2026-12-01')
work('w3','b1','r2','scheduled','2026-12-02')
work('w4','b1','r1','pending_approval','2026-12-03')
def reject(fn):
    try: fn()
    except sqlite3.IntegrityError: return
    raise AssertionError('operation should fail')
reject(lambda:db.execute("INSERT INTO warehouse_project_links(project_id,request_id,linked_by) VALUES('p1','r1','o')"))
db.execute("INSERT INTO warehouse_project_links(project_id,request_id,linked_by) VALUES('p1','r1','a'),('p2','r2','a')")
reject(lambda:db.execute("INSERT INTO warehouse_project_links(project_id,request_id,linked_by) VALUES('copy','r1','a')"))
db.execute("INSERT INTO warehouse_items(id,name,unit,created_by) VALUES('panel','Panel solar','unit','a')")
def move(id,kind,q,project=None,work=None):
    db.execute('INSERT INTO warehouse_movements(id,item_id,project_id,kind,quantity_milli,actor,reference,work_id) VALUES(?,?,?,?,?,?,?,?)',(id,'panel',project,kind,q,'a','test',work))
move('receive','receive',20000)
reject(lambda:move('x','reserve',1000,'missing'))
move('reserve','reserve',12000,'p1')
reject(lambda:move('x','issue',1000,'p1','w3'))
reject(lambda:move('x','issue',1000,'p1','w4'))
reject(lambda:move('x','issue',1000,'p1'))
move('i1','issue',6000,'p1','w1')
move('i2','issue',4000,'p1','w2')
reject(lambda:move('x','consume',7000,'p1','w1'))
move('c1','consume',5000,'p1','w1')
reject(lambda:move('x','return',2000,'p1','w1'))
db.execute("UPDATE brigade_work SET status='cancelled' WHERE id='w1'")
reject(lambda:move('x','issue',1000,'p1','w1'))
move('d1','return',1000,'p1','w1')
move('d2','return',2000,'p1','w2')
assert db.execute("SELECT on_hand_milli,reserved_milli,issued_milli FROM warehouse_balances").fetchone()==(13000,2000,2000)
assert db.execute("SELECT outstanding_milli,delivered_milli,consumed_milli,returned_milli FROM warehouse_work_balances WHERE work_id='w1'").fetchone()==(0,6000,5000,1000)
assert db.execute("SELECT outstanding_milli FROM warehouse_work_balances WHERE work_id='w2'").fetchone()==(2000,)
print('PASS brigade warehouse: existing orders, approval, project linkage, individual custody, returns after cancellation')
