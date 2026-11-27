#!/usr/bin/env python3
"""Operational finance: fictitious records only, no bank calls."""
import sqlite3
from pathlib import Path
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
root=Path(__file__).resolve().parents[1]/'migrations'
for n in range(1,29):
    db.executescript(next(root.glob(f'{n:03d}_*.sql')).read_text())
db.execute("INSERT INTO admin_users(id,email,password_hash,role) VALUES('a','a@invalid.test','fake','admin'),('o','o@invalid.test','fake','operator')")
db.execute("INSERT INTO requests(id,type,title,status) VALUES('r','installation','Trabajo','approved'),('r2','installation','Otro','approved')")
db.execute("INSERT INTO warehouse_project_links(project_id,request_id,linked_by) VALUES('p','r','a'),('p2','r2','a')")
def reject(fn):
    try: fn()
    except sqlite3.IntegrityError: return
    raise AssertionError('Expected rejection')
db.execute("INSERT INTO commercial_quote_versions(id,request_id,version_no,title,items_json,subtotal_cents,total_cents,valid_until,created_by,created_at,updated_at) VALUES('q','r',1,'Cotización','[]',100000,100000,'2026-12-31','a','now','now')")
def contract(p='p',actor='a'):
    db.execute("INSERT INTO business_project_contracts(project_id,quote_id,contract_reference,acceptance_evidence,accepted_on,due_on,recorded_by) VALUES(?,'q','Contrato firmado','Aceptación documentada del cliente','2026-11-21','2026-12-31',?)",(p,actor))
reject(contract)
db.execute("UPDATE commercial_quote_versions SET status='in_review' WHERE id='q'")
db.execute("UPDATE commercial_quote_versions SET status='approved_internal',reviewed_by='a',reviewed_at='now' WHERE id='q'")
reject(lambda:contract('p2'))
reject(lambda:contract(actor='o'))
contract()
def report(id,amount):
    db.execute("INSERT INTO request_payment_reports(id,request_id,reported_by,amount_usd_cents,payment_method,reported_on,reference,report_note,created_at,updated_at) VALUES(?,'r','o',?,'transfer','2026-11-21',?,'Pago informado','now','now')",(id,amount,id+'-reference'))
report('payment1',30000)
report('payment2',80000)
def balances():
    return db.execute("SELECT contracted_usd_cents,manually_verified_usd_cents,reported_unverified_usd_cents,outstanding_reference_usd_cents,excess_reference_usd_cents FROM business_project_receivables").fetchone()
assert balances()==(100000,0,110000,100000,0)
db.execute("UPDATE request_payment_reports SET verification_status='verified_manual',reviewed_by='a',reviewed_at='now',verification_basis='bank_statement',review_note='Comprobación independiente manual' WHERE id='payment1'")
assert balances()==(100000,30000,80000,70000,0)
db.execute("UPDATE request_payment_reports SET verification_status='verified_manual',reviewed_by='a',reviewed_at='now',verification_basis='bank_statement',review_note='Comprobación independiente manual' WHERE id='payment2'")
assert balances()==(100000,110000,0,0,10000)
db.execute("INSERT INTO procurement_suppliers(id,name,country,created_by) VALUES('s','Fábrica ficticia','China','a')")
db.execute("INSERT INTO warehouse_items(id,name,unit,created_by) VALUES('panel','Panel','unit','a')")
db.execute("INSERT INTO procurement_orders(id,supplier_id,project_id,currency,incoterm,reference,created_by) VALUES('po','s','p','USD','EXW','RFQ-1','a')")
db.execute("INSERT INTO procurement_lines VALUES('l','po','panel',120000,40000)")
db.execute("UPDATE procurement_orders SET status='ordered',approved_by='a',approved_at='now' WHERE id='po'")
assert db.execute("SELECT uninvoiced_committed_minor FROM business_purchase_commitments").fetchone()==(40000,)
def obligation(id,category,order,amount,currency='USD',actor='a'):
    db.execute("INSERT INTO business_obligations(id,project_id,purchase_order_id,supplier_id,category,currency,amount_minor,document_reference,evidence,issued_on,recorded_by) VALUES(?,'p',?,'s',?,?,?,?,'Documento comprobado administrativamente','2026-11-21',?)",(id,order,category,currency,amount,id+'-doc',actor))
reject(lambda:obligation('bad','goods','po',41000))
reject(lambda:obligation('bad','goods','po',40000,'CNY'))
reject(lambda:obligation('bad','goods','po',40000,actor='o'))
obligation('goods','goods','po',40000)
reject(lambda:obligation('duplicate','goods','po',40000))
assert db.execute("SELECT count(*) FROM business_purchase_commitments").fetchone()==(0,)
obligation('freight','freight',None,5000)
obligation('customs','customs',None,10000,'CUP')
def pay(id,amount,ref,actor='a'):
    db.execute("INSERT INTO business_supplier_payments(id,obligation_id,amount_minor,reference,paid_on,evidence,recorded_by) VALUES(?,'goods',?,?,'2026-11-21','Comprobante revisado manualmente',?)",(id,amount,ref,actor))
reject(lambda:pay('bad',1000,'ref-1','o'))
pay('one',20000,'ref-1')
reject(lambda:pay('two',20001,'ref-2'))
reject(lambda:pay('duplicate',1000,'ref-1'))
assert db.execute("SELECT amount_minor,manually_recorded_paid_minor,outstanding_minor FROM business_payables WHERE id='goods'").fetchone()==(40000,20000,20000)
assert db.execute("SELECT SUM(documented_minor) FROM business_project_obligations WHERE currency='USD'").fetchone()==(45000,)
assert db.execute("SELECT SUM(documented_minor) FROM business_project_obligations WHERE currency='CUP'").fetchone()==(10000,)
reject(lambda:db.execute("UPDATE business_obligations SET amount_minor=1 WHERE id='goods'"))
print('PASS business finance: contract evidence, verified vs reported, excess, commitments vs invoice, currency separation, supplier payments')
