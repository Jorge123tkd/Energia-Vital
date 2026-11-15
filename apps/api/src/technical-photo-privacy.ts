/**
 * Privacidad de evidencia técnica: elimina bloques EXIF/GPS, XMP, IPTC y
 * comentarios de las fotos NUEVAS, antes de escribir bytes/hash en R2/D1.
 * No modifica evidencias históricas; conserva datos de píxeles y perfiles de color.
 * Rechaza estructuras corruptas para no guardar metadatos en colas desconocidas.
 */
const invalid=():never=>{throw new Error('Estructura de imagen inválida o no compatible.');};
const text4=(b:Uint8Array,p:number)=>String.fromCharCode(b[p],b[p+1],b[p+2],b[p+3]);
function concat(chunks:Uint8Array[]):Uint8Array{
  const size=chunks.reduce((n,c)=>n+c.byteLength,0);
  const result=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}
  return result;
}
function jpeg(bytes:Uint8Array):Uint8Array{
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)invalid();
  const parts=[bytes.subarray(0,2)];
  let offset=2,inScan=false,hasScan=false,ended=false;
  while(offset<bytes.length){
    if(inScan){
      const start=offset;
      while(offset<bytes.length){
        if(bytes[offset]!==0xff){offset++;continue;}
        if(offset+1>=bytes.length)invalid();
        const next=bytes[offset+1];
        if(next===0x00||next>=0xd0&&next<=0xd7){offset+=2;continue;}
        if(next===0xff){offset++;continue;}
        break;
      }
      parts.push(bytes.subarray(start,offset));
      inScan=false;
      continue;
    }
    const start=offset;
    if(bytes[offset++]!==0xff)invalid();
    while(offset<bytes.length&&bytes[offset]===0xff)offset++;
    if(offset>=bytes.length)invalid();
    const marker=bytes[offset++];
    if(marker===0xd9){ // EOI: no copiar posibles datos personales añadidos al final
      if(!hasScan)invalid();
      parts.push(bytes.subarray(start,offset));
      ended=true;
      break;
    }
    if(marker===0xd8||marker===0x00||marker===0x01||
       marker>=0xd0&&marker<=0xd7)invalid();
    if(offset+2>bytes.length)invalid();
    const size=(bytes[offset]<<8)|bytes[offset+1];
    if(size<2||offset+size>bytes.length)invalid();
    offset+=size;
    // Preservar JFIF/ICC/Adobe por fidelidad visual; eliminar otros APP y COM.
    const isApp=marker>=0xe0&&marker<=0xef;
    const strip=(isApp&&marker!==0xe0&&marker!==0xe2&&marker!==0xee)||
      marker===0xfe;
    if(!strip)parts.push(bytes.subarray(start,offset));
    if(marker===0xda){inScan=true;hasScan=true;}
  }
  if(!ended)invalid();
  return concat(parts);
}
function u32be(b:Uint8Array,p:number):number{
  return (b[p]*0x1000000+b[p+1]*0x10000+b[p+2]*0x100+b[p+3])>>>0;
}
function png(bytes:Uint8Array):Uint8Array{
  if(bytes.length<33||![137,80,78,71,13,10,26,10].every((b,i)=>b===bytes[i]))invalid();
  const parts=[bytes.subarray(0,8)];
  const visual=new Set(['IHDR','PLTE','IDAT','IEND','tRNS','sRGB','iCCP',
    'gAMA','cHRM','bKGD','sBIT','pHYs','hIST','acTL','fcTL','fdAT']);
  let pos=8,first=true,hasPixels=false,ended=false;
  while(pos+12<=bytes.length){
    const size=u32be(bytes,pos),name=text4(bytes,pos+4);
    const end=pos+12+size;
    if(size>bytes.length-pos-12||end>bytes.length)invalid();
    if(first&&(name!=='IHDR'||size!==13))invalid();
    first=false;
    if(!/^[A-Za-z]{4}$/.test(name))invalid();
    if(name==='IDAT'||name==='fdAT')hasPixels=true;
    if(name==='IEND'){
      if(size!==0||!hasPixels)invalid();
      parts.push(bytes.subarray(pos,end));
      ended=true;
      break;
    }
    // Los chunks desconocidos críticos no se pueden eliminar sin romper la imagen.
    if(!visual.has(name)&&name[0]===name[0].toUpperCase())invalid();
    if(visual.has(name))parts.push(bytes.subarray(pos,end));
    pos=end;
  }
  if(!ended)invalid();
  return concat(parts);
}
function u32le(b:Uint8Array,p:number):number{
  return (b[p]+b[p+1]*0x100+b[p+2]*0x10000+b[p+3]*0x1000000)>>>0;
}
function webp(bytes:Uint8Array):Uint8Array{
  if(bytes.length<20||text4(bytes,0)!=='RIFF'||text4(bytes,8)!=='WEBP'||
    u32le(bytes,4)!==bytes.length-8)invalid();
  const parts:Uint8Array[]=[];
  const visual=new Set(['VP8 ','VP8L','VP8X','ALPH','ANIM','ANMF','ICCP']);
  let pos=12,hasPixels=false;
  while(pos<bytes.length){
    if(pos+8>bytes.length)invalid();
    const type=text4(bytes,pos),size=u32le(bytes,pos+4);
    const padded=size+(size%2);
    if(padded>bytes.length-pos-8)invalid();
    const end=pos+8+padded;
    if(type==='VP8 '||type==='VP8L'||type==='ANMF')hasPixels=true;
    if(visual.has(type)){
      if(type==='VP8X'){
        if(size!==10)invalid();
        const chunk=bytes.slice(pos,end);
        chunk[8]&=~0x0c; // borrar flags EXIF y XMP del encabezado extendido
        parts.push(chunk);
      }else parts.push(bytes.subarray(pos,end));
    }
    pos=end;
  }
  if(!hasPixels)invalid();
  const payload=concat(parts);
  const out=new Uint8Array(12+payload.length);
  out.set(bytes.subarray(0,12));
  const riffLength=out.length-8;
  out[4]=riffLength&255;out[5]=(riffLength>>>8)&255;
  out[6]=(riffLength>>>16)&255;out[7]=(riffLength>>>24)&255;
  out.set(payload,12);
  return out;
}
/** Devuelve la COPIA que se guarda; el original queda solo en memoria del request. */
export function sanitizeTechnicalPhoto(bytes:Uint8Array,mime:string):Uint8Array{
  if(mime==='image/jpeg')return jpeg(bytes);
  if(mime==='image/png')return png(bytes);
  if(mime==='image/webp')return webp(bytes);
  return invalid();
}
