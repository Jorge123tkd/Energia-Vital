# Bonaire — Preparación para publicar Brigadas y Expediente 360°

**Estado: PREPARADO, PERO NO AUTORIZADO PARA PRODUCCIÓN.**
Fecha de preparación: 13 de noviembre de 2026. Proyecto: `Jorge123tkd/Energia-Vital`.
Rama de desarrollo: `feat/cloudflare-customer-accounts-hardening`.
D1: `energia-vital-db`. Worker: `energia-vital-api`. Pages: `energia-vital-web`.

## Hallazgos comprobados sin acceder a Cloudflare remoto

1. `main` está **460 commits por detrás** de la rama de desarrollo, según la comparación GitHub del 13-11-2026. PR abierto: #1, «[EN PRUEBAS] Cuentas de clientes y despliegue seguro en Cloudflare». Por lo tanto, una fusión/publicación no incorporaría solo Brigadas y Expedientes, sino también cambios históricos en cuentas, asistente, catálogo, web, etc. **No fusionar en bloque solo para publicar estos dos módulos.** Hay que revisar el conjunto y confirmar la versión que usa realmente Cloudflare.
2. En el repositorio, las migraciones **013** (tres tablas de brigadas y restricciones) y **014** (actividades comerciales por solicitud) son aditivas. No reescriben las tablas antiguas ni crean usuarios/brigadas ficticias.
3. GitHub Actions **PASS**: typecheck API, svelte-check, build web, pruebas de integración Worker+D1 aislada con permisos JWT, brigadas 1/2/3/4, concurrencia y expedientes; y además `apps/api/tests/migration-preservation.py` comprobó con SQLite en memoria que 013+014 conservan intactos 9 conjuntos de filas históricas ficticias, las referencias y vínculos. **Esto NO prueba compatibilidad con los datos reales de producción**.
4. El workflow `.github/workflows/deploy.yml` de la rama de desarrollo ahora exige, para sus jobs de despliegue manual, selección de la rama `main`, texto exacto `PUBLICAR_BONAIRE`, casillas de respaldo y migraciones revisadas, más confirmación read-only de las cuatro tablas D1. Si faltan, no publica. **Una casilla marcada no sustituye la prueba efectiva del respaldo.** Hay que verificar la revisión y la protección de entorno de GitHub antes de usarlo.
5. **No se consultó en esta etapa la D1 remota**: ni la lista actual de migraciones, ni conteos de clientes, ni la versión exacta del Worker/Pages publicados, ni la rama configurada en Cloudflare Pages. Cualquier afirmación sobre esos valores sin resultado remoto es especulativa.

## Puerta de salida 1 — Congelar y verificar código

- Anotar SHA exacto de la versión candidata y SHA del `main` que realmente se va a publicar.
- Revisar el PR #1 por ser un lanzamiento **amplio** (460 commits adelante en la fecha de revisión); no hacer merge ni despacho manual automáticamente.
- Confirmar que Actions `checks` pasó para **el mismo SHA**, incluido `migration-preservation.py`; los jobs de publicación siguen `skipped`.
- Comprobar configuración Cloudflare Pages para saber qué rama despliega a producción, `VITE_API_URL` y orígenes permitidos.
- Realizar verificación de roles y privacidad del Expediente 360°, incluido acceso a fotos, registros de gestores y auditoría. Las pruebas automáticas NO equivalen a auditoría de seguridad completa.

## Puerta de salida 2 — Auditoría remota SOLO LECTURA (después de acordar el mecanismo seguro)

Realizar desde un entorno de administración controlado de Cloudflare o un job GitHub expresamente aprobado, nunca desde un servidor en la PC del propietario. No pegar tokens ni SQL con datos personales en chat/logs.

- Consultar versión, estado y soporte de recuperación D1 (`wrangler d1 info energia-vital-db`). D1 Time Travel está disponible en el sistema de almacenamiento de producción; el periodo de recuperación depende del plan. Referencia: https://developers.cloudflare.com/d1/reference/time-travel/
- Listar **todas** las migraciones pendientes sin aplicarlas: `wrangler d1 migrations list energia-vital-db --remote`. No asumir que solo faltan 013 y 014; prestar especial atención a nombres/diferencias históricas de 011.
- Confirmar read-only esquema/tablas, existencia de `d1_migrations` y conteos resumidos (sin PII) de `customers`, `requests`, `appointments`, `assistant_sessions`, `request_images`, `audit_logs`, `request_intake`. Si faltan tablas, detener.
- Verificar Worker actualmente desplegado, sus bindings reales (D1/R2), variables/secretos sin mostrarlos, y el último despliegue de Pages; anotar identificadores/fechas, no secretos.
- Si la lista de migraciones remotas no coincide con el esquema real, **PARAR**. No ejecutar una migración «por si acaso» ni restaurar borrando el registro `d1_migrations`.

## Puerta de salida 3 — Respaldo y ensayo sobre copia privada

- Obtener un respaldo **COMPLETO, verificable y protegido** de D1 real antes de cualquier escritura. Cloudflare admite exportación SQL mediante `wrangler d1 export energia-vital-db --remote --output=...`; no publicar ese SQL en GitHub, Actions artifacts, chats ni repositorios. Debe guardarse **cifrado**, con acceso controlado, fuera del repositorio, y comprobar tamaño, integridad/hashes y posibilidad de restauración en base aislada. Referencia: https://developers.cloudflare.com/d1/wrangler-commands/
- Anotar un bookmark/time stamp de recuperación de D1 Time Travel si el almacenamiento lo soporta. **Time Travel no reemplaza un respaldo durable fuera del sistema**, y restaurar el estado de una DB activa puede revertir escrituras hechas después del punto elegido.
- Las imágenes en R2 **no están dentro del respaldo SQL de D1**. Confirmar que R2 sigue accesible y evaluar su política de versiones/copias por separado.
- Restaurar/importar el respaldo en **otro entorno privado aislado**, con acceso limitado, sin bot activo y sin envíos de Telegram, WhatsApp, correo o notificaciones.
- Correr allí únicamente migraciones que realmente falten (incluidas 013/014 si aplica). Revisar resultados, `PRAGMA foreign_key_check`, conteos por tabla antes/después, enlaces cliente→solicitud→cita, fotos/R2, actividades y restricciones de brigadas. Los conteos históricos y referencias deben permanecer intactos.
- Si la copia falla, no tocar producción: resolver SQL/compatibilidad primero.

## Puerta de salida 4 — Aprobación del propietario antes de producción

La frase «ok» de conversación autorizó **preparar el procedimiento**, no autoriza ejecutar escrituras en D1 remoto ni publicar Worker/Pages. Obtener autorización explícita de fecha, versión SHA, evidencia de respaldo y ventana de despliegue antes de aplicar migraciones o actualizar servicios.

## Puerta de salida 5 — Publicación controlada (NO EJECUTADA)

Solo después de las cuatro puertas:
1. Registrar estado inicial: bookmark/respaldo, conteos críticos, versión Worker y deployment Pages.
2. Aplicar **solo las migraciones pendientes y revisadas** a D1 remota; comprobar de inmediato que no faltan las tablas requeridas y que los registros previos siguen presentes. No asumir que «apply» no puede fallar.
3. Publicar primero el Worker compatible con las tablas nuevas; comprobar /health y rutas privadas de Brigadas/Expediente con usuarios de prueba autorizados (sin crear pagos, contratos ni solicitudes reales).
4. Construir/publicar Pages **en la rama de producción confirmada**, no en una rama preview accidental. Verificar en móvil y escritorio las pantallas y permisos, más la web pública y el asistente.
5. Vigilar errores, registrar incidente/versión si hay fallo. Rollback de Worker/Pages al artefacto previo si es necesario. **NO restaurar automáticamente D1**, pues revertiría nuevas escrituras. Toda restauración requiere decisión humana, alcance y ventana acordados.
6. Registrar evidencias, versión final y resultado en `docs/CONTINUIDAD.md`. Hasta entonces el estado sigue: **código probado en GitHub, no desplegado**.

## Pruebas que aún no cubren los pipelines

- Auditoría sobre **copia real de D1**, no solamente DB temporal nueva y muestra ficticia.
- Comprobación de versión efectiva en Cloudflare, rama de Pages y permisos de tokens del pipeline.
- Revisión completa del PR/460 commits y exposición de diferencias no relacionadas con Brigadas/Expediente.
- Copia/ciclo de restauración de R2, requisitos de privacidad y seguridad adicionales.
- Verificación con usuario real autorizado y regresión de web pública tras lanzamiento.

**Situación actual: detenerse antes de la puerta 2 remota hasta decidir cómo auditar sin exponer datos ni credenciales.**
