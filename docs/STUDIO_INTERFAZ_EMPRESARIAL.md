# EV Pro Studio integrado en Bonaire — estado y límites

Ruta: `/admin/ev-pro-studio` desde el menú administrativo. Mismo login de personal central. El puente Pages consulta Studio mediante Service Binding; la aplicación Windows usa el canal nativo independiente y no depende del DNS del subdominio de sincronización.

## Secciones web creadas
- **Proyectos autorizados:** consulta de proyectos, navegación por sección y acceso únicamente a las secciones que Studio permite. Los trabajadores reciben exclusivamente las filas técnicas task-* y material-* de proyectos asignados.
- **Editor técnico:** cambios por fila de tareas y materiales con baseRevision, operación idempotente y comparación de versión ante 409. No muta existencias físicas, finanzas ni proyectos fuera del alcance. La edición directa requiere STUDIO_WEB_SECTION_WRITES=true y STUDIO_ENABLED=true (ambas desactivadas).
- **Personal y proyectos:** consulta de membresías y asignaciones, autorización de cuentas de Bonaire existentes, proyectos y vínculo a solicitud comercial verificada. Gates específicos de Studio y el almacén cierran las escrituras.
- **Operaciones:** inventario, compras, proveedores, faltantes, economía y conflictos, solo administración. Cantidades de almacén separadas de existencias del catálogo público.
- **Respaldos:** sólo copia cifrada de metadatos/secciones y comparación, no archivos completos ni restauración. Gate cerrado.
- **Publicaciones:** propuestas internas de catálogo desde filas material-* sin producto publicado; propuestas de galería con referencia de consentimiento de cliente, únicamente mediante administrador; aceptación significa evaluación comercial, nunca publicación automática ni verificación de consentimiento.

## Controles obligatorios antes de habilitar
1. Aplicar y comprobar en entorno de pruebas efímero las migraciones Studio hasta 0005, y las migraciones comerciales 025–028; no asumir que CI significa que las bases de producción se migraron.
2. Aprovisionar Service Bindings y claves secretas de firma/cifrado fuera de GitHub. Comprobar que no se envían tokens de renovación al ejecutable.
3. Crear autorización inicial Studio exclusivamente para identidad central real verificada, sin registro local. Probar roles, proyecto no asignado, conflicto, pérdida de conexión y revocación.
4. Asegurar que el consentimiento consta documentalmente y que ningún producto, imagen o dato de cliente sale a catálogo/galería automáticamente.
5. Completar paridad de ingeniería y respaldo integral; no sustituir Studio 3.8 ni distribuir piloto empresarial como edición definitiva.

**Producción:** todos los gates de escritura y los servicios Studio quedan cerrados por defecto. Los flujos de GitHub marcados como validación no publican ni ejecutan migraciones remotas; los trabajos de despliegue se ejecutan solo si cumplen las condiciones de su workflow.
