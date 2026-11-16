/**
 * Privacidad de nuevas fotos: retira GPS, fecha, cámara, autor y XMP/IPTC
 * antes de guardar bytes/hash en R2/D1. Si hace falta, reconstruye EXIF
 * mínimo con SOLO orientación visual, sin copiar la ficha privada original.
 * No modifica evidencias históricas; conserva píxeles y perfiles de color.
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
/**
 * Read only IFD0 Orientation from EXIF (1-8); never copy the original EXIF.
 * Invalid or unsupported EXIF is discarded; no private tags are retained.
 */
function orientationFromExif(input:Uint8Array):number|null{
  const exifPrefix=input.length>=6&&[69,120,105,102,0,0].every((v,i)=>input[i]===v);
  const t=exifPrefix?input.subarray(6):input;
  if(t.length<8)return null;
  const le=t[0]===73&&t[1]===73;
  const be=t[0]===77&&t[1]===77;
  if(!le&&!be)return null;
  const u16=(p:number):number=>p+2>t.length?-1:
    le?t[p]+t[p+1]*256:t[p]*256+t[p+1];
  const u32=(p:number):number=>p+4>t.length?-1:
    le?t[p]+t[p+1]*256+t[p+2]*65536+t[p+3]*16777216:
       t[p]*16777216+t[p+1]*65536+t[p+2]*256+t[p+3];
  if(u16(2)!==42)return null;
  const start=u32(4),count=u16(start);
  if(start<8||count<0||count>2048||start+2+count*12+4>t.length)return null;
  let orientation:number|null=null;
  for(let i=0;i<count;i++){
    const p=start+2+i*12;
    if(u16(p)!==0x0112)continue;
    if(u16(p+2)!==3||u32(p+4)!==1)return null;
    const v=u16(p+8);
    if(v<1||v>8||orientation!==null&&orientation!==v)return null;
    orientation=v;
  }
  return orientation;
}
/** New minimal TIFF containing ONLY orientation (no camera, GPS, date, serial). */
function orientationTiff(value:number):Uint8Array{
  const t=new Uint8Array([
    0x4d,0x4d,0,0x2a,0,0,0,8,
    0,1, 1,0x12,0,3,0,0,0,1,0,0,0,0, 0,0,0,0,
  ]);
  t[19]=value; // SHORT inline big-endian: high byte 0, low byte 1..8
  return t;
}
function orientationJpegApp(value:number):Uint8Array{
  const prefix=new Uint8Array([69,120,105,102,0,0]),tiff=orientationTiff(value);
  const length=prefix.length+tiff.length+2;
  const app=new Uint8Array(length+2);
  app[0]=0xff;app[1]=0xe1;app[2]=length>>>8;app[3]=length&255;
  app.set(prefix,4);app.set(tiff,4+prefix.length);
  return app;
}
function makeWebpChunk(type:string,data:Uint8Array):Uint8Array{
  const out=new Uint8Array(8+data.length+(data.length%2));
  for(let i=0;i<4;i++)out[i]=type.charCodeAt(i);
  const n=data.length;
  out[4]=n&255;out[5]=(n>>>8)&255;out[6]=(n>>>16)&255;out[7]=(n>>>24)&255;
  out.set(data,8);
  return out;
}
function jpeg(bytes:Uint8Array):Uint8Array{
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)invalid();
  const parts=[bytes.subarray(0,2)];
  let offset=2,inScan=false,hasScan=false,ended=false;
  let seenOrientation:number|null=null;
  const iccParts:Uint8Array[]=[];
  let iccTotal=0,iccBytes=0;
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
    const signature=bytes.subarray(start+4,offset);
    const prefix=(value:string)=>value.split('').every((ch,i)=>signature[i]===ch.charCodeAt(0));
    const safeApp=(marker===0xe0&&prefix('JFIF')&&signature[4]===0)||
      (marker===0xe2&&prefix('ICC_PROFILE')&&signature[11]===0)||
      (marker===0xee&&prefix('Adobe'));
    // Preserve ONLY a rebuilt orientation tag; all other EXIF/GPS fields go.
    if(marker===0xe1&&prefix('Exif')&&signature[4]===0&&signature[5]===0){
      const orientation=orientationFromExif(signature);
      if(orientation!==null){
        if(seenOrientation!==null&&seenOrientation!==orientation)invalid();
        if(seenOrientation===null&&orientation!==1)parts.push(orientationJpegApp(orientation));
        seenOrientation=orientation;
      }
    }
    // APP2 fragments carry one ICC profile, split by segment number.
    if(marker===0xe2&&prefix('ICC_PROFILE')&&signature[11]===0){
      if(signature.length<15)invalid();
      const seq=signature[12],total=signature[13],fragment=signature.subarray(14);
      if(total<1||seq<1||seq>total||iccTotal!==0&&total!==iccTotal||
        iccParts[seq-1]!==undefined||fragment.length<1)invalid();
      iccTotal=total;iccParts[seq-1]=fragment;iccBytes+=fragment.length;
      if(iccBytes>MAX_ICC_BYTES)invalid();
    }
    const strip=(isApp&&!safeApp)||marker===0xfe;
    if(!strip)parts.push(bytes.subarray(start,offset));
    if(marker===0xda){inScan=true;hasScan=true;}
  }
  if(!ended)invalid();
  if(iccTotal>0){
    if(iccParts.filter(Boolean).length!==iccTotal||
      !validIccProfile(concat(iccParts)))invalid();
  }
  return concat(parts);
}
function u32be(b:Uint8Array,p:number):number{
  return (b[p]*0x1000000+b[p+1]*0x10000+b[p+2]*0x100+b[p+3])>>>0;
}

/**
 * ICC guard: structural checks only. Preserves the complete color profile,
 * including any residual descriptions; never claims metadata anonymization.
 * Bound its size to avoid unbounded/ambiguous ancillary payloads.
 */
const MAX_ICC_BYTES=1024*1024;
function validIccProfile(data:Uint8Array):boolean{
  if(data.length<132||data.length>MAX_ICC_BYTES||u32be(data,0)!==data.length||
    text4(data,36)!=='acsp')return false;
  const count=u32be(data,128);
  if(count>256||count>(data.length-132)/12)return false;
  for(let i=0;i<count;i++){
    const p=132+i*12,off=u32be(data,p+4),len=u32be(data,p+8);
    if(off<132+count*12||len<8||off>data.length||len>data.length-off)return false;
  }
  return true;
}
function validPngIccp(bytes:Uint8Array,start:number,size:number):boolean{
  if(size<6||size>MAX_ICC_BYTES)return false;
  // PNG iCCP stores a 1..79 byte Latin-1 name, NUL, method 0 and zlib bytes.
  let nul=-1;
  for(let i=0;i<Math.min(size,80);i++){
    const c=bytes[start+i];
    if(c===0){nul=i;break;}
    if(c<32||c>126&&c<161)return false;
    if((i===0||i===size-1)&&c===32)return false;
    if(i>0&&c===32&&bytes[start+i-1]===32)return false;
  }
  if(nul<1||nul>79||bytes[start+nul-1]===32||
    size<nul+5||bytes[start+nul+1]!==0)return false;
  const z=start+nul+2,cmf=bytes[z],flg=bytes[z+1];
  // Zlib header integrity; actual decompression/profile ICC still needs
  // an approved decoder and visual inspection before production.
  return (cmf&15)===8&&(cmf>>>4)<=7&&((cmf*256+flg)%31)===0&&(flg&32)===0;
}

// PNG requires CRC-32 for every chunk, including metadata chunks we discard.
// Use a precomputed table to keep uploads inexpensive even near the 5 MB limit.
const pngCrcTable=(()=>{
  const table=new Uint32Array(256);
  for(let i=0;i<256;i++){
    let crc=i;
    for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
    table[i]=crc>>>0;
  }
  return table;
})();
function pngChunkCrcValid(bytes:Uint8Array,start:number,end:number):boolean{
  let crc=0xffffffff;
  for(let i=start+4;i<end-4;i++)crc=pngCrcTable[(crc^bytes[i])&255]^(crc>>>8);
  return ((crc^0xffffffff)>>>0)===u32be(bytes,end-4);
}
function png(bytes:Uint8Array):Uint8Array{
  if(bytes.length<33||![137,80,78,71,13,10,26,10].every((b,i)=>b===bytes[i]))invalid();
  const parts=[bytes.subarray(0,8)];
  const visual=new Set(['IHDR','PLTE','IDAT','IEND','tRNS','sRGB','iCCP',
    'gAMA','cHRM','bKGD','sBIT','pHYs','hIST','acTL','fcTL','fdAT']);
  let pos=8,first=true,hasPixels=false,ended=false,seenIcc=false;
  while(pos+12<=bytes.length){
    const size=u32be(bytes,pos),name=text4(bytes,pos+4);
    const end=pos+12+size;
    if(size>bytes.length-pos-12||end>bytes.length)invalid();
    if(!pngChunkCrcValid(bytes,pos,end))invalid();
    if(first&&(name!=='IHDR'||size!==13))invalid();
    first=false;
    if(!/^[A-Za-z]{4}$/.test(name))invalid();
    if(name==='iCCP'){
      if(seenIcc||!validPngIccp(bytes,pos+8,size))invalid();
      seenIcc=true;
    }
    // PNG with non-default EXIF orientation needs pixel normalization, not silent rotation.
    // Until a trusted image pipeline exists, reject rather than store visually rotated proof.
    if(name==='eXIf'){
      const orientation=orientationFromExif(bytes.subarray(pos+8,pos+8+size));
      if(orientation!==null&&orientation!==1)invalid();
    }
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
  let pos=12,hasPixels=false,seenOrientation:number|null=null,seenIcc=false;
  let vp8x:Uint8Array|null=null;
  while(pos<bytes.length){
    if(pos+8>bytes.length)invalid();
    const type=text4(bytes,pos),size=u32le(bytes,pos+4);
    const padded=size+(size%2);
    if(padded>bytes.length-pos-8)invalid();
    const end=pos+8+padded;
    if(type==='ICCP'){
      if(seenIcc||hasPixels||!validIccProfile(bytes.subarray(pos+8,pos+8+size)))invalid();
      seenIcc=true;
    }
    if(type==='VP8 '||type==='VP8L'||type==='ANMF')hasPixels=true;
    if(type==='EXIF'){
      const orientation=orientationFromExif(bytes.subarray(pos+8,pos+8+size));
      if(orientation!==null){
        if(seenOrientation!==null&&seenOrientation!==orientation)invalid();
        seenOrientation=orientation;
      }
    }
    if(visual.has(type)){
      if(type==='VP8X'){
        if(size!==10||vp8x!==null)invalid();
        vp8x=bytes.slice(pos,end);
        vp8x[8]&=~0x0c; // remove original EXIF/XMP flags; restore only safe orientation
        parts.push(vp8x);
      }else parts.push(bytes.subarray(pos,end));
    }
    pos=end;
  }
  if(!hasPixels||seenIcc&&!vp8x)invalid();
  // Correct the ICC flag based on the actual presence of one valid profile.
  if(vp8x){
    vp8x[8]&=~0x20;
    if(seenIcc)vp8x[8]|=0x20;
  }
  if(seenOrientation!==null&&seenOrientation!==1){
    if(!vp8x)invalid(); // nonstandard simple WebP cannot preserve EXIF orientation safely
    (vp8x as Uint8Array)[8]|=0x08;
    parts.push(makeWebpChunk('EXIF',orientationTiff(seenOrientation)));
  }
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
