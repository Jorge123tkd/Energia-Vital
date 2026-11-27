/**
 * Verificación bajo demanda de evidencias técnicas. SOLO lectura R2 y D1.
 * Compara tamaño y SHA-256 de los bytes almacenados con el registro D1.
 * No imprime ni devuelve datos, hash ni claves R2.
 * No prueba autenticidad de la foto, ni validez legal, ni privacidad de ICC.
 */
export type EvidenceIntegrity='verified'|'missing'|'mismatch';
const LIMIT=5*1024*1024;
export async function verifyTechnicalEvidence(
  bucket:R2Bucket,key:string,storedBytes:number,storedSha256:string
):Promise<EvidenceIntegrity>{
  if(!Number.isSafeInteger(storedBytes)||storedBytes<1||storedBytes>LIMIT||
    !/^[a-f0-9]{64}$/.test(storedSha256)||!key.startsWith('technical-evidence/'))
    return 'mismatch';
  const obj=await bucket.get(key);
  if(!obj)return 'missing';
  // Detect tampering/oversized objects BEFORE reading them into memory.
  if(obj.size!==storedBytes||obj.size>LIMIT)return 'mismatch';
  const data=await obj.arrayBuffer();
  if(data.byteLength!==storedBytes)return 'mismatch';
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
  const digest=Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
  return digest===storedSha256?'verified':'mismatch';
}
