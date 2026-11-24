# Paso Pages — prepublicación de puente Studio (sin desplegar)

**Diagnóstico real (23/11/2026).** El proyecto Cloudflare Pages energia-vital-web utiliza **Direct Upload** (Git Provider: No). Sus despliegues productivos se etiquetan main. El despliegue que respondía 200 text/html para las dos rutas de Studio tenía como fuente 7dabbfa, que **no contiene** la Function de Studio, no incluye /api/studio/* en _routes.json y carece del binding STUDIO_API. La rama actual feat/cloudflare-customer-accounts-hardening sí incluye esos archivos. El problema no necesita resolver DNS ni duplicar el proyecto.

## Preparación automatizada desde GitHub — NO PUBLICA
La CI .github/workflows/qa-code-check.yml del branch feat/cloudflare-customer-accounts-hardening realiza:

1. Instalación de dependencias, comprobaciones y build de la web.
2. Validación de apps/web/dist/_routes.json y del código de las Functions.
3. Compilación de Pages Functions con Wrangler y captura de rutas generadas.
4. Generación de un manifiesto JSON con SHA-256 del bundle compilado, las reglas compiladas, dist/_routes.json y la referencia GitHub del commit exacto mediante apps/web/tests/pages-package-preflight.mjs.
5. Conservación temporal (14 días) de **solo el manifiesto**, mediante GitHub Actions upload-artifact; no incluye credenciales, SQL, objetos R2, binarios de la aplicación ni datos de clientes.

El manifiesto se identifica explícitamente como **PREPARADO_NO_PUBLICADO**. No certifica los bindings remotos, respaldo externo o aprobación final. Si alguna comprobación falla, no se marca el paquete como preparado. La compilación se ejecuta en GitHub Actions; **no requiere servidor local ni ningún comando en el PC del operador**.

Para revisar el artefacto: GitHub → Jorge123tkd/Energia-Vital → Actions → **Bonaire - validacion previa de QA sin despliegue** → última ejecución correcta en la rama feat → Artifacts → bonaire-pages-preflight-(SHA).

## Publicación — BLOQUEADA hasta autorización

No ejecutar pages deploy todavía. Antes se deben completar y registrar:
- Respaldo cifrado independiente y restaurable de D1 y de recursos R2 relevantes (no basta con que un bucket exista ni con un hash histórico).
- Revisión de migraciones comerciales y accesos administrativos antes de cambiar la web de producción.
- Validación del Pages production_branch mediante consulta de lectura. El texto Branch: main de un despliegue Direct Upload **no** significa que GitHub actualice el proyecto automáticamente. No confundir main de Pages con cambiar el branch del repositorio.
- Autorización humana explícita para actualizar **solo Pages**, usando la misma rama fuente que superó las pruebas. No desplegar energia-vital-api, evpro-sync-api, ni migrar D1 junto con esta corrección.

Cuando se apruebe la fase, la subida deberá hacerse **desde apps/web con Wrangler**, no arrastrando un ZIP en el Dashboard, de modo que se incluyan Functions y bindings. Verificar después:
- GET /api/studio/v1/me sin token → **401 application/json**.
- GET /api/studio/native/v1/me sin token → **401 application/json**.
- Rutas de sesión administrativa y navegación siguen funcionando.
- Studio continúa cerrado por flags del Worker hasta su habilitación explícita posterior.

Documentación Cloudflare: https://developers.cloudflare.com/pages/get-started/direct-upload/ y https://developers.cloudflare.com/pages/functions/wrangler-configuration/


## Ejecución desde CMD sin publicar mientras faltan bloqueos

El script de publicación aislada es scripts/pages-publicacion-controlada.ps1. **Sin parámetros** únicamente verifica rama de Git, limpieza del árbol, último commit local contra origin, rama main de despliegues Pages y conteo/última migración de la base comercial D1; no compila, no crea secretos y no despliega. En Windows CMD:

    cd /d "C:\Users\Taliety\Desktop\Energia-Vital"
    git pull --ff-only origin feat/cloudflare-customer-accounts-hardening
    powershell -NoProfile -File scripts\pages-publicacion-controlada.ps1

El código actual trae las migraciones 025-028 para almacén/finanzas; si la base de producción no alcanza la 028, el script **bloquea** la publicación de este frontend. En ese caso no aplicar migraciones sin respaldos independientes y ensayo de restauración. La ausencia de datos privados en la salida facilita compartir solo las líneas de estado.

**Publicación final, solo tras verificar de verdad los respaldos externos y las migraciones comerciales:**

    powershell -NoProfile -File scripts\pages-publicacion-controlada.ps1 -Publicar -RespaldoExternoVerificado -Confirmacion PUBLICAR_SOLO_PAGES_BONAIRE

Ese comando realiza la compilación y pruebas locales de empaquetado (sin iniciar ningún servidor) y, al final, despliega **solo** Pages desde apps/web con --branch main. Después verifica que ambas rutas anónimas de Studio devuelvan 401 JSON y que el inicio siga en 200. **No usar el segundo comando antes de cumplir los controles**: el parámetro de respaldo es una declaración humana, no una copia creada por el programa. Si la web ya fue publicada y falla una comprobación, el script indicará claramente que se requiere inspección y posible rollback; el despliegue no se revierte automáticamente.

Este procedimiento no reemplaza el despliegue completo de API, las migraciones, la creación de claves oficiales ni las pruebas reales de Studio 3.9. Aun con Pages publicada, Studio sigue desactivado hasta su propia fase aprobada.
