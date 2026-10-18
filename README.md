# Energia Vital — Plataforma Comercial Inteligente

**Versión:** 1.0  

## Enfoque principal: asistente conversacional

La página principal de Energía Vital es un asistente digital con el que el cliente habla directamente, en lugar de buscar por su cuenta. El cliente escribe lo que necesita y el asistente lo guía paso a paso.

### Qué puede hacer el cliente

1. Escribir: «Quiero poner electricidad solar en mi casa, pero no sé qué equipos necesito».
2. Recibir preguntas sencillas del asistente y ser guiado paso a paso.
3. Obtener recomendaciones de equipos reales del catálogo (inversores, baterías, paneles, estaciones EcoFlow).
4. Solicitar reparaciones, instalaciones y citas.
5. Ver una galería de trabajos realizados con botón «Quiero algo parecido».
6. Acceder a videos de YouTube del canal oficial de Energía Vital.
7. Continuar la conversación por Telegram si lo prefiere.

### Paneles

- **Panel del negocio:** administración de precios, productos, fotos, citas, clientes potenciales y trabajos publicados.
- **Seguimiento del cliente:** consulta de sus propias solicitudes y citas, sin acceso a información de otros clientes.
**Objetivo:** Plataforma web comercial funcional, administrable, segura y ampliable, con coste mensual inicial de US$0 dentro de los planes gratuitos disponibles.

## Tecnologías utilizadas

| Capa | Tecnología | Función |
|---|---|---|
| Frontend | Svelte 5 + SvelteKit | Interfaz interactiva, adaptable a móviles y tabletas, menor complejidad que React. |
| Estilos | Tailwind CSS | Diseño rápido, adaptable y fácil de mantener. |
| Backend | Cloudflare Workers + Hono | Lógica del servidor, API REST y webhooks de Telegram. |
| Base de datos | Cloudflare D1 | Productos, servicios, citas, solicitudes, configuración del asistente, usuarios. |
| Archivos | Cloudflare R2 | Fotografías, videos y documentos del catálogo y galería. |
| Comunicación | Telegram Bot API | Notificaciones al equipo y seguimiento de solicitudes. |
| Versionado | GitHub + GitHub Actions | Código fuente y despliegue automático. |
| Desarrollo local | Node.js, npm, Wrangler CLI | Emulación y despliegue de los Workers. |

La primera versión puede atender las necesidades esenciales **sin depender de una API de IA de pago**. Las reglas conversacionales, el catálogo, las preguntas frecuentes y los cálculos solares funcionan con lógica determinista y reglas configurables desde el panel de administración.

## Estructura del proyecto

```
energia-vital/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── apps/
│   ├── web/                     # SPA Svelte 5 + Tailwind CSS
│   │   ├── src/
│   │   │   ├── routes/          # Páginas públicas y admin
│   │   │   ├── lib/             # API, asistente, catálogo, solar, auth
│   │   │   ├── layouts/         # Layout público y admin
│   │   │   ├── components/      # Componentes reutilizables
│   │   │   └── app.html
│   │   ├── static/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.cjs
│   │   └── wrangler.toml
│   ├── api/                     # Cloudflare Workers + Hono
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   ├── db.ts
│   │   │   └── types.ts
│   │   ├── migrations/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── wrangler.toml
│   └── cli/                     # Herramienta local opcional (migraciones, seed)
│       ├── src/
│       │   ├── commands.ts
│       │   ├── db.ts
│       │   ├── migrate.ts
│       │   └── seed.ts
│       ├── package.json
│       └── tsconfig.json
├── docs/
│   ├── README.md
│   ├── PROYECTO.md
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── ADMIN_MANUAL.md

## Modelo de datos mínimo (D1)

Las tablas principales incluyen:

- `admin_users` — administradores y roles del panel.
- `categories` — categorías de productos y servicios.
- `products` — productos reales del catálogo.
- `product_images` — fotos de productos (referencia a R2).
- `services` — servicios ofrecidos.
- `frequently_asked_questions` — preguntas y respuestas configurables.
- `assistant_config` — configuración del asistente (tono, reglas, preguntas por defecto).
- `assistant_sessions` — sesiones de conversación del asistente.
- `assistant_messages` — mensajes de cada sesión.
- `customers` — clientes y datos de contacto necesarios.
- `requests` — solicitudes comerciales, instalaciones, reparaciones.
- `appointments` — citas y calendario.
- `appointments_notes` — notas del técnico sobre cada cita.

## Estándares de entrega

- Código fuente completo y organizado en repositorio GitHub.
- Migraciones de D1 versionadas.
- Variables de entorno en `.env.example` sin secretos.
- Manual de despliegue paso a paso.
- Manual de administración del asistente y del panel.
- Pruebas unitarias, e2e y de carga.
- Documentación de cálculos solares y supuestos.
- Procedimiento de copias de seguridad y recuperación.

## Requisitos obligatorios

- Las funciones esenciales (catálogo, citas, solicitudes, administración) funcionan sin IA.
- No se incluyen secretos en el código público ni en el repositorio.
- El panel de administración es privado y protegido con autenticación real.
- Los clientes no pueden acceder a datos privados de otros clientes ni al dashboard.
- Las API validan permisos en el servidor, no solo ocultan botones en la interfaz.

## Cómo contribuir

1. Crear una rama desde `main`.
2. Desarrollar la funcionalidad en la rama.
3. Ejecutar pruebas.
4. Abrir un pull request.
5. Revisar y fusionar a `main`.

---

> Nota: el dominio propio no se incluye en el coste de infraestructura mensual y suele tener un coste anual independiente.
- `work_gallery` — galería de trabajos realizados.
- `system_settings` — configuración general (YouTube, dominio, etc.).
- `audit_logs` — registro de operaciones administrativas.
│   ├── TELEGRAM_SETUP.md
│   ├── SOLAR_CALCULATIONS.md
│   ├── CONFIG_ASISTENTE.md
│   └── PRUEBAS.md
├── tests/
│   ├── unit/
│   ├── e2e/
│   └── load/
├── .gitignore
├── .env.example
├── package.json
└── README.md
```