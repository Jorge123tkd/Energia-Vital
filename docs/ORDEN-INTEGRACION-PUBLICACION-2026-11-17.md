# Orden seguro de integración y publicación — Bonaire Energía Vital
**Fecha:** 17/11/2026. **Estado:** PLAN; ninguna fusión, migración remota ni despliegue autorizado por este documento.
**Regla:** no se publica cada rama de seguridad por separado ni se descarga para usar en Windows. La integración y las pruebas se realizan en GitHub Actions/Cloudflare aislado. No modificar la web ni D1 de producción durante la inspección.

## Inventario verificado — 12 ramas (GitHub)
- **Producción histórica:** `main`. Está muy atrasada respecto al candidato; no desplegar directamente.
- **Rama de desarrollo integral:** `feat/cloudflare-customer-accounts-hardening` (incluye funciones de cuentas, brigadas, expedientes y otros módulos del proyecto).
- **Candidato de lanzamiento:** `release/combined-security-deps-20261117` → [PR #7](https://github.com/Jorge123tkd/Energia-Vital/pull/7).
- **Ramas fuente de dependencias históricas:** `security/hono-4-13-18`, `security/vite-undici-20261116`, `security/combine-pr2-pr3-20261116`, `security/combined-deps-20261116`, `security/combined-deps-reviewed-20261116`, `security/dedupe-svelte-20261116`, `security/triage-residual-audit-20261116`.
- **Ramas fuente de autenticación históricas:** `security/refresh-jti-isolated-20261116`, `security/session-release-candidate-20261117`.
Total: 12. Estas ramas antiguas **NO** deben desplegarse secuencialmente: varias contienen versiones anteriores del mismo lockfile y componentes. PR #4 y PR #6 ya están materializados en PR #7.

## Secuencia obligatoria antes de liberar
| Orden | Fuente | Acción segura | Criterio de aceptación |
|---|---|---|---|
| 1 | `main` | Comparar con desarrollo, no desplegar | Identificar los módulos aún ausentes en la versión pública |
| 2 | `feat/cloudflare-customer-accounts-hardening` | Usar como base integral actual; preservar registros y documentación | Diff revisado; sin perder datos históricos |
| 3 | PR #4 → PR #7 | Verificar paquetes Hono/Vite/Svelte/Undici y lockfile **ya incorporados** | Hashes coincidentes, `npm ci` y `npm audit` validan |
| 4 | PR #6 → PR #7 | Verificar rotación JWT, migración 021, clientes/admin y tests **ya incorporados** | Archivo a archivo y pruebas de autenticación |
| 5 | PR #7 | Verificar mergeabilidad, revisar diff y ejecutar CI en SHA final; no fusionar sin revisión humana | PR sin conflictos y checks PASS; solo candidato |
| 6 | Cloudflare pruebas | Preview aislada de Pages y Worker, con D1/R2 de ensayo sin datos reales | QA funcional y móvil, admin, citas, brigadas y asistente |
| 7 | Producción: solo lectura | Autorizar inventario Worker/Pages/D1/R2, migraciones, bindings y variables sin exponer secretos | Estado real y faltantes confirmados |
| 8 | Producción: resguardo | Backup privado cifrado D1 + R2, ensayar restauración y migraciones en recursos separados | Integridad verificada y rollback definido |
| 9 | Producción: esquema | Autorizar **por separado** las migraciones exactas requeridas hasta 021 según auditoría, previa copia y ensayo | D1 compatible, ningún dato perdido |
| 10 | Producción: web/API | Autorizar release congelado: desplegar Worker, smoke tests, Pages, smoke tests, monitoreo | Operación real comprobada sin incidentes bloqueantes |

## Resultados comprobados
- [PR #7](https://github.com/Jorge123tkd/Energia-Vital/pull/7) quedó `draft=true`; GitHub informó `mergeable=true` al consultar el 17/11/2026 (es un estado dinámico y se debe consultar otra vez antes de fusionar).
- Se compararon directamente los SHA de los archivos de dependencias del PR #4 con el candidato, idénticos, y los del PR #6; solo se añadió en el workflow el gate de `npm audit`.
- `security/session-release-candidate-20261117`: **0 commits ahead / 13 behind** de PR #7 al consultar; todo su historial está contenido en el candidato.
- Las variantes antiguas de dependencias tienen principalmente cambios de `package*.json` y `package-lock.json`, no conviene integrarlas encima del lockfile validado. La rama de triage añade un workflow temporal; no pasar a producción por defecto.
- Última CI conocida antes de este documento: [44116004704](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44116004704) SUCCESS. Tras cualquier modificación de PR #7, verificar nuevo SHA.
- Los controles de lanzamiento siguen marcados **NO-GO**: error 401 de admin real, revisión de fotografías/consentimiento, QA web/móvil, WAF, esquema D1/R2 real, backups y restauración, aprobación de migraciones y despliegue.

## Instrucciones para evitar perder arreglos
1. **No fusionar PR #2, #3, #4, #5, #6 uno por uno hacia `main`**; se duplicarían y podrían degradarse cambios. PR #5 está cerrado sin merge y PR #7 consolida PR #4 + PR #6.
2. No reusar commits aislados de ramas `security/*` sin comprobar su contenido contra PR #7.
3. Antes de integrar a `main`, partir de la versión integral de desarrollo: no reemplazar `main` con `git reset --hard` ni forzar referencias.
4. Congelar SHA y verificar que tanto el Worker como Pages apuntan al mismo release aprobado. Variables `VITE_API_URL` / `SITE_URL` y secrets deben configurarse fuera del código.
5. Nunca dar por aplicado D1 021 por ver el archivo SQL en GitHub. Un deploy sin esquema actualizado podría fallar.
6. Registrar cada cambio de estado en `docs/CONTINUIDAD.md` y `docs/PLAN-MAESTRO-BONAIRE.md`.

## Próxima decisión
Autorizar **únicamente** la verificación remota de Cloudflare de solo lectura y configurar un preview aislado, sin tocar `main`, D1 de producción ni dominios públicos. La publicación real requiere otra aprobación tras QA, respaldo/restauración y pruebas satisfactorias.
