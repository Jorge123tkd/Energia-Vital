/**
 * Auditoría informativa del lockfile npm en GitHub Actions.
 * No registra nombres de paquetes, respuestas completas del registro, credenciales
 * ni artefactos. Muestra solo los conteos agregados por severidad.
 *
 * IMPORTANTE: terminar sin error NO significa ausencia de vulnerabilidades.
 * Las alertas altas/críticas deben revisarse ANTES de autorizar un despliegue.
 */
const {spawnSync}=require('node:child_process');
const severity=['critical','high','moderate','low','info'];
let unverified=false;
let blockers=false;
for(const {label,args} of [
  {label:'Dependencias de ejecución',args:['--omit=dev']},
  {label:'Todas las dependencias (incluye desarrollo)',args:[]},
]){
  const run=spawnSync('npm',['audit','--json',...args],{
    cwd:require('node:path').resolve(__dirname,'..'),
    encoding:'utf8',timeout:90000,maxBuffer:12*1024*1024,
    env:{...process.env,npm_config_update_notifier:'false'}
  });
  let report;
  try{report=JSON.parse(run.stdout||'');}
  catch{report=null;}
  const counts=report?.metadata?.vulnerabilities;
  if(!counts||!severity.every(level=>Number.isInteger(counts[level])&&counts[level]>=0)){
    unverified=true;
    console.log('::warning title=Auditoría npm no verificada::'+label+
      ': el registro no devolvió resultados estructurados. Revisar conectividad/permisos del runner.');
    continue;
  }
  const details=severity.map(s=>s+'='+counts[s]).join(', ');
  console.log(label+': '+details);
  if(counts.high+counts.critical>0){
    blockers=true;
    console.log('::warning title=Riesgos de dependencias por revisar::'+label+
      ' tiene '+(counts.high+counts.critical)+' alertas altas/críticas en npm audit.');
  }
}
if(!unverified&&!blockers)console.log('No se detectaron alertas altas/críticas en el reporte npm actual.');
console.log('Auditoría solo informativa: el lanzamiento requiere revisión y aprobación de dependencias.');
