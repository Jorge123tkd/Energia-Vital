#!/usr/bin/env python3
"""Bonaire: ensayo REPRODUCIBLE con registros FICTICIOS de una D1 histórica.

Ejecuta 001..012, inserta datos relacionados (sin datos de producción),
aplica 013, 014, 015, 016, 017 y 018, compara cada fila histórica y comprueba referencias.
Usa SQLite de Python en memoria; la suite separada Worker+D1 verifica
compatibilidad real con Cloudflare. NO accede a Cloudflare.
"""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1] / "migrations"
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")

def migration(number):
    matches = sorted(ROOT.glob(f"{number:03d}_*.sql"))
    assert len(matches) == 1, f"Migración {number:03d} ausente o duplicada: {matches}"
    db.executescript(matches[0].read_text(encoding="utf-8"))

for n in range(1, 13):
    migration(n)

# Una muestra deliberadamente ficticia; jamás copiar registros reales a CI.
db.execute("INSERT INTO admin_users(id,email,password_hash,role) VALUES (?,?,?,?)",
           ("staff-old","gestor@invalid.example","hash-ficticio-inutilizable","operator"))
db.execute("INSERT INTO admin_users(id,email,password_hash,role) VALUES (?,?,?,?)",
           ("admin-old","admin@invalid.example","hash-ficticio-inutilizable","admin"))
db.execute("""INSERT INTO customers(id,name,email,phone,address,city,province,password_hash)
              VALUES(?,?,?,?,?,?,?,?)""",
           ("customer-old","Cliente ficticio","cliente@invalid.example","5350000000",
            "Calle de prueba 123","Habana Vieja","La Habana","hash-ficticio-inutilizable"))
db.execute("""INSERT INTO requests(id,customer_id,type,title,description,status,priority)
              VALUES(?,?,?,?,?,?,?)""",
           ("request-old","customer-old","installation","Instalación ficticia",
            "Solicitud histórica para ensayo","pending","high"))
db.execute("""INSERT INTO appointments(id,customer_id,request_id,title,starts_at,ends_at)
              VALUES(?,?,?,?,?,?)""",
           ("appointment-old","customer-old","request-old","Visita ficticia",
            "2026-11-20T15:00:00Z","2026-11-20T16:00:00Z"))
db.execute("""INSERT INTO assistant_sessions(id,customer_id,channel)
              VALUES(?,?,?)""", ("session-old","customer-old","web"))
db.execute("""INSERT INTO assistant_messages(id,session_id,role,content)
              VALUES(?,?,?,?)""",
           ("message-old","session-old","user","Conversación ficticia histórica"))
db.execute("""INSERT INTO request_images(id,request_id,customer_id,r2_key,content_type)
              VALUES(?,?,?,?,?)""",
           ("image-old","request-old","customer-old","pruebas/no-real.png","image/png"))
db.execute("""INSERT INTO request_intake(request_id,available_budget_usd_cents,payment_method,
              payment_currency,customer_type,created_at,updated_at)
              VALUES(?,?,?,?,?,?,?)""",
           ("request-old",250000,"transferencia","USD","mipyme",
            "2026-11-13T00:00:00Z","2026-11-13T00:00:00Z"))
db.execute("""INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id)
              VALUES(?,?,?,?,?)""",
           ("audit-old","staff-old","request_created","request","request-old"))

tables = ("admin_users","customers","requests","appointments",
          "assistant_sessions","assistant_messages","request_images",
          "request_intake","audit_logs")
def snapshot(name):
    # text serialization avoids relying on column order of Python row objects
    rows = db.execute(f'SELECT * FROM "{name}" ORDER BY 1').fetchall()
    return tuple(tuple(r) for r in rows)

before = {name:snapshot(name) for name in tables}
assert all(before.values()), "El ensayo debe tener datos preexistentes reales (ficticios)."
assert db.execute("PRAGMA foreign_key_check").fetchall() == []

migration(13)
migration(14)
migration(15)
migration(16)
migration(17)
migration(18)
after = {name:snapshot(name) for name in tables}
for name in tables:
    assert before[name] == after[name], f"La migración alteró datos existentes: {name}"

for new_table in ("brigades","brigade_members","brigade_work","request_activities",
                  "commercial_quote_versions","request_financial_declarations","request_payment_reports",
                  "technical_work_reports","service_followup_cases","service_case_notes",
                  "brigade_chief_accounts","brigade_chief_sessions",
                  "brigade_chief_reports","brigade_evidence_images"):
    assert db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
                      (new_table,)).fetchone()[0] == 1

db.execute("""INSERT INTO request_activities(id,request_id,actor_id,activity_type,note,created_at)
              VALUES(?,?,?,?,?,?)""",
           ("activity-new","request-old","staff-old","call",
            "Se confirmó recepción del expediente.","2026-11-13T23:00:00Z"))
db.execute("""INSERT INTO brigades(id,name,leader_name,created_by,created_at,updated_at)
              VALUES(?,?,?,?,?,?)""",
           ("brigade-old","Brigada ficticia","Responsable ficticio","admin-old",
            "2026-11-13T00:00:00Z","2026-11-13T00:00:00Z"))
db.execute("""INSERT INTO brigade_work(id,brigade_id,request_id,title,work_date,
              estimated_minutes,status,requested_by,created_at,updated_at)
              VALUES(?,?,?,?,?,?,?,?,?,?)""",
           ("work-new","brigade-old","request-old","Visita ficticia 360",
            "2026-11-20",240,"scheduled","staff-old",
            "2026-11-13T00:00:00Z","2026-11-13T00:00:00Z"))
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
assert db.execute("SELECT COUNT(*) FROM request_activities WHERE request_id='request-old'").fetchone()[0] == 1
assert db.execute("SELECT COUNT(*) FROM brigade_work WHERE request_id='request-old'").fetchone()[0] == 1

# Con nuevos vínculos, la solicitud original no se puede borrar por error.
try:
    db.execute("DELETE FROM requests WHERE id='request-old'")
    raise AssertionError("Se eliminó una solicitud pese a tener historial.")
except sqlite3.IntegrityError:
    pass
assert db.execute("SELECT COUNT(*) FROM requests WHERE id='request-old'").fetchone()[0] == 1
assert db.execute("PRAGMA foreign_key_check").fetchall() == []

# Las propuestas son INTERNAS, por versiones; no se altera ninguna solicitud.
db.execute("""INSERT INTO commercial_quote_versions(
 id,request_id,version_no,title,currency,items_json,
 subtotal_cents,taxes_cents,freight_cents,discount_cents,total_cents,status,
 created_by,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",(
 "quote-version-old","request-old",1,"Cotización ficticia interna","USD",
 '[{"description":"Panel ficticio","quantity":1,"unit_price_usd_cents":10000,"line_total_usd_cents":10000}]',
 10000,0,0,0,10000,"draft","staff-old",
 "2026-11-13T00:00:00Z","2026-11-13T00:00:00Z"))
try:
    db.execute("UPDATE commercial_quote_versions SET title='Tachado' WHERE id='quote-version-old'")
    raise AssertionError("Se pudo reescribir el contenido de la cotización.")
except sqlite3.IntegrityError:
    pass
try:
    db.execute("DELETE FROM commercial_quote_versions WHERE id='quote-version-old'")
    raise AssertionError("Se pudo borrar la versión histórica.")
except sqlite3.IntegrityError:
    pass
try:
    db.execute("""UPDATE commercial_quote_versions SET status='approved_internal'
              WHERE id='quote-version-old'""")
    raise AssertionError("Se pudo aprobar directamente sin revisión humana.")
except sqlite3.IntegrityError:
    pass
assert db.execute("SELECT title,status FROM commercial_quote_versions WHERE id='quote-version-old'").fetchone() == (
    "Cotización ficticia interna","draft")
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
# Los fondos declarados no se convierten en pagos ni verificaciones.
db.execute("""INSERT INTO request_financial_declarations
 (id,request_id,actor_id,source,funding_stage,approved_funds_declared_cents,
  available_funds_declared_cents,advance_proposed_cents,payment_method,notes,created_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
 ("declaration-old","request-old","staff-old","customer_reported","approval_reported",
  450000,100000,50000,"transfer","Empresa afirma aprobación, sin confirmación.",
  "2026-11-14T00:00:00Z"))
db.execute("""INSERT INTO request_payment_reports(
 id,request_id,reported_by,amount_usd_cents,payment_method,reported_on,
 reference,report_note,verification_status,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,'reported',?,?)""",
 ("payment-old","request-old","staff-old",10000,"transfer","2026-11-14",
  "CI-REF-1234","Cliente informa pago no comprobado.",
  "2026-11-14T00:00:00Z","2026-11-14T00:00:00Z"))
try:
    db.execute("UPDATE request_financial_declarations SET notes='Modificado' WHERE id='declaration-old'")
    raise AssertionError("Se alteró una declaración económica histórica.")
except sqlite3.IntegrityError:
    pass
try:
    db.execute("DELETE FROM request_payment_reports WHERE id='payment-old'")
    raise AssertionError("Se eliminó un reporte de pago histórico.")
except sqlite3.IntegrityError:
    pass
try:
    db.execute("""UPDATE request_payment_reports
                   SET verification_status='verified_manual',reviewed_by='staff-old',
                   reviewed_at='2026-11-14T01:00:00Z',
                   verification_basis='bank_statement',
                   review_note='Examen detallado de la evidencia ficticia.'
                 WHERE id='payment-old'""")
    raise AssertionError("Un operador pudo verificar un pago.")
except sqlite3.IntegrityError:
    pass
try:
    db.execute("""UPDATE request_payment_reports
                   SET verification_status='verified_manual',reviewed_by='admin-old',
                   reviewed_at='2026-11-14T01:00:00Z',
                   review_note='Examen detallado de la evidencia ficticia.'
                 WHERE id='payment-old'""")
    raise AssertionError("Un administrador pudo verificar sin fuente independiente.")
except sqlite3.IntegrityError:
    pass
db.execute("""UPDATE request_payment_reports
                SET verification_status='verified_manual',reviewed_by='admin-old',
                    reviewed_at='2026-11-14T01:00:00Z',
                    verification_basis='bank_statement',
                    review_note='Comprobada evidencia independiente ficticia.',
                    updated_at='2026-11-14T01:00:00Z'
              WHERE id='payment-old'""")
try:
    db.execute("UPDATE request_payment_reports SET verification_status='rejected' WHERE id='payment-old'")
    raise AssertionError("Una segunda revisión pudo sobrescribir la original.")
except sqlite3.IntegrityError:
    pass
assert db.execute("SELECT verification_status FROM request_payment_reports WHERE id='payment-old'").fetchone()[0] == "verified_manual"
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
# Un reporte de ejecución requiere una asignación previa y revisión de dirección.
try:
    db.execute("UPDATE brigade_work SET status='completed' WHERE id='work-new'")
    raise AssertionError("Se pudo cerrar trabajo sin informe técnico aceptado.")
except sqlite3.IntegrityError:
    pass
try:
    db.execute("""INSERT INTO technical_work_reports
      (id,work_id,actor_id,report_type,information_source,summary,
       evidence_note,review_status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)""",
      ("fake-accepted","work-new","staff-old","completion_proposed","staff_observed",
       "Intento de crear directamente un cierre autorizado.",
       "Las evidencias reportadas aún no han sido revisadas por dirección.",
       "accepted","2026-11-14T00:00:00Z"))
    raise AssertionError("Se pudo insertar informe preaprobado sin revisión.")
except sqlite3.IntegrityError:
    pass
db.execute("""INSERT INTO technical_work_reports
  (id,work_id,actor_id,report_type,information_source,summary,evidence_note,review_status,created_at)
  VALUES(?,?,?,?,?,?,?,?,?)""",
 ("technical-old","work-new","staff-old","completion_proposed","chief_relayed",
  "El jefe informa las pruebas ejecutadas y el trabajo presuntamente terminado.",
  "Se documentaron mediciones y controles de instalación para revisión administrativa.",
  "pending_review","2026-11-14T00:00:00Z"))
try:
    db.execute("""UPDATE technical_work_reports SET review_status='accepted',
        reviewed_by='staff-old',reviewed_at='2026-11-14T03:00:00Z',
        review_note='El gestor pretende validar un informe propio.'
        WHERE id='technical-old'""")
    raise AssertionError("Un gestor pudo aceptar el cierre técnico.")
except sqlite3.IntegrityError:
    pass
db.execute("""UPDATE technical_work_reports SET review_status='accepted',
        reviewed_by='admin-old',reviewed_at='2026-11-14T03:00:00Z',
        review_note='Se examinó documentación técnica del trabajo.'
        WHERE id='technical-old'""")
db.execute("UPDATE brigade_work SET status='completed' WHERE id='work-new'")
assert db.execute("SELECT status FROM brigade_work WHERE id='work-new'").fetchone()[0] == 'completed'
try:
    db.execute("UPDATE brigade_work SET status='scheduled' WHERE id='work-new'")
    raise AssertionError("Se reabrió silenciosamente un trabajo completado.")
except sqlite3.IntegrityError:
    pass
try:
    db.execute("DELETE FROM technical_work_reports WHERE id='technical-old'")
    raise AssertionError("Se eliminó el informe técnico ya aprobado.")
except sqlite3.IntegrityError:
    pass

db.execute("""INSERT INTO service_followup_cases(
    id,request_id,work_id,case_type,priority,title,description,warranty_claim_details,
    status,opened_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
 ("warranty-old","request-old","work-new","warranty_claim","high",
  "Reclamación de garantía","Cliente reclama fallo posterior a la visita.",
  "Garantía mencionada pero sin aceptación de cobertura.",
  "open","staff-old","2026-11-14T04:00:00Z","2026-11-14T04:00:00Z"))
try:
    db.execute("""INSERT INTO service_followup_cases(
       id,request_id,case_type,priority,title,description,status,opened_by,
       created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)""",
       ("fake-closed-case","request-old","incident","medium",
        "Caso falsamente cerrado","No se puede crear un caso cerrado de origen.",
        "resolved","staff-old","2026-11-14T04:00:00Z","2026-11-14T04:00:00Z"))
    raise AssertionError("Se creó caso cerrado sin administrador.")
except sqlite3.IntegrityError:
    pass
db.execute("""INSERT INTO service_case_notes(id,case_id,actor_id,note,created_at)
  VALUES(?,?,?,?,?)""",
 ("case-note-old","warranty-old","staff-old",
  "Jefe declara que el equipo será revisado en próxima visita.",
  "2026-11-14T04:10:00Z"))
try:
    db.execute("""UPDATE service_followup_cases SET status='resolved',
      resolved_by='staff-old',resolved_at='2026-11-14T05:00:00Z',
      resolution_note='El gestor no puede cerrar una reclamación.'
      WHERE id='warranty-old'""")
    raise AssertionError("Un gestor pudo resolver un caso de garantía.")
except sqlite3.IntegrityError:
    pass
db.execute("""UPDATE service_followup_cases SET status='resolved',
  resolved_by='admin-old',resolved_at='2026-11-14T05:00:00Z',
  resolution_note='Se revisó el caso y se documentó el seguimiento.',
  updated_at='2026-11-14T05:00:00Z' WHERE id='warranty-old'""")
try:
    db.execute("DELETE FROM service_case_notes WHERE id='case-note-old'")
    raise AssertionError("Se borró una nota histórica de posventa.")
except sqlite3.IntegrityError:
    pass
try:
    db.execute("""INSERT INTO service_case_notes(id,case_id,actor_id,note,created_at)
      VALUES(?,?,?,?,?)""",("fake-note-late","warranty-old","staff-old",
      "No se pueden agregar notas a caso ya cerrado.","2026-11-14T06:00:00Z"))
    raise AssertionError("Se pudo añadir nota a un caso de posventa ya cerrado.")
except sqlite3.IntegrityError:
    pass
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
# Acceso aislado de jefe con vínculo a su brigada y evidencia técnica privada.
db.execute("""INSERT INTO brigade_chief_accounts
 (id,brigade_id,email,password_hash,is_active,created_by,created_at,updated_at)
 VALUES(?,?,?,?,1,?,?,?)""",
 ("chief-old","brigade-old","chief@invalid.example","hash-para-pruebas","admin-old",
  "2026-11-14T08:00:00Z","2026-11-14T08:00:00Z"))
db.execute("""INSERT INTO brigade_chief_sessions
 (id,chief_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)""",
 ("session-chief-old","chief-old","a"*64,"2026-11-14T09:00:00Z","2026-11-14T17:00:00Z"))
try:
    db.execute("""INSERT INTO brigade_chief_reports
      (id,work_id,chief_id,report_type,summary,created_at)
      VALUES(?,?,?,?,?,?)""",
      ("closed-chief-report","work-new","chief-old","progress",
       "No se pueden agregar nuevos informes a un trabajo cerrado.",
       "2026-11-14T09:00:00Z"))
    raise AssertionError("Se informó un trabajo ya finalizado.")
except sqlite3.IntegrityError:
    pass

db.execute("""INSERT INTO brigade_work(id,brigade_id,request_id,title,work_date,
 estimated_minutes,status,requested_by,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?)""",
 ("work-chief-new","brigade-old","request-old","Instalación de prueba del jefe",
  "2026-11-21",180,"scheduled","staff-old",
  "2026-11-14T08:00:00Z","2026-11-14T08:00:00Z"))
db.execute("""INSERT INTO brigade_chief_reports
 (id,work_id,chief_id,report_type,summary,evidence_note,created_at)
 VALUES(?,?,?,?,?,?,?)""",
 ("report-chief-old","work-chief-new","chief-old","progress",
  "El jefe autenticado reporta un avance real de prueba.",
  "Se registraron las comprobaciones técnicas en la inspección.",
  "2026-11-14T09:00:00Z"))
db.execute("""INSERT INTO brigade_evidence_images
 (id,work_id,chief_id,report_id,stage,r2_key,content_type,size_bytes,sha256_hex,created_at)
 VALUES(?,?,?,?,?,?,?,?,?,?)""",
 ("photo-chief-old","work-chief-new","chief-old","report-chief-old","after",
  "technical-evidence/work-chief-new/photo-chief-old.png","image/png",72,"b"*64,
  "2026-11-14T09:00:00Z"))
try:
    db.execute("""UPDATE brigade_evidence_images SET stage='before'
                  WHERE id='photo-chief-old'""")
    raise AssertionError("Se modificó una fotografía histórica.")
except sqlite3.IntegrityError:
    pass
try:
    db.execute("DELETE FROM brigade_evidence_images WHERE id='photo-chief-old'")
    raise AssertionError("Se eliminó el registro de evidencia.")
except sqlite3.IntegrityError:
    pass

db.execute("""INSERT INTO brigades (id,name,leader_name,created_by,created_at,updated_at)
 VALUES(?,?,?,?,?,?)""",
 ("brigade-other","Otra brigada ficticia","Otro jefe ficticio","admin-old",
  "2026-11-14T10:00:00Z","2026-11-14T10:00:00Z"))
db.execute("""INSERT INTO brigade_chief_accounts
 (id,brigade_id,email,password_hash,is_active,created_by,created_at,updated_at)
 VALUES(?,?,?,?,1,?,?,?)""",
 ("chief-other","brigade-other","otherchief@invalid.example","hash-ficticio",
  "admin-old","2026-11-14T10:00:00Z","2026-11-14T10:00:00Z"))
try:
    db.execute("""INSERT INTO brigade_chief_reports
       (id,work_id,chief_id,report_type,summary,created_at)
       VALUES(?,?,?,?,?,?)""",
       ("foreign-report","work-chief-new","chief-other","incident",
        "El jefe de otra brigada no puede firmar este informe.",
        "2026-11-14T11:00:00Z"))
    raise AssertionError("Un jefe accedió al trabajo de otra brigada.")
except sqlite3.IntegrityError:
    pass
try:
    db.execute("""INSERT INTO brigade_evidence_images
       (id,work_id,chief_id,stage,r2_key,content_type,size_bytes,sha256_hex,created_at)
       VALUES(?,?,?,?,?,?,?,?,?)""",
       ("foreign-photo","work-chief-new","chief-other","after",
        "technical-evidence/foreign-photo.png","image/png",72,"c"*64,
        "2026-11-14T11:00:00Z"))
    raise AssertionError("Un jefe pudo agregar foto a trabajo de otra brigada.")
except sqlite3.IntegrityError:
    pass
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
print("PASS migraciones 013-018: preservación histórica, identidad y brigada aislada, token hash y evidencias técnicas inmutables (SQLite ficticia).")
