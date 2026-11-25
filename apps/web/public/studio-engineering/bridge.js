'use strict';
// The shared EV renderer receives only a workspace capability, never JWTs.
(()=>{
 const waiting=new Map();let nextId=0,port=null,resolveConnection,readyTimer;
 const connected=new Promise(resolve=>{resolveConnection=resolve});
 const expectedParentOrigin=new URL(location.href).origin;
 function receive(event){
  if(port||event.source!==parent||event.origin!==expectedParentOrigin||event.data?.type!=='evpro-engineering-connect-v1'||event.ports.length!==1)return;
  port=event.ports[0];clearInterval(readyTimer);
  window.removeEventListener('message',receive);
  port.onmessage=event=>{
   const response=event.data;if(response?.type==='check-close'){let pending=true;try{pending=typeof engineeringCanLeave!=='function'||!engineeringCanLeave()}catch{};port.postMessage({type:'close-state',pending});return}const pending=waiting.get(response?.id);if(!pending)return;
   waiting.delete(response.id);clearTimeout(pending.timer);
   if(response.ok)pending.resolve(response.result);
   else pending.reject(Object.assign(Error(response.error||'No se confirmó el guardado online'),{conflict:response.status===409,code:response.status}));
  };
  port.start();resolveConnection();installMenu();
 }
 function installMenu(){
  const menu=document.getElementById('nav');if(!menu)return;
  const items=[['team','♙','Colaboración y permisos','projects'],['catalog','▥','Catálogo comercial','library'],['backup','↧','Copias de secciones compartidas','backups'],['inventory','▦','Almacén y compras'],['finance','＄','Finanzas y compromisos'],['publication','↗','Publicaciones comerciales'],['exit','←','Volver a Bonaire']];
  const send=section=>{if(port)port.postMessage({type:'studio-navigation',section})};
  function decorate(){
   if(!menu.querySelector('.brand')||menu.querySelector('#ev-business-nav'))return;
   const group=document.createElement('div');group.id='ev-business-nav';
   const label=document.createElement('div');label.className='navlabel';label.textContent='OPERACIONES BONAIRE';group.append(label);
   for(const [section,glyph,name,under] of items){
    const button=document.createElement('button');button.type='button';button.className='navitem';button.dataset.studioSection=section;
    const icon=document.createElement('span');icon.textContent=glyph;button.append(icon,document.createTextNode(name));
    button.addEventListener('click',()=>{menu.classList.remove('visible');send(section)});
    const anchor=under&&Array.from(menu.querySelectorAll('button.navitem')).find(b=>b.getAttribute('onclick')==="nav('"+under+"')");
    if(anchor){button.style.paddingLeft='27px';button.style.fontSize='12px';anchor.after(button)}
    else if(!under||section==='team'){group.append(button)}
   
   }
   menu.append(group);
  }
  menu.addEventListener('click',e=>{const button=e.target.closest?.('button.navitem');if(button&&!button.dataset.studioSection)send('engineering')},true);
  new MutationObserver(decorate).observe(menu,{childList:true});decorate();
 }
 window.addEventListener('message',receive);
 const signal=()=>{if(!port)parent.postMessage({type:'evpro-engineering-ready-v2'},expectedParentOrigin)};
 signal();readyTimer=setInterval(signal,500);
 async function call(action,payload){
  let timer;try{await Promise.race([connected,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Studio no recibió autorización de Bonaire')),15000)})])}finally{clearTimeout(timer)}
  const id=++nextId;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{waiting.delete(id);reject(Error('No se confirmó la operación online. Conserva tus cambios.'))},180000);
   waiting.set(id,{resolve,reject,timer});
   port.postMessage({id,action,payload});
  });
 }
 Object.defineProperty(window,'EVEngineeringAccount',{value:Object.freeze({info:()=>call('account'),action:async action=>{if(action!=='logout')throw Error('Acción no disponible');if(!port)throw Error('Sesión no conectada');port.postMessage({type:'studio-navigation',section:'logout'})}}),writable:false,configurable:false});
 Object.defineProperty(window,'EVEngineeringStore',{value:Object.freeze({scope:'online',read:()=>call('read'),write:payload=>call('write',payload)}),writable:false,configurable:false});
})();
