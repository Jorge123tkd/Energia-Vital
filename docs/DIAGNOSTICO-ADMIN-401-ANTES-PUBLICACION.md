# Bonaire — diagnóstico del 401 administrativo antes de producción
**Fecha:** 17/11/2026. **Estado: NO RESUELTO EN PRODUCCIÓN**. Diagnóstico de código y evidencia previa; no se ha consultado D1 real en esta comprobación.

## Evidencia existente y conclusión limitada
- El log histórico informado fue `ADMIN_LOGIN_DIAGNOSTICO { encontrado: true, claveCorrecta: false }`: entonces se encontró la cuenta, pero la comparación de clave no coincidió. No demuestra que hoy ocurra igual.
- La ruta `POST /api/auth/login` lee `admin_users` por email normalizado y `is_active=1` y ejecuta `comparePassword(password,password_hash)`. Si no encuentra fila activa o no coincide la contraseña, devuelve 401 genérico.
- La ruta `POST /api/auth/sign-in` también permite autenticar administrador, comprobando el hash original; no se puede presumir que ambos entornos tengan los mismos datos.
- El almacenamiento de hash es PBKDF2: `pbkdf2$iteraciones$salt$hash`. El código de comparación exige formato válido e iteraciones entre 50 000 y 100 000. **Nunca escribir ni imprimir hashes ni contraseñas en logs**.
- Un 401 en login ocurre **antes** de emitir tokens; la rotación de JWT del PR #7 no repara una contraseña incorrecta por sí sola.

## Orden de verificación con aprobación del responsable
1. Confirmar URL exacta de Pages, Worker realmente utilizado, variable `VITE_API_URL`, dominio y si la cuenta se está autenticando por `/api/auth/login` o `/api/auth/sign-in`. No enviar claves en chat.
2. En entorno autorizado revisar únicamente metadatos sanitizados de `admin_users`: existe cuenta, activa, rol permitido, algoritmo reconocido y conteo de formato. Registrar solo resultados booleanos; no exportar ni mostrar correo, sal, hash, tokens u otros datos.
3. Comprobar que la contraseña real utilizada corresponde al usuario activo y al entorno correcto. El propietario la introduce directamente en la pantalla segura; evitar más intentos si se acerca el límite.
4. Si el secreto es desconocido o incorrecto: **restablecimiento controlado por administrador con respaldo y autorización expresa**, registro de auditoría y revocación de sesiones antiguas. No volver a usar `/api/auth/setup`, no sustituir hash mediante comandos improvisados.
5. Tras el restablecimiento aprobado, validar inicio, permisos y logout con un usuario de prueba autorizado. Verificar panel en móvil y escritorio.
6. Si login ya es 200 pero luego falla el panel, distinguir 401 de `/api/auth/admin/me` frente a 401/403 de otras rutas y comprobar el JWT, sesión D1 y rol vigente; no tratarlo como el mismo problema de contraseña.

## Gate
**NO-GO** hasta que un administrador autorizado pueda acceder y operar desde la web real y quede evidencia no sensible de la prueba. No modificar D1 ni desplegar por este diagnóstico.
