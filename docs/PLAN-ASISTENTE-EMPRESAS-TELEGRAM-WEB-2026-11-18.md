# Plan integral: Asistente comercial Bonaire — Web y Telegram
Fecha de revisión: 18 de noviembre de 2026
Rama de trabajo única: `feat/cloudflare-customer-accounts-hardening`
Naturaleza: auditoría funcional de código y plan de implementación; los elementos pendientes NO están implementados por escribir este plan.

## 1. Objetivo
Que el asistente de Bonaire atienda con naturalidad tanto a hogares como a organizaciones de cualquier sector, y que distinga una consulta informativa de una solicitud formal. Debe orientar, recoger lo necesario, registrar expedientes accesibles al personal, admitir documentos relacionados y ofrecer seguimiento verificable, sin prometer contratos, precios, fechas ni condiciones no autorizadas.

### Clasificación inicial bajo demanda
1. Residencial / vivienda.
2. Mipyme.
3. Empresa estatal.
4. Negocio privado / TCP / cooperativa.
5. Proveedor, fabricante o interesado en promocionar, representar o distribuir marcas en Cuba.
6. Alianza o asociación comercial, incluso fuera del sector de energía renovable.

**No preguntar el tipo de cliente por defecto**. Identificarlo solamente cuando la persona manifieste intención de tramitar un servicio, proyecto, compra o relación comercial; aceptar correcciones a la clasificación.

## 2. Evidencia del estado actual (revisión de código)
- `apps/api/src/routes/telegram.ts` y `apps/api/src/telegram-conversation.ts`: atajos de Telegram priorizan asesor solar, productos y servicios; `request-service` vuelve a preguntar por instalación, mantenimiento, reparación o evaluación solar. No hay módulo conversacional persistente de intake empresarial ni creación de un expediente desde Telegram.
- `apps/api/src/assistant-engine.ts`: `isBusinessProposal` y `businessProposalReply` reconocen parcialmente proveedores, asociaciones, marcas y distribución. La respuesta devuelve un resumen para contactar al equipo, pero explícitamente no registra solicitud ni crea proyecto. El seguimiento comercial no existe.
- `apps/api/src/routes/assistant.ts`: web guarda sesiones y mensajes por cliente y contexto solar; la respuesta de propuesta comercial se conserva en el chat, pero no se vincula automáticamente a solicitudes/expedientes.
- `apps/api/src/request-intake.ts`: solicitudes web aceptan `customer_type`, presupuesto USD y forma/moneda de pago; no es un flujo completo de chat empresarial.
- `apps/api/src/routes/private.ts`: registrar solicitud web y cita requiere sesión de cliente. Telegram no puede adjudicarse una identidad de cliente o consultar expedientes solo por tener `chat_id`.
- `apps/api/src/telegram-human-contact.ts`: contacto con gestores existe, pero la transferencia del expediente con permiso y asignación no está automatizada.
- Ya existe infraestructura administrativa de solicitudes, dossiers, brigadas, presupuestos y seguimiento técnico, pero no se comprobó una integración de Telegram empresarial de extremo a extremo.
- La última validación del usuario de la función de creación de citas desde /admin: API typecheck PASS, Svelte 0 errores / 2 warnings, build PASS. Aún requiere publicar y probar funcionalmente en producción.

## 3. Reglas de la conversación (obligatorias)
**Consulta informativa**: «¿Qué equipos tienen?», «¿Qué es un inversor?», «¿Trabajan con empresas estatales?» → responder sin abrir trámite ni pedir datos fiscales/presupuesto.

**Intención de servicio/proyecto**: preguntar solo lo que falta, por etapas:
- Tipo de cliente / organización y nombre del contacto.
- Nombre de la empresa (si procede), ubicación y medios para contactar.
- Qué necesita exactamente, alcance, lugar y si desea visita o presupuesto.
- Forma de pago prevista: transferencia, efectivo u otra que indique; cantidad disponible **en USD** cuando sea pertinente y conozca el monto.
- Fechas o plazos SOLO si el cliente los menciona o son imprescindibles para tramitar.
- Confirmación de resumen antes de registrar expediente; no registrar por una frase ambigua.
Nunca exigir en el primer contacto anticipo, saldos pendientes, autorizaciones, estado financiero o plazos detallados.

**Empresa estatal**: identificar que puede haber niveles de aprobación y pagos diferidos; aclarar que Bonaire evaluará y acordará las condiciones antes de comprometer recursos. Nunca afirmar que se aceptó crédito, se hizo reserva o comenzó el trabajo.

**Proveedores / alianzas**: solicitud distinta a instalación residencial. Preguntar empresa, país, oferta, marca/productos, modalidad (suministro, promoción, distribución en Cuba, asociación) y contacto. No limitarlo a energía solar. No prometer exclusividad ni aceptación.

**Privacidad**: no divulgar el expediente de una entidad a otra. Un usuario sin autenticación/vinculación verificada puede preguntar cómo seguir su solicitud pero nunca obtener su estado, documentos, valores comerciales o detalles personales de terceros.

## 4. Modelo de expedientes y adjuntos
- Reutilizar y extender `requests`/dossier cuando sea compatible. Diseño de migración nueva (022 o posterior), ADITIVA y con claves externas: perfil de organización y contactos autorizados, `commercial_cases` o vínculo de expediente a `requests`, `case_conversations`, `case_documents` con claves R2 y metadatos, eventos `case_status_history` y asignación de gestor.
- Definir un ID legible de referencia, estado y responsable. Guardar origen (`web`, `telegram`, `staff`), identidad verificada y cada consentimiento explícito de registro.
- Documentos recibidos por Telegram: verificar autenticidad del update y chat; límites de tamaño, tipo MIME permitido y cuotas, descarga temporal segura desde Telegram, escaneo/validaciones apropiadas, carga en R2 privado, token de acceso temporal, exclusión de archivos peligrosos y revocación. Sin `file_id` público como autorización.
- Web: carga de PDF e imágenes pertinentes, asociados exclusivamente al caso; permisos y auditoría de lectura/descarga. No convertir documentos no confiables en instrucciones para el asistente.
- Restringir contactos y empresas a acceso autorizado; permitir revocación de acceso y trazabilidad de cambios.

## 5. Telegram: cambios necesarios
1. Añadir opciones de `Empresa/Negocio`, `Proyecto/Servicio`, `Proveedor/Alianza` y `Estado de mi expediente` a bienvenida/teclado, sin impedir conversación natural.
2. Añadir clasificador conversacional **sin confundir** «soy una empresa», «quiero cotización para mi empresa», «quiero ser proveedor» o «qué venden» con asesoramiento solar residencial.
3. Estado de conversación comercial persistente por `chat_id + thread_id`, con categorías separadas, reanudación y nueva conversación sin mezclar solicitudes.
4. Solicitud por Telegram con validación de campos, resumen, **confirmación explícita** y creación idempotente de caso/solicitud; evitar dobles registros en reintentos del webhook.
5. Consulta del estado solo tras vinculación segura del Telegram al cliente/organización y comprobación de titularidad; nunca por número o nombre de empresa sin validar.
6. Archivos y proyectos por chat asociados al expediente correcto; el equipo los ve en /admin.
7. Intervención humana: enviar botón de WhatsApp del gestor, crear tarea/seguimiento para equipo si corresponde, sin enviar información interna indiscriminadamente.
8. Pruebas de mensajes repetidos, historiales, cambio de cliente, cancelación de conversación y carga de archivos.

## 6. Web: cambios necesarios
- Reutilizar una máquina de estados de intake comercial compartida con Telegram y distinguible de `solar-guidance`.
- Historial y nueva conversación existentes; añadir vista «Mis expedientes», documentos y eventos con autorización.
- No preguntar datos ya recogidos; mostrar exactamente qué falta y confirmación final.
- Mantener registro de presupuesto en USD y forma de pago sin presuponer aprobación de pagos.

## 7. /admin: atención de empresas y seguimiento
- Bandeja de solicitudes comerciales con filtros por residencial, mipyme, empresa estatal, negocio privado, proveedores y alianzas; prioridad y responsable.
- Ficha de empresa, contactos autorizados, archivos, conversaciones vinculadas, presupuesto USD, forma de pago prevista, hitos y notas internas.
- Acciones: aceptar/rechazar según permisos, pedir información, asignar gestor, preparar cotización versionada, actualizar estado, registrar fecha tentativa, convertir en trabajo de brigada solo con confirmación y disponibilidad.
- Separar hechos confirmados, condiciones propuestas y notas internas. Historial de auditoría inmutable donde proceda.
- La creación de citas directa desde /admin ya se codificó y validó con typecheck y build; aún falta confirmar que está desplegada y probar una cita real.

## 8. Implementación recomendada, sin pasos innecesarios
**Fase A — Corrección inmediata sin migración:** integrar respuestas a empresas/mipymes/estatal en Telegram y web, clasificador de intenciones, botones de negocios y reglas de primera toma de contacto. Pruebas automatizadas de 20 conversaciones reales simuladas. NO afirmar que hay expediente si no se registró.
**Fase B — Persistencia y creación de expedientes:** diseño y migración 022 en SQLite/D1 probada contra respaldo con datos ficticios; nuevos endpoints protegidos; identidad y confirmación explícita; pruebas de permisos y deduplicación.
**Fase C — Documentos y seguimiento:** R2 privado, Telegram document/photo seguro, estado del proyecto, eventos y consulta autorizada, panel /admin.
**Fase D — Citas, brigadas y comunicaciones:** vinculación de expediente a visita/cita/brigada y WhatsApp gestores con consentimiento; pruebas integradas en Worker remoto controlado.
**Fase E — Salida a producción:** backup D1 nuevo, validación API/frontend, migraciones 022+ solo si se aprueban y están respaldadas; publicar `energia-vital-api` y `energia-vital-web` ya existentes, comprobar Telegram webhook, endpoints y permisos, rollback de código si falla.

No confundir **21 migraciones aplicadas** con el esquema futuro 022+. No volver a ejecutar 013–021.

## 9. Matriz de aceptación obligatoria
- «Quiero instalar paneles en mi casa» → residencial, no flujo de empresa.
- «Soy mipyme y quiero mantenimiento de refrigeración» → tipo de entidad y servicio; no recomendar paneles sin motivo.
- «Soy empresa estatal, necesito un proyecto de 220V trifásico» → intake de proyecto, no empezar por consumo doméstico.
- «Quiero distribuir sus productos en Cuba» → alianza/distribución, no servicio residencial.
- «Fabricamos equipos y buscamos proveedor/distribuidor» → proveedor/fabricante, no confundir con compra minorista.
- «Solo quiero saber qué venden» → consulta general sin interrogatorio de empresa.
- «¿En qué estado va el expediente de mi empresa?» → autenticación requerida antes de datos.
- Empresa A jamás ve expediente de empresa B; chat web jamás mezcla historiales de cuentas.
- Mensajes Telegram reenviados/reintentados no crean dos casos.
- No se exige anticipo, deuda, aprobaciones ni estados financieros al inicio.
- Documentos se asocian al caso y están protegidos contra acceso no autorizado.
- Todo el personal ve lo que corresponde a su rol; los clientes no ven notas internas.
- No inventar precios, disponibilidad, tasas, decisiones comerciales ni fechas.
- No activar asesor solar si no lo solicitan.
- Confirmar comportamiento en móvil y Telegram sin duplicar avisos ni contactos.
- Pruebas unitarias, integración, esquema D1, typechecks, build, monitoreo y respaldo completados antes de declarar entregado.

## 10. Inventario adicional de funcionalidades generales pendiente de aceptación
Revisar conjuntamente con los flujos empresariales: creación de citas en /admin, calendario staff, brigadas/jefes y ocupación, solicitudes y expediente, presupuestos y cobros, permisos administrativos, conversaciones web, enlaces WhatsApp gestores, catálogo y galería, asesor solar con 5/10/12/15 horas, interfaz móvil, paginaciones, Telegram, backups, restauración y alertas de dependencias dev. Registrar por módulo pruebas verificadas vs. pendientes, no marcar como terminado algo que solo fue implementado en código.
