# Manual de Administración — Energía Vital

Este manual explica cómo usar el panel de administración para gestionar productos, servicios, citas, solicitudes y la configuración del asistente.

## Acceder al panel

1. Ve a tu sitio web y añade `/admin` al final de la URL
2. Inicia sesión con las credenciales del administrador
3. Verás el dashboard con resumen y opciones de gestión

## Gestión de productos

### Agregar un producto

1. Ve a **Productos** en el menú lateral
2. Haz clic en **Agregar producto**
3. Completa:
   - Categoría
   - Nombre
   - Marca y modelo
   - Descripción
   - Precio y moneda
   - Estado del inventario (disponible, agotado, por encargo)
   - Especificaciones técnicas
   - Garantía (meses)
   - URL de compra (opcional, redirige a tu canal comercial)
4. Guarda

### Editar un producto

1. En la lista de productos, haz clic en **Editar**
2. Modifica los campos necesarios
3. Guarda los cambios

### Ocultar/mostrar un producto

- Cambia el estado a **Inactivo** para ocultarlo del catálogo público sin eliminarlo.

## Gestión de categorías

1. Ve a **Categorías**
2. Agrega, edita o elimina categorías
3. Las categorías organizan los productos en el catálogo

## Gestión de servicios

1. Ve a **Servicios**
2. Agrega servicios con:
   - Nombre y descripción
   - Alcance del trabajo
   - Tipo de precio (fijo, por cotización, gratuito)
   - Duración estimada (minutos)
3. Los clientes pueden solicitar citas para cada servicio

## Preguntas frecuentes (FAQ)

1. Ve a **Preguntas frecuentes**
2. Agrega preguntas y respuestas que el asistente usará
3. Puedes asociarlas a una categoría

## Configuración del asistente

El asistente conversacional se configura completamente desde el panel:

1. Ve a **Configuración del asistente**
2. Agrega pares de clave-valor para personalizar:
   - `welcome_message`: Mensaje de bienvenida
   - `tone`: Tono de conversación (profesional, amigable, técnico)
   - `default_language`: Idioma (español)
3. Los cambios se aplican inmediatamente sin reiniciar

## Gestión de citas

1. Ve a **Citas**
2. Verás todas las citas programadas
3. Puedes cambiar el estado: Pendiente, Confirmada, En progreso, Completada, Cancelada
4. Agrega notas del técnico para cada cita

## Galería de trabajos

1. Ve a **Galería**
2. Agrega fotos de instalaciones y reparaciones reales
3. Cada trabajo puede tener:
   - Título y descripción
   - Imagen
   - URL de video (YouTube)
   - Categoría
4. Los clientes pueden hacer clic en "Quiero algo parecido" para iniciar una conversación con el asistente

## Configuración general

1. Ve a **Configuración**
2. Edita:
   - URL del canal de YouTube
   - URL del sitio web
   - Información de contacto
3. Estos valores se muestran en el pie de página y el asistente

## Seguridad

- No compartas tus credenciales de administrador
- El panel solo es accesible desde `/admin` y requiere autenticación
- Todas las acciones quedan registradas en el auditoría