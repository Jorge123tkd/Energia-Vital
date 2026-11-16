# Bonaire · 7 etapas pendientes para publicar Brigadas y Expediente 360° de forma segura

**Fecha:** 15 de noviembre de 2026. **Estado:** PLAN, no autorización.
**Alcance:** primera publicación controlada de las funciones actuales de la rama `feat/cloudflare-customer-accounts-hardening`; no equivale a que todo el negocio/plataforma esté terminado. El orden puede ajustarse por hallazgos.

## Situación de partida
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

## Interpretación del número
**7 etapas pendientes** para una publicación controlada de estas funciones; no son 7 mensajes ni 7 commits. Si la auditoría remota o los dispositivos revelan problemas, algunas etapas requerirán iteraciones. Para terminar **toda** la plataforma Bonaire —incluidas iniciativas futuras— no existe aún un número cerrado de pasos.

## Condiciones obligatorias
- Nunca usar el servidor local del propietario.
- Nunca registrar tokens, datos privados o respaldos en el repositorio, Actions artifacts o la conversación.
- Hasta que haya autorización específica: GitHub y Worker/D1 de CI solamente, sin tocar producción.
