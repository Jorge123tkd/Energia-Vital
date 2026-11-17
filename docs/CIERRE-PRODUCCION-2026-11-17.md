# Bonaire Energía Vital — cierre de publicación (17/11/2026)
**Estado: NO-GO.** Documento operativo; ninguna instrucción de este archivo autoriza migraciones, cambios de credenciales o despliegue. Congelación temporal de funciones nuevas: priorizar seguridad, corrección de incidencias, QA, auditoría y preparación de salida.

## Candidato de código y evidencias
- [PR #7 DRAFT — combinado](https://github.com/Jorge123tkd/Energia-Vital/pull/7): seguridad de sesiones de PR #6 + dependencias actualizadas de PR #4. No fusionado.
- [PR #6 DRAFT](https://github.com/Jorge123tkd/Energia-Vital/pull/6): migración 021, refresh de un solo uso, cliente/admin y auditoría D1 preparada; CI [44105736214](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44105736214) aprobada por separado.
- [PR #4 DRAFT](https://github.com/Jorge123tkd/Energia-Vital/pull/4): lockfile npm deduplicado; CI [43946090393](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/43946090393) aprobada por separado. **No extrapolar estos resultados a PR #7.**
- **PR #7 (primer ensayo)** [44107829315](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44107829315) SUCCESS. CI de la puerta npm audit reforzada [44108052050](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44108052050): verificar resultado final antes de aprobar. El lockfile no se editó a mano.

## Matriz GO / NO-GO
| Bloque | Evidencia necesaria para GO | Estado |
|---|---|---|
| Fotografía/privacidad (etapa 1) | Muestras con consentimiento y comprobación visual Android/iPhone; aprobación retención y manejo ICC/EXIF | BLOQUEADO: QA/aprobación humana |
| Seguridad y accesos (etapa 2) | PR #7 CI final; revisión diff, roles y flujos reales; resolver 401 admin, WAF/Turnstile | PARCIAL: CI anterior aprobada; QA real pendiente |
| Inventario Cloudflare (etapa 3) | Registro firmado de D1/Worker/Pages/R2 y migraciones, todo solo lectura | BLOQUEADO: autorización + ejecución remota |
| Respaldo cifrado (etapa 4) | Copias D1 y R2 protegidas fuera de GitHub; integridad comprobada | BLOQUEADO: requiere acceso autorizado |
| Restauración/ensayo (etapa 5) | Restaurar copia en recursos aislados, ejecutar solo migraciones faltantes, comparar integridad | BLOQUEADO: depende de 3 y 4 |
| Congelación/rollback (etapa 6) | SHA exacto, dependencias y aprobaciones; plan de reversión de API y Pages, restauración D1 verificable | BLOQUEADO: depende de 1–5 |
| Publicación (etapa 7) | Aprobaciones separadas para esquema D1 y API/Pages; smoke tests con usuarios ficticios; monitoreo | BLOQUEADO: no autorizado |

## Secuencia corta de cierre (no ejecutar acciones remotas implícitamente)
1. Finalizar CI de PR #7, revisar vulnerabilidades residuales bajas, comprobar permisos de workflow, fijar SHA para QA y no introducir funcionalidades nuevas.
2. QA manual de web con identidades ficticias: acceso público; cliente registro/login/logout, solicitudes, citas, asistente e historial; admin/operator/brigadas, calendario, expediente y notificaciones; teléfonos y escritorio; cambio de usuario y expiración de token.
3. Investigar 401 histórico del admin **sin registrar claves ni hashes**: identificar si usuario admin activo, rol, ruta correcta, entorno correcto y si la contraseña verificada coincide; usar únicamente procedimientos aprobados de diagnóstico de solo lectura y restablecimiento controlado por administrador. El endpoint `/api/auth/setup` no es recuperación de credenciales.
4. Revisar WAF, rate limiting, Turnstile y políticas de fotografías con muestras consentidas.
5. Autorizar auditoría de solo lectura D1/Worker/Pages/R2. El workflow de PR #7 es **solo una herramienta preparada** y no se ejecutó en el entorno real. Verificar migraciones realmente aplicadas y bindings sin publicar datos en logs.
6. Crear respaldos externos cifrados de D1 y R2, comprobar hashes y restaurar copia en ambiente aislado. Desactivar envíos de mensajes/bots durante el ensayo.
7. Solo después, decidir si aplicar migraciones faltantes (incluida 021) con aprobación expresa separada. No asumir que producción ya tiene 013–020.
8. Revisar con la persona responsable el diff de PR #7 y decidir estrategia de merge hacia desarrollo/main. Confirmar Pages, dominios y `VITE_API_URL`.
9. Publicar bajo `workflow_dispatch` solo tras respaldo y migraciones aprobadas. Primero Worker, después Pages; hacer smoke test y monitorizar. Si hay incidentes, suspender y ejecutar plan de reversión validado, sin revertir D1 destructivamente a ciegas.

## Restricciones de seguridad
- No introducir tokens, contraseñas, teléfonos de clientes ni datos/backup reales en commits, chats, artifacts o logs.
- No utilizar servidor local del propietario. CI usa solamente Worker y D1 temporales.
- No hacer `wrangler d1 migrations apply --remote`, `wrangler deploy`, `pages deploy` ni `merge` por una petición genérica de continuar.
- El estado NO-GO solo cambia cuando cada etapa tiene evidencia concreta y las autorizaciones correspondientes.

## Próxima acción inmediata
Revisar [CI 44108052050](https://github.com/Jorge123tkd/Energia-Vital/actions/runs/44108052050), corregir si falla y preparar el plan de QA real. Seguimiento vivo en `CONTINUIDAD.md` y `PLAN-MAESTRO-BONAIRE.md`.
