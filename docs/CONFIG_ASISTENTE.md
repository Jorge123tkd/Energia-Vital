# Configuración del Asistente — Energía Vital

El asistente conversacional es totalmente configurable desde el panel de administración sin necesidad de programar.

## Secciones configurables

### 1. Preguntas y respuestas (FAQ)

Desde **Preguntas frecuentes**, puedes:
- Agregar nuevas preguntas que los clientes suelen hacer
- Editar respuestas existentes
- Eliminar preguntas obsoletas
- Asociar preguntas a categorías

El asistente consulta estas respuestas antes de generar una respuesta genérica.

### 2. Flujos de conversación

Desde **Configuración del asistente**, define:
- Mensaje de bienvenida
- Preguntas que el asistente debe hacer según la intención detectada
- Reglas para derivar a un humano

### 3. Conocimiento del negocio

- El catálogo de productos se sincroniza automáticamente desde D1
- Los precios y disponibilidad se consultan en tiempo real
- Los servicios y precios se gestionan desde **Servicios**

### 4. Personalidad y reglas

Configura:
- Tono de conversación (profesional, amigable, técnico)
- Idioma (español por defecto)
- Cuándo derivar a un técnico humano
- Límites de uso del asistente

## Cómo funciona el asistente (Nivel 1 - Reglas)

El asistente actual usa reglas deterministas:

1. Detecta la intención del mensaje (palabras clave)
2. Consulta el catálogo real si es una consulta de productos
3. Genera una respuesta basada en reglas predefinidas
4. Guarda la conversación en D1 para seguimiento futuro

### Intenciones reconocidas

| Intención | Palabras clave | Acción |
|---|---|---|
| Saludo | hola, buenas | Mensaje de bienvenida |
| Productos | producto, catálogo, equipo | Listar categorías disponibles |
| Asesor solar | solar, panel, inversor, batería | Hacer preguntas de dimensionamiento |
| Precio | precio, cuánto, cotizar | Dirigir al catálogo |
| Cita | cita, agendar, reservar, visita | Recopilar datos para agendar |
| Reparación | repar, avería, falla | Registrar solicitud de reparación |
| Mantenimiento | mantenimiento | Ofrecer visita de mantenimiento |
| Queja | queja, sugerencia, reclamo | Registrar feedback del cliente |
| General | cualquier otro | Respuesta genérica con oferta de ayuda |

## Próximos niveles (opcional)

- **Nivel 2**: IA para comprender preguntas formuladas de distintas maneras
- **Nivel 3**: Agente con herramientas para ejecutar acciones (crear citas, consultar disponibilidad)

Estos niveles requieren Cloudflare Workers AI u otro proveedor y se activan solo si existen cuotas gratuitas disponibles.