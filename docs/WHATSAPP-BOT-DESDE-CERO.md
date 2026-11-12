# Bonaire — Bot oficial de WhatsApp desde cero
Actualizado: 12 de noviembre de 2026.

## Alerta regional: clientes cubanos (+53) y WhatsApp Cloud API

Meta/WhatsApp Business Platform excluye números de Cuba **+53** de las comunicaciones de la API comercial. Es distinto de los enlaces `wa.me` y de conversar manualmente en WhatsApp Business App. Cambiar de desarrollador, intermediario o país de acceso no subsana la exclusión de los teléfonos destinatarios. Los proveedores oficiales Twilio y 360dialog también documentan la restricción:
- https://help.twilio.com/articles/360051177134-What-countries-can-I-reach-with-the-Twilio-API-for-WhatsApp
- https://docs.360dialog.com/docs/support/client-faq

**Decisión recomendada mientras exista la restricción:** no aplicar D1 011, no configurar secretos Meta ni anunciar el bot de WhatsApp como disponible a clientes +53. No contratar terceros que prometan evadir las normas ni automatizar WhatsApp Web. Mantener WhatsApp/WhatsApp Business normal como canal **humano** de ventas, enlazado a «Crear solicitud» en /admin.

**Alternativa técnica:** priorizar **Telegram Bot API** y reutilizar Cloudflare Workers + D1 y el asesor de Bonaire para clientes, más vinculación verificada y comandos HOY/MAÑANA/PENDIENTES para staff. Hay un webhook Telegram elemental en `apps/api/src/routes/telegram.ts`, pero no tiene todavía la agenda ni el motor comercial conectados, y tampoco recordatorios programados. Probar Telegram con usuarios reales y evaluar disponibilidad y normativa antes de activarlo. Documentación: https://core.telegram.org/bots/api

Si Meta modifica las restricciones o existe actividad legítima con destinatarios de un país admitido, reevaluar con la cuenta real de la empresa, nunca mediante datos ficticios.

## Objetivo y límites

El bot usa **WhatsApp Business Platform Cloud API de Meta**, la misma API `energia-vital-api` de Cloudflare Workers, el catálogo de D1, el motor de asesoría solar y la información pública de servicios de Bonaire. No es WhatsApp Web, un navegador automático, una cuenta personal, ni un enlace `wa.me` de un gestor de ventas.

Se distinguen dos experiencias:

| Persona que escribe | Qué permite esta primera fase | Qué no permite todavía |
| --- | --- | --- |
| Cliente no vinculado | Orientación de equipos solares, FAQ, precios de catálogo, asesoría paso a paso con estado persistente por WhatsApp, tasas elTOQUE solo con token autorizado, nuevo chat | Ver cuentas, órdenes, citas o historial web de otros usuarios; crear solicitudes automáticamente; pagos |
| Personal de Bonaire **vinculado** | Todo lo anterior, y `HOY`/`MAÑANA` para citas registradas, `PENDIENTES` para conteo de tickets, `DESVINCULAR` | Enviar mensajes masivos, crear reservas automáticas, cambios de inventario, recordatorios proactivos todavía no configurados |
| Persona que se autoproclama administrador sin vinculación | Solo información pública | Agenda, tickets privados, contactos y ubicación de clientes |

**Restricción comercial:** ninguna pregunta sobre crisis mundial, política u otros temas ajenos a Bonaire se convierte en una explicación general. Se sigue la política del asistente web. Tasas de cambio de Cuba vía elTOQUE son la excepción previamente autorizada; si no hay token, no inventar valores.

## 1. Configurar la cuenta de Meta (se hace fuera de GitHub)

1. Entrar en [Meta for Developers](https://developers.facebook.com/) con una cuenta administradora del negocio, crear una app apropiada para WhatsApp y asociar el portafolio empresarial Bonaire.
2. Configurar una **WhatsApp Business Account (WABA)** y un número gestionado por el negocio. Para pruebas se puede usar el número de prueba de Meta. Los números de gestores de ventas son contactos HUMANOS, no se convertirán en bots por añadir enlaces.
3. Obtener el **Phone Number ID**, el **App Secret** (en App Settings), un **Access Token** autorizado para WhatsApp Cloud API y la **Graph API version** indicada por Meta al crear la app. Para producción, utilizar credenciales de sistema con los permisos adecuados. No confundir el ID del teléfono con el número público.
4. Antes de migrar un número existente, revisar su elegibilidad para **Coexistence** con WhatsApp Business App y las condiciones de Meta. No desconectar un número comercial existente para experimentar. Si no está disponible, utilizar un número del bot dedicado.
5. Crear un **Verify Token** aleatorio de longitud suficiente y guardarlo privadamente; es un secreto acordado entre Cloudflare y la configuración del webhook en Meta.
6. No activar autoenvíos masivos ni mensajes proactivos de trabajo hasta tener opt-in de personal y plantillas aprobadas si la ventana de 24 horas está cerrada.

Documentación oficial: https://developers.facebook.com/docs/whatsapp/cloud-api/overview/ y https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api/

## 2. Código preparado en esta rama

- Ruta de Cloudflare Worker: `GET /api/whatsapp/webhook` responde el desafío de suscripción SOLO si coincide el Verify Token; `POST /api/whatsapp/webhook` valida `X-Hub-Signature-256` con HMAC SHA-256 sobre el cuerpo original, limita tamaño y acepta solo mensajes recibidos por el Phone Number ID configurado.
- Sin **todos** los secretos necesarios, el webhook POST responde `503` y **no envía mensajes**. No afirmar que el bot funciona hasta completar Meta y comprobar una conversación real.
- Responde mensajes de texto entrantes mediante Graph API, usa los mismos módulos de catálogo/FAQ/asesoría solar y almacenamiento separado `whatsapp_conversations`. No usa una sesión de cliente web ni concede permisos por coincidir el número con un usuario.
- `whatsapp_events` evita responder dos veces a un mensaje de Meta cuyo ID ya se procesó, conserva estados de entrega y permite reintentos fallidos. Los reintentos no garantizan exactamente-una-vez en caso de corte durante el envío; el diseño debe reforzarse con cola/outbox antes de escalar.
- `whatsapp_staff_link_codes` y `whatsapp_staff_links` habilitan código de ocho dígitos con duración de **10 minutos**, generado desde sesión de personal válida, verificado en el número que ESCRIBE al bot. Se conserva una relación directa y revocable `wa_id -> admin_user_id`, y se comprueba que el personal sigue activo en cada comando.
- La consola `/admin` tiene «Mi cuenta → Vincular WhatsApp de equipo». Para personal no vinculado, el bot no muestra citas ni tickets. Comandos `HOY`, `MAÑANA`, `PENDIENTES`, `AYUDA`, `DESVINCULAR`, `NUEVO`, `asesoramiento solar`.
- Sin crear solicitudes privadas de cliente desde la conversación del bot mientras no haya vinculación segura de identidad de CLIENTE; los trabajadores pueden registrar contactos WhatsApp sin cuenta desde la ventana «Crear solicitud» del panel de administración.

## 3. Pruebas de código ANTES de tocar producción

Desde PowerShell en la raíz `C:\Users\Taliety\Desktop\Energia-Vital`:

```powershell
git pull --ff-only
npm run typecheck --workspace=apps/api
npm run typecheck --workspace=apps/web
node apps/api/tests/whatsapp-bot-smoke.cjs
$env:VITE_API_URL = "https://energia-vital-api.astrustrus.workers.dev"
npm run build:web
```

La prueba del bot usa firmas HMAC de laboratorio y no toca Meta, Cloudflare ni D1. El build web es necesario porque cambió `AdminPage.svelte` y se añadieron controles de solicitudes y vinculación. Si falla un control, corregir SOLO ese error antes de publicar. No repetir `npm ci`, test solar ni las migraciones antiguas.

## Publicación por etapas, sin bloquear el trabajo administrativo

**Etapa A — Panel y solicitudes.** Después de aprobar los tres controles técnicos, se puede desplegar el Worker y la web de Bonaire para tener el contador de pendientes, la creación manual de tickets y la eliminación de avisos duplicados **sin activar el bot**. Sin credenciales de Meta, `/api/whatsapp/admin/link` responde `configured:false`, no intenta consultar tablas nuevas, y la pantalla informa que la vinculación está pendiente. El webhook tampoco responde a mensajes externos sin configuración. **No hace falta migrar D1 para usar el panel.**

**Etapa B — Bot de WhatsApp.** Cuando el propietario configure la aplicación Meta y tenga sus credenciales, aplicar la nueva migración 011, guardar los secretos directamente en Cloudflare y desplegar Worker de nuevo. Solo entonces activar la suscripción webhook. Si Meta no está lista, no correr la migración por costumbre. La funcionalidad de la web no depende del bot.

## 4. Preparación de D1 (única migración NUEVA, no ejecutada aún)

La integración requiere **`apps/api/migrations/011_whatsapp_bot_foundation.sql`**, que añade tablas separadas para el bot, mensajes deduplicados y vínculos de personal. No modifica clientes ni solicita nuevas credenciales de cuentas existentes. No ejecutar hasta superar las pruebas y tener claro el plan de Meta. Esta migración NO se requiere para publicar la creación de solicitudes, el contador o el menú de administración. Hacer respaldo remoto si no existe uno reciente al momento de la migración.

```powershell
cd "C:\Users\Taliety\Desktop\Energia-Vital\apps\api"
npx wrangler d1 migrations list energia-vital-db --remote
npx wrangler d1 migrations apply energia-vital-db --remote
```

**Revisar la lista:** no repetir las migraciones `001-010` si ya constan como aplicadas. Confirmar que solamente se aplique `011`; si Wrangler propone otras, detener la operación y analizar antes.

## 5. Secretos en Cloudflare Workers (NO copiarlos aquí ni a GitHub)

Desde `apps/api`, cuando Meta esté configurado:

```powershell
npx wrangler secret put WA_APP_SECRET
npx wrangler secret put WA_VERIFY_TOKEN
npx wrangler secret put WA_ACCESS_TOKEN
npx wrangler secret put WA_PHONE_NUMBER_ID
npx wrangler secret put WA_GRAPH_API_VERSION
```

Para la versión Graph introduce el valor soportado **exacto** que indique Meta (formato `vNN.N`), no una versión adivinada. Se define explícitamente para poder actualizarla. Los secretos no deben aparecer en el frontend, los logs ni documentación pública.

Desplegar Worker solo después de pruebas y migración, comprobar `/health`, conservar `Current Version ID`. Para el nuevo frontend, desplegar el dist validado a Pages **Production `main`**, NO a rama preview:
```powershell
cd "C:\Users\Taliety\Desktop\Energia-Vital\apps\api"
npx wrangler deploy
Invoke-RestMethod "https://energia-vital-api.astrustrus.workers.dev/health"
cd ..\..
npx wrangler pages deploy apps/web/dist --project-name energia-vital-web --branch=main
```

## 6. Webhook y pruebas reales en Meta

En la configuración de Webhooks de la app, introducir:
- Callback URL: `https://energia-vital-api.astrustrus.workers.dev/api/whatsapp/webhook`
- Verify Token: el secreto `WA_VERIFY_TOKEN` configurado en Cloudflare.
- Suscribirse a las notificaciones de mensajes entrantes de WhatsApp Business Account.

La verificación se realiza de servidor a servidor. **No abrir manualmente con un Verify Token en la barra del navegador** ni compartirlo para depurar. Meta firmará las notificaciones POST con App Secret.

Con el número de prueba autorizado:
1. Un cliente envía «Hola» y recibe orientación de Bonaire.
2. Envía «asesoramiento solar», indica sus cargas y comprueba que reconoce «2 aires acondicionados».
3. Pregunta «crisis mundial» y obtiene rechazo comercial sin divulgar datos.
4. Envía «HOY» sin vinculación y NO recibe agenda.
5. Personal inicia sesión en `/admin`, abre «Mi cuenta → Vincular WhatsApp de equipo», genera código, escribe `VINCULAR 12345678` (utilizando **su propio código**, no el ejemplo) desde SU WhatsApp, y consulta `HOY`, `MAÑANA`, `PENDIENTES`; desvincula y confirma bloqueo inmediato.
6. Verificar duplicados, firmas falsas y ausencia de exposición de información privada.

**No se ha ejecutado este QA ni configurado ningún webhook Meta.**

## 7. Segunda fase: recordatorios automáticos a las 7:00, citas y asignación

Aún NO implementada. Para la función «a las 7:00 me recuerda los trabajos de hoy y la dirección» se requiere:

1. Definir qué trabajador tiene cada cita; el calendario actual muestra citas, pero NO asigna automáticamente técnico ni comprueba su disponibilidad.
2. Configurar una preferencia explícita por trabajador (opt-in) para recibir WhatsApp de agenda; horario local **America/Havana** con cambio de horario de verano.
3. Configurar un trigger `scheduled` en Workers con control idempotente por `fecha + empleado + tipo`. No programar envíos múltiples ni a números no vinculados.
4. Usar **plantillas Utility aprobadas por Meta** para mensajes iniciados por el negocio fuera de la ventana de atención de 24 horas; revisar costes y normativa vigentes. No enviar texto libre fuera de esa ventana. No asumir gratuidad.
5. Incluir solo citas del trabajador autenticado, fecha/hora, dirección y contacto necesarios. Permitir DESACTIVAR recordatorios; auditar consentimientos y entregas.
6. Confirmar con cada cliente antes del desplazamiento. No prometer asistencia o contacto que el sistema todavía no ejecutó.

## Siguiente paso operativo

La primera fase de código está **solo en GitHub** y necesita pruebas del usuario, migración 011 y credenciales oficiales. El panel de solicitudes y el contador pendientes pueden publicarse después de sus tests con la API; sin embargo, el webhook no debe habilitarse ni anunciarse a clientes sin la verificación y autorización de Meta. Telegram y sincronización completa de historial web siguen para otra fase.

Referencias: https://whatsappbusiness.com/resources/resource-library/organize-whatsapp-inbox-meta-business-suite/ · https://whatsappbusiness.com/trust-and-safety/ · https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api/ · https://support.zendesk.com/hc/en-us/articles/9586188841626-Workflow-How-to-proactively-contact-users-on-WhatsApp-channel
