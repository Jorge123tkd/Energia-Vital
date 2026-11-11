# Continuidad de Bonaire
Actualizado: 11 de noviembre de 2026 (America/Havana).

## Leer primero al retomar
- Marca pública: Bonaire. Repositorio: Jorge123tkd/Energia-Vital.
- Rama de trabajo: feat/cloudflare-customer-accounts-hardening.
- Equipo del usuario: Windows / PowerShell. Ruta reportada: C:\Users\Taliety\Desktop\Energia-Vital.
- Worker: energia-vital-api. Pages: energia-vital-web. D1: energia-vital-db.
- No confundir la rama de código con la rama de producción configurada en Pages.
- Petición permanente del usuario: actualizar esta documentación en GitHub después de cada paso con qué se hizo, resultado, último paso y siguiente paso. No depender solo del historial del chat.
- Nunca guardar contraseñas, tokens, respaldos D1 ni datos privados en GitHub.

## Último paso realizado
2026-11-11: se reorganizó el formulario «Mi sitio web» del panel con cuatro secciones conmutables mediante botones (Portada, Contacto, Redes y bots, Pie de página), conservando el guardado común. Se añadieron accesos opcionales a canales de bot configurados en el carrusel de Inicio y aclaración de «Servicio solicitado» en la ficha administrativa. La persistencia de enlaces y la presentación visual siguen pendientes de prueba. Los enlaces de bots no constituyen integración efectiva: no hay historial ni mensajes multicanal conectados todavía. No se han desplegado los cambios. 

2026-11-11: se amplió la rama de trabajo con paginación coherente para Solicitudes y Citas (conservando paginación API existente), Clientes (API con búsqueda, total y páginas), Servicios y Galería del panel, Personal/permisos, Notificaciones (API D1 paginada cliente/personal), Catálogo/Servicios/Galería públicos e Inicio y Mis solicitudes/citas. Los endpoints públicos admiten páginas y el cliente puede cargar sucesivos bloques para evitar el antiguo máximo visible de 200; no hay migraciones nuevas. El formulario Solicitar servicio ahora muestra servicios publicados y envía `service_id`, validado en el servidor y registrado en título/descripción de la solicitud sin alterar tablas D1. Mejorada navegación de Inicio y añadidos enlaces editables diferenciados para bot de WhatsApp y bot de Telegram. La integración real de canales, memoria y bots aún NO está implementada; ver docs/CHATBOTS-OMNICANAL.md. Código guardado en GitHub; no se han ejecutado aún typechecks/build para esta tanda ni hubo despliegue o pruebas visuales, y no hay evidencias de conexión operativa de los bots.

2026-11-11: contrastado el historial previo de pruebas y el nuevo archivo "Texto pegado(3).txt" del usuario. El historial del proyecto ya documenta una integración Worker/D1 local completa anterior, con pruebas de autenticación, aislamiento entre clientes, catálogo, servicios, solicitudes, asistente, citas, notificaciones y destacados. El cálculo solar volvió a dar PASS. En el archivo nuevo el usuario aplicó **001–010 con éxito a una nueva D1 local aislada** (`.wrangler/tests-20261111-020247`), sin afectar D1 remoto. Inmediatamente después aparece "Shutting down local server..." y `Invoke-RestMethod http://127.0.0.1:8787/health` y `npm test` devuelven conexión rechazada: **no había Worker local escuchando**. Esto no es una falla funcional demostrada. No repetir migraciones locales, baterías integrales ni comprobaciones ya superadas solo por este ECONNREFUSED.

La rama de trabajo incluye la pantalla /asistente a viewport completo (commit fa2b1db) y el gestor del carrusel con botones de crear/editar/eliminar, 1–6 diapositivas y validación nueva en la API (commit 4d8ca8f). Confirmados por salida PowerShell: `npm ci`, typecheck API, typecheck web (0 errores, 0 advertencias), `npm run build:web`, `$env:VITE_API_URL=https://energia-vital-api.astrustrus.workers.dev`, `npm audit --omit=dev` (0 vulnerabilidades). El audit completo reporta 9 avisos pendientes de clasificación; no impedir el avance por repetir comandos sin cambios. No hay evidencia todavía de validación visual de los dos cambios de interfaz ni de despliegue de estos commits a producción. Último despliegue confirmado previamente: Worker 07e2b3b8-0832-42d2-851c-fb401f142909 y Pages Production/main ad66cfa7-024c-4935-aad9-f7f313404533, fuente 98011f0.
## Siguiente paso exacto
1. En Windows, actualizar la rama sin perder los cambios locales: revisar `git status`, guardar el trabajo no confirmado y ejecutar `git pull --ff-only` solo cuando sea seguro. Ejecutar **una vez** `npm run typecheck --workspace=apps/api`, `npm run typecheck --workspace=apps/web` y `npm run build:web` para los cambios nuevos; corregir errores si aparecen. No repetir toda la integración anterior ni las migraciones D1 001–010.
2. Probar incrementalmente las paginaciones, búsqueda de clientes/notificaciones, la lista de todos los servicios publicados, envío de solicitud asociado a un servicio y enlaces/botones de Inicio (sin modificar datos de producción por rutina).
3. Para bots, configurar las URL oficiales de los bots únicamente cuando respondan de verdad; preparar posteriormente conexión segura, historial multicanal y webhooks externos. No confundir estos enlaces con las cuentas del personal.
4. Tras los controles, preparar despliegue de API y Pages con respaldo, rama Production y URL de API confirmados; registrar versiones desplegadas y resultados reales.
5. Mantener auditoría de dependencias de desarrollo y revisión general de v1.0 pendientes.

Enfocar la verificación incremental solamente en lo modificado, **sin repetir pruebas históricas por rutina**:

1. Preparar despliegue de la versión ya compilada: confirmar estado limpio de git, respaldo D1 remoto existente o nuevo según política, rama efectiva de Pages (históricamente main), y URL VITE_API_URL. No hay migraciones nuevas en el código de los dos últimos commits, por lo que no volver a aplicar migraciones 001–010 ni crear otra D1 local. El nuevo código sí requiere desplegar Worker (cambio de validación de site-settings) y Pages (cambio visual).
2. En un entorno accesible, comprobar **solo las diferencias**: /asistente realmente a pantalla completa en móvil/escritorio, regreso, historial y nuevo chat; en /admin > Sitio, botones de crear/editar/eliminar diapositiva, guardar y persistencia de 1–6 diapositivas y navegación del carrusel. Probar primero sin alterar contenidos reales innecesariamente.
3. Registrar versión del Worker/Pages y resultados tras despliegue. Mantener pendientes de lanzamiento: pruebas visuales/operativas generales y remediación del audit completo; no confundir evidencia previa con pruebas de las novedades.

No volver a pedir `npm test`, `npm ci`, `npm run typecheck`, `npm run build:web`, `npm audit --omit=dev`, ni `wrangler d1 migrations apply --local` sin un nuevo cambio que lo justifique. No probar `apps/api/tests/integration.cjs` contra la API remota, pues escribe cuentas, contenido y registros de prueba.
## Trabajo completado y evidencia
### Cambios previos presentes en el repositorio
- Chat en pantalla completa, historial privado, nuevo chat, búsqueda, renombrar/eliminar, regreso y apertura desde el modal.
- Administración: edición y eliminación de catálogo, servicios y categorías; controles de notificaciones.
- Ajustes de navegación del asistente y presentación de los modos del asesor solar.
- Existe docs/RELEASE-V1-CHECKLIST.md; la auditoría general 1.0 sigue pendiente. La presencia de código no certifica cada flujo en producción.

### Último cambio funcional: b56a0e9
- Inicio muestra productos, servicios y galerías destacadas usando las tarjetas y visores de sus páginas completas.
- Servicios y proyectos: opción administrativa Destacar en inicio al crear/editar.
- Migración 010_home_featured_content.sql añade is_featured a services y work_gallery; los existentes comienzan sin destacar.
- API filtra destacados y publicados. Ocultar retira de Inicio; quitar destacado conserva el listado general.
- CardImage compartido: altura uniforme, recorte centrado, zoom con cursor/foco, movimiento reducido, carga diferida y alternativa ante fallos.
- Corregida entrada Windows ausente en package-lock.json que impedía npm ci.
- npm ci, typecheck API, typecheck web (0 errores/0 advertencias) y build web: correctos.
- Migraciones 001–010 aplicadas a D1 LOCAL.
- Test solar e integración Worker/D1 local: correctos. Pruebas nuevas verifican booleanos, selección, persistencia, ocultar/republicar y quitar destacados.
- Revisión visual pendiente: Chromium no pudo iniciarse por restricción de sockets del entorno.
- Detalles: docs/HOME-FEATURED-CONTENT.md.

## Estado del despliegue
| Paso | Estado |
|---|---|
| Código funcional en GitHub | Nuevos commits: fa2b1db (asistente) y 4d8ca8f (diapositivas); sin despliegue de estos cambios |
| Instalación y checks locales del usuario | Completados en PowerShell para la versión 4d8ca8f; build correcto, falta verificación visual |
| Registro de continuidad e instrucciones | Creados en esta actualización |
| Autenticación Cloudflare en entorno del agente | No disponible |
| Estado del repositorio Windows | Usuario confirmó pull hasta 4d8ca8f; instalación, typecheck API/web y build web correctos; stash previo no modificado |
| Autenticación Cloudflare del usuario | Confirmada por whoami; permisos D1, Workers y Pages |
| Proyecto Pages | energia-vital-web.pages.dev; sin proveedor Git |
| Rama de producción Pages | main, confirmada por listado Production; Git sigue en la rama de trabajo |
| Dependencias en Windows | audit --omit=dev: 0 confirmado de nuevo; audit completo: 9 avisos pendientes de revisar |
| Versión Pages anterior | 89031ae4-57c9-4fc8-907f-52d1eaba93d3, fuente a9a8a9c |
| Respaldo D1 remoto para esta actualización | Exportado: energia-vital-20261111-011838.sql, 158917 bytes; no se ensayó restauración |
| Migraciones D1 remotas, incluida 010 | Completadas 009/010; ninguna pendiente |
| Desplegar Worker | Completado: 07e2b3b8-0832-42d2-851c-fb401f142909; anterior d3daae7e-2a02-4f26-97d6-23553d894bb3 |
| Compilar con VITE_API_URL y desplegar Pages | Completado Production/main: ad66cfa7-024c-4935-aad9-f7f313404533, fuente 98011f0 |
| Health y API de destacados | Correctos desde PowerShell; destacados vacíos |
| Comprobación HTTP desde el agente | 403; causa no determinada, revisión visual no realizada |
| Activar destacados elegidos y probar web | Pendiente |
| Auditoría completa y lanzamiento 1.0 | Pendiente |

## Bitácora
- 2026-11-11: reorganizado «Mi sitio web» en cuatro paneles navegables, botones opcionales de bot en portada y etiquetas de solicitudes de servicio; pendientes typechecks/build de la nueva tanda y validación incremental.

- 2026-11-11: añadidas paginaciones públicas y administrativas, búsqueda/paginación D1 de clientes y notificaciones, selector de servicios publicados para solicitudes, y navegación de Inicio; documentada arquitectura de bots y separación de contactos humanos. No hay cambios de esquema D1. Typecheck, build y pruebas visuales de estos cambios pendientes.

- 2026-11-11: a petición del usuario se auditó la forma de verificación de chats anteriores para evitar repeticiones. Constatadas migraciones D1 local 001–010 exitosas; nueva integración no llegó a iniciar por Worker local detenido ("Shutting down local server", ECONNREFUSED), no por aserción funcional. Integración completa y cálculos habían sido validados previamente. Se limita el próximo QA a pantalla completa y carrusel modificado, despliegue y comprobación visual; no repetir instalación, typecheck, build, audit producción ni migraciones.

- 2026-11-11: calculador solar PASS; integración bloqueada por API local inexistente (ECONNREFUSED 127.0.0.1:8787); audit de producción 0 vulnerabilidades; VITE_API_URL de Worker correcta; build web repetido con éxito. Próximo: iniciar Worker y D1 locales aislados, repetir integración y prueba visual. Producción sin cambios.
- 2026-11-11: evidencia del usuario: PowerShell aplicó fast-forward 98011f0..4d8ca8f, `npm ci` completó con 9 avisos de seguridad, typecheck API sin errores, Svelte 0 errores/0 warnings y Vite build exitoso (150 módulos, 22.80 s). Pendiente confirmar VITE_API_URL, ejecutar pruebas funcionales y publicación. No se ejecutaron órdenes Cloudflare de esta actualización.

- 2026-11-11: preparado gestor de diapositivas por botones y soporte frontend/API para 1–6 diapositivas. Pendiente compilación, pruebas de interfaz y despliegue.
- 2026-11-11: corrección del alto real de /asistente y ocultación de navegación pública preparada en rama, sin deploy ni test visual de esta modificación.
- 2026-11-11: publicado b56a0e9 en la rama de trabajo; comprobaciones locales superadas.
- 2026-11-11: el usuario autorizó preparar y realizar todos los pasos de despliegue y pidió documentación permanente después de cada paso.
- 2026-11-11: comprobado acceso a GitHub. Wrangler indica que no hay sesión Cloudflare en este entorno. Preparada guía de PowerShell y punto de reanudación; producción sin modificar.

- 2026-11-11: paso 1 confirmado con salida del usuario: sesión Cloudflare activa, rama correcta y proyecto Pages encontrado. Cambios locales detectados; preparado paso 2 para conservarlos antes de actualizar. No se guardan correo, identificadores de cuenta ni credenciales. Rama de producción aún no confirmada.

- 2026-11-11: paso 2 confirmado mediante archivo adjunto: stash con untracked, pull fast-forward a 98011f0, npm ci y ambos typechecks correctos. Pages Production usa main. Registradas 9 vulnerabilidades pendientes de detalle. Próximo: build, respaldo D1, lista de migraciones/versiones y audit; sin cambios remotos de producción.

- 2026-11-11: build y respaldo D1 confirmados. Lista remota solo 009/010 pendientes; registrada versión previa Worker. npm audit: 0 omitiendo dev, 9 completo. El lockfile tiene Svelte 5.57.2 en apps/web y Svelte 4.2.20 en raíz; Undici 7.29.1 y Wrangler 4.151.2. Los hallazgos de herramientas/framework requieren revisión; omit=dev no certifica seguridad del bundle. No se guardó el enlace temporal firmado de descarga del respaldo. Preparado siguiente bloque de migraciones/API/Pages; todavía no ejecutado.

- 2026-11-11: aplicadas 009/010 remotas y confirmado que no quedan migraciones. API publicada con versión 07e2b3b8-0832-42d2-851c-fb401f142909; health ok y endpoints de destacados correctos/vacíos. Pages Production/main publicado como ad66cfa7-024c-4935-aad9-f7f313404533 (fuente 98011f0). Peticiones del agente obtuvieron 403, por lo que no se presenta validación visual independiente como completada. Próximo paso: selección administrativa de destacados y pruebas visuales/funcionales.

## Cómo actualizar este registro
Después de cada paso: añadir fecha, acción, resultado y evidencia breve a la bitácora; ajustar tabla, Último paso realizado y Siguiente paso exacto. Registrar fallos y bloqueos. Guardar y subir a la rama, sin declararlo actualizado si GitHub no confirmó el cambio. No marcar como realizado un comando solo porque se haya entregado al usuario.
