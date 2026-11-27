# Bonaire — Protocolo propuesto de evidencias técnicas, cierre y garantía (5B2c–5B2f)

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
- **Fase 5B2e — integridad de PNG:** todos los bloques PNG se comprueban mediante CRC-32, incluidos los bloques de metadatos que se eliminan. Una foto PNG corrupta se rechaza y no llega a R2/D1. Las pruebas automáticas incorporan un archivo 1×1 válido y casos negativos con CRC erróneo en IHDR, IDAT y tEXt.
- **Privacidad residual importante:** se conservan perfiles de color ICC (JPEG APP2, PNG iCCP, WebP ICCP) para no alterar silenciosamente la representación de colores durante la revisión técnica. Esos perfiles pueden contener identificadores, textos u otros datos internos; por tanto, el procesamiento actual NO demuestra ausencia absoluta de información sensible en el archivo final. Antes de usar fotografías reales, debe revisarse una muestra autorizada de cada formato y decidir si se requiere un conversor seguro de color y perfiles. No anunciar una eliminación total y certificada de metadatos.
- La privacidad de los bytes no equivale a privacidad del contenido visible: etiquetas, matrículas, personas, pantallas o coordenadas superpuestas, así como notas de los técnicos, pueden revelar información. El portal del jefe advierte esto antes de la carga; se requiere política operativa aprobada y supervisión humana.

- Antes de empezar a pedir fotografías reales: revisar texto de información al cliente, base de tratamiento y permisos del inmueble/equipo, y acordar mecanismos de consentimiento cuando corresponda. No subir documentos de identidad, números de cuentas ni imágenes de personas si no son necesarios.
- Definir con asesoría jurídica y de negocio los **periodos de conservación**, restricciones legales de borrado y trazabilidad. No establecer días de retención ficticios ni activar borrado automático sin procedimiento aprobado.
- Cualquier borrado futuro exige auditoría de alcance e impacto, comprobación de vínculos con D1 y copia segura de R2. El borrado de evidencias históricas no forma parte de esta fase.

## 2A. Fase 5B2f — verificación de integridad R2/D1 y criterio ICC

- El sistema almacena en D1 el SHA-256 y tamaño de la fotografía **saneada** al subirla a R2 privado. Un administrador puede pedir un **cotejo puntual de solo lectura** desde el expediente: obtiene el objeto R2, revisa que tamaño y SHA-256 coincidan con la fila D1 y recibe únicamente `verified`, `missing` o `mismatch` (respuesta 200 o 409), sin publicar clave R2, archivo, huella ni datos del cliente. Se bloquea a clientes, operadores y jefes.
- **Qué significa `verified`:** los bytes privados actuales coinciden con la huella guardada en D1. NO confirma autoría, fecha efectiva de captura, validez de la foto, imagen libre de manipulación previa, cumplimiento técnico, firma electrónica, certificado ni garantía. Si los datos D1 hubieran sido alterados junto con R2, la comparación no ofrece prueba independiente. No aceptar ni cerrar trabajos automáticamente sobre esta base.
- No se realiza inventario masivo, recuperación, modificación ni lectura de R2 de producción en esta fase. La verificación bajo demanda solo se ejecutará sobre datos reales después de publicación autorizada.
- **Política temporal ICC:** conservar perfiles de color ICC sin modificarlos para evitar alterar la representación de mediciones, placas de equipos, cableado o indicadores cromáticos. Los perfiles pueden contener etiquetas descriptivas o información identificativa; conservarlos NO significa que la fotografía esté libre de metadatos. Tampoco es correcto eliminarlos a ciegas sin convertir y validar los colores.
- Para decidir un tratamiento posterior, comparar con fotografías **consentidas** y muestras ficticias JPEG (APP2), PNG (iCCP) y WebP (ICCP), visualizando antes/después en iPhone, Android, navegadores escritorio y monitores sRGB/P3; inspeccionar el contenido de perfiles exclusivamente en un entorno privado y registrar si existen textos o datos personales. No escribir contenidos, rutas, nombres, hashes de perfiles, EXIF ni capturas reales en logs de CI o GitHub.
- Hasta completar esa evaluación, no declarar neutralización total de metadatos o privacidad certificada. Las fotos técnicas son privadas por autorización, pero el acceso sigue sujeto a política de tratamiento, plazo de retención aprobado y control humano de contenido visible.

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
