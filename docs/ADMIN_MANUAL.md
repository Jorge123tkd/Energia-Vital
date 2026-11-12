# Manual de Administración — Bonaire

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

## Solicitudes: editar o eliminar

En `/admin` → **Solicitudes** cada ficha muestra el estado y la posibilidad de contactar al cliente por WhatsApp. Los administradores pueden:

- Pulsar **Editar**, cambiar asunto, descripción, ubicación y fecha preferida, y guardar. Se conserva el ID, el cliente, el estado y las fotografías. Si otro administrador ya cambió el registro, se solicitará actualizar el listado antes de repetir la edición.
- Cambiar el **estado** desde la ficha (también disponible para operadores).
- Pulsar **Eliminar** para borrar la solicitud permanentemente tras una advertencia explícita. El sistema registra el autor de la eliminación, borra imágenes vinculadas de D1 y solicita la limpieza de los archivos R2. No se permite borrar solicitudes con citas vinculadas; el sistema conserva la referencia y solicita resolverla antes de eliminar.

**Importante:** Eliminar no es archivar. El cliente ya no verá la solicitud en su historial y sus fotos asociadas se pierden. Úsalo solo cuando corresponda; conserva los registros vinculados a una cita.

## Centro de notificaciones y avisos internos

En `/admin` los espacios quedan separados:

- **Notificaciones a clientes:** solo mensajes comerciales enviados desde el administrador y avisos de bienvenida automáticos. Presenta una tarjeta de la configuración actual de bienvenida, su estado, y un historial paginado de envíos agrupados con cantidad de destinatarios y audiencia.
- **Avisos internos:** bandeja privada de los administradores y operadores, incluida la recepción de solicitudes/citas; se consulta desde la campanita y el apartado «Avisos internos». Estos eventos no deben contaminar el historial de campañas del administrador.

Para crear una notificación, selecciona **Todos los clientes activos** o **Clientes específicos**. En el segundo caso, introduce al menos dos caracteres del **ID, nombre, apellidos o correo**, elige una coincidencia y repite tantas veces como sea necesario; los destinatarios aparecen como etiquetas que puedes quitar. El límite por selección es de 100 clientes (para un envío más amplio utiliza «Todos»). No se presenta un desplegable enorme de usuarios.

La configuración de **bienvenida automática** tiene su propio editor. Los mensajes de bienvenida nuevos se guardan con el tipo `welcome` para distinguirlos de las confirmaciones operativas. Los mensajes antiguos guardados como `system` no se reclasifican automáticamente; se conserva la vista de configuración vigente.

## Enlaces del asistente

Los enlaces HTTPS dentro de las respuestas del asistente se muestran como **texto de color y subrayado**, sin desplegar una URL larga. Al pulsarlos se abre la dirección correspondiente. Al utilizar **Compartir texto** el contenido de la conversación se copia/compartirá sin modificar y mantiene la URL original completa (`https://...`).

## Seguridad

- No compartas tus credenciales de administrador
- El panel solo es accesible desde `/admin` y requiere autenticación
- Todas las acciones quedan registradas en el auditoría