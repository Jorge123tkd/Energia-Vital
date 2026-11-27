import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'migrations'
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
for n in range(1,32):
 db.executescript(next(root.glob(f'{n:03}_*.sql')).read_text())
db.execute("INSERT INTO admin_users(id,email,password_hash,role) VALUES('a','a@invalid.test','x','admin')")
db.execute("INSERT INTO customers(id,name,email,phone) VALUES('c','Cliente','c@invalid.test','55551234'),('x','Otro','x@invalid.test','55551235')")
db.execute("INSERT INTO requests(id,customer_id,type,title) VALUES('r','c','consultation','QA')")
def quote(id,version):
 db.execute("INSERT INTO commercial_quote_versions(id,request_id,version_no,title,items_json,subtotal_cents,total_cents,valid_until,created_by,created_at,updated_at) VALUES(?,'r',?,'QA offer','[]',100,100,'2026-12-01','a','2026-11-27','2026-11-27')",(id,version))
 db.execute("UPDATE commercial_quote_versions SET status='in_review',updated_at='2026-11-27' WHERE id=?",(id,))
 db.execute("UPDATE commercial_quote_versions SET status='approved_internal',reviewed_by='a',reviewed_at='2026-11-27',updated_at='2026-11-27' WHERE id=?",(id,))
def issue(id):
 db.execute("INSERT INTO notifications(id,user_id,user_type,type,title,message,created_at) VALUES(?,'c','customer','system','QA','QA','2026-11-27')",('quote-issued-'+id,))
def decide(id,actor='c',kind='accept',note='',day='2026-11-27'):
 db.execute("INSERT INTO commercial_quote_decisions VALUES(?,?,?,'customer',?,NULL,NULL,?,?)",(id,kind,note,actor,day,day))
def reject(fn):
 try: fn()
 except sqlite3.IntegrityError: return
 raise AssertionError('must reject')
quote('q1',1)
reject(lambda:decide('q1'))
issue('q1')
reject(lambda:decide('q1','x'))
reject(lambda:decide('q1',day='2026-12-02'))
reject(lambda:decide('q1',kind='changes'))
decide('q1',kind='changes',note='Cambiar cantidad')
quote('q2',2);issue('q2');decide('q2')
reject(lambda:db.execute("UPDATE commercial_quote_decisions SET decision='reject'"))
quote('q3',3);issue('q3');reject(lambda:decide('q3'))
assert db.execute('SELECT count(*) FROM commercial_quote_decisions').fetchone()==(2,)
print('PASS quote decisions: ownership, issuance, validity, immutable revisions and accepted offer guard')

# A documented external response may be recorded for an unregistered customer, but not by an operator.
db.execute("INSERT INTO admin_users(id,email,password_hash,role) VALUES('o','o@invalid.test','x','operator')")
db.execute("INSERT INTO requests(id,type,title) VALUES('guest','consultation','Guest QA')")
db.execute("INSERT INTO commercial_quote_versions(id,request_id,version_no,title,items_json,subtotal_cents,total_cents,valid_until,created_by,created_at,updated_at) VALUES('g','guest',1,'Guest offer','[]',100,100,'2026-12-01','a','2026-11-27','2026-11-27')")
db.execute("UPDATE commercial_quote_versions SET status='in_review' WHERE id='g'")
db.execute("UPDATE commercial_quote_versions SET status='approved_internal',reviewed_by='a',reviewed_at='2026-11-27' WHERE id='g'")
def external(actor):
 db.execute("INSERT INTO commercial_quote_decisions VALUES('g','accept','','staff_evidence',NULL,?,'Respuesta recibida por escrito','2026-11-27','2026-11-27')",(actor,))
reject(lambda:external('o'))
external('a')
assert db.execute("SELECT source FROM commercial_quote_decisions WHERE quote_id='g'").fetchone()==('staff_evidence',)
print('PASS unregistered customer: documented response, admin-only')
