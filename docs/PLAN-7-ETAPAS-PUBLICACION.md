# Bonaire · 7 etapas pendientes para publicar Brigadas y Expediente 360° de forma segura

**Fecha:** 15 de noviembre de 2026. **Estado:** PLAN, no autorización.
**Alcance:** primera publicación controlada de las funciones actuales de la rama `feat/cloudflare-customer-accounts-hardening`; no equivale a que todo el negocio/plataforma esté terminado. El orden puede ajustarse por hallazgos.


**Avance de QA de accesos (16/11/2026):** se endurecieron las entradas JSON de citas y solicitudes de clientes y se añadieron pruebas de permisos cliente/admin/anónimo. [GitHub Actions 43949536145](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43949536145) aprobó la suite aislada; despliegues omitidos. Esto avanza el **hito 2/7** pero no lo cierra: siguen pendientes pruebas reales de usuarios/móviles, WAF, error 401 del admin, aprobación de privacidad de fotografías y revisión del PR #4. En total **siguen siete etapas** para publicación segura.


## Nueva revisión de sesiones, 16-11-2026

Se reforzó el cambio de contraseña de cliente: hash nuevo y revocación de otras sesiones comparten una transacción D1, con condición sobre el hash anterior para evitar modificaciones concurrentes silenciosas. [CI 44006778238](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44006778238) y dos validaciones adicionales SUCCESS sobre usuarios ficticios; despliegues omitidos. El paso no requiere migración remota, pero **la etapa 2 no puede cerrarse** mientras falten WAF, pruebas móviles, error 401 real y revisión de privacidad. Continúan las **7 etapas pendientes**.

## Actualización de acceso inicial, 16-11-2026

`/api/auth/setup` ahora admite crear **solo un administrador inicial, incluso con dos solicitudes concurrentes y correos diferentes**, mediante una única operación atómica D1. Validado con la suite Worker/D1 aislada y los tres runs GitHub Actions de SHA `732e043c` (SUCCESS). No se ha probado ni modificado el administrador real ni resuelto su error 401, y este flujo no restablece credenciales. **Siete etapas pendientes**, la segunda todavía abierta por QA manual, WAF y revisión de accesos reales.

## Etapa 2: permisos del personal protegidos en CI (16/11/2026)

Se añadió la migración 020 con triggers que impiden eliminar, degradar o desactivar al último administrador activo. También se verificó la revocación de las sesiones al cambiar roles y bloquear cuentas; GitHub Actions `43951639834`, `43951639831` y `43951626221` finalizaron correctamente usando Worker+D1 aislados. Nada fue aplicado a D1 real y PR #4 de dependencias continúa como borrador.

**Siguen pendientes 7 etapas:** privacidad/consentimiento de fotos (1), QA de seguridad y acceso real (2, en curso), inventario Cloudflare autorizado (3), respaldos privados D1/R2 (4), ensayo de restauración y migraciones hasta 020 (5), revisión PR/rollback (6) y autorización explícita de despliegue con monitorización (7).

## Estado actualizado — 16/11/2026

El [PR #4](https://github.com/Jorge123tkd/Energia-Vital/pull/4) ya incorpora un lockfile npm probado que reúne Hono, Vite, Undici y Svelte 5.57.3 sin duplicados antiguos. El [run 43946090393](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43946090393) pasó TypeScript, compilación, integración Worker/D1 aislados y auditoría total con **0 críticas, 0 altas, 0 moderadas y 3 bajas**; en producción, 0 en todas las severidades. Los avisos bajos del plugin Svelte/inspector/`deepmerge` requieren evaluación.

**Se mantienen siete etapas pendientes**: la etapa 1 no está cerrada (fotos reales/consentimientos); la etapa 2 tampoco (QA móvil, WAF, 401 admin real y revisión humana del PR); las etapas 3–7 dependen de inspección autorizada, respaldos, restauración y autorización expresa de publicación. Ningún test de CI reemplaza estas puertas.

## Situación de partida
## Avance confirmado el 16-11-2026

Los parches de seguridad antes separados en PR #2 y PR #3 **ya se integraron de manera reproducible en el [PR #4 borrador](https://github.com/Jorge123tkd/Energia-Vital/pull/4)**. [GitHub Actions 43943927309](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43943927309) terminó SUCCESS con `npm ci`, `npm audit`, TypeScript, build e integración Worker/D1 aislada. Auditoría de dependencias juntas: **0 críticas, 0 altas, 1 moderada, 3 bajas**. No hay merge ni publicación y todavía deben revisarse dependencias residuales/QA.

**Conteo actualizado: siguen 7 etapas principales pendientes.** El hito 1 necesita pruebas de fotos reales y política aprobada; el hito 2 está avanzado en código pero no cerrado por WAF, 401 real, QA móvil y revisión del PR; hitos 3–7 requieren autorización y respaldos.


- Fase de desarrollo 5B2g: validaciones sintéticas de perfiles ICC en imágenes JPEG, PNG y WebP; máximo de 1 MiB para perfil/dato comprimido, perfil JPEG por segmentos ordenados, rechazo de duplicados/malformaciones. **No** se convierten colores ni se limpian etiquetas internas ICC.
- Las pruebas CI reproducen Worker/D1 aislados en GitHub. No muestran la estructura real de D1 ni los archivos de R2 de producción.
- No se ha conectado a Cloudflare de producción, creado backup real ni publicado nuevo Worker/Pages como parte de estas fases.

## Las 7 etapas que restan

### 1. Privacidad final de fotografías y política interna — PENDIENTE
**Podemos avanzar con código:** acabar defensas de formatos y tests. **Requiere muestras autorizadas y revisión humana:** comparar retratos Android/iPhone, perfiles de color (sRGB/P3), orientación, datos visibles, y aprobar uso y conservación de imágenes. Los perfiles ICC pueden contener texto identificable; no se declara saneamiento perfecto.

**Hecho cuando:** resultados visuales satisfactorios, datos sensibles gestionados y política escrita aprobada.

### 2. Revisión integral de seguridad y experiencia real — EN PROGRESO (NO CERRADA)
Probar manualmente desde dispositivos reales y cuentas de ensayo: inicio de sesión admin (incluido 401 histórico), registro clientes, acceso público, asistente/Telegram, expedientes, brigadas, calendario, finanzas/cotizaciones, aislamientos y errores. Revisar `npm audit` y permisos; corregir los defectos encontrados. Ejecutar Actions en el mismo SHA candidato.

**Avance 15-11-2026:** se revisaron rutas de autenticación; se añadió lectura controlada de JSON en setup/login unificado/login admin/login cliente/refresh y edición de perfil/contraseña. Nuevas pruebas rechazan cuerpos inválidos y comprueban códigos 400/401 en Worker+D1 aislados. [Matriz de accesos, pruebas y diagnóstico 401](./VALIDACION-SEGURIDAD-ACCESOS.md). No se probó el usuario admin de producción ni se resolvió el 401 histórico; QA manual, auditoría de dependencias y WAF siguen pendientes.

**Hecho cuando:** incidencias bloqueantes resueltas o excepciones firmadas; los flujos críticos funcionan con usuarios de prueba.

### 3. Inventario Cloudflare D1/Worker/Pages/R2 SOLO LECTURA — REQUIERE AUTORIZACIÓN
Configurar credenciales en los secretos de GitHub/entorno seguro, **nunca en el chat**. Disparar una auditoría `workflow_dispatch` aprobada y confirmar tablas, migraciones realmente pendientes, bindings, versiones y rama real que publica Pages, sin consultar datos personales en logs.

**Hecho cuando:** inventario verificable y sin discrepancias críticas. Esta etapa no permite `apply`, `export` ni despliegue.

### 4. Respaldo real de D1 Y R2 cifrado, privado y verificable — REQUIERE AUTORIZACIÓN
Proteger por separado base SQL, imágenes/documentos y versiones/registro de objetos. Guardarlos fuera de GitHub y ChatGPT, con control de acceso. Verificar hash, disponibilidad, consistencia y recuperación prevista. D1 Time Travel no reemplaza copia externa durable ni incluye R2.

**Hecho cuando:** respaldo comprobado sin exponer secretos ni datos.

### 5. Restauración privada y ensayo de migraciones — REQUIERE COPIA REAL AUTORIZADA
Restaurar copias en D1/R2 **aislados**, con bots/mensajería y notificaciones desactivados. Ejecutar solo las migraciones faltantes (incluidas 013–019 según inventario). Comparar clientes, solicitudes, citas, imágenes, referencias, conteos e integridad antes/después. No modificar producción.

**Hecho cuando:** restauración operativa, migraciones exitosas y datos históricos preservados.

### 6. Congelar versión, revisar PR y preparar la salida/rollback — REQUIERE APROBACIÓN
Revisar el alcance de la rama respecto a `main`, no mezclar sin querer otros módulos, confirmar rama de producción Pages, `VITE_API_URL`, secretos, permisos, dominios, ventanas de mantenimiento y reversión. Congelar SHA y verificar tests de esa versión.

**Hecho cuando:** plan y versión exactos listos, validación y responsables de despliegue claros.

### 7. Autorización expresa, despliegue controlado y vigilancia — REQUIERE APROBACIÓN FINAL
Aprobar por separado migraciones y publicación. Ejecutar únicamente cambios revisados en D1; comprobar salud y tablas; desplegar primero Worker y después Pages. Verificar flujos con cuentas ficticias, métricas y errores, y disponer de rollback probado. Registrar versión/resultado. **No se realiza automáticamente por decir «sigue».**

**Hecho cuando:** publicación comprobada y monitoreo sin incidencias bloqueantes.

## Avance del hito 2/7 (16 de noviembre de 2026)

- Se preparó el parche de runtime Hono 4.13.18 en [PR #2 borrador](https://github.com/Jorge123tkd/Energia-Vital/pull/2) con `npm ci`, API/Svelte/build, integración aislada y auditoría npm de producción sin alertas graves/moderadas en el runner. **Aún no se ha fusionado**.
- El hito 2 sigue abierto por QA manual, WAF, el 401 real del administrador y el tratamiento de las alertas altas de herramientas de desarrollo (Vite/Undici).
- El hito 1 también sigue abierto por falta de fotos consentidas y consentimiento/retención aprobados. En consecuencia **quedan siete hitos completos de publicación**, aunque el desarrollo continúe avanzando.

## Nueva progresión del hito 2 — 16-11-2026

Dos PR de dependencias **borrador y sin fusionar** quedaron validados de forma aislada:
- [#2 Hono 4.13.18](https://github.com/Jorge123tkd/Energia-Vital/pull/2): arreglo de alerta moderada de producción.
- [#3 Vite 6.4.6 / plugin Svelte 5.1.1 / Undici 7.30.2](https://github.com/Jorge123tkd/Energia-Vital/pull/3): desaparecen las dos alertas altas en la auditoría del candidato, con 1 moderada y 3 bajas restantes. `package-lock.json` se generó con npm y pasó integración Worker/D1 aislados.

Es imprescindible reconciliar el lockfile y repetir pruebas al combinar los PR. No se ha verificado ningún acceso de producción, foto real, política WAF ni respaldo. **Etapa 1 pendiente, etapa 2 en progreso y etapas 3–7 no iniciadas; 7 siguen pendientes**.

## Nota de integración de dependencias — 16-11-2026

Aunque [PR #2](https://github.com/Jorge123tkd/Energia-Vital/pull/2) y [PR #3](https://github.com/Jorge123tkd/Energia-Vital/pull/3) pasaron sus pruebas individuales, el intento de combinación **no ha sido validado**: npm retuvo una dependencia Hono 4.13.13 al regenerar el lockfile parcialmente. Se bloquearon los ensayos y retiraron los workflows temporales. [Diagnóstico completo](./INTEGRACION-DEPENDENCIAS-PR2-PR3.md).

La **etapa 2 sigue en progreso**. La etapa 1 sigue pendiente y no se ha iniciado ninguna etapa 3–7. Quedan **7 etapas completas** hasta publicar, no se debe descontar una por ensayos incompletos.

## Interpretación del número
**7 etapas pendientes** para una publicación controlada de estas funciones; no son 7 mensajes ni 7 commits. Si la auditoría remota o los dispositivos revelan problemas, algunas etapas requerirán iteraciones. Para terminar **toda** la plataforma Bonaire —incluidas iniciativas futuras— no existe aún un número cerrado de pasos.

## Condiciones obligatorias
- Nunca usar el servidor local del propietario.
- Nunca registrar tokens, datos privados o respaldos en el repositorio, Actions artifacts o la conversación.
- Hasta que haya autorización específica: GitHub y Worker/D1 de CI solamente, sin tocar producción.
