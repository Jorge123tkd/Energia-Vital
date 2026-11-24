# Bonaire — plan de producción por fases (24/11/2026)

Este documento distingue la **web pública (Pages)**, la **API comercial (Worker)**, la **D1 comercial** y **EV Pro Studio**. El código de la rama única es `feat/cloudflare-customer-accounts-hardening`; la rama productiva de **Cloudflare Pages Direct Upload** es `main`. No confundir ambas ni crear otra rama.

## Actualización verificada: 24 de noviembre de 2026

**Fase 1 confirmada:** Cloudflare Pages publicó correctamente en el dominio bnergiv.com. La sesión administrativa y navegación a `/admin/citas` fueron comprobadas por el operador; GitHub Actions confirmó cinco rutas HTTPS esperadas. El puente Studio está protegido con 401 JSON y su interfaz continúa desactivada.

**Fase 2 completada:** El operador ejecutó `powershell -NoProfile -File scripts/migrar-bonaire-025-028.ps1 -Aplicar`, escribió la confirmación explícita y Wrangler aplicó exclusivamente `025_warehouse_ledger.sql`, `026_warehouse_brigade_links.sql`, `027_procurement.sql` y `028_business_finance.sql` sobre la D1 **producción `energia-vital-db`**. Las cuatro terminaron con marca de éxito y el script comprobó `[OK] D1 produccion 28/28`. QA ya estaba en 28/28. Esta ejecución **no desplegó Worker, Pages ni modificó R2**. No repetir la migración.

**Siguiente fase 3:** Solo resta actualizar el Worker comercial `energia-vital-api` con el comando `scripts/publicar-solo-worker-bonaire.ps1 -Publicar`. El script vuelve a comprobar la D1 productiva 28/28 y las tablas nuevas, solicita confirmación y despliega solo Worker; verifica `/health` después. No volver a publicar Pages ni crear nuevos respaldos como requisito de esa fase. El respaldo cifrado local preexistente sigue siendo el único adicional comprobado; no es independiente del SSD.

**Studio 3.9:** sigue como fase separada, no se activa automáticamente con la nueva D1 comercial ni con el despliegue del Worker comercial.

### Orden posterior a esta actualización
1. Ejecutar `git pull --ff-only origin feat/cloudflare-customer-accounts-hardening`.
2. Ejecutar `powershell -NoProfile -File scripts/publicar-solo-worker-bonaire.ps1 -Publicar` y confirmar `PUBLICAR_SOLO_WORKER_BONAIRE` solo si el estado D1 28/28 y los recursos mostrados son correctos.
3. Confirmar `[OK] Worker API desplegado y /health responde 200 JSON`; después probar los módulos empresariales desde una sesión administrativa autorizada.
4. Mantener EV Pro Studio apagado hasta terminar sus pruebas y configuración propias.

**Nota histórica:** Las secciones más abajo que hablan de D1 producción 24/24 documentan el estado *anterior* a la migración; no representan el estado vigente.

## Estado confirmado
- **CI de Bonaire:** el commit `cea34e1` pasó todas las comprobaciones antes de preparar este plan. Los commits posteriores deben superar CI nuevamente.
- **D1 Bonaire QA:** `energia-vital-qa-db` migrada de 021 a **028/028** por el operador; las migraciones 022-028 terminaron OK y se leyó 28/28.
- **D1 Bonaire producción:** última lectura remota confirmada por el operador **24/24**; no se han aplicado las cuatro migraciones nuevas.
- **Respaldo Bonaire:** existe una exportación D1 de 24/24 cifrada y restaurada con éxito en memoria. La copia adicional está en el SSD interno. No hay copia independiente comprobada, y el operador decidió **aplazar** esa operación. No generar nuevos respaldos ni obligar a USB en la primera fase.
- **Pages:** la versión publicada anteriormente respondía `200 text/html` a `/api/studio/v1/me` y `/api/studio/native/v1/me`; la nueva rama sí contiene el puente, `_routes.json` y `STUDIO_API`.
- **Studio 3.9:** UI deliberadamente inactiva por defecto (`VITE_STUDIO_UI_ENABLED='false'`); la integración Studio no implica activación del Worker Studio.

## Fase 1 — Página pública y puente Studio (sin migración ni Worker)
Puede hacerse con **D1 24/24**: la pantalla Studio sigue oculta incluso por enlace directo; Pages Functions agregan rutas protegidas, pero no ejecutan operaciones comerciales sobre las tablas nuevas.

Desde CMD, una vez aprobado el commit por CI:

    cd /d "C:\Users\Taliety\Desktop\Energia-Vital"
    git pull --ff-only origin feat/cloudflare-customer-accounts-hardening
    powershell -NoProfile -File scripts\pages-publicacion-controlada.ps1
    powershell -NoProfile -File scripts\pages-publicacion-controlada.ps1 -Publicar -Confirmacion PUBLICAR_SOLO_PAGES_BONAIRE

El publicador **solo** llama `wrangler pages deploy dist --project-name energia-vital-web --branch main`. No ejecuta `d1 migrations apply` ni `wrangler deploy`. Hace build con `VITE_STUDIO_UI_ENABLED=false`, comprueba las Pages Functions, `_routes.json`, hashes y, tras publicar, verifica dos rutas Studio 401 JSON sin token, sesión administrativa 401 sin cookie, inicio 200 y acceso directo /admin/citas 200. También se debe comprobar manualmente el login /admin, "mantener sesión", recarga en citas y cierre de sesión. Cualquier error posterior al despliegue requiere inspección y posible rollback del despliegue Pages; no hay reversión automática.

**No exigir otro respaldo para esta fase**: no modifica D1 ni R2; es una publicación de código web reversible.

## Fase 2 — Esquema comercial 025-028 (solo cuando se decida actualizar almacén/finanzas)
Preparado `scripts/migrar-bonaire-025-028.ps1`. **Modo por defecto** consulta en lectura el estado de D1 QA 28/28, producción 24/24 y el SHA-256 de la copia cifrada 24/24 ya existente. No crea respaldos.

    powershell -NoProfile -File scripts\migrar-bonaire-025-028.ps1

`-Aplicar` solicita en CMD la confirmación **MIGRAR_BONAIRE_025_028_CON_COPIA_LOCAL** y después aplica `d1 migrations apply` *solo a* `energia-vital-db`. Es una mutación real de producción y puede haber interrupción. La copia cifrada en el **mismo SSD** no cubre fallo físico ni pérdida del equipo. Si la política de riesgo del propietario cambia, conviene copiarla fuera antes; **no afirmar que ya existe un respaldo independiente**. Ante fallo o aplicación parcial, no repetir el comando a ciegas.

## Fase 3 — API comercial actualizada (sin republicar Pages)
Una vez que D1 comercial registre **28/28** y existan las tablas warehouse_items, warehouse_project_links, procurement_orders y business_obligations, usar `scripts/publicar-solo-worker-bonaire.ps1`. El modo sin parámetros es lectura. La variante `-Publicar` pide confirmación interactiva `PUBLICAR_SOLO_WORKER_BONAIRE`; publica únicamente `energia-vital-api` y prueba /health 200 JSON. No toca D1, Pages ni R2.

## Fase 4 — EV Pro Studio completo (independiente)
No se activa con las fases anteriores. En la última comprobación de Studio, su D1 productiva aún necesitaba migraciones 0002–0005 (13/29 objetos frente a QA 29/29), respaldo independiente, secretos oficiales, controles de bootstrap y ensayos reales de Windows. Mantener su Worker/feature gates cerrados y los enlaces UI ocultos hasta superar esas condiciones.

**No dar por hecha la publicación solo por commits o CI:** confirmar el resultado de las rutas HTTPS después de cada despliegue.
