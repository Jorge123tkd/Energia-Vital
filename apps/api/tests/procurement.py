#!/usr/bin/env python3
"""Procurement integration with the existing warehouse ledger. Fictitious data only."""
import sqlite3
from pathlib import Path
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
root=Path(__file__).resolve().parents[1]/'migrations'
for n in range(1,28):
    db.executescript(next(root.glob(f'{n:03d}_*.sql')).read_text())
db.execute("INSERT INTO admin_users(id,email,password_hash,role) VALUES('a','a@invalid.test','fake','admin'),('o','o@invalid.test','fake','operator')")
db.execute("INSERT INTO requests(id,type,title,status) VALUES('r','installation','Trabajo','approved')")
db.execute("INSERT INTO warehouse_project_links(project_id,request_id,linked_by) VALUES('p','r','a')")
db.execute("INSERT INTO warehouse_items(id,name,unit,created_by) VALUES('panel','Panel','unit','a'),('battery','Batería','unit','a')")
db.execute("INSERT INTO warehouse_project_requirements VALUES('p','panel',120000,'a')")
def reject(fn):
    try: fn()
    except sqlite3.IntegrityError: return
    raise AssertionError('Expected rejection')
reject(lambda:db.execute("INSERT INTO procurement_suppliers(id,name,country,created_by) VALUES('bad','Bad','China','o')"))
db.execute("INSERT INTO procurement_suppliers(id,name,country,created_by) VALUES('s','Fábrica ficticia','China','a')")
db.execute("INSERT INTO procurement_orders(id,supplier_id,project_id,currency,incoterm,reference,created_by) VALUES('po','s','p','USD','EXW','RFQ-1','a')")
reject(lambda:db.execute("UPDATE procurement_orders SET status='ordered',approved_by='a',approved_at='now' WHERE id='po'"))
db.execute("INSERT INTO procurement_lines VALUES('l','po','panel',120000,600000)")
def receive(id,q,item='panel',line='l'):
    db.execute("INSERT INTO warehouse_movements(id,item_id,kind,quantity_milli,actor,reference,purchase_line_id) VALUES(?,?,'receive',?,'a','test',?)",(id,item,q,line))
reject(lambda:receive('x',1000))
reject(lambda:db.execute("UPDATE procurement_orders SET status='ordered',approved_by='o',approved_at='now' WHERE id='po'"))
db.execute("UPDATE procurement_orders SET status='ordered',approved_by='a',approved_at='now' WHERE id='po'")
reject(lambda:db.execute("DELETE FROM procurement_lines WHERE id='l'"))
def shortage():
    return db.execute("SELECT uncovered_milli,shared_available_milli,ordered_not_received_milli FROM procurement_project_shortages").fetchone()
assert shortage()==(120000,0,120000)
reject(lambda:receive('x',1000,'battery'))
receive('r1',70000)
assert shortage()==(120000,70000,50000)
reject(lambda:receive('r1',70000))
reject(lambda:receive('x',51000))
reject(lambda:db.execute("UPDATE procurement_orders SET status='closed' WHERE id='po'"))
reject(lambda:db.execute("UPDATE procurement_orders SET status='cancelled' WHERE id='po'"))
db.execute("INSERT INTO warehouse_movements(id,item_id,project_id,kind,quantity_milli,actor,reference) VALUES('reserve','panel','p','reserve',70000,'a','test')")
assert shortage()==(50000,0,50000)
receive('r2',50000)
db.execute("UPDATE procurement_orders SET status='closed' WHERE id='po'")
assert shortage()==(50000,50000,0)
reject(lambda:receive('x',1000))
assert db.execute("SELECT received_milli,outstanding_milli FROM procurement_line_balances").fetchone()==(120000,0)
assert db.execute("SELECT on_hand_milli,reserved_milli FROM warehouse_balances WHERE item_id='panel'").fetchone()==(120000,70000)
print('PASS procurement: supplier, approval, partial receipt, no overreceipt, outstanding vs physical, order closure, shortage')
