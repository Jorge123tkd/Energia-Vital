/* EV Pro Studio 3.6: actualización de recursos web con respaldo y reinicio. */
'use strict';
window.EVProUpdater=(()=>{
 const MAX=12*1024*1024, ALLOWED=new Set(['app.js','index.html','engine.js','library.js','style.css','favicon.svg','updater.js']);
 const dec=new TextDecoder('utf-8',{fatal:true}),elem=id=>document.getElementById(id);
 function stage(value,message){const p=elem('evUpdateProgress'),s=elem('evUpdateStatus');if(p)p.value=value;if(s)s.textContent=message}
 function panel(){return `<section class="panel"><h2>Actualización del programa · ZIP compartido</h2><p>Selecciona un ZIP de actualización de EV Pro Studio. La aplicación verifica los archivos, hace una copia de seguridad y recarga la página tras instalar. Los proyectos, fotografías y bases de datos no se sustituyen.</p><label class="field">Archivo ZIP<input type="file" id="evUpdateZip" accept=".zip,application/zip"></label><label class="check"><input type="checkbox" id="evUpdateConsent"> Ya guardé un respaldo privado y conozco el origen del ZIP.</label><div class="actions"><button type="button" id="evUpdateButton" onclick="EVProUpdater.run()">Actualizar desde ZIP</button></div><progress id="evUpdateProgress" max="100" value="0" style="width:100%;height:14px" aria-label="Progreso de actualización"></progress><p id="evUpdateStatus" role="status" aria-live="polite">Esperando archivo ZIP.</p><p class="muted">Versión instalada: ${globalThis.EVPRO_CURRENT_RELEASE||'3.5'}. En modo local puede solicitar permiso para escribir en la carpeta de EV Pro. En modo servidor solo el administrador local puede aplicar actualizaciones. Actualiza los recursos web compartidos, no el ejecutable Windows ni el servidor Python.</p></section>`;}
 function unzipStored(buf){
   const d=new DataView(buf),b=new Uint8Array(buf),l=b.length;
   if(l<22||l>MAX)throw Error('ZIP fuera de tamaño permitido');
   let e=-1;for(let p=l-22;p>=Math.max(0,l-65557);p--){if(d.getUint32(p,true)===0x06054b50){e=p;break}}
   if(e<0)throw Error('ZIP sin directorio válido');
   const n=d.getUint16(e+10,true),start=d.getUint32(e+16,true),size=d.getUint32(e+12,true);
   if(n<2||n>12||d.getUint16(e+8,true)!==n||start+size>l)throw Error('Directorio ZIP incompatible');
   let p=start,total=0;const map=new Map();
   for(let k=0;k<n;k++){
     if(p+46>l||d.getUint32(p,true)!==0x02014b50)throw Error('Directorio ZIP dañado');
     const method=d.getUint16(p+10,true),bytes=d.getUint32(p+20,true),raw=d.getUint32(p+24,true),len=d.getUint16(p+28,true),ex=d.getUint16(p+30,true),com=d.getUint16(p+32,true),off=d.getUint32(p+42,true);
     if(method!==0||bytes!==raw||raw>MAX||p+46+len+ex+com>l)throw Error('ZIP requiere entradas sin compresión');
     const name=dec.decode(b.slice(p+46,p+46+len));
     if((name!=='manifest.json'&&!ALLOWED.has(name))||map.has(name)||name.includes('/')||name.includes('\\'))throw Error('Archivo no permitido/repetido: '+name);
     if(off+30>l||d.getUint32(off,true)!==0x04034b50)throw Error('Entrada ZIP dañada');
     const dataStart=off+30+d.getUint16(off+26,true)+d.getUint16(off+28,true);
     if(dataStart+raw>l)throw Error('Archivo ZIP incompleto');
     map.set(name,b.slice(dataStart,dataStart+raw));total+=raw;if(total>MAX)throw Error('ZIP demasiado grande');
     p+=46+len+ex+com;
   }
   if(!map.has('manifest.json'))throw Error('Falta manifest.json');return map;
 }
 async function verify(file){
   stage(10,'Leyendo archivo ZIP…');if(file.size>MAX)throw Error('ZIP demasiado grande');
   const buf=await file.arrayBuffer(),entries=unzipStored(buf);stage(27,'Verificando manifiesto y archivos…');
   const man=JSON.parse(dec.decode(entries.get('manifest.json')));
   if(man.format!=='evpro-update-v1'||!/^\d+\.\d+(?:\.\d+)?(?:-(?:prueba|rc\.\d+))?$/.test(man.version)||!Array.isArray(man.files)||man.files.length!==entries.size-1)throw Error('Paquete incompatible');
   for(const [i,f] of man.files.entries()){
     if(!ALLOWED.has(f.path)||!entries.has(f.path)||entries.get(f.path).length!==f.bytes||!/^[0-9a-f]{64}$/.test(f.sha256))throw Error('Archivo inesperado');
     const digest=await crypto.subtle.digest('SHA-256',entries.get(f.path)),hex=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
     if(hex!==f.sha256)throw Error('SHA-256 incorrecto: '+f.path);stage(30+Math.floor((i+1)/man.files.length*20),'Validado: '+f.path);
   }
   if(!man.files.some(f=>f.path==='app.js'))throw Error('Falta app.js');return {buf,man,entries};
 }
 async function installDesktop(buf,man){
   stage(57,'Instalando actualización en la aplicación de escritorio…');
   const result=await window.EVProDesktop.applyUpdate(buf);
   if(!result?.ok||result.version!==man.version)throw Error('Actualización nativa no confirmada');
   stage(98,'Actualizado '+result.version+'. Recargando…');setTimeout(()=>location.reload(),900);
 }
 async function installLocal(entries,man){
   if(!window.showDirectoryPicker)throw Error('Este navegador no permite escribir archivos. Usa Chrome o Edge compatible, o el instalador Windows.');
   stage(55,'Selecciona la carpeta de EV Pro Studio…');
   const root=await window.showDirectoryPicker({mode:'readwrite',id:'evpro'});
   try{for(const n of ['app.js','index.html','engine.js'])await root.getFileHandle(n)}catch{throw Error('La carpeta elegida no contiene una instalación reconocida de EV Pro Studio.')}
   const backup=await root.getDirectoryHandle('.evpro-actualizaciones',{create:true});
   const folder=await backup.getDirectoryHandle(new Date().toISOString().replace(/[:.]/g,'-'),{create:true});
   const before=new Map(),completed=[];
   try{
     for(const f of man.files){let data=null;try{data=await(await(await root.getFileHandle(f.path)).getFile()).arrayBuffer()}catch(e){if(e.name!=='NotFoundError')throw e};before.set(f.path,data);
       if(data!==null){const h=await folder.getFileHandle(f.path,{create:true}),w=await h.createWritable();await w.write(data);await w.close()}}
     stage(70,'Respaldo de archivos guardado. Instalando…');
     for(const [i,f] of man.files.entries()){
       const h=await root.getFileHandle(f.path,{create:true}),w=await h.createWritable();await w.write(entries.get(f.path));await w.close();completed.push(f.path);
       stage(72+Math.floor((i+1)/man.files.length*20),'Actualizado: '+f.path);
     }
   }catch(e){
     for(const n of completed.reverse())try{const data=before.get(n);if(data!==null){const h=await root.getFileHandle(n),w=await h.createWritable();await w.write(data);await w.close()}else await root.removeEntry(n)}catch(err){console.error('Restauración incompleta',n,err)}
     throw e;
   }
   stage(98,'Actualización completa. Recargando…');setTimeout(()=>location.reload(),900);
 }
 function installServer(buf){return new Promise((resolve,reject)=>{
   const x=new XMLHttpRequest();x.open('POST','/api/update/apply');x.withCredentials=true;x.setRequestHeader('Content-Type','application/json');x.timeout=90000;
   x.upload.onprogress=e=>{if(e.lengthComputable)stage(55+Math.floor(e.loaded/e.total*30),'Enviando actualización: '+Math.round(e.loaded/e.total*100)+' %')};
   x.onload=()=>{let j;try{j=JSON.parse(x.responseText)}catch{return reject(Error('Respuesta incorrecta del servidor'))}if(x.status!==200)return reject(Error(j.error||'Error de instalación'));resolve(j)};
   x.onerror=()=>reject(Error('Sin conexión con el servidor'));x.ontimeout=()=>reject(Error('Tiempo de espera agotado'));
   const a=new Uint8Array(buf);let text='';for(let i=0;i<a.length;i+=0x8000)text+=String.fromCharCode(...a.subarray(i,i+0x8000));x.send(JSON.stringify({package:btoa(text)}));
 })}
 let busy=false;
 async function run(){
   if(busy)return;const file=elem('evUpdateZip')?.files?.[0],button=elem('evUpdateButton');
   if(!file)return stage(0,'Selecciona primero el ZIP.');
   if(!elem('evUpdateConsent')?.checked)return stage(0,'Confirma que descargaste un respaldo privado y conoces el origen del ZIP.');
   if(typeof pendingSave==='function'&&pendingSave())return stage(0,'Hay cambios pendientes: guarda primero el expediente.');
   if(shared&&me?.role!=='admin')return stage(0,'Solo el administrador puede actualizar el servidor.');
   busy=true;if(button)button.disabled=true;
   try{const {buf,man,entries}=await verify(file);
     if(!confirm('¿Aplicar '+man.version+'? Se respaldarán los archivos y recargará la página.')){stage(0,'Operación cancelada.');return}
     if(shared){const info=await installServer(buf);stage(98,'Instalado '+info.version+'. Recargando…');setTimeout(()=>location.reload(),900)}else if(window.EVProDesktop?.platform==='windows-electron'){await installDesktop(buf,man)}else await installLocal(entries,man);
   }catch(e){stage(0,'No se actualizó: '+(e?.message||String(e)));console.error(e)}finally{busy=false;if(button)button.disabled=false}
 }
 return {panel,run,verify,unzipStored};
})();
