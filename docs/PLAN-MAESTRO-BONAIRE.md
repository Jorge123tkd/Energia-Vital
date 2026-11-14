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

**Nota actualizada:** 1A, 1B y 1C están preparadas y verificadas mediante GitHub Actions (Worker+D1 temporal, permisos reales, regresión de la web y APIs). **NO se han desplegado** y la migración 013 sigue sin aplicarse a D1 remota. Solo se habilitarán en producción tras respaldo, revisión de compatibilidad con datos históricos y autorización del propietario.

## Entrega 1A verificada en D1 local (evidencia del usuario, 13-11-2026)

- Usuario realizó `git pull --ff-only` hasta `aadcae6` correctamente.
- Ejecutó `wrangler@4.161.0 d1 migrations apply energia-vital-db --local --persist-to "$sandbox"` en la carpeta TEMP `bonaire-brigadas-d1-prueba`, sobre base **LOCAL aislada**.
- Las **13 migraciones 001–013** terminaron con ✅, incluido `013_brigades_foundation.sql`.
- Consulta de `sqlite_master` comprobó tablas `brigades`, `brigade_members`, `brigade_work` y triggers `trg_brigade_work_guard_insert`, `trg_brigade_work_guard_approval` y `trg_brigade_work_immutable_target`.
- **No se aplicó ninguna migración a D1 remoto**. Esta prueba de instalación no equivale a pruebas de asignación concurrente.

## Entrega 1B preparada para pruebas (no desplegada)

- `apps/api/src/routes/brigades.ts`: API privada en `/api/brigades`. Lectura exclusivamente a personal validado; crear/editar brigadas y sus integrantes solo para admin. Conserva historial: desactivación, no borrado; impide desactivar brigada con trabajos programados; auditoría de cambios y control de versión para evitar pisar ediciones simultáneas.
- `apps/web/src/components/AdminBrigades.svelte`: nueva pestaña «Brigadas» en /admin; lista privada, ficha de jefe/especialidad, altas, edición y activación de integrantes; informa explícitamente que la asignación/calendario NO se han implementado.
- `apps/web/src/lib/api.ts` y `apps/api/src/index.ts`: conectan módulo sin alterar rutas antiguas de solicitudes ni citas.
- `apps/api/tests/brigades-admin-smoke.cjs`: pruebas sin red con middleware y DB simulados; complementan `brigade-policy.cjs`; añadidas al script npm test. **No se ejecutaron ni typecheck/build desde esta sesión.**
- Pendiente obligatorio antes de publicar: typecheck API + web, build web, pruebas smoke, regresión completa y pruebas integrales con D1 local y autorización real; respaldo y revisión de la migración 013 sobre copia representativa de datos remotos. La nueva pestaña y rutas no deben publicarse antes de que la migración 013 esté instalada en producción de forma segura.

## Entrega 1C — Agenda técnica y asignaciones (GitHub, sin despliegue)

- API `apps/api/src/routes/brigade-work.ts`, accesible solo con cuentas de personal activas:
  - `GET /api/brigade-work/availability?date=AAAA-MM-DD`: identifica brigadas ocupadas por fecha cubana, número de trabajos, minutos estimados acumulados en el mes y recomienda una brigada, sin asignarla automáticamente.
  - `GET /api/brigade-work/month?month=AAAA-MM`: agenda privada del mes, con responsables, estado y fecha; incluye trabajos pendientes y aprobaciones.
  - `POST /api/brigade-work`: gestores (`operator` y `admin`) registran trabajos vinculados a solicitud existente y no cerrada. La operación usa una inserción SQL que decide, atómicamente, si queda `scheduled` o `pending_approval`. En 1–2 brigadas, si ya hay trabajo, exige que el gestor confirme que revisó la ocupación; en 3+ nunca puede confirmar por sí mismo el segundo trabajo.
  - `GET /api/brigade-work/pending` y `PATCH /api/brigade-work/:id/review`: solo administrador principal puede consultar la cola de excepciones y aprobarlas/rechazarlas. El rechazo exige motivo; se registran identidad y fecha del revisor.
  - `PATCH /api/brigade-work/:id/cancel`: personal puede cancelar una asignación activa sin borrar historial, indicando motivo opcional.
- Se respetan los tres triggers de la migración 013. El sistema NO modifica el estado comercial de la solicitud al asignar, NI altera las citas del cliente, NI permite autoprogramación desde el asistente.
- La interfaz `apps/web/src/components/BrigadePlanner.svelte` amplía `/admin → Brigadas` con vista mensual, advertencias de ocupación, reparto sugerido, asignación y cola de aprobación exclusiva de admin. La tarjeta de solicitudes contiene enlace directo «Asignar brigada» con el ID precargado.
- El calendario general `StaffCalendar.svelte` combina citas, solicitudes con fecha orientativa y trabajos técnicos, distinguiendo claramente los pendientes de autorización.
- GitHub Actions verificó CI PASS en run `43551000617` (commit `c2569bc7`): TypeScript API/web, build web, migración D1 en runner, pruebas `integration.cjs` incluyendo asignación 1, 2 y 3 brigadas, concurrencia de dos gestores, rechazo y aprobación, y regresión de funciones anteriores. Se agregó prueba para **CUATRO brigadas** en commit `3d1f214f`; el run de GitHub Actions `43551156654` terminó **success**. El último ajuste visual `92fb27bf` también superó GitHub Actions (run `43551338548`: `checks` success, `deploy-api`/`deploy-web` skipped).

### Riesgos y operaciones pendientes para publicación

1. **No hacer despliegue automático:** el flujo `deploy.yml` ejecutó comprobaciones pero los jobs de publicación quedaron `skipped`.
2. **No migrar D1 remota sin respaldo verificado** y ensayo de migración 013 en una copia representativa de datos reales. Las pruebas sobre D1 vacía/temporal no sustituyen ese ensayo.
3. **Orden de liberación imprescindible:** copia D1 remota → validación de migraciones pendientes → aplicar solo las aprobadas → desplegar Worker → comprobar endpoints privados, permisos e integridad → publicar Pages → comprobar UI y calendario. Tener plan de rollback de Worker/Pages; no borrar filas ni migraciones para revertir D1.
4. **Trabajo técnico no completado automáticamente:** la fase actual programa y cancela, pero la confirmación de ejecución y evidencias del jefe de brigada pertenecen a la etapa de seguimiento técnico. No marcar completado sin esa evidencia.
5. La solicitud comercial y la agenda de brigadas tienen estados independientes. Esto es intencional; se integrarán en el expediente 360° sin cambiar el historial previo.
6. La recomendación por carga es orientativa: horas estimadas sin conocer aún transporte, equipamiento ni eventual indisponibilidad. El gestor decide según condiciones reales.
7. La identidad interna es la cuenta de personal validada; no asignar permisos basándose en el nombre de WhatsApp.

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
