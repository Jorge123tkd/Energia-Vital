# Bonaire — Protocolo propuesto de evidencias técnicas, cierre y garantía (5B2c–5B2d)

**ESTADO: BORRADOR INTERNO. NO ES CERTIFICADO, CONTRATO NI POLÍTICA LEGAL APROBADA.**
Rama de trabajo: `feat/cloudflare-customer-accounts-hardening`. Sin aprobación para Cloudflare de producción.

## 1. Qué debe suceder cuando termina una instalación

1. El jefe autenticado solo consulta trabajos de su propia brigada y registra un informe `completion_proposed` con resumen y evidencia técnica descriptiva.
2. Puede agregar fotografías privadas del trabajo en las etapas *antes, durante y después*, hasta el límite técnico vigente de 12 archivos por trabajo y 5 MB por archivo. Los archivos nuevos se procesan para reducir metadatos; no se deben copiar capturas de clientes fuera del expediente.
3. El administrador revisa de forma independiente informe original, fotografías disponibles, pruebas descritas y observaciones. Si falta información, **rechaza motivadamente** sin marcar la ejecución como terminada; el jefe puede corregir su propuesta.
4. Solo tras aprobación administrativa el trabajo técnico pasa a `completed`. El acto de revisar se audita y conserva vínculo con informe original y revisor. **No certifica cumplimiento normativo, recepción contractual, cobro ni garantía.**
5. El cierre comercial y la comunicación al cliente son procesos separados que requieren términos reales aprobados por Bonaire.

## 2. Controles de privacidad y trazabilidad

- R2 debe seguir privado. No mostrar claves internas, enlaces públicos permanentes ni URLs de terceros a los archivos técnicos.
- Solo el jefe autenticado de la brigada y personal autorizado pueden consultar evidencias según permisos vigentes. Nunca asociar fotografías técnicas a la galería pública por defecto.
- El backend intenta eliminar datos accesorios EXIF/GPS/XMP/IPTC de **nuevas subidas**, recalcula hash SHA-256 y tamaño de los bytes que guarda. Los archivos existentes NO se han limpiado retroactivamente.
- **Fase 5B2d, protección de orientación:** JPEG y WebP con orientación EXIF 2–8 conservan solamente una etiqueta de orientación reconstruida (sin copiar el EXIF de cámara/GPS). EXIF con orientación normal 1 no se conserva. Las pruebas de código cubren las ocho orientaciones y metadatos sintéticos; esto NO es prueba visual en teléfonos reales.
- En WebP, orientación no predeterminada sin cabecera extendida VP8X no se acepta, porque preservar ese dato no sería seguro sin convertir la imagen. PNG con etiqueta eXIf de orientación 2–8 se rechaza hasta disponer de una normalización de píxeles controlada.
- **Pendiente de aceptación:** comprobar visualmente fotografías consentidas de teléfonos Android e iPhone en el navegador y en la vista privada del expediente; comprobar también si la cámara o el editor aplica orientación a los píxeles antes de subir. Si alguna gira, no publicar sin corrección verificada.
- Antes de empezar a pedir fotografías reales: revisar texto de información al cliente, base de tratamiento y permisos del inmueble/equipo, y acordar mecanismos de consentimiento cuando corresponda. No subir documentos de identidad, números de cuentas ni imágenes de personas si no son necesarios.
- Definir con asesoría jurídica y de negocio los **periodos de conservación**, restricciones legales de borrado y trazabilidad. No establecer días de retención ficticios ni activar borrado automático sin procedimiento aprobado.
- Cualquier borrado futuro exige auditoría de alcance e impacto, comprobación de vínculos con D1 y copia segura de R2. El borrado de evidencias históricas no forma parte de esta fase.

## 3. Flujo separado de reclamación de garantía

**Registro ≠ cobertura aceptada.** Una reclamación se incorpora al expediente y se sigue con `service_followup_cases` y notas inmutables. No se debe presentar como válida o cubierta una garantía hasta revisar contrato, facturas/referencias legítimas, producto, fecha, condiciones, causa y exclusiones aplicables. Un administrador cierra la incidencia con motivo; cerrar el caso no reconoce automáticamente una cobertura económica o jurídica.

Estados de negocio propuestos para futuro diseño, **no implementados como nuevo enum en D1**:
- Reclamación recibida → en evaluación → requiere información o inspección → decisión motivada → resolución técnica/comercial.
- La decisión sobre cobertura (aceptada, no cubierta, parcialmente cubierta) requerirá responsable y condiciones expresas aprobadas. No inferirla de que el trabajo esté marcado `completed`.

## 4. Plantilla futura de acta/certificado — NO emitir automáticamente

Datos propuestos sujetos a aprobación:
- Identificador de expediente, cliente identificado según permisos, fecha y lugar del trabajo;
- descripción de equipos, seriales confirmados, labores y pruebas realizadas, resultados y observaciones;
- identificador del informe del jefe y de la revisión de administración, referencias a evidencias privadas sin publicarlas;
- garantías contractuales **solo si existen términos firmados/verificados** y autoridad para emitirlas;
- nombres, cargos y mecanismo de firma o aceptación jurídica revisada; versión del documento y responsable de emisión.

No agregar texto «certificado», «firmado» ni «garantía aprobada» a salidas automáticas hasta tener procedimiento validado y consentimiento/contrato pertinente. No usar la mera sesión del jefe como firma digital.

## 5. Puerta antes de producción (pendiente)

1. Pruebas CI de backend/frontend, migraciones 001–019 y regresión de fotos de prueba JPEG, PNG, WebP.
2. Revisión de fotografías de móvil con orientación EXIF y muestras consentidas en entorno de ensayo aislado; verificación real del acceso privado de R2.
3. Inventario D1 **solo lectura** con autorización expresa, copia privada verificada de D1 y R2, ensayo de recuperación sobre copia real y comprobación del esquema de 15 tablas nuevas.
4. Revisión jurídica y aprobación de política de conservación, información a clientes y proceso de garantías/actas.
5. Autorización humana separada para migrar/publish Worker y Pages. Nunca desplegar por continuar desarrollando en GitHub.

**Restricción:** este documento sirve para diseñar el flujo, no cambia los términos comerciales, clientes, garantías o fotografías ya existentes.
