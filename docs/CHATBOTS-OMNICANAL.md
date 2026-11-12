# Chatbots de Bonaire — WhatsApp y Telegram
Actualizado: 12 de noviembre de 2026.

## Estado ACTUAL — Telegram primero (12 de noviembre de 2026)

La decisión más reciente del propietario reemplaza las fases antiguas de WhatsApp: se trabajará con **Telegram Bot API**, mientras WhatsApp/WhatsApp Business normal seguirá como atención humana de clientes cubanos. El código de WhatsApp Cloud API permanece inactivo por restricciones para números +53; **su archivo de migración fue movido fuera de las migraciones activas** a `docs/archived-migrations/011_whatsapp_bot_foundation.sql`. La ÚNICA migración nueva activa es `apps/api/migrations/011_telegram_bot.sql` y todavía NO ha sido aplicada.

El bot de Telegram está preparado **solo en GitHub** (aún sin tokens, typechecks ni despliegue): `apps/api/src/routes/telegram.ts` integra catálogo, FAQ, asesoría solar, elTOQUE con token autorizado y rechazo de temas ajenos a Bonaire. Guarda mensajes y contexto en D1 separado del portal de clientes, permite `/nuevo`, `/historial` y `/borrarhistorial`. El acceso a agenda y tickets solo lo obtiene personal `admin/operator` activo que vincule su chat privado mediante un código de un solo uso emitido desde su sesión `/admin`. Comandos `/hoy`, `/manana`, `/pendientes`, `/desvincular`.

También hay un resumen opt-in **a las 7:00 a. m. de Cuba** preparado con cron y `/avisos si`/`/avisos no`, sin activar por defecto ni afirmar asignaciones individuales de técnicos. Webhook firmado con secreto de Telegram, anti-duplicados y límites. Ningún usuario de Telegram puede obtener su historial web privado solo por el nombre o teléfono. Los trabajadores deben primero iniciar el chat con el bot.

**Instrucciones vigentes y requisitos de activación:** [Telegram Bonaire desde cero](./TELEGRAM-BOT-DESDE-CERO.md).

**Los apartados más abajo son notas históricas** y no autorizan ejecutar el archivo de WhatsApp archivado ni activar Meta.

## Acuerdos recuperados del usuario
- WhatsApp y Telegram de **chatbot** son canales atendidos por el **asistente de Bonaire**, no números de administradores. Los teléfonos de atención humana y los enlaces de redes sociales son distintos.
- En los bots, al elegir «Nueva conversación» se inicia una sesión independiente; el usuario quiere conservar memoria e historial para recuperar chats anteriores siempre que el canal lo permita.
- La experiencia web ya ofrece conversaciones privadas, nuevo chat, búsqueda, renombrar, eliminar, compartir texto y pantalla completa. No se deben exponer esos mensajes a personas no autenticadas ni mezclar cuentas por número de teléfono.

## Orden de trabajo acordado el 12 de noviembre de 2026
1. **Primero** corregir el asistente web antes de copiarlo a canales nuevos. Regresión: conversaciones sobre crisis mundial, precio del dólar/euro y dos aires acondicionados sin pérdida de datos. Una API autorizada de elTOQUE, con token en un secreto de Cloudflare, puede responder tasas del mercado informal; sin token, no inventar cifras.
2. **Alcance corregido por decisión expresa del propietario:** el bot NO responderá preguntas de cultura general o crisis mundial: redirigirá a Bonaire. El asistente determinista actual (con `WORKERS_AI_ENABLED=false`) ya comparte catálogo, servicios, asesoría solar y tasas vía elTOQUE autorizadas. NO activar un chatbot general de noticias.
3. **Luego** preparar un bot de Telegram con BotFather, su token secreto y webhook verificado; y WhatsApp Business Platform Cloud API con un número del **bot** que no sea el de los gestores de ventas, webhook seguro y aprobación de la plataforma.
4. Ambos canales deben reutilizar la **misma lógica** del asistente de Bonaire y respetar identidad, historial, límites, verificación del cliente y privacidad. Los enlaces `wa.me` o `t.me` por sí solos **no** implementan un chatbot.
5. Este cambio de noviembre **no configura ni despliega** ninguno de los dos bots. Primero validar backend y consultar los permisos/credenciales que administrará el propietario. No subir secretos a GitHub.

## Alerta regional: clientes cubanos (+53) y WhatsApp Cloud API

Meta/WhatsApp Business Platform excluye números de Cuba **+53** de las comunicaciones de la API comercial. Es distinto de los enlaces `wa.me` y de conversar manualmente en WhatsApp Business App. Cambiar de desarrollador, intermediario o país de acceso no subsana la exclusión de los teléfonos destinatarios. Los proveedores oficiales Twilio y 360dialog también documentan la restricción:
- https://help.twilio.com/articles/360051177134-What-countries-can-I-reach-with-the-Twilio-API-for-WhatsApp
- https://docs.360dialog.com/docs/support/client-faq

**Decisión recomendada mientras exista la restricción:** no aplicar la migración WhatsApp archivada, no configurar secretos Meta ni anunciar el bot de WhatsApp como disponible a clientes +53. No contratar terceros que prometan evadir las normas ni automatizar WhatsApp Web. Mantener WhatsApp/WhatsApp Business normal como canal **humano** de ventas, enlazado a «Crear solicitud» en /admin.

**Alternativa técnica:** priorizar **Telegram Bot API** y reutilizar Cloudflare Workers + D1 y el asesor de Bonaire para clientes, más vinculación verificada y comandos HOY/MAÑANA/PENDIENTES para staff. Hay un webhook Telegram elemental en `apps/api/src/routes/telegram.ts`, pero no tiene todavía la agenda ni el motor comercial conectados, y tampoco recordatorios programados. Probar Telegram con usuarios reales y evaluar disponibilidad y normativa antes de activarlo. Documentación: https://core.telegram.org/bots/api

Si Meta modifica las restricciones o existe actividad legítima con destinatarios de un país admitido, reevaluar con la cuenta real de la empresa, nunca mediante datos ficticios.

## Nueva etapa acordada — WhatsApp para clientes y personal

El usuario decidió el 12 de noviembre iniciar **primero WhatsApp**, integrarlo a `energia-vital-api`, mantener respuestas **comerciales exclusivamente** para clientes y ofrecer una vista privada de agenda para personal vinculado. Los avisos internos de solicitudes se eliminan del menú `/admin`, sustituidos por un contador de solicitudes pendientes; administradores/moderadores pueden registrar manualmente solicitudes recibidas por WhatsApp, incluso si el contacto aún no tiene cuenta.

La primera base real ya quedó en GitHub: `apps/api/src/routes/whatsapp.ts`, migración nueva `011_whatsapp_bot_foundation.sql`, vinculación de personal desde `/admin → Mi cuenta`, verificación de firma HMAC Meta, contexto solar por remitente y comandos `HOY`, `MAÑANA`, `PENDIENTES`, `DESVINCULAR`. **No está desplegada ni configurada con Meta**; requiere typecheck, test nuevo, D1 011, credenciales privadas y QA. Las consultas privadas requieren OTP temporal desde web autenticada, no coincidencia del número de teléfono.

Los recordatorios proactivos por la mañana, asignación de técnicos, plantillas Utility aprobadas, vinculación de clientes y sincronización de sus historiales siguen **pendientes de segunda fase**. Se debe verificar que los mensajes reales de WhatsApp cumplan consentimiento, la ventana de atención y la política de Meta. El bot no inicia una solicitud de cliente ni agenda automáticamente.

**Guía completa de implementación:** [WhatsApp Cloud API desde cero](./WHATSAPP-BOT-DESDE-CERO.md).

## Estado real
- **Código preparado en rama:** nuevos ajustes `bot_whatsapp_url` y `bot_telegram_url` en Mi sitio web. Se muestran enlaces independientes en el pie de página y en Solicitar servicio si el administrador configura URL HTTPS oficiales (wa.me / api.whatsapp.com y t.me / telegram.me). No hacen público un enlace hasta guardarlo.
- **Telegram existente:** hay un webhook con secreto que devuelve mensajes de orientación sobre el acceso web, pero NO se ha conectado al historial privado del asistente ni soporta /nuevo o /historial todavía. El mensaje fue actualizado para nombrar Bonaire y no prometer funciones que no están activas.
- **WhatsApp:** ya hay implementación inicial del webhook de Cloud API y vinculación staff en la rama, pero está **inactiva sin los secretos de Meta y migración 011**. Los enlaces wa.me de teléfonos comerciales siguen siendo contacto tradicional. Enlazar un número del bot en el sitio NO lo activa automáticamente.
- **No se han configurado ni probado credenciales, webhooks Meta reales o Telegram nuevo en producción**. Solo código en GitHub; no guardar tokens o claves en GitHub. `/api/whatsapp/webhook` debe quedar deshabilitado hasta configurar los secretos.

## Diseño objetivo antes de activar bots
1. **Canales separados:** número WhatsApp del bot distinto del contacto humano; usuario Telegram del bot distinto de una cuenta personal. El panel «Mi sitio web» permite modificar solamente los enlaces visibles, no secretos.
2. **Identidad segura:** enlazar el identificador de canal a la cuenta Bonaire mediante un flujo de vinculación de un solo uso verificado en la web autenticada; nunca identificar al cliente únicamente por un nombre o teléfono que se haya escrito en un mensaje. Sin vincular, limitarse a catálogo público y orientación general; no divulgar citas, solicitudes ni historial de terceros.
3. **Conversaciones:** el primer mensaje o comando «Nuevo chat» abre una sesión, almacena mensajes y contexto en D1 por cliente y canal. En Telegram se pueden ofrecer comandos /nuevo y /historial y botones; en WhatsApp opciones de menú y comandos NUEVO e HISTORIAL. Recuperar una sesión solo después de verificar identidad. No simular listas de conversaciones nativas que la interfaz del servicio no ofrece.
4. **Motor compartido:** consultar el mismo catálogo, precios realmente publicados, servicios y motor de asesoría del asistente web. Nunca inventar cotizaciones, disponibilidad o reservas confirmadas.
5. **Entrega fiable:** verificación de firma de webhook de Meta y secreto del webhook de Telegram, deduplicación de ID de evento, límites por usuario, no registrar mensajes personales sin necesidad, trazabilidad del origen y tratamiento apropiado de errores.
6. **Preparación:** requiere configuración de Telegram Bot API, cuenta y número WhatsApp Business Platform Cloud API, credenciales administradas en secretos de Cloudflare y pruebas end-to-end de cada canal. Solo entonces habilitar enlaces públicos a los bots.
7. **Atención humana:** ofrecer una derivación clara al personal cuando se solicite, sin hacer que los mensajes al bot se envíen automáticamente a teléfonos privados ni compartir conversaciones sin consentimiento.

## Mensajes y lenguaje recomendado
**Bot — Bienvenida:**
«¡Hola! Soy el asistente virtual de Bonaire ☀️. Puedo orientarte sobre equipos, precios publicados, instalaciones, mantenimiento y solicitudes. ¿En qué te ayudo hoy?»

**Bot — Inicio de chat nuevo:**
«Nueva conversación de Bonaire. ¿Necesitas asesoría solar, precios de equipos o solicitar un servicio?»

**Sin vincular:**
«Puedo asesorarte sobre paneles solares, inversores, baterías y servicios de Bonaire. Las solicitudes y agendas privadas requieren un acceso verificado; por ahora consulta tu cuenta de la página.»

**Confirmación de solicitud:**
«Recibimos tu solicitud del servicio [nombre]. Referencia: [ID]. Está pendiente de revisión; puedes consultar el estado desde Mis solicitudes.»

**Servicio no disponible:**
«Ese servicio ya no está publicado. Elige otro servicio de la lista actual o solicita orientación.»

No prometer una reserva ni un pago antes de la confirmación del sistema. Mantener mensajes cortos, claros, inclusivos, consistentes y orientados a una acción concreta.

## Verificaciones pendientes
- Confirmar que los enlaces configurados llevan a cuentas de bot, no a los teléfonos del personal.
- Definir y construir la vinculación segura entre identidades web/Telegram/WhatsApp y las sesiones multicanal, incluyendo persistencia por canal, tratamiento de consentimiento y recuperación.
- Revisar permisos, validación de webhooks, duplicados, límites de mensajes y política de privacidad.
- Probar cada canal con credenciales de prueba autorizadas y verificar que ningún cliente pueda leer mensajes ajenos.
