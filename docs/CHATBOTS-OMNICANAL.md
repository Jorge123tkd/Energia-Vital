# Chatbots de Bonaire — WhatsApp y Telegram
Actualizado: 11 de noviembre de 2026.

## Acuerdos recuperados del usuario
- WhatsApp y Telegram de **chatbot** son canales atendidos por el **asistente de Bonaire**, no números de administradores. Los teléfonos de atención humana y los enlaces de redes sociales son distintos.
- En los bots, al elegir «Nueva conversación» se inicia una sesión independiente; el usuario quiere conservar memoria e historial para recuperar chats anteriores siempre que el canal lo permita.
- La experiencia web ya ofrece conversaciones privadas, nuevo chat, búsqueda, renombrar, eliminar, compartir texto y pantalla completa. No se deben exponer esos mensajes a personas no autenticadas ni mezclar cuentas por número de teléfono.

## Orden de trabajo acordado el 12 de noviembre de 2026
1. **Primero** corregir el asistente web antes de copiarlo a canales nuevos. Regresión: conversaciones sobre crisis mundial, precio del dólar/euro y dos aires acondicionados sin pérdida de datos. Una API autorizada de elTOQUE, con token en un secreto de Cloudflare, puede responder tasas del mercado informal; sin token, no inventar cifras.
2. **Después** habilitar un motor de respuesta general más capaz (la configuración actual tiene `WORKERS_AI_ENABLED=false` y no hay IA general garantizada) y/o datos periodísticos autorizados para preguntas de actualidad, evitando que el bot finja navegar.
3. **Luego** preparar un bot de Telegram con BotFather, su token secreto y webhook verificado; y WhatsApp Business Platform Cloud API con un número del **bot** que no sea el de los gestores de ventas, webhook seguro y aprobación de la plataforma.
4. Ambos canales deben reutilizar la **misma lógica** del asistente de Bonaire y respetar identidad, historial, límites, verificación del cliente y privacidad. Los enlaces `wa.me` o `t.me` por sí solos **no** implementan un chatbot.
5. Este cambio de noviembre **no configura ni despliega** ninguno de los dos bots. Primero validar backend y consultar los permisos/credenciales que administrará el propietario. No subir secretos a GitHub.

## Estado real
- **Código preparado en rama:** nuevos ajustes `bot_whatsapp_url` y `bot_telegram_url` en Mi sitio web. Se muestran enlaces independientes en el pie de página y en Solicitar servicio si el administrador configura URL HTTPS oficiales (wa.me / api.whatsapp.com y t.me / telegram.me). No hacen público un enlace hasta guardarlo.
- **Telegram existente:** hay un webhook con secreto que devuelve mensajes de orientación sobre el acceso web, pero NO se ha conectado al historial privado del asistente ni soporta /nuevo o /historial todavía. El mensaje fue actualizado para nombrar Bonaire y no prometer funciones que no están activas.
- **WhatsApp:** los enlaces wa.me de teléfonos comerciales son contacto tradicional, NO constituyen por sí mismos una integración de bot. Enlazar un número de bot tampoco activa automáticamente Cloud API.
- **No se han configurado ni probado credenciales, bots, webhooks de Meta o Telegram nuevos en producción**. No se ha publicado esta actualización. No guardar tokens ni credenciales de bots en GitHub.

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
«He iniciado una conversación nueva. Tus conversaciones anteriores siguen disponibles en tu historial, cuando tu cuenta y canal estén vinculados.»

**Sin vincular:**
«Puedo ayudarte con información general. Para consultar solicitudes o recuperar tu historial, vincula primero tu cuenta Bonaire de forma segura desde la web.»

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
