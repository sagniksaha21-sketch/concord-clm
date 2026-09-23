import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const exercises=JSON.parse(fs.readFileSync(path.join(root,'src/data/exercises.json'),'utf8'));
const programs=JSON.parse(fs.readFileSync(path.join(root,'src/data/programs.json'),'utf8'));
const required=[
 'app/_layout.tsx','app/(tabs)/_layout.tsx','app/(tabs)/index.tsx','app/(tabs)/train.tsx',
 'app/(tabs)/nutrition.tsx','app/(tabs)/analytics.tsx','app/(tabs)/more.tsx',
 'app/workout.tsx','app/share.tsx','app/program-builder.tsx','app/exercise-picker.tsx',
 'app/exercise-history.tsx','app/progress-photos.tsx','app/music.tsx','src/store/ForgeProvider.tsx',
 'src/components/Body3D.tsx','src/graphics/bodyMesh.ts','src/services/restTimer.ts','src/utils/training.ts'
];
const missing=required.filter(f=>!fs.existsSync(path.join(root,f)));
const ids=new Set(exercises.map(x=>x.id));
const bad=[];
for(const p of Object.values(programs)) for(const id of p.exercises) if(!ids.has(id)) bad.push(`${p.id}:${id}`);
const provider=fs.readFileSync(path.join(root,'src/store/ForgeProvider.tsx'),'utf8');
const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const appJson=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
const body3D=fs.readFileSync(path.join(root,'src/components/Body3D.tsx'),'utf8');
const workout=fs.readFileSync(path.join(root,'app/workout.tsx'),'utf8');
const builder=fs.readFileSync(path.join(root,'app/program-builder.tsx'),'utf8');
const photos=fs.readFileSync(path.join(root,'app/progress-photos.tsx'),'utf8');
const analytics=fs.readFileSync(path.join(root,'app/(tabs)/analytics.tsx'),'utf8');
const stateKey=provider.includes('forge_v2_functional_state_v3');
const migration=fs.readFileSync(path.join(root,'src/store/migration.ts'),'utf8');
const migrationContract=provider.includes('FORGE_DATA_VERSION') && provider.includes('migrateForgeState(raw,DEFAULT)') && migration.includes('state.dataVersion=FORGE_DATA_VERSION') && provider.includes("version:'forge-native-14'");
const plugins=Array.isArray(appJson.expo?.plugins)?appJson.expo.plugins:[];
const share=fs.readFileSync(path.join(root,'app/share.tsx'),'utf8');
const brand=fs.readFileSync(path.join(root,'src/components/ForgeBrand.tsx'),'utf8');
const featureChecks={
 expoGL: packageJson.dependencies?.['expo-gl'] && body3D.includes('GLView'),
 notifications: packageJson.dependencies?.['expo-notifications'] && plugins.some(p=>p==='expo-notifications'||(Array.isArray(p)&&p[0]==='expo-notifications')),
 smartSubstitution: workout.includes('SMART MATCHES') && provider.includes('replaceCurrentExercise'),
 programmeBuilder: builder.includes('Training blocks') && provider.includes('moveProgramExercise'),
 progressPhotos: photos.includes('ImagePicker') && provider.includes('addProgressPhoto'),
 hallOfFameHistory: analytics.includes('exercise-history'),
 shareStudio: share.includes('expo-sharing') && share.includes('LATEST PR') && share.includes('CUSTOM') && share.includes('Use latest progress photo'),
 googleYouTube: fs.readFileSync(path.join(root,'app/music.tsx'),'utf8').includes('YOUTUBE MUSIC') && fs.existsSync(path.join(root,'src/services/youtube.ts')),
 strongerBrand: brand.includes('styles.rule') && brand.includes('styles.spark')
};
if(!String(packageJson.version).startsWith('14.')) throw new Error(`Expected Forge 14 package version, found ${packageJson.version}`);
if(!String(appJson.expo?.version).startsWith('14.')) throw new Error(`Expected Forge 14 Expo version, found ${appJson.expo?.version}`);
// Safe-area behavior is enforced by Screen.tsx. Expo SDK 57 no longer accepts edgeToEdgeEnabled in app config.
const screen=fs.readFileSync(path.join(root,'src/components/Screen.tsx'),'utf8');
if(!screen.includes('react-native-safe-area-context')||!screen.includes("edges={['top']}")) throw new Error('System safe-area gate failed');
if(!packageJson.dependencies?.['react-native-safe-area-context']) throw new Error('Safe-area runtime dependency missing');
if(exercises.length!==85) throw new Error(`Expected 85 exercises, found ${exercises.length}`);
if(Object.keys(programs).length!==14) throw new Error(`Expected 14 programmes, found ${Object.keys(programs).length}`);
if(missing.length) throw new Error(`Missing native routes/modules: ${missing.join(', ')}`);
if(bad.length) throw new Error(`Programme references missing exercises: ${bad.join(', ')}`);
if(!stateKey) throw new Error('Canonical Forge state key missing');
if(!migrationContract) throw new Error('Forge 14 migration contract missing');
const failed=Object.entries(featureChecks).filter(([,ok])=>!ok).map(([k])=>k);
if(failed.length) throw new Error(`Forge 14 feature checks failed: ${failed.join(', ')}`);
console.log(JSON.stringify({ok:true,version:packageJson.version,exercises:exercises.length,programmes:Object.keys(programs).length,stateKey:'forge_v2_functional_state_v3',routesAndModules:required.length,features:Object.keys(featureChecks)},null,2));
