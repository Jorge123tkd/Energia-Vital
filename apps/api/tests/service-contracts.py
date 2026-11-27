import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'migrations'
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
for n in range(1,33): db.executescript(next(root.glob(f'{n:03}_*.sql')).read_text())
db.execute("INSERT INTO admin_users(id,email,password_hash,role) VALUES('a','a@invalid.test','x','admin'),('o','o@invalid.test','x','operator')")
db.execute("INSERT INTO requests(id,type,title,status) VALUES('r','installation','QA','approved')")
db.execute("INSERT INTO warehouse_project_links(project_id,request_id,linked_by) VALUES('p','r','a')")
db.execute("INSERT INTO commercial_quote_versions(id,request_id,version_no,title,items_json,subtotal_cents,total_cents,valid_until,created_by,created_at,updated_at) VALUES('q','r',1,'QA offer','[]',100,100,'2026-12-31','a','2026-11-27','2026-11-27')")
db.execute("UPDATE commercial_quote_versions SET status='in_review' WHERE id='q'")
db.execute("UPDATE commercial_quote_versions SET status='approved_internal',reviewed_by='a',reviewed_at='2026-11-27' WHERE id='q'")
def reject(fn):
 try: fn()
 except sqlite3.IntegrityError: return
 raise AssertionError('must reject')
def draft(actor='a',revision=1):
 db.execute("INSERT INTO service_contract_drafts VALUES('q',?,'CTR-Q','{}',?,'2026-11-27T12:00:00Z')",(revision,actor))
def approve(actor='a',revision=2):
 db.execute("INSERT INTO service_contract_approvals VALUES('q',?,'Legal review documented',?,'2026-11-27T12:00:00Z','2026-11-27')",(revision,actor))
def sign(actor='a',day='2026-11-27'):
 db.execute("INSERT INTO service_contract_signatures VALUES('q',?,'Both signatures reviewed','private-documents/contract-test','signed.pdf',?,100,?,'2026-11-27T20:00:00Z','2026-11-27')",(day,'a'*64,actor))
def finance():
 db.execute("INSERT INTO business_project_contracts(project_id,quote_id,contract_reference,acceptance_evidence,accepted_on,recorded_by) VALUES('p','q','CTR-Q','Signed evidence reviewed','2026-11-27','a')")
reject(draft);reject(sign);reject(finance)
db.execute("INSERT INTO commercial_quote_decisions VALUES('q','accept','','staff_evidence',NULL,'a','Written proposal acceptance','2026-11-27','2026-11-27')")
reject(lambda:draft('o'));draft();reject(draft);reject(finance);draft(revision=2);reject(sign);reject(lambda:approve(revision=1));reject(lambda:approve(actor='o'));approve();reject(lambda:draft(revision=3));reject(lambda:sign('o'));reject(lambda:sign(day='2026-11-26'));sign();reject(sign);finance()
reject(lambda:db.execute("UPDATE service_contract_signatures SET sha256='x'"))
reject(lambda:db.execute("DELETE FROM service_contract_drafts"))
assert db.execute('SELECT count(*) FROM business_project_contracts').fetchone()==(1,)
print('PASS service contract: acceptance gate, administrative review, immutable signed evidence and finance gate')
