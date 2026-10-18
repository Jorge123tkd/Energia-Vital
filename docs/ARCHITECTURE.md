# Arquitectura — Energía Vital

## Visión general

La plataforma utiliza una arquitectura serverless basada en Cloudflare, con separación clara entre frontend, backend y base de datos.

## Capas

### Frontend (Cloudflare Pages)
- SPA desarrollada con Svelte 5 + Tailwind CSS
- Desplegada estáticamente en Cloudflare Pages
- Comunicación con el API mediante fetch REST

### Backend (Cloudflare Workers)
- API REST desarrollada con Hono
- Endpoints públicos y privados
- Webhooks de Telegram
- Lógica del asistente basada en reglas

### Base de datos (Cloudflare D1)
- Base de datos SQLite gestionada por Cloudflare
- Esquema versionado mediante migraciones SQL
- Almacena productos, servicios, citas, solicitudes, configuración del asistente, usuarios

### Archivos (Cloudflare R2)
- Almacenamiento de imágenes de productos y galería
- Sin costes de transferencia saliente

### Comunicación (Telegram Bot API)
- Webhooks para recibir mensajes
- Notificaciones salientes para citas y solicitudes

## Flujo de datos

```
Cliente → Cloudflare Pages (frontend) → Cloudflare Workers (API) → Cloudflare D1 (base de datos)
                                                      ↓
                                              Cloudflare R2 (archivos)
                                                      ↓
                                              Telegram Bot API (notificaciones)
```

## Seguridad

- Autenticación por token Bearer en endpoints privados
- Validación de entrada en todas las rutas
- Prevención de inyección SQL mediante consultas parametrizadas de D1
- Secretos almacenados en variables de entorno de Cloudflare, nunca en el código
- Los clientes no tienen acceso al panel de administración

## Escalabilidad

- Cloudflare Pages distribuye el estático globalmente
- Workers se escalan automáticamente según la demanda
- D1 soporta hasta 1M lecturas/día en el plan gratuito
- R2 sin costes de transferencia saliente

## Costes (plan gratuito)

| Servicio | Límite gratuito | Coste estimado |
|---|---|---|
| Pages | Ilimitado (estático) | US$0 |
| Workers | 100,000 requests/día | US$0 |
| D1 | 5 GB, 1M lecturas/día | US$0 |
| R2 | 10 GB, 1M operaciones/mes | US$0 |
| Telegram | Ilimitado | US$0 |
| **Total** | | **US$0/mes** |