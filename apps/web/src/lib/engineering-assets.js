'use strict';
// Shared by Windows and the authenticated web shell; renderer keeps the
// original EV 3.8 data URLs. No credentials or public asset URLs here.
 const MAX_ASSET=21*1024*1024, MAX_TOTAL=192*1024*1024, MAX_REFS=512;
 const digest=async value=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
 const dataURL=s=>typeof s==='string'&&/^data:[a-z0-9!#$&^_.+/-]+;base64,[A-Za-z0-9+/]+={0,2}$/i.test(s);
 const ref=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.hasOwn(v,'__evAsset');
 const validHash=h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h);
 async function pack(snapshot){
  const assets=new Map(), seen=new Map();let total=0,expanded=0;
  async function walk(v,depth=0){
   if(depth>20)throw Error('Estructura de expediente demasiado profunda');
   if(typeof v==='string'&&v.startsWith('data:')&&v.includes(';base64,')){
    if(!dataURL(v)||v.length>MAX_ASSET)throw Error('Adjunto inválido o demasiado grande');
    expanded+=v.length;if(expanded>MAX_TOTAL)throw Error('Tamaño total de adjuntos excedido (192 MiB codificados). Conserva tu respaldo.');
    let hash=seen.get(v);
    if(!hash){hash=await digest(v);seen.set(v,hash)}
    if(!assets.has(hash)){total+=v.length;assets.set(hash,v);if(total>MAX_TOTAL||assets.size>MAX_REFS)throw Error('Límite de adjuntos del espacio alcanzado; conserva un respaldo')}
    return {__evAsset:hash};
   }
   if(ref(v))throw Error('Referencia de adjunto reservada');
   if(Array.isArray(v)){const a=[];for(const item of v)a.push(await walk(item,depth+1));return a}
   if(v&&typeof v==='object'){const out=Object.create(null);for(const [k,item] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Campo inválido');out[k]=await walk(item,depth+1)}return out}
   return v;
  }
  return {snapshot:await walk(snapshot),assets};
 }
 async function unpack(snapshot,load){
  const cache=new Map();let total=0,expanded=0;
  async function walk(v,depth=0){
   if(depth>20)throw Error('Expediente demasiado profundo');
   if(ref(v)){
    const hash=v.__evAsset;
    if(!validHash(hash)||Object.keys(v).length!==1)throw Error('Referencia inválida');
    if(!cache.has(hash)){
     if(cache.size>=MAX_REFS)throw Error('Demasiados adjuntos');
     const data=await load(hash);
     if(!dataURL(data)||data.length>MAX_ASSET||await digest(data)!==hash)throw Error('Integridad del adjunto no confirmada');
     total+=data.length;if(total>MAX_TOTAL)throw Error('Adjuntos exceden el límite');
     cache.set(hash,data);
    }
    const value=cache.get(hash);expanded+=value.length;
    if(expanded>MAX_TOTAL)throw Error('Tamaño de adjuntos reconstruidos excedido');
    return value;
   }
   if(Array.isArray(v)){const a=[];for(const item of v)a.push(await walk(item,depth+1));return a}
   if(v&&typeof v==='object'){const out=Object.create(null);for(const [k,item] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Campo inválido');out[k]=await walk(item,depth+1)}return out}
   return v;
  }
  return walk(snapshot);
 }
 function createCache(){return {values:new Map(),bytes:0}}
 function remember(cache,hash,data){if(!cache||cache.values.has(hash))return;while(cache.values.size>=MAX_REFS||cache.bytes+data.length>MAX_TOTAL){const first=cache.values.keys().next().value;if(first===undefined)return;cache.bytes-=cache.values.get(first).length;cache.values.delete(first)}cache.values.set(hash,data);cache.bytes+=data.length}
 function transport(request,{cache=null}={}){
  return async(method,payload)=>{
   if(method==='REV'){const result=await request('GET','/manifest');if(typeof result?.rev!=='string')throw Error('Revisión inválida');return {rev:result.rev};}
   if(method==='GET'){
    const result=await request('GET','/manifest');
    if(result.snapshot===null)return result;
    const snapshot=await unpack(result.snapshot,async hash=>{
     if(cache?.values.has(hash))return cache.values.get(hash);
     const data=(await request('GET','/assets/'+hash)).data;
     if(dataURL(data)&&data.length<=MAX_ASSET&&await digest(data)===hash)remember(cache,hash,data);
     return data;
    });
    // Restore plain JSON prototypes (desktop comparison uses deep equality).
    return {...result,snapshot:JSON.parse(JSON.stringify(snapshot))};
   }
   if(method!=='PUT')throw Error('Operación inválida');
   const {snapshot,assets}=await pack(payload.snapshot);
   if(assets.size){
    const hashes=[...assets.keys()];
    const present=new Set();
    for(let i=0;i<hashes.length;i+=32){
     const batch=hashes.slice(i,i+32);
     const existing=await request('POST','/assets/check',{hashes:batch});
     if(!Array.isArray(existing.present)||existing.present.some(h=>!batch.includes(h)))throw Error('Respuesta de adjuntos inválida');
     for(const h of existing.present)present.add(h);
    }
    for(const [hash,data] of assets)if(!present.has(hash)){
     const receipt=await request('PUT','/assets/'+hash,{data});
     if(receipt?.ok!==true||receipt.hash!==hash)throw Error('No se confirmó el adjunto');
    }
   }
   const result=await request('PUT','/manifest',{...payload,snapshot});
   if(result?.ok===true)for(const [hash,data] of assets)remember(cache,hash,data);
   return result;
  };
 }
export {pack,unpack,transport,createCache};
