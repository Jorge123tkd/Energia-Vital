// Produce a release MANIFEST from CI artifacts. No credentials or network.
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,statSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
function verify(file){
 const stats=statSync(file)
 assert(stats.isFile()&&stats.size>0&&stats.size<100*1024*1024,'Artefacto vacío o demasiado grande')
 const bytes=readFileSync(file)
 return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}
}
export function verifySourceRoutes(raw){
 assert.equal(raw.version,1)
 assert.deepEqual([...raw.include].sort(),['/api/admin-session/*','/api/studio/*'].sort())
 assert.deepEqual(raw.exclude,[])
 return true
}
function main(){
 assert.equal(process.argv.length,5,'Uso: node apps/web/tests/pages-package-preflight.mjs RUTA_BUNDLE RUTA_ROUTING_GENERADO SALIDA_JSON')
 const [bundle,compiledRoutes,output]=process.argv.slice(2).map(resolve)
 const compiled=JSON.parse(readFileSync(compiledRoutes,'utf8'))
 assert(compiled&&typeof compiled==='object'&&!Array.isArray(compiled),'Wrangler no generó rutas válidas')
 const sourceRouteFile=new URL('../dist/_routes.json',import.meta.url)
 verifySourceRoutes(JSON.parse(readFileSync(sourceRouteFile,'utf8')))
 const sourceRoutes=verify(fileURLToPath(sourceRouteFile))
 const built=verify(bundle)
 assert(built.bytes>1000,'Pages Functions no se compilaron correctamente')
 const generated=verify(compiledRoutes)
 if(process.env.GITHUB_ACTIONS==='true')assert.equal(process.env.GITHUB_REF_NAME,'feat/cloudflare-customer-accounts-hardening','La CI de preparación solo puede usar la rama de desarrollo autorizada')
 const gitSha=process.env.GITHUB_SHA||'no-identificado'
 assert(gitSha==='no-identificado'||/^[a-f0-9]{40}$/i.test(gitSha),'Commit CI inválido')
 const manifest={
  state:'PREPARADO_NO_PUBLICADO',
  project:'energia-vital-web',
  sourceBranch:'feat/cloudflare-customer-accounts-hardening',
  gitSha,
  checked:{
   distRoutes:{...sourceRoutes,studio:true,adminSessions:true},
   compiledPagesFunctions:built,
   compiledFunctionsRoutes:generated
  },
  restrictions:{
   pagesDeployed:false,
   workerDeployed:false,
   d1Migrated:false,
   productionBindingsVerified:false,
   externalBackupVerified:false,
   studioActivated:false
  }
 }
 writeFileSync(output,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600})
 console.log('[OK] Manifiesto de paquete Pages generado sin datos personales ni secretos.')
 console.log('[SIN PUBLICAR] Commit '+gitSha+'; Functions y _routes.json comprobados; producción sin cambios.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{main()}catch(error){const detail=error instanceof Error ? error.message : 'Excepción no identificada';console.error('[BLOQUEADO] Manifiesto Pages: '+String(detail).slice(0,350));process.exitCode=1}
}
