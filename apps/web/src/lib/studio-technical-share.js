// Map only explicitly shareable operational fields. Never spread an
// engineering record, material cost, financial metadata or an attachment.
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const units=new Map([['ud','unit'],['unidad','unit'],['unit','unit'],['m','m'],['m²','m2'],['m2','m2'],['kg','kg'],['juego','set'],['set','set'],['kit','set'],['rollo','roll'],['roll','roll'],['caja','box'],['box','box']]);
function date(v){
 if(!v)return '';
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)return null;
 return v;
}
async function digest(v){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v)))),x=>x.toString(16).padStart(2,'0')).join('')}
export function savedProjects(manifest){
 if(!manifest||!Array.isArray(manifest.projects))return [];
 const result=[],ids=new Set();
 for(const p of manifest.projects){
  if(!validId(p?.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||!Array.isArray(p.sites))throw Error('Proyecto de ingeniería inválido o duplicado');
  ids.add(p.id);result.push({id:p.id,name:p.name.trim().slice(0,200)});
 }
 return result;
}
export async function previewTechnicalRows(manifest,projectId){
 const p=manifest?.projects?.find(p=>p?.id===projectId);
 if(!p||!validId(projectId))throw Error('Selecciona un proyecto guardado');
 const rows=[],skipped=[],seen=new Set();
 for(const site of p.sites){
  if(!validId(site?.id))throw Error('Instalación sin identificador válido');
  const siteName=typeof site.name==='string'?site.name:'Instalación';
  const make=async(kind,sourceKey,body)=>{
   const id=kind+'-'+await digest([projectId,site.id,sourceKey]);
   if(seen.has(id))throw Error('Identificadores técnicos duplicados; revisa el proyecto');
   seen.add(id);rows.push({id,site:siteName,kind,body});
  };
  for(const [i,t] of (Array.isArray(site.tasks)?site.tasks:[]).entries()){
   const title=typeof t?.name==='string'?t.name.trim():'',dueDate=date(t?.end);
   if(!title||title.length>160||dueDate===null){skipped.push({site:siteName,kind:'Tarea',reason:'Nombre o fecha no válidos'});continue}
   const status=t.status==='Completada'||t.status==='Terminada'||t.progress===100?'done':t.status==='En curso'||t.status==='En ejecución'||Number(t.progress)>0?'working':'pending';
   // Legacy task rows without IDs use a content fingerprint + occurrence.
   // This is a one-time share, not a bidirectional task identity migration.
   await make('task',validId(t.id)?['id',t.id]:['legacy',i,title],{title,status,dueDate});
  }
  for(const m of Array.isArray(site.materials)?site.materials:[]){
   const name=typeof m?.name==='string'?m.name.trim():'',quantity=Number(m?.qty),unit=units.get(String(m?.unit||'').trim().toLowerCase());
   if(!validId(m?.id)||!name||name.length>180||!Number.isFinite(quantity)||quantity<=0||quantity>1000000||!unit){skipped.push({site:siteName,kind:'Material',reason:'Identidad, nombre, cantidad o unidad no compatibles'});continue}
   // Catalog links must be assigned separately against Bonaire, not guessed
   // from legacy library IDs. No stock operation is generated.
   await make('material',['id',m.id],{name,productId:null,quantity,unit});
  }
  if(rows.length>1000)throw Error('Demasiadas filas; divide el proyecto por etapas');
 }
 return {rows,skipped};
}
