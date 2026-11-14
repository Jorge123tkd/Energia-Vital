# Bonaire — Plan maestro de crecimiento seguro (acuerdos con dirección)

Actualizado: 13 de noviembre de 2026. Rama de desarrollo: `feat/cloudflare-customer-accounts-hardening`.
**Estado:** plan aprobado para iniciar por entregas. No es garantía de funciones activas.
**No aplicar migraciones a D1 remoto ni desplegar API/Pages sin pruebas, copia de seguridad y autorización del propietario.**

## Norte del proyecto

Bonaire es una plataforma comercial y de gestión para Cuba: energía renovable, servicios técnicos, propuestas empresariales, posibles colaboraciones comerciales y futuras líneas autorizadas. No confundir cotización con contrato, fondos declarados con fondos recibidos, ni orientación del asistente con decisión oficial.

Proceso objetivo: captación → solicitud → expediente 360° → gestor → propuesta revisada → aprobación/contrato → trabajo programado para brigada (si aplica) → resultado → posventa.

## Reglas acordadas

1. **Expedientes:** preservar solicitud original, estado, fotos, conversación, archivos, actividades y responsables. Memoria del asistente solo con identidad y permisos verificados; no registrar sin confirmación del cliente.
2. **Gestores:** con 1 o 2 gestores, ambos pueden atender cualquier caso sin reparto obligatorio. Cada actuación se atribuye a la cuenta del miembro del equipo que la realizó (no solo nombre público de WhatsApp). Con más de 2 gestores puede recomendarse distribución sin encerrar solicitudes en un único usuario.
3. **Cotizaciones:** estimación preliminar ≠ propuesta en revisión ≠ oferta oficial autorizada. Exigir revisión humana de precios, impuestos aplicables, vigencia, cantidades, existencias, transporte, plazos, garantías y condiciones. Versiones inmutables y control de emisión. Sin envío automático de ofertas contractuales.
4. **Pagos:** separar presupuesto declarado, fondos aprobados declarados, fondos disponibles declarados, condiciones negociadas, pago reportado y **pago verificado** por autorizado. No prometer modalidades/cambio legal sin revisión de normativa y permisos de la entidad en Cuba. El asistente no valida ingresos.
5. **Brigadas:** la entidad principal operativa es la brigada; tiene jefe, integrantes, especialidades y calendario. Actualmente dirección declara UNA brigada: no crear datos ficticios. Los **gestores** asignan trabajos. Con 1 brigada pueden asignar y reconocen la ocupación al proponer dos trabajos el mismo día. Con 2 se recomienda reparto equitativo por fecha libre y minutos estimados; el gestor elige y confirma si hay ocupación. Con **más de 2 brigadas**, cuando se pretende añadir un segundo trabajo a una brigada ocupada **el administrador general decide si aprobarlo**. Debe quedar pendiente sin confirmación hasta resolver; conservar solicitante, revisor, fecha y motivo. No reemplazar el requisito administrativo por un simple checkbox. La jornada local es `America/Havana`, y el trabajo tiene fecha explícita. El gestor debe comprobar viabilidad real aun cuando un sistema permita el calendario.
6. **Brigadas en web:** sección privada de Administración primero; no publicar fichas ni datos de integrantes sin permiso y revisión de privacidad. Las brigadas se relacionarán con solicitudes/citas, sin alterar citas previas. El jefe reporta información técnica, no aprueba pagos ni cotizaciones.
7. **Asistente:** responder primero y solicitar solo el dato útil que falte; no volver a pedir información conocida y autorizada; nunca crear solicitudes/citas/acuerdos sin confirmación explícita.
8. **Integridad:** cada etapa con pruebas automáticas, validación de permisos, pruebas manuales y rollback. Cloudflare D1 tiene respaldos y migraciones revisados.

## Entregas, con control de riesgo

| Etapa | Entrega utilizable | Dependencia / criterio de aceptación |
|---|---|---|
| 0 | Congelación y revisión: backup D1, seguridad de cuentas, pruebas y flujos vigentes | Sin pérdida de acceso ni regresiones |
| 1A | Fundación aditiva de brigadas: migración 013, reglas puras y tests (preparada en GitHub, NO desplegada) | `node apps/api/tests/brigade-policy.cjs` PASS; typecheck API; ensayo migración 013 en D1 local |
| 1B | Gestión privada de brigadas, jefe e integrantes en /admin | CRUD validado, solo personal autorizado, sin exposición pública |
| 1C | Asignación a solicitud y calendario por día, sugerencia equitativa, aprobación general para 3+ | Prueba 1, 2, 3 y 4 brigadas, dobles intentos concurrentes, cancelación, aprobación/rechazo, auditoría |
| 2 | Expediente 360°, actividades atribuibles a gestores y documentos | Datos previos conservados; permisos por expediente |
| 3 | Cotizaciones con versiones y revisión; *no* emisión automática | Firma/aprobación responsable y evidencia de condiciones |
| 4 | Seguimiento económico sin verificación automática falsa | Separación de declaración y comprobación, revisión jurídico-contable cubana |
| 5 | Agenda técnica y posventa integral con brigadas | No solapar sin regla, evidencias y cierres claros |
| 6 | Asistente conectado a expedientes autorizados, análisis de oportunidades y crecimiento | Chat ágil, sin interrogatorio, seguimiento medible |

**Nota:** la entrega 1A no cambia ninguna ruta API, panel, tabla existente ni estado actual. La migración no debe ejecutarse en producción solo porque aparezca en GitHub. No existe todavía una pantalla funcional de brigadas. Las etapas 1B y 1C se habilitarán juntas tras pruebas de integración, y pueden adelantarse a la etapa 2 solo si la base es estable.

## Validaciones antes de activar la función

- Test de 1/2/3+ brigadas; 2 asignaciones un día; rechazo, aprobación solo admin y auditoría.
- Ningún usuario cliente ni bot puede ver integrantes o asignar brigadas.
- Si cambia de 2 a 3 brigadas, la próxima asignación conflictiva exige aprobación; los históricos no se borran.
- Fecha local correcta en Cuba; mantener trabajos históricos sin convertirlos a días UTC.
- D1: `013_brigades_foundation.sql` debe crear tablas sin modificar las existentes.
- Dos gestores concurrentes no deben producir un segundo trabajo confirmado cuando hay más de 2 brigadas: verificar atómicamente en SQL.
- Reversión: no eliminar tablas con datos ni restaurar D1 sin aprobación explícita del propietario.

## Pendiente de especificar antes de 1B/1C

Duración habitual de servicios por brigada; quién crea y desactiva integrantes; cómo representar múltiples días; permisos concretos del jefe de brigada; cómo declarar indisponibilidad por vacaciones/transporte; política para adelantar/cancelar trabajos; identificación privada de gestores con cuenta de personal. No inventar estas respuestas ni añadir permisos amplios para resolverlas.
