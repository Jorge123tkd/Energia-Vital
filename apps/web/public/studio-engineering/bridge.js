'use strict';
// The shared EV renderer receives only a workspace capability, never JWTs.
(()=>{
 const waiting=new Map();let nextId=0,port=null,resolveConnection,readyTimer,verifiedAccount=null;
 const connected=new Promise(resolve=>{resolveConnection=resolve});
 const expectedParentOrigin=new URL(location.href).origin;
 function receive(event){
  if(port||event.source!==parent||event.origin!==expectedParentOrigin||event.data?.type!=='evpro-engineering-connect-v1'||event.ports.length!==1)return;
  const identity=event.data.account;
  if(identity&&typeof identity.email==='string'&&identity.email.trim()&&['admin','worker'].includes(identity.role))verifiedAccount=Object.freeze({email:identity.email,role:identity.role,mode:'online',platform:'web'});
  port=event.ports[0];clearInterval(readyTimer);
  window.removeEventListener('message',receive);
  port.onmessage=event=>{
   const response=event.data;if(response?.type==='check-close'){let pending=true;try{pending=typeof engineeringCanLeave!=='function'||!engineeringCanLeave()}catch{};port.postMessage({type:'close-state',pending});return}const pending=waiting.get(response?.id);if(!pending)return;
   if(response.progress){clearTimeout(pending.timer);pending.timer=setTimeout(pending.expire,180000);return}
   waiting.delete(response.id);clearTimeout(pending.timer);
   if(response.ok)pending.resolve(response.result);
   else pending.reject(Object.assign(Error(response.error||'No se confirmó el guardado online'),{conflict:response.status===409,code:response.status}));
  };
  port.start();resolveConnection();installMenu();installAccountControls();
 }
 // The shared renderer normally draws this block. Keep an authenticated fallback
 // in the SAME top bar if an older renderer or a failed account RPC omits it.
 function installAccountControls(){
  const top=document.getElementById('top');if(!top||!verifiedAccount)return;
  function decorate(){
   const fallback=top.querySelector('#ev-web-account-fallback');
   const native=top.querySelector('.session-tools:not(#ev-web-account-fallback) .logout-btn');
   if(native){if(fallback)fallback.remove();return}
   if(fallback)return;
   const group=document.createElement('div');group.id='ev-web-account-fallback';group.className='session-tools';
   const identity=document.createElement('span');identity.className='session-account';
   const role=document.createElement('small');role.textContent=verifiedAccount.role==='admin'?'Administrador · En línea':'Trabajador técnico · En línea';
   const email=document.createElement('strong');email.textContent=verifiedAccount.email;
   identity.append(role,email);
   const logout=document.createElement('button');logout.type='button';logout.className='secondary logout-btn';logout.textContent='Cerrar sesión';
   logout.setAttribute('aria-label','Cerrar sesión');
   logout.addEventListener('click',()=>{if(port)port.postMessage({type:'studio-navigation',section:'logout'})});
   group.append(identity,logout);
   (top.querySelector('.row:last-child')||top).append(group);
  }
  new MutationObserver(decorate).observe(top,{childList:true,subtree:true});decorate();
 }
 function installMenu(){globalThis.EVBusinessMenu?.install(section=>{if(port)port.postMessage({type:'studio-navigation',section})},{web:true})}
 window.addEventListener('message',receive);
 const signal=()=>{if(!port)parent.postMessage({type:'evpro-engineering-ready-v2'},expectedParentOrigin)};
 signal();readyTimer=setInterval(signal,500);
 async function call(action,payload){
  let timer;try{await Promise.race([connected,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Studio no recibió autorización de Bonaire')),15000)})])}finally{clearTimeout(timer)}
  const id=++nextId;
  return new Promise((resolve,reject)=>{
   const expire=()=>{waiting.delete(id);reject(Error('No se confirmó la operación online. Conserva tus cambios.'))};
   const timer=setTimeout(expire,['preview','save-file'].includes(action)?900000:180000);
   waiting.set(id,{resolve,reject,timer,expire});
   if(action==='save-file'&&payload?.bytes instanceof Uint8Array)port.postMessage({id,action,payload},[payload.bytes.buffer]);else port.postMessage({id,action,payload});
  });
 }
 Object.defineProperty(window,'EVEngineeringAccount',{value:Object.freeze({info:()=>call('account'),action:async action=>{if(action!=='logout')throw Error('Acción no disponible');if(!port)throw Error('Sesión no conectada');port.postMessage({type:'studio-navigation',section:'logout'})}}),writable:false,configurable:false});
 Object.defineProperty(window,'EVEngineeringReports',{value:Object.freeze({preview:(html,options)=>call('preview',{html,options}),saveFile:(name,bytes,mime)=>call('save-file',{name,bytes,mime})}),writable:false,configurable:false});
 Object.defineProperty(window,'EVEngineeringStore',{value:Object.freeze({scope:'online',read:()=>call('read'),revision:()=>call('revision'),write:payload=>call('write',payload)}),writable:false,configurable:false});
})();
