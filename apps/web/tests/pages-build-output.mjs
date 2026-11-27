// Comprobacion local de artefactos Pages. NO consulta ni modifica Cloudflare.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';

const web=resolve(fileURLToPath(new URL('../',import.meta.url)));
const manifest=join(web,'dist','_routes.json');
const bundle=join(web,'dist','index.html');
const studio=join(web,'functions','api','studio','[[path]].js');
const config=join(web,'wrangler.toml');
assert.ok(existsSync(bundle),'Falta dist/index.html: compilar antes de comprobar');
assert.ok(existsSync(manifest),'Falta dist/_routes.json: las Functions de Studio caerían en el fallback HTML');
assert.ok(existsSync(studio),'Falta la Pages Function de Studio');
const raw=JSON.parse(readFileSync(manifest,'utf8'));
assert.equal(raw.version,1);
assert.deepEqual([...raw.include].sort(),['/api/admin-session/*','/api/studio/*'].sort(),
 'El artefacto Pages debe incluir exactamente los dos puentes protegidos');
assert.deepEqual(raw.exclude,[],'No excluir rutas protegidas');
const wrangler=readFileSync(config,'utf8');
assert.match(wrangler,/pages_build_output_dir\s*=\s*"\.\/dist"/);
assert.match(wrangler,/binding\s*=\s*"STUDIO_API"\s*service\s*=\s*"evpro-sync-api"/);
assert.match(wrangler,/binding\s*=\s*"ADMIN_SESSION_API"\s*service\s*=\s*"energia-vital-api"/);
console.log('[OK] Artefacto Pages: dist/_routes.json incluye Studio y admin; funciones y bindings en código presentes.');
console.log('Esta comprobacion local NO prueba que el paquete esté desplegado ni que los bindings funcionen en producción.');
