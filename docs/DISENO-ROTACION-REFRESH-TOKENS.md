# Bonaire — diseño de rotación segura de refresh JWT (etapa 2/7)

Fecha: 2026-11-16. Estado: DISEÑO EN REVISIÓN; no implementado, migrado ni desplegado.
Rama base: `feat/cloudflare-customer-accounts-hardening`.

## Evidencia inspeccionada
- `apps/api/src/auth.ts`: `generateTokenPair` firma tokens de 1 h (access) y 30 días (refresh), con `sid`, `iat`, `exp` y `kind`; no incluye identificador único de refresh. Tokens emitidos durante el mismo segundo para una misma sesión pueden ser idénticos.
- `apps/api/src/routes/auth.ts`: `POST /api/auth/refresh` exige JWT refresh y `activeSession`, consulta rol vigente en D1, pero no consume ni reemplaza el refresh anterior.
- `apps/api/migrations/003_customer_accounts.sql`: `auth_sessions` contiene id, user_id, user_type, created_at, expires_at y revoked_at; sin generación del refresh.
- `apps/api/src/middleware.ts`: bearer solo access; verifica sesión en D1 y cuenta activa.
- `apps/web/src/lib/api.ts`: dispone del método `refreshToken`, pero no es prueba de renovación coordinada entre pestañas. El resto del frontend y su persistencia deben auditarse antes de modificar contratos.

## Objetivo y reglas no negociables
1. Un refresh exitoso entrega un nuevo access y un refresh distinto; el refresh usado ya no es válido para emitir otro par.
2. Cada dispositivo conserva su `sid` aislado: renovar o cerrar sesión en A no invalida B.
3. La transición es atómica en D1 y segura frente a dos POST concurrentes con el mismo token. Sólo uno puede avanzar.
4. Un token antiguo/reutilizado devuelve error controlado sin revelar hash, JWT ni información de cuenta. No asumir que toda reutilización es un ataque: dos pestañas pueden competir.
5. Un access emitido antes de renovar sigue válido hasta su expiración, salvo revocación de sesión o de cuenta. El logout y cambio de contraseña mantienen sus garantías actuales.
6. Los permisos de nuevos JWT siempre se consultan en D1, no se aceptan roles de claims antiguos.
7. Sin registrar tokens en logs; en D1 sólo almacenar un digest SHA-256 de un identificador aleatorio criptográficamente fuerte.
8. Sin cambio de `JWT_SECRET`, TTL, cookies ni políticas de sesión hasta auditar el frontend y acordar compatibilidad.

## Diseño candidato: esquema y servidor
- Nueva migración aditiva `021_refresh_rotation.sql` **todavía no creada**: columna de control de generación/digest actual en `auth_sessions` (nullable inicialmente para compatibilidad histórica); índices solo si lo justifica el patrón de consultas.
- Añadir `jti` aleatorio independiente por cada refresh; no mezclar con `sid`. Validarlo junto a firma y `kind`. Los access no requieren `jti`.
- En refresh, verificar sesión/usuario/rol y efectuar un **UPDATE condicional atómico** sobre la misma fila, de digest esperado a digest nuevo, con `revoked_at IS NULL` y expiración vigente; confirmar que se actualizó exactamente 1 fila. Si no, devolver 401/409 controlado y NO emitir tokens válidos. Evaluar si `D1.batch` y operaciones de cambio de rol requieren coordinación para evitar carreras entre la lectura del rol y la confirmación final.
- Sesiones históricas sin digest: definir explícitamente política de primer canje para tokens legacy; no permitir que dos canjes antiguos ganen. No forzar el cierre de sesiones existentes sin aprobación.
- Concurrencia en varias pestañas: coordinar una sola petición en el frontend y propagar el par nuevo dentro del mismo contexto de sesión; si una petición queda obsoleta, no sobrescribir los tokens más recientes. Evaluar UX cuando otra pestaña ya renovó. No confiar en coordinación cliente como único control.

## Casos de prueba mínimos, todos con Worker y D1 temporales
1. Refresh válido → tokens nuevos distintos; segundo uso del viejo rechazado; el nuevo funciona.
2. Dos refresh simultáneos del mismo JWT → como máximo uno tiene éxito; una sola generación guardada.
3. Dos sesiones/dispositivos de un cliente → renovar A no bloquea B; cerrar A no bloquea B.
4. Logout y cambio de contraseña del cliente revocan el refresh adecuado, incluidos los renovados; controles de rol admin/operator/customer continúan.
5. Refresh como bearer access y access como refresh rechazados.
6. Usuario bloqueado, sesión vencida y rol degradado no ganan nuevos permisos.
7. JSON inválido y refresh sin jti reciben error controlado según la política legacy definida.
8. Compatibilidad con pestañas, recarga y almacenamiento real del navegador, más CI y migración de preservación con registros sintéticos.

## Puerta de implementación
No crear la migración 021 ni modificar los endpoints de autenticación hasta revisar integralmente el frontend que almacena access/refresh, el contrato de `auth_sessions` en todas las rutas y las reglas para sesiones antiguas. No ejecutar en D1/R2 reales ni Cloudflare producción. Tras implementación, verificar el mismo SHA con typecheck API, Svelte, build, migraciones 001–021, integración/concurrencia y preservación ficticia. La etapa 2/7 seguirá abierta por WAF/Turnstile, error 401 de admin real, móviles, privacidad fotográfica y revisión del PR #4.

## Resultado de auditoría frontend — 2026-11-16

Inspección directa adicional de `apps/web/src/App.svelte`, `apps/web/src/components/CustomerAccess.svelte`, `apps/web/src/AdminPage.svelte` y `apps/web/src/lib/api.ts`:

- CustomerAccess recibe `result.access_token` y solo entrega ese token a `onSuccess(user, token)`; no pasa `refresh_token` al estado de aplicación.
- App conserva un único access token en `sessionStorage` para cliente o staff; `restoreSession()` llama a `/me` y elimina la sesión local si falla, pero no intenta una renovación ni distingue fallo de red de token expirado.
- AdminPage también conserva solo `access_token` en `sessionStorage`, y al fallar `adminMe` elimina el token local. Las rutas de administración reciben explícitamente el access token.
- `api.ts` ofrece `api.refreshToken(body)`, pero `apiRequest` no hace renovación coordinada ni reintento. El token de renovación no se guarda en ese cliente.
- Por tanto, **la UI actual no disfruta de los 30 días de refresh que permite la API**; tras vencer el access de 1 h, una petición o recarga puede llevar a nueva autenticación. Esto es un hallazgo de código, **no una prueba manual del navegador**.

### Decisión técnica propuesta para implementar

Primero separar claramente un **diseño de persistencia y renovación frontend** del cambio backend de rotación: el cliente y admin necesitan un flujo unificado que preserve `access` actualizado y coordine refresh concurrentes. Revisar almacenamiento y modelo de amenazas antes de guardar refresh tokens en JavaScript: `sessionStorage` no protege frente a XSS y un cookie HttpOnly/Secure/SameSite requiere estudiar origen Pages/Worker, CORS/CSRF, configuración de dominio y compatibilidad real. **No introducir almacenamiento duradero de refresh tokens por defecto** sin resolver eso. Tampoco borrar tokens locales por fallo de red transitorio, ni renovar ante errores 403 por permisos.

Para el lanzamiento, exigir pruebas de pestañas, reconexión, dos dispositivos, login de staff/cliente, expiración simulada, logout y cambio de contraseña con cuentas ficticias; revisiones en móvil reales pendientes. Mantener la rotación del servidor como fase siguiente a la decisión de transporte. Nada de esto se ha implementado ni probado todavía.
