# Bonaire — Bot oficial de Telegram desde cero
Actualizado: 12 de noviembre de 2026. Rama de trabajo: `feat/cloudflare-customer-accounts-hardening`.

## Experiencia conversacional nueva: sin memorizar comandos

El bot es un **chat de Telegram**: cada persona simplemente abre la conversación, pulsa **Iniciar** (botón propio de Telegram) y comienza a hablar en español. Los comandos con barra siguen aceptándose solo por compatibilidad, pero **NO son la interfaz principal** y no hace falta enseñarlos a clientes.

- Cliente: «Hola, necesito un sistema solar», «Quiero saber qué productos tienen», «¿Qué servicios ofrecen?», «Necesito una reparación», «Quiero hablar con una persona». También puede tocar opciones sugeridas: ☀️ Asesoría solar, 🛍️ Ver productos, 🛠️ Servicios, 🧾 Solicitar servicio, 🙋 Hablar con una persona, ✏️ Nuevo chat.
- Asesoría solar: el bot pregunta progresivamente si tiene inversor, si es vivienda o negocio, qué cargas necesita, qué quiere respaldar y cuánta autonomía busca. Ofrece **botones para opciones cerradas** y permite contestar escribiendo con libertad en las preguntas abiertas. Las estimaciones son comerciales y no sustituirán el diseño eléctrico profesional. El contexto de ese chat se conserva entre mensajes.
- Trabajador VINCULADO: puede preguntar «¿Qué trabajos tenemos hoy?», «Muéstrame las citas de mañana», «¿Cuántas solicitudes siguen pendientes?» y el bot le responde con los datos reales del panel. Sus botones especiales solo se presentan después de verificar su vínculo: 📅 Agenda del equipo hoy, 📆 Agenda del equipo mañana, 📋 Solicitudes pendientes, 🔔 Recordatorios.
- Avisos: «¿Cómo funcionan los recordatorios?» muestra estado y botones sin cambiar consentimiento. «Activar avisos diarios» o «Quiero recibir recordatorios» opta expresamente por el resumen general de las 7:00; «Desactivar avisos» lo suspende. Una pregunta genérica no debe activar avisos inadvertidamente.
- Identidad: si el trabajador escribe «Soy del equipo», el bot le explica cómo generar el código desde /admin; después envía **solo los ocho dígitos**, sin comandos ni contraseñas. Las consultas privadas siempre vuelven a validar la cuenta de personal activa. Un cliente no vinculado nunca podrá consultar citas internas, aunque escriba las mismas frases o botones.
- «Nuevo chat», «Historial» o «Borra mi historial» se admiten como texto normal, sin barra inicial. El historial del bot sigue SEPARADO del historial privado del asistente web.
- Reservas y solicitudes: el bot puede conversar, orientar y remitir al portal de Bonaire para registrar solicitudes autenticadas. **Aún no crea solicitudes, reserva citas ni transfiere una conversación a un gestor automáticamente**. Los botones son sugerencias de texto, no promesas de acciones que no estén conectadas.

Esta interfaz usa **ReplyKeyboardMarkup** de la API oficial de Telegram. Las teclas muestran sugerencias y envían el texto escogido como parte del chat; también se puede ocultar el teclado y escribir libremente. No es una Mini App separada ni una IA abierta como ChatGPT: las respuestas reutilizan el motor comercial y solar actual de Bonaire (Workers AI general sigue desactivado).

Referencias: https://core.telegram.org/bots/features y https://core.telegram.org/bots/api#replykeyboardmarkup

**Estado:** el código conversacional está en GitHub y necesita nuevos typecheck API/web, prueba smoke y compilación del frontend antes de reemplazar el Worker/Pages que ya estaban publicados con la versión previa.

## Objetivo
Automatizar el mismo asesor comercial y solar de la web Bonaire en Telegram, separando estrictamente **clientes** de **personal verificado**. Conservar WhatsApp Business App para atención HUMANA del mercado cubano; no depender de Meta Developers ni simular bots de WhatsApp Web.

### Qué está preparado en código (aún no desplegado)
- `apps/api/src/routes/telegram.ts` reutiliza catálogo, FAQ, asesoría solar paso a paso, elTOQUE solo si la clave autorizada está configurada y rechazo a preguntas ajenas a Bonaire. Se guarda historial **solo de Telegram** en D1, separado de cuentas privadas de la web. Comandos `/start`, `/ayuda`, `/asesor`, `/nuevo`, `/historial` (últimos temas del chat actual), `/borrarhistorial`.
- El webhook `POST /api/telegram/webhook` verifica el encabezado secreto de Telegram, procesa **chats privados** de personas reales (no grupos), limita tamaño y consultas, deduplica `update_id` y reintenta fallos; no responde con secretos. Sin token y secreto devuelve `503`.
- Personal de Bonaire: `/admin → Mi cuenta → Vincular Telegram de equipo` genera código de **8 dígitos válido 10 minutos**. Solo una cuenta personal autorizada puede generarlo. En el chat privado con el bot, enviar `/vincular CODIGO`; se validan intentos y rol activo `admin` o `operator`. Luego permite `/hoy`, `/manana`, `/pendientes`, `/desvincular`, `/avisos si`, `/avisos no`.
- `/hoy` y `/manana` presentan las citas **generales abiertas del equipo**, con cliente, hora cubana y dirección cuando exista. NO son asignaciones personales de técnicos. `/pendientes` cuenta solicitudes en estado `pending`.
- Recordatorio opcional a las **7:00 a. m. hora de Cuba** mediante dos Cron Triggers UTC de Cloudflare (11:00 y 12:00 UTC para horario verano/invierno). El Worker comprueba la hora real `America/Havana` antes de enviar, y guarda fecha de envío por usuario para evitar repeticiones. **DESACTIVADO POR DEFECTO** hasta `/avisos si` del personal vinculado. No se envía a clientes ni a trabajadores no vinculados.
- `POST /api/telegram/set-webhook` (admin autenticado) registra únicamente la URL fija `https://energia-vital-api.astrustrus.workers.dev/api/telegram/webhook`; `GET /api/telegram/webhook-info` permite comprobar el estado. El panel incluye botones para estas acciones después de configurar Telegram.

> Nota actualizada: desde ahora la forma recomendada de utilizar el bot es hablarle con frases normales y tocar sugerencias. Los comandos precedidos por `/` documentados más abajo son atajos antiguos opcionales y se mantienen por compatibilidad. La autorización de datos privados no cambia.

## Paso 1 — Crear el bot con BotFather
1. Instala Telegram y verifica que tú y el equipo pueden utilizarlo, y que Telegram está disponible para los clientes a quienes quieres atender.
2. Abre **@BotFather** oficial: https://t.me/BotFather
3. Envía `/newbot`, escribe nombre visible (por ejemplo «Bonaire Asistente») y escoge un nombre de usuario disponible terminado en `bot`. **No inventar aquí un nombre real de bot**: lo entrega BotFather al crearlo.
4. BotFather mostrará un **token secreto**. No lo envíes por ChatGPT/WhatsApp/correo, no lo guardes en GitHub, ni lo introduzcas en el navegador con una URL pública.
5. Puedes configurar texto de presentación con `/setdescription`, foto con `/setuserpic` y comandos con `/setcommands` para mejorar la experiencia. Sugeridos: `start,ayuda,asesor,nuevo,historial,borrarhistorial`. El nombre de usuario público sí se podrá compartir para abrir `https://t.me/<nombre_del_bot>`.

Telegram no permite que un bot **inicie un chat** con una persona: primero cada usuario debe pulsar Iniciar o escribirle al bot. Esto también aplica a quienes quieren recordatorios del equipo. Fuente: https://core.telegram.org/bots

## Paso 2 — Validar el código (sin activar el bot aún)
Desde PowerShell en `C:\Users\Taliety\Desktop\Energia-Vital`:
```powershell
git pull --ff-only
npm run typecheck --workspace=apps/api
npm run typecheck --workspace=apps/web
node apps/api/tests/telegram-bot-smoke.cjs
$env:VITE_API_URL = "https://energia-vital-api.astrustrus.workers.dev"
npm run build:web
```
Estos typechecks y build son **nuevos para Telegram**. No necesitas reinstalar dependencias ni repetir pruebas de asistentes anteriores. La prueba Telegram no toca D1, Cloudflare ni Telegram real; valida el webhook inactivo, rechazo de spoofing, chats privados y el horario cubano.

**No desplegar si hay fallos**. La antigua prueba `whatsapp-bot-smoke.cjs` no es requisito para activar Telegram y la migración WhatsApp no se usa.

## Paso 3 — Aplicar solo la migración nueva de Telegram
La nueva migración activa es `apps/api/migrations/011_telegram_bot.sql`. Crea tablas aisladas para conversaciones, mensajes, IDs deduplicados, códigos de personal, consentimientos y envíos diarios. No cambia clientes ni citas existentes.

La migración anterior `011_whatsapp_bot_foundation.sql` quedó archivada en `docs/archived-migrations/`, FUERA de la carpeta activa, porque nunca se había aplicado en el flujo confirmado. **No confundir ni ejecutar ese archivo archivado**. Si ya hubieras aplicado WhatsApp 011 por tu cuenta, detenerte y consultar el estado de D1 antes de continuar.

```powershell
cd "C:\Users\Taliety\Desktop\Energia-Vital\apps\api"
npx wrangler d1 migrations list energia-vital-db --remote
```
Comprueba que solo está pendiente `011_telegram_bot.sql` y que las migraciones anteriores `001-010` figuran como aplicadas. Si la lista propone otras, NO aplicar a ciegas. Una vez confirmado y con respaldo adecuado:
```powershell
npx wrangler d1 migrations apply energia-vital-db --remote
```

## Paso 4 — Guardar secretos EN CLOUDFlARE
Desde la carpeta `apps/api`, introducir los valores en el terminal local en modo secreto:
```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```
- `TELEGRAM_BOT_TOKEN`: token exacto entregado por BotFather.
- `TELEGRAM_WEBHOOK_SECRET`: cadena **aleatoria e independiente** de 32 a 64 caracteres con letras, números, guiones o guion bajo. No utilizar la contraseña de administrador ni el token del bot como secreto del webhook. No imprimirlo en la consola o chat.
- No usar `TELEGRAM_CHAT_ID` fijo en variables públicas. Cada empleado vincula su chat de forma voluntaria y revocable.

Los secretos quedan como bindings del Worker; el frontend solo recibe indicadores `configured` y `linked`. Si se rota el token de BotFather, los códigos de vinculación emitidos antes de la rotación caducarán; vuelve a registrar el webhook.

## Paso 5 — Publicar Worker y panel
Una vez tests y migración listos, desplegar:
```powershell
cd "C:\Users\Taliety\Desktop\Energia-Vital\apps\api"
npx wrangler deploy
Invoke-RestMethod "https://energia-vital-api.astrustrus.workers.dev/health"
cd ..\..
npx wrangler pages deploy apps/web/dist --project-name energia-vital-web --branch=main
```
La rama de Cloudflare Pages **Production** confirmada es `main`. La rama GitHub de desarrollo sigue siendo `feat/cloudflare-customer-accounts-hardening`; el comando Pages sube el `dist` local validado, no hace checkout de código. Registrar IDs de Worker y Pages tras cada deploy, y verificar el dominio principal.

## Paso 6 — Activar el webhook de Telegram sin revelar tokens
1. Entrar en el panel `/admin` de Bonaire con cuenta administradora.
2. Abrir «Mi cuenta → Vincular Telegram de equipo».
3. Pulsar **Activar webhook de Telegram**. Esta acción invoca el endpoint privado y registra el callback oficial en Bot API usando el token del Worker, sin enviarlo al navegador.
4. Pulsar **Comprobar conexión** y revisar la URL y los errores de Telegram. Si no queda configurado, revisar secrets, migración y respuesta HTTP.
5. Abrir el bot en Telegram y pulsar «Iniciar» o enviar `/start` — debe responder como asistente comercial Bonaire.
6. Probar «asesoramiento solar», «1 nevera, 2 aires acondicionados» a través del flujo y «crisis mundial» (debe rechazar tema ajeno al negocio). El bot jamás debe dar agenda a un cliente no vinculado.
7. Desde /admin generar un código con la cuenta real del administrador/moderador, enviar `/vincular CODIGO` desde SU chat privado y probar `/hoy`, `/manana`, `/pendientes`; después `/desvincular` para comprobar que el acceso se revoca.

Configuración oficial de webhook: https://core.telegram.org/bots/api#setwebhook

## Paso 7 — Activar recordatorios del equipo (opcional)
Únicamente una persona vinculada que **ya abrió conversación con el bot** puede escribir `/avisos si`. Entonces, si hay un trigger activo, recibirá cada mañana un resumen de la agenda **general** del equipo a las 7:00 de Cuba. `/avisos no` lo desactiva y `/desvincular` elimina acceso y consentimiento.

No se ha implementado asignación individual de un técnico a un trabajo, ni envío de mensajes automáticos a clientes, ni confirmación de citas por un «sí» de Telegram. Estos flujos necesitan permisos, reglas, consentimiento e integración posterior con el calendario de Bonaire.

Cloudflare ejecuta Cron en UTC: https://developers.cloudflare.com/workers/configuration/cron-triggers/

## Seguridad y limitaciones
- No se puede convertir una cuenta Telegram en cuenta web de cliente solamente por coincidir nombre, usuario o teléfono. Los mensajes comerciales son públicos; para acceder a solicitudes/compra/historial web, iniciar sesión en Bonaire.
- El bot **no** busca conversaciones de WhatsApp ni inventa historial compartido; `/historial` muestra solo últimos mensajes del chat actual, `/borrarhistorial` borra el historial guardado de ese chat. La privacidad/retención definitiva deberá reflejarse en la política del sitio antes de abrir el bot al público.
- Solo se admiten mensajes de texto de chats privados; ningún grupo puede obtener agenda. No compartas códigos ni tokens. La activación de avisos requiere permiso explícito y vínculo vigente.
- Duplicados de webhook se reconocen por `update_id`; como en cualquier API externa, fallos extremos entre envío y confirmación pueden requerir un outbox transaccional para garantía estricta de entrega. La primera fase registra fallos y reintentos.
- El calendario muestra trabajo GENERAL, no asignación por empleado. Confirmar datos y citas con clientes antes de desplazarte.
- **Estado al redactar:** código en GitHub, migración NO aplicada, secrets NO configurados, bot NO creado ni conectado, sin pruebas de esta tanda aún. No prometer que hay recordatorios enviándose.

## Próximo paso
Primero completa las comprobaciones del Paso 2. Después puedes crear el bot en BotFather de forma privada y comunicar únicamente su **nombre público @usuario**, NUNCA el token. Solo entonces pasar a D1 y secretos. Si BotFather no es accesible desde tu red, verificar disponibilidad/legalidad del servicio sin emplear métodos que eludan restricciones de plataformas o autoridades.
