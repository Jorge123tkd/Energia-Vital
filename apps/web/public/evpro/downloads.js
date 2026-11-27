'use strict';
const allowedReleaseUrl=value=>{
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&u.origin==='https://github.com'&&
   u.pathname.startsWith('/Jorge123tkd/EV-Pro-Estudio/releases/download/')&&
   !u.username&&!u.password&&!u.search&&!u.hash;
 }catch{return false;}
};
const allowedReleasePage=value=>{
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&u.origin==='https://github.com'&&
   /^\/Jorge123tkd\/EV-Pro-Estudio\/releases\/tag\/[A-Za-z0-9._-]+$/.test(u.pathname)&&
   !u.username&&!u.password&&!u.search&&!u.hash;
 }catch{return false;}
};
(async()=>{
 const status=document.getElementById('status'),detail=document.getElementById('detail'),files=document.getElementById('files');
 try{
  const r=await fetch('/evpro/stable-release.json',{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error();
  const raw=await r.json();
  if(raw?.schema!=='evpro-stable-v2'||typeof raw.available!=='boolean')throw Error();
  if(!raw.available){status.textContent='Todavía no hay una versión estable publicada';detail.textContent='El equipo está validando la siguiente entrega. Los instaladores piloto privados no se distribuyen por este canal.';return;}
  if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(raw.version)||!allowedReleasePage(raw.release_url))throw Error();
  const rows=[];
  for(const [key,ext,title] of [['installer','exe','Instalador Windows'],['portable','zip','Windows sin instalar']]){
   const f=raw[key];
   if(!f||!allowedReleaseUrl(f.url)||!/^([a-f0-9]{64})$/.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<=0||f.bytes>500*1024*1024)throw Error();
   const section=document.createElement('section'),link=document.createElement('a'),p=document.createElement('p'),code=document.createElement('code');
   section.className='file';link.href=f.url;link.className='btn';link.rel='noopener noreferrer';
   link.textContent=title+' · '+Math.round(f.bytes/1024/1024)+' MiB';
   p.textContent='SHA-256: ';code.textContent=f.sha256;p.append(code);section.append(link,p);rows.push(section);
  }
  const release=document.createElement('p'),notes=document.createElement('a');
  notes.href=raw.release_url;notes.rel='noopener noreferrer';notes.textContent='Ver notas y cambios de esta versión';release.append(notes);rows.push(release);
  status.textContent='Versión estable '+raw.version;detail.textContent='Archivos oficiales alojados en GitHub Releases; verifica SHA-256 después de descargar.';files.replaceChildren(...rows);
 }catch{status.textContent='No se pudo comprobar la versión';detail.textContent='No descargues archivos de enlaces alternativos. Vuelve a consultar el canal oficial cuando tengas conexión.';files.replaceChildren();}
})();
