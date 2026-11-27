import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'migrations'
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript((root/'001_init.sql').read_text())
db.execute("INSERT INTO admin_users(id,email,password_hash,role) VALUES('a','a@invalid.test','x','admin'),('o','o@invalid.test','x','operator')")
db.executescript((root/'029_commercial_tariffs.sql').read_text())
def add(rev,actor='a',sale=1500,cost=800,active=1):
    db.execute("INSERT INTO commercial_tariff_versions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",('panel-mount',rev,'Montaje de panel','labor','unit',None,sale,cost,'',active,actor,'2026-11-27'))
def rejects(fn):
    try: fn()
    except sqlite3.IntegrityError: return
    raise AssertionError('must reject')
assert db.execute('SELECT count(*) FROM commercial_tariffs').fetchone()==(0,)
rejects(lambda:add(1,'o'))
add(1)
rejects(lambda:add(1))
rejects(lambda:add(3))
add(2,sale=2000)
assert db.execute('SELECT revision,sale_cents FROM commercial_tariffs').fetchone()==(2,2000)
assert db.execute('SELECT sale_cents FROM commercial_tariff_versions WHERE revision=1').fetchone()==(1500,)
rejects(lambda:db.execute('UPDATE commercial_tariff_versions SET sale_cents=5'))
rejects(lambda:db.execute('DELETE FROM commercial_tariff_versions'))
add(3,sale=None)
assert db.execute('SELECT count(*) FROM commercial_tariffs WHERE active=1 AND sale_cents IS NOT NULL').fetchone()==(0,)
print('PASS tariff versions, permissions, unpriced records and immutable history')
