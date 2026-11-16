# Activación puntual de actualización de Hono
Esta marca permite ejecutar una sola vez el workflow aislado `hono-patch-one-shot.yml` en la rama `security/hono-4-13-18`.
El workflow solo ejecuta npm en GitHub Actions, regenera el package-lock de Hono 4.13.18, exige auditoría de ejecución sin vulnerabilidades, compila API y web, y ejecuta integración en Worker/D1 falsos. Solo tras pruebas verdes puede registrar `apps/api/package.json` y `package-lock.json` en la rama de ensayo.
NO publica Worker/Pages, NO usa credenciales Cloudflare y NO accede a D1/R2 de producción.
Esta marca y el workflow deben eliminarse de la rama de ensayo una vez terminada la revisión.
