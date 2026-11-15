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
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP438DwHwAGgAJ/zxIJ8QAAAABJRU5ErkJggg==','base64');
const eq=(actual,expected,msg)=>assert.deepEqual(Buffer.from(actual),Buffer.from(expected),msg);

function segment(marker,payload){
  const data=Buffer.isBuffer(payload)?payload:Buffer.from(payload);
  const head=Buffer.alloc(4);
  head[0]=0xff;head[1]=marker;head.writeUInt16BE(data.length+2,2);
  return Buffer.concat([head,data]);
}
// EXIF test payloads: only IFD0 Orientation is allowed to survive sanitizing.
function tiffOrientation(value,littleEndian=false){
  return littleEndian?Buffer.from([
    0x49,0x49,42,0,8,0,0,0,1,0, 0x12,1,3,0,1,0,0,0,
    value,0,0,0, 0,0,0,0
  ]):Buffer.from([
    0x4d,0x4d,0,42,0,0,0,8,0,1, 1,0x12,0,3,0,0,0,1,
    0,value,0,0, 0,0,0,0
  ]);
}
function exifPayload(value,littleEndian=false){
  return Buffer.concat([
    Buffer.from([69,120,105,102,0,0]),tiffOrientation(value,littleEndian),
    Buffer.from('GPS_PRIVATE_SOURCE_CAMERA_SERIAL_2026')
  ]);
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
for(const value of [2,3,4,5,6,7,8]){
  const rotated=Buffer.concat([
    jpeg.subarray(0,2),segment(0xe1,exifPayload(value,true)),jpeg.subarray(2)
  ]);
  const expected=Buffer.concat([
    jpeg.subarray(0,2),
    segment(0xe1,Buffer.concat([Buffer.from([69,120,105,102,0,0]),tiffOrientation(value)])),
    jpeg.subarray(2)
  ]);
  const actual=Buffer.from(clean(rotated,'image/jpeg'));
  eq(actual,expected,'JPEG orientation '+value+' must survive without camera/GPS metadata');
  assert.equal(actual.includes(Buffer.from('GPS_PRIVATE')),false);
}
const noRotation=Buffer.concat([
  jpeg.subarray(0,2),segment(0xe1,exifPayload(1,true)),jpeg.subarray(2)
]);
eq(clean(noRotation,'image/jpeg'),jpeg,'Default orientation must not keep EXIF at all');
assert.throws(()=>clean(Buffer.concat([
  jpeg.subarray(0,2),segment(0xe1,exifPayload(6,true)),
  segment(0xe1,exifPayload(3,true)),jpeg.subarray(2)
]),'image/jpeg'),'Conflicting JPEG orientation must fail closed');


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

const wrongHeaderCrc=Buffer.from(png);
wrongHeaderCrc[29]^=1; // IHDR CRC has been corrupted
assert.throws(()=>clean(wrongHeaderCrc,'image/png'),'PNG IHDR CRC mismatch must reject upload');
const wrongPixelsCrc=Buffer.from(png);
wrongPixelsCrc[41]^=1; // one compressed IDAT byte changed, CRC no longer agrees
assert.throws(()=>clean(wrongPixelsCrc,'image/png'),'PNG pixel chunk CRC mismatch must reject upload');
const wrongDroppedChunk=pngChunk('tEXt',Buffer.from('Sensitive note to remove'));
wrongDroppedChunk[wrongDroppedChunk.length-1]^=1;
assert.throws(()=>clean(Buffer.concat([
  png.subarray(0,33),wrongDroppedChunk,png.subarray(33)
]),'image/png'),'Even stripped PNG metadata chunks must have a valid CRC');


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
const rotatedWebp=riff([
  webpChunk('VP8X',vp8x),vp8,
  webpChunk('EXIF',exifPayload(6,true)),
  webpChunk('XMP ',Buffer.from('PRIVATE GPS')),
]);
const safeWebp=riff([
  webpChunk('VP8X',Buffer.from([0x08,0,0,0,1,0,0,1,0,0])),
  vp8,webpChunk('EXIF',tiffOrientation(6))
]);
eq(clean(rotatedWebp,'image/webp'),safeWebp,
  'WebP must retain ONLY minimal orientation with updated VP8X/RIFF lengths');
assert.equal(Buffer.from(clean(rotatedWebp,'image/webp')).includes(Buffer.from('GPS_PRIVATE')),false);
assert.throws(()=>clean(riff([vp8,webpChunk('EXIF',exifPayload(6,true))]),'image/webp'),
  'WebP without VP8X cannot safely retain orientation');
const rotatedPng=Buffer.concat([
  png.subarray(0,33),pngChunk('eXIf',tiffOrientation(6)),png.subarray(33)
]);
assert.throws(()=>clean(rotatedPng,'image/png'),'Rotated PNG eXIf must be rejected until pixel normalization');

assert.throws(()=>clean(metadataWebp.subarray(0,metadataWebp.length-1),'image/webp'));
assert.throws(()=>clean(png,'image/gif'));
console.log('PASS JPEG/WebP orientation 1-8, GPS removal, PNG CRC-32 and corrupted inputs');
