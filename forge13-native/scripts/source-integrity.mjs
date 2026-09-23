import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const must=[
 'package.json','app.json','src/data/exercises.json','src/data/programs.json','src/components/Body3D.tsx','src/graphics/bodyMesh.ts',
 'app/workout.tsx','app/program-builder.tsx','app/progress-photos.tsx','app/share.tsx','app/(tabs)/analytics.tsx','app/(tabs)/nutrition.tsx','app/(tabs)/more.tsx',
 'assets/icon.png','assets/adaptive-icon.png','assets/body-poster.png','assets/programmes/chest-shoulders.jpg','assets/programmes/back-biceps.jpg','assets/programmes/legs-triceps.jpg',
 'assets/splash/01.jpg','assets/splash/02.jpg','assets/splash/03.jpg','assets/splash/04.jpg'
];
const missing=must.filter(f=>!fs.existsSync(path.join(root,f))||fs.statSync(path.join(root,f)).size===0);
if(missing.length) throw new Error('Missing required Forge files/assets: '+missing.join(', '));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(pkg.version!=='13.0.0-alpha.3') throw new Error('Wrong Forge source version: '+pkg.version);
const ex=JSON.parse(fs.readFileSync(path.join(root,'src/data/exercises.json'),'utf8'));
const pr=JSON.parse(fs.readFileSync(path.join(root,'src/data/programs.json'),'utf8'));
if(ex.length!==85) throw new Error(`Expected 85 exercises, found ${ex.length}`);
if(Object.keys(pr).length!==14) throw new Error(`Expected 14 programmes, found ${Object.keys(pr).length}`);
const mesh=fs.readFileSync(path.join(root,'src/graphics/bodyMesh.ts'),'utf8');
if(mesh.length<700000||!mesh.includes('BODY_MESH_B64')) throw new Error('FHM2 body mesh missing or incomplete');
console.log(JSON.stringify({ok:true,version:pkg.version,exercises:85,programmes:14,meshBytes:mesh.length,requiredFiles:must.length},null,2));
