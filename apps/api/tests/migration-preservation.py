#!/usr/bin/env python3
"""Bonaire: ensayo REPRODUCIBLE con registros FICTICIOS de una D1 histórica.

Ejecuta 001..012, inserta datos relacionados (sin datos de producción),
aplica 013 y 014, compara cada fila histórica y comprueba referencias.
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
after = {name:snapshot(name) for name in tables}
for name in tables:
    assert before[name] == after[name], f"La migración alteró datos existentes: {name}"

for new_table in ("brigades","brigade_members","brigade_work","request_activities"):
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
print("PASS migraciones 013+014: preservados 9 conjuntos históricos, FKs y enlaces nuevos (SQLite ficticia).")
