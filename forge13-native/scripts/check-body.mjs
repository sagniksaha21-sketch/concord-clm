import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/graphics/bodyMesh.ts',import.meta.url),'utf8');
const match=source.match(/BODY_MESH_B64\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/);
if(!match) throw new Error('Embedded FHM2 body mesh payload missing');
const bytes=Buffer.from(match[1],'base64');
const magic=bytes.subarray(0,4).toString('ascii');
if(magic!=='FHM2') throw new Error(`Unexpected body mesh header: ${magic}`);
const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const vertexCount=view.getUint32(4,true);
const indexCount=view.getUint32(8,true);
if(vertexCount<1000 || indexCount<3000) throw new Error(`Body mesh looks incomplete (${vertexCount} vertices / ${indexCount} indices)`);
console.log(JSON.stringify({ok:true,magic,vertexCount,indexCount,encodedBytes:match[1].length,decodedBytes:bytes.length},null,2));
