# Asistente de Bonaire — preguntas generales, asesor solar y tasas elTOQUE
Actualizado: 12 de noviembre de 2026.

## Alcance vigente del asistente (última decisión del usuario)

El asistente **solo asesora sobre Bonaire**: productos solares, inversores, baterías, energía de respaldo, instalaciones, mantenimiento, reparaciones y trámites disponibles. No debe actuar como un asistente de cultura general ni investigar guerras o crisis mundiales. Cuando el cliente pregunte «¿Qué sabes de la crisis mundial?», se ofrece una respuesta breve, sin desarrollar la noticia:

> Sobre ese tema no tengo información para ofrecerte. Soy el asistente de Bonaire y puedo asesorarte sobre paneles solares, inversores, baterías, autonomía eléctrica, productos y servicios de instalación o mantenimiento. ¿En qué puedo ayudarte?

El Worker intercepta temas explícitamente fuera del ámbito (incluso en medio de un estudio solar, sin perder su progreso), y el motor no delega intenciones generales al proveedor de IA. Una pregunta relacionada con apagones o energía no se descarta por contener la palabra «crisis». El cambio de USD/EUR/CUP vía elTOQUE es una excepción comercial que el usuario solicitó anteriormente; no equivale a permiso para responder economía mundial.

## Problema reproducido
El usuario compartió una conversación en la que «Saber de la crisis mundial» acabó en una presentación comercial, «Precio del dolar» mostró un panel de 550 W y el estudio ignoró «2 aires acondicionados», mostrando apenas 440 W de potencia simultánea.

**Causa principal:** el motor de respuestas es mayormente determinista y sin búsqueda general activa. Hasta este cambio, `detectIntent` priorizaba «precio» como catálogo incluso al hablar de USD, y el parser solar reconocía «aire acondicionado» o «split» pero omitía «aires acondicionados» (plural). Las cargas no reconocidas se descartaban en silencio.

## Cambios realizados en la rama
- La intención `currency_exchange` se detecta **antes** de consultas de precios de productos y de FAQ. Conversaciones sobre USD, EUR, CUP, MLC y cambio consultan el nuevo adaptador `apps/api/src/exchange-rates.ts`.
- La API oficial de elTOQUE es `GET https://tasas.eltoque.com/v1/trmi` con `Authorization: Bearer <token>`. Hay que solicitar una clave **por aplicación** y conservarla como **secreto privado de Cloudflare Workers**. No incluirla en el frontend, el repositorio, mensajes ni URLs.
- El adaptador espera una respuesta con `tasas.USD`, `tasas.ECU` (euro según el contrato observado) y `tasas.MLC`, valida que sean números positivos y exige fecha reciente (máximo 48 horas). Consulta con tiempo máximo aproximado de 6,5 s y caché de memoria de 10 min. Como el esquema de respuesta 200 no está fijado en el OpenAPI oficial, **la forma real debe confirmarse con la primera respuesta autorizada**, sin publicar datos sensibles ni tokens.
- Si la clave no está configurada o el proveedor falla, responde con el enlace a elTOQUE **sin inventar valores**. Muestra siempre la tasa informal como referencia distinta de la tasa bancaria oficial; si hay datos, atribuye la fuente, publica USD/EUR/MLC en CUP, fecha comunicada y una relación EUR/USD **derivada** explícitamente, no presentada como cotización directa del proveedor.
- **Política corregida por petición expresa posterior del usuario (12 de noviembre):** el asistente de Bonaire NO debe ofrecer explicaciones generales sobre crisis mundial, política, guerras ni otros temas ajenos a la empresa. Responde cortésmente que no tiene información para ofrecer sobre el tema y vuelve a paneles, inversores, baterías, autonomía, productos o servicios de Bonaire. Las consultas de divisas vinculadas a elTOQUE se mantienen como **excepción solicitada previamente**, con fuente autorizada y sin inventar tasas. La restricción se aplica al motor determinista, al prompt y al flujo de API antes de consultar cualquier proveedor de IA.
- El parser de cargas solares reconoce singular y plural de aire acondicionado, incluyendo «2 aires acondicionados», «airas acondicionados» y «splits». Si aparece una categoría que no identifica, varias categorías juntas sin separar o una cantidad inválida, **pide aclaración** en lugar de ignorarla. El estudio empieza preguntando si existe un inversor. El nivel básico ya no exige que el usuario introduzca horas solares pico; usa 4,5 como supuesto temporal explícito.
- Cuando hay aire acondicionado, el estudio advierte que 1.200 W por equipo son solo una hipótesis; confirmar placa, consumo por ciclo, tipo inverter y picos de arranque. Para los cinco aparatos del chat original: 1 televisor (90 W), 1 refrigerador (150 W), 2 aires (2 × 1200 W), 5 LED (50 W), 1 computadora (150 W) = **2840 W nominales de referencia** si todos funcionan simultáneamente. No son mediciones reales ni una recomendación definitiva de inversor o batería.

## Activación aprobada de elTOQUE
1. Solicitar una clave para la aplicación **Bonaire** en el formulario oficial: https://tasas-token.eltoque.com/
2. Revisar y aceptar sus condiciones: https://eltoque.com/api-tasas-de-eltoque-terminos-y-condiciones-de-uso
3. **Solo cuando se disponga de la clave,** desde `apps/api` ejecutar `npx wrangler secret put ELTOQUE_API_TOKEN` y pegar el token **directamente en PowerShell**, no en ChatGPT o GitHub.
4. Después de validar los cambios de TypeScript y la prueba focalizada, publicar el Worker según el procedimiento controlado. Probar «precio del dólar», «euro», «dólar a euro». Sin clave, la respuesta será transparente y no contendrá tasa actual.
5. Monitorear 401/422 (clave), 429 (cuota), errores de conexión y cambios de formato. No hacer scraping de eltoque.com como sustituto: la API es el canal autorizado. El caché actual es por instancia y **no** garantiza una petición global cada 10 minutos.

## Referencias
- API oficial: https://tasas.eltoque.com/docs/
- Contrato OpenAPI: https://tasas.eltoque.com/static/swagger.json
- Página pública de tasas: https://eltoque.com/tasas-de-cambio-cuba/mercado-informal/
- Metodología: https://eltoque.com/metodologia-de-la-tasa-representativa-del-mercado-informal-de-eltoque
- Términos y condiciones: https://eltoque.com/api-tasas-de-eltoque-terminos-y-condiciones-de-uso

## Comprobación incremental pendiente
Desde la raíz del repositorio, **sin D1 ni frontend**:
```powershell
git pull --ff-only
node apps/api/tests/assistant-regression.cjs
npm run typecheck --workspace=apps/api
```
El test focalizado solo reproduce conversaciones y valida adaptadores con datos simulados, no llama a la API de elTOQUE. No ejecutar `npm ci`, reconstrucción web ni pruebas integrales si no se modifican esos módulos.

## WhatsApp y Telegram: fase posterior
Este cambio **no activa bots**. El proyecto tiene enlaces públicos e integración parcial de Telegram, pero aún no existe un bot multicanal que comparta identidad e historial real con el chat web. Se debe desarrollar una capa de identidad vinculada, protección de webhooks, deduplicación, almacenamiento de conversaciones por canal y un motor común de respuesta, sin mezclar el WhatsApp de gestores de ventas ni cuentas personales. Ver `docs/CHATBOTS-OMNICANAL.md`.
