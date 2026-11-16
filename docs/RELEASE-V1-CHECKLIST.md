# Bonaire — Control de salida 1.0 (PENDIENTE)

**Lanzamiento de Brigadas y Expediente 360°:** aplicar antes el plan [PUBLICACION-SEGURA-BRIGADAS-EXPEDIENTES.md](./PUBLICACION-SEGURA-BRIGADAS-EXPEDIENTES.md). La rama de desarrollo estaba 460 commits adelante de `main` en la auditoría del 13-11-2026: no fusionar ni publicar el conjunto sin revisar alcance y base real. Las pruebas sintéticas no sustituyen un ensayo sobre copia privada de producción.

Este documento define pruebas de aceptación, no constituye certificación de seguridad ni autorización para publicar. No modificar datos reales durante la auditoría.

**Estado de avance y número de etapas restantes:** consultar [PLAN-7-ETAPAS-PUBLICACION.md](./PLAN-7-ETAPAS-PUBLICACION.md). Son **7 hitos** para la publicación segura del alcance Brigadas/Expedientes, no 7 commits ni un plazo de entrega.


## Etapa 2/7 — entradas de citas y solicitudes de clientes (16/11/2026)
- [x] Rechazar JSON inválido, `null`, arreglos y fechas no textuales en creación de citas con HTTP 400, sin fugas de error de servidor.
- [x] Rechazar arreglos como cuerpo en solicitudes de clientes.
- [x] Ejecutar pruebas Worker/D1 aisladas de validación de inputs y de límites de identidad: administrador en cita privada 401, anónimo en listado 401. [CI funcional](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43949536145) aprobada; trabajos de despliegue omitidos.
- [ ] Comprobar los formularios en navegadores y teléfonos con usuarios de prueba, incluidos mensajes de error y estados de citas.
- [ ] Resolver/verificar el 401 de administración real con autorización, WAF/Turnstile, privacidad de fotos consentidas/ICC y revisar PR #4 sin fusionar anticipadamente.
- [ ] Mantener **7 etapas pendientes**; etapa 2 permanece abierta.


## Etapa 2/7 — último administrador y sesiones del personal (16-11-2026)

- [x] Migración `020_last_admin_guard.sql`: protege en SQLite/D1 al último administrador activo frente a degradación, desactivación y eliminación, incluso entre peticiones concurrentes.
- [x] Actualización de permisos, revocación de sesiones y auditoría en lote transaccional; respuesta controlada 409 en caso de conflicto.
- [x] Ensayo ficticio de migraciones 013-020 y pruebas HTTP de ascenso/degradación de gestor, cierre de access/refresh y desactivación. CI `43951639834`, `43951639831`, `43951626221` SUCCESS; deployments SKIPPED.
- [ ] Validar en copia autorizada la secuencia 013-020 tras inventario y respaldos. La migración 020 **no está aplicada en producción**.
- [ ] Completar QA móvil, 401 del administrador real, WAF/Turnstile y aprobación de tratamiento de fotografías. **Quedan 7 hitos de publicación pendientes.**

## Nueva etapa 3A: cotizaciones internas
## Seguridad npm — refinamiento posterior del PR #4 (16-11-2026)
- [x] Identificar que la alerta moderada restante era un Svelte 4.2.20 obsoleto instalado en la raíz, junto a Svelte 5.57.2 de la web.
- [x] Deduplicar con npm a Svelte 5.57.3 único, verificar `npm ci`, typecheck, build y Worker/D1 ficticios [CI 43946090393](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43946090393).
- [x] Repetir `npm audit`: **producción 0 avisos en cualquier gravedad; total 0 críticas, 0 altas, 0 moderadas y 3 bajas**. Candidato combinado actualizado en [PR #4](https://github.com/Jorge123tkd/Energia-Vital/pull/4) commit `ce8d32c0`, sin merge.
- [x] Borrar workflow y activador de deduplicación tras ensayo; mantener los PR como borradores para revisión.
- [ ] Registrar tratamiento/aprobación de avisos bajos de plugin Svelte/inspector/`deepmerge`, sin actualizaciones no compatibles.
- [ ] Completar QA real, WAF, 401 administrativo histórico, fotografías/ICC/consentimientos y respaldos antes de cerrar la etapa 2 y autorizar producción.

## PR combinado #4 — dependencias seguras (16-11-2026)
- [x] Hono 4.13.18 + Vite 6.4.6 + plugin Svelte 5.1.1 + Undici 7.30.2 resueltos e instalados juntos con `npm ci`, integridad npm y suite Worker/D1 temporal.
- [x] `npm audit` conjunto: **0 critical, 0 high, 1 moderate, 3 low**. Sin alertas de Hono, Vite ni Undici. [CI aprobada](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43943927309).
- [x] El [PR #4](https://github.com/Jorge123tkd/Energia-Vital/pull/4) quedó **borrador, sin merge**, con solo cuatro archivos de dependencias y sin los workflows temporales.
- [ ] Revisar y aprobar las cuatro diferencias del PR, tratar vulnerabilidades moderada y bajas restantes y repetir QA final en móviles/navegadores.
- [ ] Confirmar WAF/Turnstile, 401 del administrador real, privacidad/consentimiento de fotografías y respaldos D1/R2 antes de cualquier despliegue.
- [ ] Mantener el conteo de **7 etapas completas pendientes** de publicación; etapa 2 sigue abierta.


- [ ] Confirmar migración `015_commercial_quote_versions.sql` sobre copia privada de D1 real y preservación del historial.
- [ ] Verificar roles: gestor redacta y solicita revisión; únicamente administrador aprueba/rechaza internamente.
- [ ] Verificar vigencia, partidas, cantidades, impuestos, transporte, descuentos y cálculo monetario en USD.
- [ ] Asegurar que `approved_internal` NO crea ni remite ninguna oferta, contrato, factura o verificación de pago.
- [ ] Revisar política de emisión formal por separado y mantener la web sin botón de publicación de cotizaciones.

## Nueva etapa 4A: seguimiento económico (sin publicación)
- [ ] Confirmar que `016_request_financial_tracking.sql` funciona en copia privada de D1 real y que los nueve conjuntos históricos siguen intactos.
- [ ] Confirmar que se distinguen los fondos declarados como aprobados/disponibles, condiciones negociadas, pagos reportados y revisión manual del administrador.
- [ ] Verificar acceso: cliente y bot no pueden consultar finanzas internas; gestor registra pero jamás valida pagos; solo administrador activo registra una revisión con evidencia independiente.
- [ ] Comprobar referencias duplicadas, rechazo, auditoría, integridad SQL y que la revisión manual NO se anuncie como conciliación bancaria automática.
- [ ] Revisar procesos jurídico-contables reales, control de caja, aprobaciones fiscales y tratamiento de comprobantes sin almacenar credenciales o números de cuenta en notas.

## Nueva etapa 5A: seguimiento técnico y posventa (sin publicación)
- [ ] Ensayar `017_technical_followup.sql` sobre una copia privada de D1 real sin alterar clientes, solicitudes, fotos ni trabajos anteriores.
- [ ] Validar que el personal puede informar sin firmar como jefe de brigada; `chief_relayed` es retransmisión, NO autenticación del jefe.
- [ ] Solo administrador principal puede aceptar el informe de finalización y cerrar técnicamente un trabajo; confirmar auditoría y ausencia de efecto sobre solicitud comercial/pagos.
- [ ] Comprobar integridad de fotografías vinculadas (misma solicitud), sin presentar fotos previas como prueba de ejecución.
- [ ] Comprobar casos de incidencia/reclamación de garantía, notas inmutables y cierre administrativo sin aceptar automáticamente cobertura de garantía.
- [ ] No publicar rutas técnicas ni archivos en canales públicos. Definir autenticación de jefes, carga privada R2 y firma técnica en etapa aparte.

## Nueva fase 5B1: portal del jefe y fotos R2 privado
- [ ] Ensayar 018 sobre copia **real privada** de D1; comprobar diez tablas anteriores intactas y catorce tablas nuevas en total, con respaldos D1 y R2.
- [ ] Confirmar que un jefe con contraseña propia NO accede a staff, expedientes, clientes, cotizaciones ni pagos; tampoco a trabajos/fotos de otras brigadas.
- [ ] Probar límite 5 MB por foto, tipo de archivo real, permisos R2 privado, retención de SHA-256 y máximo 12 por trabajo; evaluar EXIF/GPS y consentimiento antes de subir fotos reales.
- [ ] Verificar baja y revocación de sesiones de jefes al cambiar contraseña, desactivar brigada o sustituir al jefe nominal.
- [ ] Validar diferencia entre informe autenticado, firma jurídica, certificado técnico y aprobación humana de la finalización. NO cerrar automáticamente trabajos por informe del jefe.
- [ ] Revisar backups y política de conservación R2, protección WAF contra abuso de login y carga, permisos Cloudflare y CORS de Pages.
- [ ] NO fusionar ni publicar sin aprobación explícita, auditoría remota read-only y ensayos sobre copia representativa.

## Nueva fase 5B2a: informe directo del jefe y revisión de dirección
- [ ] Ensayar migración 019 sobre copia de D1 real: **15 tablas nuevas**, nueve conjuntos históricos íntegros.
- [ ] Confirmar identidad y trabajo de origen del informe del jefe; no asumir que su token constituye firma electrónica o identidad civil verificada.
- [ ] Confirmar que solo administrador principal puede aceptar/rechazar directamente informe; gestor, cliente y jefe no pueden cerrar.
- [ ] Rechazo conserva trabajo programado; aceptación crea snapshot de revisión, auditoría y cierre técnico, sin cambiar solicitudes comerciales, garantías o pagos.
- [ ] Probar concurrencia y doble decisión, referencia de informe original, historia y preservación de fotos en R2 privado.
- [ ] Exigir auditoría read-only y copia/restauración D1 y R2 antes de cualquier despliegue.

## Fase 5B2d: privacidad de orientación de fotos (código y CI; producción pendiente)
- [x] Prueba sintética de orientación EXIF 1–8 en JPEG y conservación de una etiqueta reconstruida sin GPS/fecha/serial.
- [x] Prueba sintética de WebP extendido VP8X: eliminar XMP/EXIF original y reconstruir solamente orientación, con corrección de flags y tamaño RIFF.
- [x] Rechazar PNG eXIf orientado y WebP no extendido con orientación sin soporte de normalización segura. Mantener rutas R2 privadas y hash/tamaño sobre bytes saneados.
- [ ] **Probar con fotografías reales consentidas** de Android/iPhone y comprobar orientación visual de retrato, delante de administradores y jefes en sus vistas privadas.
- [ ] Evaluar privacidad residual de perfiles de color y políticas de retención/consentimiento con responsables antes de subir evidencias reales.
- [ ] No aplicar el código ni migraciones a Cloudflare real sin auditoría read-only, copias de D1/R2 verificadas y autorización expresa.

## Fase 5B2e: integridad de PNG y privacidad residual (código GitHub, sin publicación)
- [x] Validar CRC-32 de cada bloque PNG antes de almacenar y verificar rechazo de IHDR/IDAT/tEXt dañados con imágenes de prueba.
- [x] Sustituir el PNG de prueba anterior con CRC erróneo por una imagen 1×1 válida y repetir integración con Worker + D1/R2 temporales.
- [x] Advertir en el portal del jefe que EXIF/GPS eliminado NO protege datos visibles ni información incluida en notas o perfiles de color.
- [ ] Auditar perfiles ICC conservados de JPEG/PNG/WebP y decidir conversión de color segura para evidencias, con pruebas visuales representativas.
- [ ] Revisar fotografías reales **autorizadas** de Android/iPhone, contrastando orientación, lectura de perfiles y permisos privados de R2 en entorno controlado.
- [ ] Ejecutar auditoría D1 remota read-only solo con autorización específica y secretos adecuados; NO iniciar export, restauraciones, migraciones o despliegue sin respaldo D1/R2 verificado y decisión expresa.

## Fase 5B2f: auditoría bajo demanda R2/D1 y tratamiento responsable de ICC
- [x] Añadir verificación **read-only y solo para administrador principal** del SHA-256/tamaño de una fotografía privada frente a la referencia de D1, sin devolver claves R2 ni bytes.
- [x] Incluir pruebas con R2 falso para foto ausente, hash distinto, tamaño diferente, objeto de más de 5 MB y prefijo de archivo inesperado.
- [x] Probar ruta HTTP real en Worker/D1 aislados: admin autorizado, operador 403, jefe 401, anónimo 401 e ID de trabajo ajeno 404.
- [x] Mostrar opción «Comprobar integridad R2/D1» únicamente al administrador en expediente, SIN cierre automático ni certificación de la prueba.
- [ ] Examinar presencia de perfiles ICC APP2/iCCP/ICCP en fotografías **consentidas**, con análisis privado de etiquetas y pruebas comparativas de color en móviles.
- [ ] Aprobar política de conservación, consentimiento y tratamiento de fotografías reales, así como procedimientos de recuperación y respaldo cifrado R2+D1.
- [ ] Autorizar por separado auditoría D1 remota de solo lectura, realizar respaldo y prueba de restauración de R2/D1 y, posteriormente, aprobar cada publicación. Nada de esto forma parte de los tests en Actions.

## Fase 5B2g: perfiles ICC limitados y estructuralmente comprobados en GitHub
- [x] JPEG: validar APP2 `ICC_PROFILE` como fragmentos numerados completos, con un único perfil de estructura ICC plausible; rechazar faltantes/duplicados, longitudes inconsistentes y perfiles mayores de 1 MiB.
- [x] PNG: comprobar nombre, separador, método y cabecera zlib del chunk iCCP, con tamaño comprimido máximo 1 MiB; verificar CRC con la fase 5B2e. **No** se descomprime ni audita internamente el perfil en el Worker.
- [x] WebP: conservar un ICCP válido estructuralmente antes de los datos de imagen, rechazar duplicados/excesos y corregir el flag ICC de VP8X.
- [x] Añadir pruebas sintéticas ICC válidas e inválidas en `technical-photo-privacy.cjs`; verificar GitHub Actions con Worker y D1 aislados. Sin alterar el color ni tocar las fotos históricas.
- [ ] Revisar el efecto del límite de perfil con imágenes reales **autorizadas** (sRGB, Display P3 y perfiles especiales) y documentar rechazos legítimos; si afectan operaciones, ajustar tras pruebas, sin relajar silenciosamente controles.
- [ ] Evaluar privacidad de etiquetas ICC y posible expansión de iCCP comprimido en entorno privado; el guard actual NO garantiza que un perfil admitido carezca de datos personales ni que se haya decodificado íntegramente.
- [ ] Revisar el plan de 7 etapas y obtener aprobación, respaldos y pruebas manuales antes de cualquier publicación.

## Etapa 2/7 — autenticación y seguridad de accesos (parcial, no cerrar etapa)
- [x] Inicio de sesión admin y cliente con PBKDF2/JWT ficticios y comprobación de límites de roles en Worker + D1 aislados.
- [x] Manejo seguro de JSON malformado, nulo, arreglos o tipos incorrectos en autenticación, refresh, perfil y cambio de contraseña. HTTP 400/401 controlados, sin 500 por lectura de propiedades.
- [x] Tests de integración para entradas inválidas en `/api/auth/setup`, `/api/auth/login`, `/api/auth/sign-in`, `/api/auth/customer/login`, `/api/auth/refresh`, `/api/auth/me` y `/api/auth/password`.
- [ ] Resolver o diagnosticar con autorización el **401 histórico del administrador real**; los tests con cuenta ficticia no lo descartan. Nunca publicar hashes o contraseñas en GitHub ni chats.
- [ ] Confirmar WAF/Turnstile, límites de IP, CORS y dependencias, así como los flujos reales de registro/login/permisos en Android/iPhone y escritorio.
- [ ] Validar manualmente todos los módulos protegidos y documentar incidencias restantes según [VALIDACION-SEGURIDAD-ACCESOS.md](./VALIDACION-SEGURIDAD-ACCESOS.md).
- [ ] Mantener la cuenta de las **7 etapas pendientes** hasta completar también privacidad de fotos, QA manual y puertas de producción.

## Etapa 2/7 — límites de intentos y dependencia npm (avances de seguridad)
- [x] Sustituir contador de acceso D1 de doble operación (`INSERT` + `SELECT`) por una escritura atómica con `RETURNING hits`, sin crear migración ni cambiar políticas de cuotas.
- [x] Probar en GitHub Actions 12 logins erróneos concurrentes y 429 al superar el límite, incluyendo bloqueo de credenciales válidas una vez excedido el presupuesto de IP.
- [x] Añadir auditoría npm automática de solo lectura al flujo de validación de rama; se registran totales y paquetes públicos afectados, sin publicar tokens ni registros completos del gestor npm.
- [ ] Evaluar **alertas npm**: primer reporte informativo encontró producción 0 críticas/altas y 1 moderada; conjunto completo (incluye desarrollo) 2 altas, 7 moderadas y 1 baja. Revisar la cadena de dependencias y actualizar solo con verificación; no ejecutar `npm audit fix --force` a ciegas.
- [ ] Revisar el tratamiento de buckets expirados de `rate_buckets` y limpieza segura en entorno aislado; hoy no existe purga automática de filas antiguas. No ejecutar DELETE remoto como parte de esta etapa.
- [ ] Confirmar Cloudflare WAF/Turnstile y limitaciones frente a IP compartida, encabezados ausentes y ataques distribuidos. La protección D1 por IP es una defensa complementaria, no un WAF.
- [ ] Mantener pendientes QA manual, 401 admin real y pruebas de fotos/consentimiento. El total permanece en 7 hitos hasta cerrar puertas enteras.

## Etapa 2/7 — parches npm en PR sin fusionar (16-11-2026)
- [x] [PR #2](https://github.com/Jorge123tkd/Energia-Vital/pull/2): Hono 4.13.18, lockfile npm, pruebas CI y auditoría de producción sin alertas críticas/altas/moderadas. **DRAFT, no fusionado.**
- [x] [PR #3](https://github.com/Jorge123tkd/Energia-Vital/pull/3): Vite 6.4.6, plugin Svelte 5.1.1, Undici 7.30.2 con override raíz, lockfile npm y pruebas aisladas. Auditoría del candidato: 0 críticas, 0 altas, 1 moderada y 3 bajas. **DRAFT, no fusionado.**
- [ ] Revisar diff de ambos PR y `package-lock.json` tras combinarlos; regenerar con npm, ejecutar CI y auditoría completa sobre el mismo SHA congelado.
- [ ] Revisar `overrides.undici`, compatibilidad Windows/Linux y comprobar la UI en teléfonos reales con Vite 6/Svelte.
- [ ] Resolver o aprobar riesgos npm residuales; terminar WAF, 401 admin real, privacidad/fotos y QA manual antes de marcar la etapa 2 como cerrada. Continúan **7 hitos completos pendientes**.

## Reconciliación PR #2 + #3 (16-11-2026) — NO aprobada
- [x] Comprobar los dos PR separados y reproducir integración con npm en ramas temporales.
- [x] Detectar Hono 4.13.13 anidado y sin integridad en el candidato combinado; impedir aceptación incorrecta.
- [x] Retirar los workflows de escritura temporales de los dos ensayos fallidos.
- [ ] Obtener un único `package-lock.json` **regenerado por npm** que incorpore Hono 4.13.18, Vite 6.4.6, plugin Svelte 5.x y Undici 7.30.1+.
- [ ] Confirmar `npm ci`, auditoría cero alertas altas/críticas y Worker/D1/Svelte de ensayo en el mismo SHA.
- [ ] Revisar PR combinado, compatibilidad móvil/desktop y autorizar por separado cualquier fusión; **no** publicar producción.
- [ ] Mantener los siete hitos pendientes, especialmente WAF, 401 real del admin, ICC/fotos consentidas, copia y ensayo D1/R2.

## Preparación
- [ ] Congelar cambios funcionales, documentar versión SHA, mantener PR revisado y fusionar en main solo después de aprobación.
- [ ] Exportar y verificar respaldo reciente de D1; documentar versión del Worker y último despliegue Pages.
- [ ] Verificar migraciones remotas `No migrations to apply`, bindings D1/R2 y secretos Cloudflare.
- [ ] Tener procedimiento de rollback de Worker/Pages y recuperación de D1 probado en entorno aislado.

## Compilación, dependencias y seguridad
- [ ] `npm ci`, typecheck API/web, build web, pruebas de integración con D1 local, test solar.
- [ ] `npm audit --omit=dev` y `npm audit`; investigar cada hallazgo y actualizar sin cambios incompatibles no probados.
- [ ] Inspeccionar dependencias, workflows, cabeceras de seguridad, CSP, CORS, CSRF, XSS y validación de entradas/archivos.
- [ ] Verificar ausencia de secretos en repositorio, registros, mapas de código y respuestas públicas.
- [ ] Probar aislamiento y autorización entre cuentas cliente, administrador y moderador; expiración y revocación de sesiones.
- [ ] Comprobar límites de peticiones, tamaños y tipos reales de imágenes, acceso privado a R2 y eliminación segura.
- [ ] Resolver advertencias de compilación y accesibilidad, o registrar una excepción documentada.

## Pruebas por página
- [ ] Inicio: carrusel, imágenes responsivas, enlaces, contacto, SEO/metadata y rendimiento.
- [ ] Catálogo: filtros, búsqueda, paginación del administrador, fotos, precios, valoración verificable y consulta.
- [ ] Servicios: alta, edición, ocultar y borrar sin pérdida de citas; galerías de fotografías.
- [ ] Galería: múltiples fotos por proyecto, categorías, móvil, eliminación y recuperación correcta.
- [ ] Mi sitio web: edición del footer, varias líneas de contacto, previsualizaciones y guardado.
- [ ] Clientes: alta, login, perfil, recuperación de acceso si aplica, protección y cierre de sesión.
- [ ] Citas/Solicitudes: búsqueda por ID, paginación, cambios de estado, WhatsApp y referencias copiables.
- [ ] Fotos de reclamaciones y mantenimientos: privada para propietario/personal; denegada para terceros.
- [ ] Notificaciones: manual, cliente único/todos, bienvenida, estados y moderación de permisos.
- [ ] Asistente: modal, pantalla completa, nuevo chat, historial de años anteriores, renombrar, eliminar, compartir texto, cambio de sesión y aislamiento por cliente.
- [ ] Asesor solar sencillo y técnico: consumos, W/kWh, batería, MPPT con límites del fabricante, errores y supuestos.
- [ ] Todas las rutas: URLs directas, navegación atrás, recarga y enlaces desde la cuenta.

## Navegadores, dispositivos y accesibilidad
- [ ] Probar en Android/iPhone/tablet/desktop: menús, modales, teclado, fotos, orientación y área segura.
- [ ] Navegación solo por teclado, foco en diálogos, lectores de pantalla, contrastes y mensajes de error.
- [ ] Comprobar con red lenta, API caída, imágenes no disponibles y sesiones expiradas.
- [ ] Revisar Core Web Vitals, LCP, CLS, peso de imágenes y scripts.

## Producción y lanzamiento
- [ ] Validar primero en entorno de pruebas sin afectar clientes y conservar evidencia de pruebas.
- [ ] Aplicar migraciones a D1 remoto solo después de backup y confirmación; desplegar Worker antes que Pages.
- [ ] Verificar endpoints /health y todos los flujos reales con una cuenta de pruebas (sin facturas reales).
- [ ] Monitorizar errores y logs tras despliegue; publicar acta de pruebas/limitaciones.
- [ ] Tras aprobación final, fusionar PR, crear etiqueta de Git `v1.0.0` y documentar cambios.

**Estado:** revisión funcional en curso. No declarar v1.0 lista hasta completar cada criterio o registrar su excepción aprobada.
