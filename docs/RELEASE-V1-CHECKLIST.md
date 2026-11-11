# Bonaire — Control de salida 1.0 (PENDIENTE)

Este documento define pruebas de aceptación, no constituye certificación de seguridad ni autorización para publicar. No modificar datos reales durante la auditoría.

## Preparación
- [ ] Congelar cambios funcionales, documentar versión SHA, mantener PR revisado y fusionar en main solo después de aprobación.
- [ ] Exportar y verificar respaldo reciente de D1; documentar versión del Worker y último despliegue Pages.
- [ ] Verificar migraciones remotas `No migrations to apply`, bindings D1/R2 y secretos Cloudflare.
- [ ] Tener procedimiento de rollback de Worker/Pages y recuperación de D1 probado en entorno aislado.

## Compilación, dependencias y seguridad
- [ ] `npm ci`, typecheck API/web, build web, pruebas de integración con D1 local, test solar.
- [ ] `npm audit --omit=dev` y `npm audit`; investigar cada hallazgo y actualizar sin cambios incompatibles no probados.
- [ ] Inspeccionar dependencias, workflows, cabeceras de seguridad, CSP, CORS, CSRF, XSS y validación de entradas/archivos.
- [ ] Verificar ausencia de secretos en repositorio, registros, mapas de código y respuestas públicas.
- [ ] Probar aislamiento y autorización entre cuentas cliente, administrador y moderador; expiración y revocación de sesiones.
- [ ] Comprobar límites de peticiones, tamaños y tipos reales de imágenes, acceso privado a R2 y eliminación segura.
- [ ] Resolver advertencias de compilación y accesibilidad, o registrar una excepción documentada.

## Pruebas por página
- [ ] Inicio: carrusel, imágenes responsivas, enlaces, contacto, SEO/metadata y rendimiento.
- [ ] Catálogo: filtros, búsqueda, paginación del administrador, fotos, precios, valoración verificable y consulta.
- [ ] Servicios: alta, edición, ocultar y borrar sin pérdida de citas; galerías de fotografías.
- [ ] Galería: múltiples fotos por proyecto, categorías, móvil, eliminación y recuperación correcta.
- [ ] Mi sitio web: edición del footer, varias líneas de contacto, previsualizaciones y guardado.
- [ ] Clientes: alta, login, perfil, recuperación de acceso si aplica, protección y cierre de sesión.
- [ ] Citas/Solicitudes: búsqueda por ID, paginación, cambios de estado, WhatsApp y referencias copiables.
- [ ] Fotos de reclamaciones y mantenimientos: privada para propietario/personal; denegada para terceros.
- [ ] Notificaciones: manual, cliente único/todos, bienvenida, estados y moderación de permisos.
- [ ] Asistente: modal, pantalla completa, nuevo chat, historial de años anteriores, renombrar, eliminar, compartir texto, cambio de sesión y aislamiento por cliente.
- [ ] Asesor solar sencillo y técnico: consumos, W/kWh, batería, MPPT con límites del fabricante, errores y supuestos.
- [ ] Todas las rutas: URLs directas, navegación atrás, recarga y enlaces desde la cuenta.

## Navegadores, dispositivos y accesibilidad
- [ ] Probar en Android/iPhone/tablet/desktop: menús, modales, teclado, fotos, orientación y área segura.
- [ ] Navegación solo por teclado, foco en diálogos, lectores de pantalla, contrastes y mensajes de error.
- [ ] Comprobar con red lenta, API caída, imágenes no disponibles y sesiones expiradas.
- [ ] Revisar Core Web Vitals, LCP, CLS, peso de imágenes y scripts.

## Producción y lanzamiento
- [ ] Validar primero en entorno de pruebas sin afectar clientes y conservar evidencia de pruebas.
- [ ] Aplicar migraciones a D1 remoto solo después de backup y confirmación; desplegar Worker antes que Pages.
- [ ] Verificar endpoints /health y todos los flujos reales con una cuenta de pruebas (sin facturas reales).
- [ ] Monitorizar errores y logs tras despliegue; publicar acta de pruebas/limitaciones.
- [ ] Tras aprobación final, fusionar PR, crear etiqueta de Git `v1.0.0` y documentar cambios.

**Estado:** revisión funcional en curso. No declarar v1.0 lista hasta completar cada criterio o registrar su excepción aprobada.
