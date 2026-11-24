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

// Review incoming team edits by the exact shared row identity. Preserve
// every field not explicitly mapped; never change local catalog links or costs.
export async function reviewTeamChanges(manifest,projectId,records){
 const project=manifest?.projects?.find(p=>p.id===projectId);
 if(!project||!Array.isArray(records))throw Error('Proyecto o filas inválidos');
 const preview=await previewTechnicalRows(manifest,projectId);
 const known=new Map(preview.rows.map(r=>[r.id,r]));
 const changes=[],ignored=[];
 for(const record of records){
  const row=known.get(record?.section_id),b=record?.body;
  if(!row||!b||typeof b!=='object'||!Number.isSafeInteger(record.revision)||record.revision<1){ignored.push(record?.section_id||'');continue}
  let fields;
  if(row.kind==='task'){
   if(typeof b.title!=='string'||!b.title.trim()||b.title.length>160||!['pending','working','done'].includes(b.status)||typeof b.dueDate!=='string'||date(b.dueDate)===null){ignored.push(row.id);continue}
   fields=['title','status','dueDate'];
  }else{
   if(typeof b.name!=='string'||!b.name.trim()||b.name.length>180||!Number.isFinite(b.quantity)||b.quantity<=0||b.quantity>1000000||!['unit','m','m2','kg','set','roll','box'].includes(b.unit)){ignored.push(row.id);continue}
   fields=['name','quantity','unit'];
  }
  const incoming=Object.fromEntries(fields.map(k=>[k,b[k]]));
  const before=Object.fromEntries(fields.map(k=>[k,row.body[k]]));
  if(JSON.stringify(before)!==JSON.stringify(incoming))changes.push({id:row.id,kind:row.kind,site:row.site,revision:record.revision,before,incoming});
 }
 return {changes,ignored};
}
export async function applyTeamChanges(manifest,projectId,approved){
 if(!Array.isArray(approved)||new Set(approved.map(c=>c.id)).size!==approved.length)throw Error('Selección duplicada o inválida');
 const copy=JSON.parse(JSON.stringify(manifest)),p=copy.projects.find(x=>x.id===projectId);
 if(!p)throw Error('Proyecto inexistente');
 const wanted=new Map(approved.map(c=>[c.id,c])),applied=[];
 const canonicalUnit={unit:'ud',m:'m',m2:'m²',kg:'kg',set:'juego',roll:'rollo',box:'caja'};
 for(const site of p.sites){
  for(const [i,t] of (site.tasks||[]).entries()){
   const id='task-'+await digest([projectId,site.id,validId(t.id)?['id',t.id]:['legacy',i,String(t.name||'').trim()]]);
   const edit=wanted.get(id);if(!edit)continue;
   const b=edit.incoming;
   // A legacy name is part of its shared identity: do not silently break it.
   if(!validId(t.id)&&b.title!==edit.before.title)throw Error('La tarea heredada cambió de nombre; revisa ese cambio manualmente.');
   t.name=b.title;t.end=b.dueDate;
   if(b.status!==edit.before.status){
    t.status={pending:'Pendiente',working:'En ejecución',done:'Completada'}[b.status];
    t.progress=b.status==='done'?100:b.status==='pending'?0:Math.max(1,Math.min(99,Number(t.progress)||1));
   }
   wanted.delete(id);applied.push(id);
  }
  for(const m of site.materials||[]){
   if(!validId(m.id))continue;
   const id='material-'+await digest([projectId,site.id,['id',m.id]]);
   const edit=wanted.get(id);if(!edit)continue;
   const b=edit.incoming;
   m.name=b.name;m.qty=b.quantity;if(b.unit!==edit.before.unit)m.unit=canonicalUnit[b.unit];
   wanted.delete(id);applied.push(id);
  }
 }
 if(wanted.size)throw Error('La fila original no coincide; no se aplicaron cambios');
 if(applied.length)p.updated=new Date().toISOString();
 return {snapshot:copy,applied};
}
