# Auditoría de ramas antes de publicar — 17/11/2026

**Estado:** Comparación de código completada en GitHub; **NO-GO** de producción hasta QA y autorizaciones. No se han fusionado ramas, desplegado servicios ni consultado D1 real.

## Rama candidata
`release/combined-security-deps-20261117` — [PR #7](https://github.com/Jorge123tkd/Energia-Vital/pull/7), DRAFT.

## Inventario exhaustivo obtenido de GitHub
En el momento de la consulta se encontraron **12 ramas**; paginación adicional agotada:
- `main`
- `feat/cloudflare-customer-accounts-hardening`
- `release/combined-security-deps-20261117`
- `security/combine-pr2-pr3-20261116`
- `security/combined-deps-20261116`
- `security/combined-deps-reviewed-20261116`
- `security/dedupe-svelte-20261116`
- `security/hono-4-13-18`
- `security/refresh-jti-isolated-20261116`
- `security/session-release-candidate-20261117`
- `security/triage-residual-audit-20261116`
- `security/vite-undici-20261116`

## Verificación por contenido, no por nombre o historial
- Se compararon los SHA de contenido de **13 archivos** del PR #5 histórico con PR #7, con coincidencia exacta; el archivo 14, `.github/workflows/deploy.yml`, solo difiere por un **bloque adicional** de verificación de `npm audit`. Al quitar de la versión candidata ese bloque, el contenido resulta **idéntico byte a byte** al origen.
- Los **4 archivos de dependencias** de PR #4, referencia commit `ce8d32c0d7313d16059ae5466e8a40a178e1bd34`, tienen SHA de contenido idéntico en PR #7: `apps/api/package.json`, `apps/web/package.json`, `package.json`, `package-lock.json`.
- PR #7 añade `apps/api/tests/release-dependency-audit.cjs` y `apps/api/tests/release-dependency-audit.test.cjs`. Su CI combinado [44108052050](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44108052050) terminó SUCCESS sin despliegues.
- Las demás ramas `security/*` consultadas tienen diferencias relativas al candidato concentradas en versiones antiguas de paquetes/lockfile y, en la rama `triage`, herramientas temporales de auditoría. **No se incorporan automáticamente versiones obsoletas ni workflows temporales que escriben en el repositorio.** La matriz no significa que todos los commits históricos deban integrarse por separado.
- La rama `security/session-release-candidate-20261117` queda completamente contenida en PR #7: comparación **0 commits ahead / 7 behind**.
- La rama `feat/cloudflare-customer-accounts-hardening` aporta cambios documentales posteriores al punto de bifurcación; no modificar ni sobrescribir docs actuales cuando se prepare merge.
- La rama `main` está muy atrasada respecto al candidato (**0 ahead / 710 behind** según compare en ese momento). **No asumir que `main` incluye la plataforma ni publicarla directamente.**

## Puertas para evitar perder arreglos
1. PR #7 es la **única fuente candidata de código de lanzamiento**; usar las ramas antiguas como histórico y evidencia.
2. Antes de promover a la rama definitiva, comprobar nuevamente `compare_commits` contra desarrollo y contra `main`, revisar todos los archivos y obtener aprobación humana del diff.
3. Verificar que el workflow de Pages realmente publica el SHA aprobado y que `VITE_API_URL` apunta al Worker autorizado. No confundir un entorno de preview con producción.
4. Repetir CI de seguridad, integraciones Worker+D1 y auditoría npm sobre el SHA congelado (la CI del PR #7 no reemplaza QA real).
5. Mantener bloqueo por 401 admin, WAF/Turnstile, consentimiento/privacidad de fotos, inventario remoto, backups, restauración y migraciones autorizadas.
6. Nunca ejecutar `merge`, `wrangler deploy`, `pages deploy` o migraciones remotas por una petición general de continuidad.

## Conclusión
**No se detectó pérdida de los arreglos que componen PR #4 y PR #6 en el candidato PR #7.** Las ramas antiguas de seguridad son variantes históricas, pero quedan pendientes revisión funcional real y la integración correcta hacia `main`. Este control debe repetirse al congelar SHA de producción.
