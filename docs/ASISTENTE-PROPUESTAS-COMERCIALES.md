# Propuestas comerciales en el asistente web

Bonaire recibe propuestas de suministro, promoción de marcas, distribución en Cuba y asociaciones comerciales. No se limita al catálogo solar actual.

## Comportamiento
- Una intención explícita inicia la orientación comercial antes del asesor solar, catálogo, FAQ o IA.
- Pregunta por empresa, país y colaboración deseada, invitando a completar solo datos no mencionados.
- La siguiente respuesta prepara un resumen de lo escrito, para revisar y compartir con el equipo por los canales publicados en Contacto.
- No envía el resumen, registra una solicitud, aprueba contratos ni promete exclusividad.
- Las preguntas generales, asesoramiento y compras de una mipyme no activan este flujo por sí solas. Una pregunta técnica nueva permite salir de la propuesta; Cancelar también.
- El historial usado en web corresponde a la sesión autenticada del cliente. No se vincula por teléfono ni se comparte entre web y Telegram.
- La regla del usuario sobre clasificación residencial/estatal/mipyme/privado está en el prompt: únicamente al pedir contratación, nunca por buscar asesoramiento. No se añadió un perfil B2B persistente ni filtros de administración.

## Validación
Typecheck API, Svelte 0/0, build web, assistant-regression (incluye propuestas y separación de asesoría) y telegram-bot-smoke correctos localmente. No se hicieron pruebas con clientes reales ni cambios remotos de datos. QA visual y despliegue pendientes.

## Publicación
Actualizar la rama, compilar web con VITE_API_URL correcto y publicar Worker + Pages Production/main. No migración D1 ni cambios de secretos o dependencias. La integración prioritaria multivuelta corresponde a la ruta web; Telegram mantiene su enrutador propio.
