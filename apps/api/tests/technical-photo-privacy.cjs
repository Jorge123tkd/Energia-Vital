/**
 * Regression: privacy sanitizer against real, tiny JPEG/WebP frames and PNG,
 * including synthetic camera metadata. Runs in GitHub Actions, not production.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/technical-photo-privacy.ts'),'utf8');
const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
});
const loaded={exports:{}};
new Function('module','exports',compiled.outputText)(loaded,loaded.exports);
const clean=loaded.exports.sanitizeTechnicalPhoto;
const jpeg=Buffer.from([
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYn',
  'KSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMU',
  'FBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5u',
  'bm5ubm5ubm5ubm5ubm7/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAA',
  'AAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAA',
  'AAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALAAR5//2Q=='
].join(''),'base64');
const webp=Buffer.from('UklGRjwAAABXRUJQVlA4IDAAAAAQAgCdASoCAAIAAUAmJaACdLoB+AH4AAPIAP7rt6/9rP85R/8t3/2lkvXs/0XAAAA=','base64');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLrOwAAAABJRU5ErkJggg==','base64');
const eq=(actual,expected,msg)=>assert.deepEqual(Buffer.from(actual),Buffer.from(expected),msg);

function segment(marker,payload){
  const data=Buffer.isBuffer(payload)?payload:Buffer.from(payload);
  const head=Buffer.alloc(4);
  head[0]=0xff;head[1]=marker;head.writeUInt16BE(data.length+2,2);
  return Buffer.concat([head,data]);
}
const metadataJpeg=Buffer.concat([
  jpeg.subarray(0,2),
  segment(0xe1,Buffer.from('Exif\0\0GPSPRIVATE:23.45,67.89')),
  segment(0xe1,Buffer.from('http://ns.adobe.com/xap/1.0/\0GPSPRIVATE')),
  segment(0xed,Buffer.from('Photoshop IPTC contact customer info')),
  segment(0xe2,Buffer.from('UNTRUSTED_PROFILE GPSPRIVATE')),
  segment(0xfe,Buffer.from('Comment with private location')),
  jpeg.subarray(2),
  Buffer.from('GPS PRIVATE TRAILER')
]);
eq(clean(metadataJpeg,'image/jpeg'),jpeg,'JPEG must erase APP/COM/trailer but preserve JFIF and image');
eq(clean(jpeg,'image/jpeg'),jpeg,'Unmodified camera JPEG must keep visual segments');
assert.throws(()=>clean(jpeg.subarray(0,jpeg.length-3),'image/jpeg'));
assert.throws(()=>clean(Buffer.from([0xff,0xd8,0xff,0xd9]),'image/jpeg'));

function pngChunk(name,data){
  const nameBytes=Buffer.from(name,'ascii');
  const body=Buffer.concat([nameBytes,Buffer.from(data)]);
  let crc=0xffffffff;
  for(const x of body){crc^=x;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const head=Buffer.alloc(4);head.writeUInt32BE(data.length,0);
  const tail=Buffer.alloc(4);tail.writeUInt32BE((crc^0xffffffff)>>>0,0);
  return Buffer.concat([head,body,tail]);
}
const metadataPng=Buffer.concat([
  png.subarray(0,33),pngChunk('tEXt',Buffer.from('GPSLocation\0PRIVATE:23.45,67.89')),
  png.subarray(33),Buffer.from('tail GPS info')
]);
eq(clean(metadataPng,'image/png'),png,'PNG must remove tEXt and trailing private data');
assert.throws(()=>clean(Buffer.concat([png.subarray(0,33),pngChunk('ABCD',Buffer.from('unknown critical')),png.subarray(33)]),'image/png'));
assert.throws(()=>clean(png.subarray(0,png.length-4),'image/png'));

function riff(chunks){
  const body=Buffer.concat([Buffer.from('WEBP'),...chunks]);
  const head=Buffer.alloc(8);head.write('RIFF');head.writeUInt32LE(body.length,4);
  return Buffer.concat([head,body]);
}
function webpChunk(name,data){
  const head=Buffer.alloc(8);head.write(name,0,'ascii');head.writeUInt32LE(data.length,4);
  return Buffer.concat([head,Buffer.from(data),data.length%2?Buffer.from([0]):Buffer.alloc(0)]);
}
const vp8=webp.subarray(12);
const vp8x=Buffer.from([0x0c,0,0,0,1,0,0,1,0,0]);
const vp8xSafe=Buffer.from([0,0,0,0,1,0,0,1,0,0]);
const metadataWebp=riff([
  webpChunk('VP8X',vp8x),vp8,
  webpChunk('EXIF',Buffer.from('GPSLocation PRIVATE')),
  webpChunk('XMP ',Buffer.from('<x:xmpmeta>PRIVATE DATA</x:xmpmeta>')),
  webpChunk('JUNK',Buffer.from('other private user info'))
]);
const expectedWebp=riff([webpChunk('VP8X',vp8xSafe),vp8]);
eq(clean(metadataWebp,'image/webp'),expectedWebp,'WEBP must strip EXIF/XMP/JUNK and update RIFF/VP8X');
eq(clean(webp,'image/webp'),webp,'Simple real WebP must retain image bytes');
assert.throws(()=>clean(metadataWebp.subarray(0,metadataWebp.length-1),'image/webp'));
assert.throws(()=>clean(png,'image/gif'));
console.log('PASS JPEG, PNG, WebP privacy sanitization and corrupted-input checks');
