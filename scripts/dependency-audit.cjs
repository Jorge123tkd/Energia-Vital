/**
 * Auditoría informativa del lockfile npm en GitHub Actions.
 * Nunca registra respuestas completas del registro, credenciales ni artefactos.
 * Muestra conteos y nombres públicos de paquetes afectados para su revisión.
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
  // Solo nombres de paquetes públicos y posibles correcciones, nunca el JSON
  // completo de npm, archivos de configuración, variables ni tokens de npm.
  const findings=Object.entries(report.vulnerabilities||{})
    .filter(([,item])=>['critical','high','moderate'].includes(item.severity))
    .sort((a,b)=>severity.indexOf(a[1].severity)-severity.indexOf(b[1].severity))
    .slice(0,25);
  for(const [name,item] of findings){
    const remedy=item.fixAvailable===false?'sin fix automático':
      item.fixAvailable===true?'fix disponible':
      item.fixAvailable?.isSemVerMajor?'requiere versión principal':
      item.fixAvailable?.version?'fix en versión '+String(item.fixAvailable.version).slice(0,24):
      'revisar';
    console.log(label+' - '+item.severity+' en '+name+
      ' ('+(item.isDirect?'directa':'transitiva')+', '+remedy+')');
  }
  if(counts.high+counts.critical>0){
    blockers=true;
    console.log('::warning title=Riesgos de dependencias por revisar::'+label+
      ' tiene '+(counts.high+counts.critical)+' alertas altas/críticas en npm audit.');
  }
}
if(!unverified&&!blockers)console.log('No se detectaron alertas altas/críticas en el reporte npm actual.');
console.log('Auditoría solo informativa: el lanzamiento requiere revisión y aprobación de dependencias.');
