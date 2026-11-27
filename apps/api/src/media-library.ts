import type { Env } from './types';

export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};
export type StoredImage = { key: string; type: string };

export async function storeImage(env: Env, file: unknown, folder: string, id: string): Promise<StoredImage> {
  if (!(file instanceof File) || !file.size || file.size > MAX_MEDIA_BYTES || !extensions[file.type]) {
    throw new Error('Selecciona una imagen JPG, PNG o WebP de hasta 8 MB.');
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (!(file.type === 'image/jpeg' && jpeg || file.type === 'image/png' && png || file.type === 'image/webp' && webp))
    throw new Error('El contenido de la imagen no coincide con el formato indicado.');
  const key = `${folder}/${id}/${crypto.randomUUID()}.${extensions[file.type]}`;
  await env.BUCKET.put(key, buffer, { httpMetadata: { contentType: file.type } });
  return { key, type: file.type };
}

export async function serveImage(c: any, key: string) {
  const object = await c.env.BUCKET.get(key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, max-age=120');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  return c.body(object.body, 200, Object.fromEntries(headers.entries()));
}

export async function servePublicImage(c: any, key: string) {
  const object = await c.env.BUCKET.get(key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  return c.body(object.body, 200, Object.fromEntries(headers.entries()));
}
