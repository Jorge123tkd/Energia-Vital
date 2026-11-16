# Activador de parche Vite y Undici
Ejecución única en GitHub Actions aislada. Actualiza mediante npm, verifica auditoría, compatibilidad, Worker y D1 temporales. No usa secretos de producción ni despliega.

Segundo ensayo: cota raíz segura para Undici 7 con lockfile regenerado por npm.

Tercer ensayo: aceptar package.json raíz por override Undici con protección de versión mayor.

Cuarto ensayo: reparado workflow YAML y verificación de manifiestos permitidos.

Quinto ensayo: aceptar sintaxis semver npm con ~ o ^ y exigir lockfile exacto.

Sexto ensayo: diagnóstico mínimo de versiones declaradas por npm.

Séptimo ensayo: el plugin se declara con semver válido '5' y resuelve 5.1.1.
