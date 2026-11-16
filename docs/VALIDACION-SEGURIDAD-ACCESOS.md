# Bonaire — revisión de acceso y autenticación antes de publicación (etapa 2/7)

**Fecha:** 15 de noviembre de 2026. **Estado: EN PROCESO.** No constituye autorización para producción.
Rama: `feat/cloudflare-customer-accounts-hardening`. Pruebas sobre Worker, D1 y R2 de CI **aislados**.

## Resultado de la revisión de código
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
