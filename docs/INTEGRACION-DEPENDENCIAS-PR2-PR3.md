# Integración controlada de parches npm — PR #2 y PR #3


## Actualización confirmada — 16 de noviembre de 2026: integración lograda en PR #4

**ESTADO ACTUAL: candidato conjunto validado en CI y PR borrador [#4](https://github.com/Jorge123tkd/Energia-Vital/pull/4); NO fusionado ni desplegado.** El texto posterior sobre bloqueos anteriores queda como histórico, no como estado vigente.

- Se creó `security/combine-pr2-pr3-20261116` **desde el parche Hono 4.13.18 del PR #2**, para conservar su lockfile coherente. Después npm instaló Vite y el plugin Svelte compatibles y un override seguro `undici: ^7.30.1`; se utilizó instalación npm completa, no solo `--package-lock-only`.
- El [run 43943927309](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43943927309) terminó **SUCCESS**: `npm ci`, comprobación estricta de versiones/integridad, auditoría, TypeScript API/Svelte, build web, preservación de migraciones ficticias e integración Worker/D1 de CI.
- **Versiones verificadas:** Hono 4.13.18, Vite 6.4.6, plugin Svelte 5.1.1 y Undici 7.30.2. `npm audit`: **0 críticas, 0 altas, 1 moderada, 3 bajas**. El lockfile de los cuatro paquetes conserva campos `resolved` e `integrity` generados por npm.
- El bot guardó dependencias en commit `a1ea3f9a`; se retiraron el workflow temporal con escritura y su disparador. El PR #4, basado en la rama feature, contiene **solo cuatro archivos**: `apps/api/package.json`, `apps/web/package.json`, `package.json` y `package-lock.json`. GitHub muestra el PR como **DRAFT, OPEN y no fusionado**.
- **Pendientes:** revisión humana del PR combinado y alertas npm moderada/bajas; pruebas manuales de la web en móviles/navegadores, WAF, 401 de administración real y políticas de fotos/ICC; además, todos los requisitos de respaldo/migración para publicación. No interpretar CI verde como autorización de fusionar o publicar.


**Fecha:** 16 de noviembre de 2026. **Estado:** PENDIENTE; no hay parche combinado aprobado. **Ámbito:** rama de trabajo `feat/cloudflare-customer-accounts-hardening`; nunca afecta a `main` ni a Cloudflare real.

## Parches independientes validados

| PR | Candidato | Prueba aislada | Estado |
| --- | --- | --- | --- |
| [#2](https://github.com/Jorge123tkd/Energia-Vital/pull/2) | Hono 4.13.18 | [43813010675](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43813010675) SUCCESS | DRAFT, no fusionado |
| [#3](https://github.com/Jorge123tkd/Energia-Vital/pull/3) | Vite 6.4.6, plugin Svelte 5.1.1, Undici 7.30.2 | [43815249208](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43815249208) SUCCESS | DRAFT, no fusionado |

**Importante:** el éxito individual no significa éxito conjunto. Los dos parches cambian `package-lock.json` y npm resuelve árboles de paquetes diferentes.

## Hallazgo de integración — bloqueo comprobado

- Rama de ensayo `security/combined-deps-20261116` desde la rama principal: workflow [43816970124](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43816970124) falló el control del lockfile antes de `npm ci`: npm seguía resolviendo Hono 4.13.13 en `apps/api/node_modules/hono` sin campo `integrity` en el lockfile, a pesar de solicitar 4.13.18. La verificación de [43817083927](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43817083927) confirmó la versión observada. **No se guardó parche combinado.**
- Segunda rama de ensayo `security/combined-deps-reviewed-20261116` parte del candidato validado Vite/Undici: [43817336355](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43817336355) mostró la misma versión Hono 4.13.13 anidada al usar `npm install --package-lock-only`.
- El candidato Hono aislado de PR #2, en cambio, contiene Hono 4.13.18 en `node_modules/hono` con `integrity` auténtica generada por npm; PR #3 conserva el Hono viejo en `apps/api/node_modules/hono`. **No copiar campos integrity entre lockfiles ni declarar una actualización efectiva que no aparezca en el árbol resuelto.**
- Las ramas de ensayo fallidas no aportaron cambios de dependencias. Sus workflows temporales con permisos de escritura y archivos activadores fueron **retirados** para no dejar automatizaciones de mantenimiento activas. No se abrió ni fusionó un PR combinado.

## Procedimiento pendiente de integración, solo en GitHub Actions

1. Preparar una **nueva rama aislada** a partir del candidato Vite/Undici que ya pasó CI, sin fusionar PR #2 o #3.
2. En un runner temporal con Node 22 y npm controlado, instalar **realmente** Hono 4.13.18 en el workspace API; evitar depender solo de `--package-lock-only` si retiene el paquete previo. Regenerar lockfile completo **exclusivamente mediante npm**, sin editar `resolved`/`integrity` a mano, y mantener Vite 6.4.6, plugin Svelte 5.1.1 y Undici 7.30.1+ dentro de versión principal 7.
3. Verificar que **todas** las entradas Hono del `package-lock.json` sean 4.13.18 con integridad de registro; las entradas Vite/Undici y sus manifiestos deben permanecer en los rangos autorizados. Rechazar duplicados inseguros o configuraciones ajenas al cambio.
4. Ejecutar `npm ci`, `npm audit --json`, typecheck API, typecheck Svelte, build de web, preservación de migraciones ficticias e integración Worker+D1 temporal. **No aprobar si hay alertas altas/críticas o vuelven a aparecer avisos de Hono/Vite/Undici.** Clasificar alertas restantes.
5. Revisar el diff final de los **cuatro archivos de dependencias** (`package.json`, `apps/api/package.json`, `apps/web/package.json`, `package-lock.json`). Crear PR **borrador** solo si todas las pruebas combinadas pasan; retirando cualquier workflow temporal de escritura.
6. Realizar revisión humana del PR combinado, comprobar UI móvil/desktop, seguridad WAF, permisos y 401 administrativo histórico antes de decidir si se fusiona con la rama de trabajo. La publicación real exige el resto de los siete hitos, respaldo privado D1/R2 y autorización separada.

## Lo que NO se ha realizado

No se ha fusionado ningún PR de dependencias; no se han aplicado migraciones a D1 remota, exportaciones/restauraciones, modificaciones de R2, despliegues de Worker/Pages, restablecimientos de contraseñas ni acceso al ordenador del propietario.

**Siguiente acción técnica:** resolver la actualización de Hono anidado con un lockfile npm reproducible en un entorno de CI autorizado. Hasta entonces, PR #2 y #3 siguen siendo propuestas separadas.
