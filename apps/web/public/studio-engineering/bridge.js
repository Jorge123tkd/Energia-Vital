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
   const response=event.data;if(response?.type==='check-close'){let pending=true;try{pending=typeof pendingSave!=='function'||pendingSave()||!!offlineRunning||!!manualSaveBusy}catch{};port.postMessage({type:'close-state',pending});return}const pending=waiting.get(response?.id);if(!pending)return;
   waiting.delete(response.id);clearTimeout(pending.timer);
   if(response.ok)pending.resolve(response.result);
   else pending.reject(Object.assign(Error(response.error||'No se confirmó el guardado online'),{conflict:response.status===409,code:response.status}));
  };
  port.start();resolveConnection();
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
 Object.defineProperty(window,'EVEngineeringStore',{value:Object.freeze({scope:'online',read:()=>call('read'),write:payload=>call('write',payload)}),writable:false,configurable:false});
})();
