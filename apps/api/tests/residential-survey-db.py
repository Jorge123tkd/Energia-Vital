import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'migrations'
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript((root/'001_init.sql').read_text())
db.execute("INSERT INTO admin_users(id,email,password_hash,role) VALUES('a','a@invalid.test','x','admin'),('o','o@invalid.test','x','operator')")
db.execute("INSERT INTO requests(id,type,title,status,priority) VALUES('r','consultation','QA','pending','medium')")
db.executescript((root/'030_residential_survey.sql').read_text())
def add(rev,actor='o',request='r'):
    db.execute("INSERT INTO residential_survey_versions VALUES(?,?,?,?,?,?)",(request,rev,'partial','{}',actor,'2026-11-27'))
def rejects(fn):
    try: fn()
    except sqlite3.IntegrityError: return
    raise AssertionError('must reject')
add(1)
rejects(lambda:add(1))
rejects(lambda:add(3))
rejects(lambda:add(2,'missing'))
add(2)
rejects(lambda:db.execute("UPDATE residential_survey_versions SET body_json='{}'"))
rejects(lambda:db.execute('DELETE FROM residential_survey_versions'))
db.execute("UPDATE requests SET status='cancelled' WHERE id='r'")
rejects(lambda:add(3))
assert db.execute('SELECT count(*) FROM residential_survey_versions').fetchone()==(2,)
assert db.execute('SELECT count(*) FROM customers').fetchone()==(0,)
print('PASS residential survey database: revision concurrency, immutable history, closed requests and no artificial accounts')
