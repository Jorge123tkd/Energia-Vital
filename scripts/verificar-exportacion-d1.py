#!/usr/bin/env python3
"""Restore a private Wrangler D1 SQL export only in memory; no network or file output."""
import sqlite3
import sys

def main():
    raw = sys.stdin.buffer.read()
    if len(raw) < 100 or len(raw) > 256 * 1024 * 1024:
        raise ValueError("SQL fuera de rango")
    db = sqlite3.connect(":memory:")
    db.executescript(raw.decode("utf-8-sig"))
    db.execute("PRAGMA foreign_keys=ON")
    if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
        raise ValueError("SQLite quick_check")
    if db.execute("PRAGMA foreign_key_check").fetchall():
        raise ValueError("SQLite foreign_key_check")
    count, last = db.execute("SELECT COUNT(*), COALESCE(MAX(id),0) FROM d1_migrations").fetchone()
    if (count, last) != (24, 24):
        raise ValueError("Historial D1 original distinto de 24/24")
    for name in ("admin_users", "requests", "customers", "auth_sessions", "products"):
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone():
            raise ValueError("Falta tabla comercial basica")
    print("[OK] Exportacion SQL restaurada en memoria: 24/24, quick_check y claves foraneas correctas")

try:
    main()
except Exception:
    print("[BLOQUEADO] No fue posible restaurar/verificar el SQL en memoria; no migrar", file=sys.stderr)
    sys.exit(1)
