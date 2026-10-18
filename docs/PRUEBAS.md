# Plan de Pruebas — Energía Vital

Este documento describe las pruebas necesarias antes del lanzamiento.

## Pruebas funcionales

### Web
- [ ] Todas las páginas cargan correctamente
- [ ] El catálogo obtiene datos de D1
- [ ] Los productos se pueden editar desde el dashboard
- [ ] Los precios se actualizan sin modificar el código
- [ ] Las imágenes se muestran correctamente
- [ ] Los enlaces comerciales funcionan

### Asistente conversacional
- [ ] Responde saludos correctamente
- [ ] Busca productos reales en el catálogo
- [ ] No inventa precios
- [ ] Responde preguntas frecuentes
- [ ] Solicita los datos que faltan para el asesor solar
- [ ] Funciona en modo básico aunque la IA no esté disponible

### Asesor solar
- [ ] Distingue potencia (W) de energía (kWh)
- [ ] Calcula autonomía correctamente
- [ ] Considera eficiencia y descarga de batería
- [ ] Dimensiona preliminarmente el campo fotovoltaico
- [ ] Respeta los límites técnicos del catálogo
- [ ] Indica cuándo hace falta una evaluación presencial

### Citas
- [ ] Comprueba disponibilidad de horarios
- [ ] Impide reservas duplicadas (solapamiento)
- [ ] Registra y actualiza estados de cita
- [ ] Permite intervención humana (cambio de estado)

### Seguridad
- [ ] Los clientes no pueden acceder al dashboard (/admin sin token)
- [ ] Un usuario no puede consultar datos privados de otro
- [ ] Las API validan permisos en el servidor
- [ ] Los secretos no aparecen en el frontend ni en el repositorio
- [ ] Los formularios resisten entradas inválidas

## Pruebas de carga (concurrencia)

### Escenario 1: 20 usuarios concurrentes (mínimo)

| Prueba | Usuarios | Acción |
|---|---|---|
| Navegación por productos | 20 | Navegar simultáneamente por el catálogo |
| Consultas al catálogo | 20 | Consultar productos simultáneamente |
| Envíos de formularios | 20 | Enviar formulario de contacto simultáneamente |
| Cálculos solares | 20 | Usar el asesor solar simultáneamente |
| Reservas del mismo horario | 5 | Intentar reservar el mismo horario al mismo tiempo |

### Escenario 2: 30 usuarios concurrentes (adicional)

| Prueba | Usuarios | Acción |
|---|---|---|
| Navegación combinada | 30 | Mezcla de catálogo, servicios, asesor solar |
| Asistente con errores | 10 | Simular errores de IA y límites de cuota |
| Asistente normal | 20 | Conversaciones normales con el asistente |

### Métricas a registrar

- Tiempo de respuesta del backend (p95 < 1 segundo para operaciones sencillas)
- Tasa de errores (< 1%)
- Consumo de cuotas de Workers, D1, R2

## Despliegue

- [ ] La web funciona con el dominio definitivo
- [ ] HTTPS funciona correctamente
- [ ] El backend conecta con D1
- [ ] Las migraciones se ejecutan correctamente
- [ ] Telegram responde a mensajes
- [ ] Las instrucciones permiten repetir el despliegue
- [ ] Las cuotas y limitaciones gratuitas están documentadas

## Criterio de aceptación

El proyecto no se considera listo hasta que:
1. Las pruebas de concurrencia hayan terminado correctamente
2. Se hayan comprobado las reservas simultáneas
3. Se hayan documentado las cuotas y limitaciones observadas