#!/usr/bin/env python3
"""Ledger invariants with fictitious records; no Cloudflare calls."""
import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'migrations'
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript((root/'001_init.sql').read_text())
db.execute("INSERT INTO admin_users(id,email,password_hash,role) VALUES('admin','admin@invalid.test','dummy','admin'),('worker','worker@invalid.test','dummy','operator')")
db.execute("INSERT INTO categories(id,name,slug) VALUES('cat','Cat','cat')")
db.execute("INSERT INTO products(id,category_id,name,slug,stock_quantity) VALUES('panel','cat','Panel','panel',99)")
db.executescript((root/'025_warehouse_ledger.sql').read_text())
assert db.execute('SELECT count(*) FROM warehouse_items').fetchone()==(0,)
db.execute("INSERT INTO warehouse_items(id,product_id,name,unit,created_by) VALUES('panel','panel','Panel','unit','admin')")
def move(id,kind,qty,project=None,actor='admin'):
    db.execute('INSERT INTO warehouse_movements(id,item_id,project_id,kind,quantity_milli,actor,reference) VALUES(?,?,?,?,?,?,?)',(id,'panel',project,kind,qty,actor,'test'))
def reject(fn):
    try: fn()
    except sqlite3.IntegrityError: return
    raise AssertionError('operation should have failed')
def balances():
    return db.execute("SELECT on_hand_milli,reserved_milli,issued_milli FROM warehouse_balances WHERE item_id='panel'").fetchone()
assert balances()==(0,0,0)
reject(lambda:move('x','reserve',1000,'p'))
reject(lambda:move('x','receive',1000,actor='worker'))
reject(lambda:move('x','receive',1500))
move('r','receive',10000)
move('a','reserve',6000,'p')
reject(lambda:move('x','reserve',5000,'q'))
move('b','reserve',4000,'q')
reject(lambda:move('x','issue',7000,'p'))
move('i','issue',5000,'p')
assert balances()==(5000,5000,5000)
reject(lambda:move('i','issue',1000,'p'))
reject(lambda:move('x','consume',1000,'q'))
move('c','consume',3000,'p')
assert balances()==(5000,5000,2000)
move('d','return',2000,'p')
assert balances()==(7000,5000,0)
move('l','release',1000,'p')
assert balances()==(7000,4000,0)
reject(lambda:move('x','release',1000,'p'))
reject(lambda:db.execute("UPDATE warehouse_movements SET quantity_milli=1000 WHERE id='r'"))
reject(lambda:db.execute("DELETE FROM warehouse_movements WHERE id='r'"))
reject(lambda:db.execute("UPDATE warehouse_items SET unit='kg' WHERE id='panel'"))
assert db.execute("SELECT stock_quantity FROM products WHERE id='panel'").fetchone()==(99,)
assert db.execute("SELECT consumed_milli FROM warehouse_project_balances WHERE item_id='panel' AND project_id='p'").fetchone()==(3000,)
print('PASS warehouse: immutable ledger, availability, project reservation, issue, consumption, return, duplicate rejection, catalog unchanged')

# Execute the exact catalog query from the API; no physical quantity is copied.
import re
source=(root.parent/'src'/'routes'/'warehouse.ts').read_text()
catalog=re.search(r'const catalogSQL="([^"]+)"\+actorGuard\+"([^"]+)"',source)
assert catalog
guard=re.search(r'const actorGuard="([^"]+)"',source).group(1)
sql=catalog.group(1)+guard+catalog.group(2)
db.execute("INSERT INTO products(id,category_id,name,slug,stock_quantity,brand,model) VALUES('battery','cat','Batería','battery',50,'QA','LFP')")
rows={r[0]:r for r in db.execute(sql,('','','admin'))}
assert rows['panel'][10]==3000
assert rows['battery'][6] is None and rows['battery'][8] is None and rows['battery'][10] is None
assert db.execute(sql,('','LFP','admin')).fetchone()[0]=='battery'
assert db.execute(sql,('','','worker')).fetchall()==[]
print('PASS catalog bridge: published products, linked real stock, unknown unlinked stock and admin-only search')
