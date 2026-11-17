# Bonaire — revisión de acceso y autenticación antes de publicación (etapa 2/7)

**Fecha:** 15 de noviembre de 2026. **Estado: EN PROCESO.** No constituye autorización para producción.
Rama: `feat/cloudflare-customer-accounts-hardening`. Pruebas sobre Worker, D1 y R2 de CI **aislados**.


## 16/11/2026 — Tokens renovados con rol vigente de D1

- **Antes:** `POST /api/auth/refresh` verificaba firma, tipo refresh, sesión activa y cuenta activa, pero generaba tokens nuevos con el `role` **almacenado en el refresh token antiguo**. Ese claim podía estar desactualizado ante cambios de rol realizados por vías externas al endpoint de administración (las rutas normales ya revocan sesiones).
- **Ahora:** si `type=admin`, consulta en D1 `admin_users.role` y exige cuenta activa con rol `admin` u `operator` antes de firmar tokens nuevos. Si `type=customer`, exige cliente activo y fija el rol canónico `customer`. Ante cuenta desactivada/sin permiso devuelve 403; mantiene rechazo de sesión revocada/tipo incorrecto con 401. No cambia duración de sesiones ni firmas JWT.
- Nuevas pruebas Worker+D1 aisladas comprueban renovación de admin/operador/cliente, separación de acceso vs refresh, bloqueo de permisos admin para operador/cliente, y revocación tras logout incluso de tokens generados previamente mediante refresh.
- **Resultado:** GitHub Actions [44008224028](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44008224028), [44008223971](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44008223971) y [44008216502](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44008216502), los tres SUCCESS sobre SHA `8959a8a1`; API, Svelte, compilación, preservación de migraciones 013-020 e integración Worker+D1 ficticios PASS. `deploy-api` y `deploy-web` omitidos.
- **Límite de esta mejora:** no implementa rotación de refresh tokens de un solo uso, que requiere una decisión separada sobre compatibilidad entre pestañas/dispositivos y riesgos de reutilización. No constituye verificación de sesiones reales ni corrige 401 de administración de producción. Etapa 2/7 permanece abierta.

## 16/11/2026 — Contraseña de cliente y cierre transaccional de otras sesiones

- Se detectó que `PUT /api/auth/password` actualizaba `customers.password_hash` y después revocaba `auth_sessions` con dos operaciones independientes. Ante un fallo de la segunda, podrían permanecer sesiones ajenas activas tras el cambio.
- La ruta ahora ejecuta `UPDATE customers ... WHERE password_hash = ? AND is_active = 1` y revocación de otras sesiones en **un único `D1.batch` transaccional**, comprobando que el hash anterior coincide para impedir sobrescrituras silenciosas entre cambios concurrentes. La revocación exige que el nuevo hash realmente quede aplicado. Si no se confirmó el cambio devuelve **409 controlado**.
- Conserva la sesión del cliente que cambia la contraseña, como antes, pero revoca los accesos y tokens de renovación de los demás dispositivos. Rechaza claves actuales incorrectas sin alterar sesiones.
- Pruebas Worker+D1 con identidades ficticias: segunda sesión previamente válida, clave actual incorrecta no afecta la sesión, cambio válido permite seguir al dispositivo actual, revoca el token de acceso y refresh del segundo dispositivo, rechaza clave antigua y acepta la nueva. GitHub Actions [44006778238](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44006778238), [44006778251](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44006778251) y [44006769880](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44006769880) **SUCCESS** en commit `559d48b0`; trabajos de despliegue omitidos.
- **No se ensayaron cuentas reales** ni se realizaron resets de contraseñas en producción. Etapa 2/7 continúa abierta por QA móvil, WAF/Turnstile, error 401 real de administración y aprobación de privacidad de fotos.

## 16/11/2026 — Configuración inicial de administrador atómica

- Se detectó que `POST /api/auth/setup` hacía `SELECT id FROM admin_users LIMIT 1` antes de insertar: dos solicitudes simultáneas con la clave de configuración y correos distintos podían superar la lectura por separado.
- `apps/api/src/routes/auth.ts` ahora crea el primer administrador con un único `INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM admin_users)`; si no se insertó una fila, devuelve HTTP 409 controlado. Se conservan validaciones de clave de setup, correo, contraseña y límite de intentos. **No modifica cuentas existentes**.
- `apps/api/tests/integration.cjs` lanza **dos setups concurrentes con correos distintos** en Worker/D1 ficticios; exige una única respuesta 201, una respuesta 409, exactamente una cuenta inicial y un nuevo setup posterior rechazado incluso con clave válida.
- **Validado:** [run 43953733232](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43953733232), [43953733227](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43953733227) y [43953722008](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43953722008) SUCCESS sobre commit `732e043c`. Despliegues omitidos.
- El setup **no** permite recuperar contraseñas de administradores existentes y **no resuelve** el 401 histórico de producción. Sigue pendiente revisar acceso real bajo autorización y WAF/Turnstile, sin divulgar la clave de configuración.

## 16/11/2026 — Protección de entradas y permisos en citas privadas

- `apps/api/src/routes/private.ts` (commit `024787841`) ahora rechaza cuerpos JSON malformados, `null`, arreglos y fechas no textuales en `POST /api/private/appointments` con **400 controlado**, en vez de generar un error interno 500. Se limita además a 64 caracteres el texto de cada fecha antes de parsearlo. El motor mantiene su regla de solapamiento de citas y máximo 4 horas.
- El mismo cambio impide aceptar arreglos JSON como solicitudes en `POST /api/private/requests`, devolviendo 400 sin crear registros.
- `apps/api/tests/integration.cjs` (commit `d0fce7db`) incorpora pruebas HTTP de entradas inválidas y acceso: token de administrador en cita exclusiva de cliente **401**, anónimo consultando citas **401**, y rechazo de JSON malformado, `null`, arreglos, fechas numéricas y datos incompletos.
- GitHub Actions [43949536145](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43949536145) **SUCCESS**: pruebas aisladas API/web/Worker+D1; `deploy-api` y `deploy-web` **skipped**. La validación de rama se comprueba por separado. No hubo consultas a datos reales.
- Esta mejora NO resuelve el 401 histórico del administrador de producción, no constituye una auditoría WAF ni cierra la etapa 2/7. Permanecen las siete etapas de salida hasta cumplir todos los controles humanos y remotos autorizados.


## 16-11-2026: último administrador protegido en D1 (CI, sin producción)

La nueva migración `020_last_admin_guard.sql` incorpora triggers para impedir atómicamente que el último administrador activo sea degradado, desactivado o eliminado. Los cambios de rol, revocación de sesiones y auditoría de personal ahora comparten un lote transaccional D1. La API devuelve 409 ante la protección SQL y rechaza arrays en edición de roles.

Pruebas con datos ficticios: migraciones 013-020, promoción y degradación de gestor, revocación inmediata de access/refresh y bloqueo de cuentas desactivadas. GitHub Actions `43951639834`, `43951639831` y `43951626221`: SUCCESS sobre commit `4c0f6ec0`; despliegues omitidos.

**Pendiente:** aplicación remota de 020 solo tras auditoría de esquema, respaldo, ensayo de restauración y autorización específica. El 401 real del administrador, WAF, QA móvil y fotos consentidas siguen sin verificarse.

## Estado actual de dependencias del PR #4 — 16/11/2026

- La auditoría residual [43945487649](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43945487649) confirmó **0 alertas de producción** en `npm audit --omit=dev` y cuatro avisos de desarrollo (Svelte moderado y tres bajos por cadena plugin Svelte/inspector/`deepmerge`).
- El ensayo `npm dedupe` [43946090393](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43946090393) terminó **SUCCESS** con Svelte **5.57.3 único**, sin Svelte 4 y sin alertas altas/críticas/moderadas en la auditoría total. Permanecen **tres bajas**, sin arreglo automático de npm. Pasaron `npm ci`, typecheck API/Svelte, build, migraciones de prueba y Worker+D1 de integración.
- El lockfile validado se aplicó directamente al mismo [PR #4 borrador](https://github.com/Jorge123tkd/Energia-Vital/pull/4), commit `ce8d32c0`; **no hay merge ni despliegue**. La validación no demuestra seguridad completa ni resuelve WAF, 401 de admin real, fotos consentidas/ICC o privacidad de clientes.
- Para próximos cambios, evaluar las alertas bajas según su ruta de ejecución efectiva y esperar una actualización compatible; no usar `npm audit fix --force` ni alterar manualmente campos `integrity`. Los conteos anteriores de 1 moderada+3 bajas corresponden a la versión de PR #4 *anterior* a deduplicar Svelte.

## Resultado de la revisión de código
## Integración de actualizaciones de dependencias — 16-11-2026

El [PR #4 borrador](https://github.com/Jorge123tkd/Energia-Vital/pull/4) **ya reúne** Hono 4.13.18 + Vite 6.4.6 + plugin Svelte 5.1.1 + Undici 7.30.2, con lockfile npm reproducible y pruebas completas en [Actions 43943927309](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43943927309), SUCCESS. `npm audit` del candidato: **0 críticas, 0 altas, 1 moderada y 3 bajas**. Los workflows temporales con escritura han sido retirados; el PR contiene exclusivamente cuatro archivos de dependencias. **No está fusionado ni desplegado.**

Los registros anteriores de fallos de integración corresponden a ensayos previos y no describen el estado actual. Se requiere revisar el PR final, realizar QA en móviles, atender alertas residuales, WAF, acceso administrativo real y demás criterios de seguridad antes de cerrar etapa 2. [Procedimiento e historia](./INTEGRACION-DEPENDENCIAS-PR2-PR3.md).


- Las rutas de autenticación de administrador, cliente y acceso unificado deben validar que el cuerpo JSON es un **objeto**. JSON vacío, inválido, nulo, arreglo o primitivo no puede causar una respuesta HTTP 500 por acceder a propiedades de un valor no válido.
- `/api/auth/login`, `/api/auth/sign-in` y `/api/auth/customer/login` devuelven **401 genérico** ante credenciales o estructura inválida; no revelan si existe un correo.
- `/api/auth/refresh` devuelve **401** con token inválido; `/api/auth/me` (PUT), `/api/auth/password` y `/api/auth/setup` devuelven **400** por cuerpos inválidos cuando se supera la barrera de autorización.
- `/api/auth/setup` requiere secreto configurado y solo funciona sin cuentas de administrador previas: no es herramienta de restablecimiento de contraseñas existentes.
- Las pruebas automáticas crean **solo identidades ficticias** en la D1 temporal y ejercitan PBKDF2, JWT/sesiones, permisos y revocaciones. No afirman que las contraseñas existentes en producción sean correctas.

## Seguimiento 15-11-2026: límites concurrentes y dependencias npm

- **Límite de intentos:** `apps/api/src/rate-limit.ts` ahora usa `INSERT ... ON CONFLICT ... RETURNING hits` sobre D1, que incrementa y lee el mismo contador de modo atómico, en lugar de un `INSERT` y `SELECT` separados. Se ensayaron solicitudes de login concurrentes en CI: el presupuesto de diez solicitudes de `admin_login` termina en 429; un intento con contraseña correcta tampoco elude el bloqueo de IP. GitHub Actions de commit `960d9803`: validaciones SUCCESS. No probado frente a Cloudflare real ni WAF configurado.
- **Límite actual:** los presupuestos de `admin_login`, `site_login` y `customer_login` son independientes por ruta. Es necesario evaluar WAF/Turnstile/limitación perimetral contra ataques distribuidos y evitar que un único encabezado ausente agrupe usuarios legítimos como `unknown`. El contador `rate_buckets` conserva filas históricas sin purga automatizada; preparar política de vencimiento y ensayo aislado antes de cambiar retención en D1 real.
- **Auditoría npm automatizada, informativa:** se ejecutan `npm audit --omit=dev --json` y `npm audit --json` en GitHub Actions sin registrar respuestas completas ni secretos. Resultado del primer análisis, SHA `56f06393` (registro GitHub): dependencias de ejecución **0 críticas, 0 altas, 1 moderada, 0 bajas**; todas las dependencias (incluye desarrollo) **0 críticas, 2 altas, 7 moderadas, 1 baja**. Se añadió una vista de paquetes públicos afectados para priorizar revisiones sin mostrar tokens ni configuraciones.
- **NO son cero riesgos:** el comando devuelve advertencias informativas, no bloquea las pruebas ni despliegues. Las dos alertas altas del conjunto completo y la moderada de producción necesitan triage por paquete, ruta de dependencia y versión de solución. No ejecutar `npm audit fix --force` ni cambiar versiones principales a ciegas.
- **Estado:** etapa 2/7 sigue abierta: faltan revisión efectiva de WAF/Turnstile, QA real en dispositivos, prueba autorizada del 401 del admin de producción y resolución/aprobación de incidencias de dependencias.

## Triage npm con nombres verificados en CI (15-11-2026)

El run aislado `43782068148` muestra los paquetes del reporte de seguridad sin imprimir credenciales ni salida bruta de npm:

| Prioridad | Paquete | Alcance | `npm audit` indica |
| --- | --- | --- | --- |
| Moderada | `hono` | Dependencia **directa de producción** (API) | Corrección automática compatible disponible, pendiente de ensayo/actualización de lockfile |
| Alta | `undici` | Dependencia **transitiva de desarrollo** | Corrección disponible, revisar cadena `wrangler`/`miniflare` antes de actualizar |
| Alta | `vite` | Dependencia **directa de desarrollo** (frontend) | Sin corrección automática reportada por npm; requiere evaluar versiones y compatibilidad |
| Moderadas | `@sveltejs/vite-plugin-svelte`, `@sveltejs/vite-plugin-svelte-inspector`, `esbuild` | Herramientas frontend | Sin corrección automática reportada |
| Moderadas | `miniflare`, `svelte`, `wrangler` | Desarrollo y entorno de compilación | Corrección disponible según npm |

**Acción recomendada antes de release:** comenzar por `hono` (alerta de producción) y, en una rama/PR aislado, regenerar lockfile mediante `npm install` controlado, pasar todas las pruebas de API y web; después tratar `undici`/`wrangler` y cadena `vite`/Svelte de forma coordinada. No editar versiones de lockfile sin regenerar integridad ni usar `npm audit fix --force` en una rama de producción.

La auditoría es una instantánea de GitHub Actions; las alertas y soluciones pueden cambiar con el tiempo. **No se han corregido todavía estos paquetes en el repositorio.**

## Parche Hono preparado en PR separado — 16-11-2026

- **Hallazgo de producción:** `hono` 4.13.13 estaba sujeto a una alerta moderada. La versión de parche `4.13.18` está disponible.
- **PR borrador de seguridad:** [#2 — Hono 4.13.18](https://github.com/Jorge123tkd/Energia-Vital/pull/2), rama `security/hono-4-13-18`, destino `feat/cloudflare-customer-accounts-hardening`. Se modifican **solo** `apps/api/package.json` y `package-lock.json`; el lockfile fue regenerado con npm en GitHub, nunca se alteraron manualmente tarballs ni campos `integrity`.
- **Validación de ensayo:** [GitHub Actions 43813010675](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43813010675) SUCCESS: `npm ci`, typecheck API y Svelte, build web, ensayo de preservación, Worker y D1 aislados con integración completa. La condición de auditoría `npm audit --omit=dev` exigió 0 alertas críticas, altas y moderadas antes de registrar el commit.
- Un primer ensayo se detuvo por asumir una ubicación fija de Hono en el árbol npm; se corrigió para aceptar hoisting y el segundo run pasó. El workflow temporal con permisos `contents: write` y su archivo activador fueron eliminados del PR tras la ejecución.
- **No fusionado**, no publicado ni probado contra las cuentas/DB reales. `vite` y `undici` siguen con alertas altas en herramientas de desarrollo, sujetas a tratamiento separado; la compatibilidad Windows/móviles debe considerarse antes del lanzamiento. No declarar etapa 2 completada.

## Parche Vite/Undici preparado en PR borrador #3 — 16-11-2026

- **Causa confirmada desde npm audit en CI:** Vite 5.4.21 presentaba alertas altas que afectan hasta Vite 6.4.3; Undici 7.29.1 tiene alertas altas y se corrige desde 7.30.1.
- Se creó la rama aislada `security/vite-undici-20261116` y se verificaron versiones actuales con npm. La propuesta [PR #3 DRAFT](https://github.com/Jorge123tkd/Energia-Vital/pull/3) modifica únicamente `apps/web/package.json`, `package.json` y `package-lock.json`: Vite **6.4.6**, plugin `@sveltejs/vite-plugin-svelte` **5.1.1** y Undici transitivo **7.30.2** mediante override raíz `"undici": "^7.30.1"`. El lockfile fue generado por npm, con integridades auténticas.
- **CI aislada confirmada:** [GitHub Actions 43815249208](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43815249208) SUCCESS tras `npm ci`, TypeScript API y Svelte, build de web, preservación de migraciones ficticias, pruebas Worker+D1 y auditoría npm completa. **Resultado del candidato: 0 críticas, 0 altas, 1 moderada y 3 bajas.** Las alertas de Vite y Undici ya no aparecen.
- Los intentos fallidos previos fueron de preparación del workflow y comprobaciones de rango npm/versión, no de fallos funcionales del producto; no se registró parche hasta pasar CI. Se retiraron todos los workflows temporales de escritura y archivos activadores.
- **Hono sigue en 4.13.13 en el PR #3** porque el parche Hono a 4.13.18 se encuentra en [PR #2 DRAFT](https://github.com/Jorge123tkd/Energia-Vital/pull/2). Antes de combinar ambos PR revisar/reconciliar `package-lock.json` con npm, CI y auditoría nuevamente; no hacer merges automáticos.
- La actualización de Vite 5 a Vite 6 y plugin 4 a 5 necesita revisión manual en móviles y navegadores. La restricción `overrides.undici` también requiere revisión con Wrangler/Miniflare antes de una publicación definitiva. Ningún PR habilita producción.

## 16-11-2026 — integración de PR #2 y #3 bloqueada por lockfile

El proyecto mantiene [PR #2](https://github.com/Jorge123tkd/Energia-Vital/pull/2) Hono 4.13.18 y [PR #3](https://github.com/Jorge123tkd/Energia-Vital/pull/3) Vite 6 / plugin Svelte 5 / Undici 7.30.2, **probados por separado, no fusionados**. Los ensayos combinados [43817083927](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43817083927) y [43817336355](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43817336355) detectaron que npm conservaba **Hono 4.13.13** anidado en `apps/api/node_modules/hono` al regenerar parcialmente `package-lock.json`. Por seguridad, los controles rechazaron el candidato y no se generó ningún PR combinado. Los workflows temporales se retiraron.

Ver [integración y criterios de aceptación](./INTEGRACION-DEPENDENCIAS-PR2-PR3.md). **No afirmar que Hono/Vite/Undici están remediados simultáneamente** hasta que `npm ci`, auditoría y pruebas integrales pasen sobre un único lockfile válido en GitHub Actions.

## Matriz de aceptación

| Área | Prueba automática en CI | Pendiente de aceptación manual |
| --- | --- | --- |
| Admin login PBKDF2 y `/api/auth/admin/me` | Admin ficticio y JWT de prueba; JSON malformado rechazado | **401 histórico de producción no resuelto:** validar método seguro de recuperación/rotación por propietario |
| Cliente: registro y login | Registro con datos ficticios, aislamiento y contraseña | Registro real en web móvil y desktop, errores, accesibilidad, correo duplicado |
| Moderador / gestor | Acceso restringido a administración, sin cambio de roles | Confirmar matriz final de permisos con dirección y probar interfaz real |
| Jefes de brigada | Tokens aislados, fotos privadas, revocación tras rotación, permisos R2 | Probar flujo en móviles con responsables autorizados, fotografías consentidas |
| Sesiones / refresh / logout | JWT y sesiones en D1 temporal; entradas inválidas rechazadas | Confirmar caducidad/recuperación de sesiones y WAF en entorno de pruebas |
| Expedientes, pagos, solicitudes | Reglas de autenticación en pruebas sintéticas | QA integral con usuarios de ensayo; no revelar presupuestos ni pagos de otros clientes |
| Fotografías JPEG/PNG/WebP | EXIF, ICC limitado, CRC, hash R2/D1 en CI | Orientación y color reales; privacidad de contenido visible y perfiles ICC |

## Incidencia conocida: administrador con 401 en producción
Historial aportado por dirección: en pruebas anteriores el usuario de administración existía y estaba activo, pero la contraseña introducida no coincidió con el hash PBKDF2 (`encontrado: true; claveCorrecta: false`). El **estado actual de producción no ha sido consultado**, por lo que no declarar resuelta la incidencia por los tests de CI.

**Procedimiento de diagnóstico autorizado, sin divulgar secretos:**
1. Confirmar con el propietario el correo de la cuenta que intenta iniciar sesión, la ruta web utilizada y si el error exacto continúa; **no solicitar contraseña**.
2. Tras autorización de auditoría y con credenciales protegidas en el servicio, consultar solo si el usuario existe/está activo, la versión de formato de hash y los registros de migración, sin mostrar el hash, tokens, correo o datos personales en logs.
3. Si el problema sigue siendo contraseña incorrecta, preparar un **restablecimiento/rotación de credenciales aprobado** con revocación de sesiones, respaldos previos y prueba de inicio de sesión posterior. No usar `/setup` para reemplazar un administrador existente ni editar D1 real desde la conversación.
4. Si se detecta otra causa, reproducirla en un entorno aislado antes de aprobar el arreglo.

## Criterios obligatorios antes de marcar la etapa 2 como terminada
- CI verde para el mismo SHA candidato, incluidas pruebas de cuerpos malformados (sin HTTP 500), aislamiento de roles y sesiones.
- Revisión manual del administrador, clientes, asistente, catálogo, brigadas, expedientes, finanzas y calendario, en escritorio y móvil; problemas bloqueantes corregidos.
- Revisión WAF/CORS/secrets/dependencias y análisis de riesgos aplicables a las rutas públicas de registro y login.
- Documentar las incidencias remanentes y su responsable. **No se marca como resuelta la incidencia de acceso a producción hasta verificarla con autorización**.

## Restricciones
No se consultó ni modificó Cloudflare producción; no hay respaldo real, migración remota, rotación de contraseñas, despliegue ni merge a `main`. Los tests de GitHub no sustituyen las comprobaciones sobre copias privadas representativas de producción.
