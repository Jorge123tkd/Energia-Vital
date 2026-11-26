'use strict';
(async()=>{
 const status=document.getElementById('status'),detail=document.getElementById('detail'),files=document.getElementById('files');
 try{
  const r=await fetch('/evpro/stable-release.json',{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error();
  const raw=await r.json();
  if(raw?.schema!=='evpro-stable-v1'||typeof raw.available!=='boolean')throw Error();
  if(!raw.available){status.textContent='Todavía no hay una versión estable publicada';detail.textContent='El equipo está validando la siguiente entrega. No se ofrecen archivos piloto como versión estable.';return;}
  if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(raw.version))throw Error();
  const rows=[];
  for(const [key,ext,title] of [['installer','exe','Instalador Windows'],['portable','zip','Windows sin instalar']]){
   const f=raw[key],expected='/evpro/releases/EV-Pro-Studio-'+raw.version+'-x64-'+key+'.'+ext;
   if(!f||f.path!==expected||!/^([a-f0-9]{64})$/.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<=0||f.bytes>500*1024*1024)throw Error();
   const section=document.createElement('section'),link=document.createElement('a'),p=document.createElement('p'),code=document.createElement('code');
   link.href=f.path;link.className='download';link.textContent=title+' · '+Math.round(f.bytes/1024/1024)+' MiB';p.textContent='SHA-256: ';code.textContent=f.sha256;p.append(code);section.append(link,p);rows.push(section);
  }
  status.textContent='Versión estable '+raw.version;detail.textContent='Selecciona el instalador o el paquete sin instalar.';files.replaceChildren(...rows);
 }catch{status.textContent='No se pudo comprobar la versión';detail.textContent='No descargues archivos de enlaces alternativos. Vuelve a consultar el canal oficial cuando tengas conexión.';files.replaceChildren();}
})();
