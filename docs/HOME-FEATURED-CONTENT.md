# Destacados de Inicio

Inicio reutiliza las tarjetas y los visores de catálogo, servicios y galería. Las tres secciones se cargan de forma independiente: un error en una no impide mostrar las demás.

En Administración, al crear o editar un servicio o proyecto, activa **Destacar en inicio**. El contenido debe estar publicado para aparecer. Desmarcar la opción lo retira de Inicio sin quitarlo del listado público. Ocultarlo lo retira de ambos. Los registros existentes empiezan sin destacar; no se seleccionan proyectos automáticamente.

Las portadas de las tres secciones públicas comparten CardImage.svelte: altura de 192 px, recorte centrado, zoom de 1.05 al pasar el cursor o enfocar el botón, carga diferida y reemplazo si falla la imagen. Con movimiento reducido se desactiva la animación. Al pulsar se abre el visor de detalles existente, con la fotografía completa sin recorte.

## Actualización

1. Obtener los cambios de feat/cloudflare-customer-accounts-hardening y ejecutar npm ci.
2. Antes de actualizar la API, aplicar 010_home_featured_content.sql mediante las migraciones D1. Añade is_featured a servicios y proyectos sin borrar datos.
3. Desplegar API y después compilar y desplegar frontend.
4. En el administrador, destacar los servicios y proyectos elegidos. Verificar Inicio y sus visores en el entorno desplegado.

Desde la raíz del repositorio, una vez preparado el respaldo de producción:

```powershell
cd apps/api
npx wrangler d1 migrations apply energia-vital-db --remote
npm run deploy
cd ../..
npm run build:web
npm run deploy:web
```

Mantener la configuración de URL de API y rama de Pages del entorno de destino.

## Verificación de este cambio

- TypeScript API y Svelte: sin errores; Svelte sin advertencias.
- Build del frontend: correcto.
- Migraciones 001–010: aplicadas en D1 local.
- Pruebas del asesor solar y suite de integración Worker/D1: correctas.
- Cobertura nueva: selección explícita, rechazo de booleanos inválidos, persistencia al editar otros campos, ocultar, republicar y quitar de destacados conservando el listado completo.
- Revisión visual móvil/escritorio pendiente: el navegador automatizado no pudo arrancar por las restricciones de sockets del entorno.
- No se ha desplegado esta actualización en producción. La auditoría general de versión 1.0 sigue en RELEASE-V1-CHECKLIST.md.
