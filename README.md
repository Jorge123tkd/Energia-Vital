# Energia-Vital

**Estructura del Proyecto**

energia-vital/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   ├── assistant/
│   │   │   ├── catalog/
│   │   │   ├── common/
│   │   │   └── solar/
│   │   ├── composables/
│   │   ├── layouts/
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   ├── assistant/
│   │   │   ├── catalog/
│   │   │   ├── services/
│   │   │   └── solar/
│   │   ├── router/
│   │   ├── stores/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── App.vue
│   │   └── main.ts
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── wrangler.toml
├── backend/
│   ├── src/
│   │   ├── api/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── middleware/
│   │   └── index.ts
│   ├── migrations/
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml
├── docs/
│   ├── DEPLOYMENT.md
│   ├── ADMIN_MANUAL.md
│   ├── TELEGRAM_SETUP.md
│   └── SOLAR_CALCULATIONS.md
├── tests/
│   ├── frontend/
│   └── backend/
├── .env.example
├── .gitignore
├── README.md
└── package.json