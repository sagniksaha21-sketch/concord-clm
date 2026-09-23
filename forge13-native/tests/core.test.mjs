import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const exercises=JSON.parse(fs.readFileSync(new URL('../src/data/exercises.json',import.meta.url)));
const programs=JSON.parse(fs.readFileSync(new URL('../src/data/programs.json',import.meta.url)));
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('keeps the canonical exercise corpus',()=>assert.equal(exercises.length,85));
test('keeps all 14 programmes',()=>assert.equal(Object.keys(programs).length,14));
test('every programme exercise exists',()=>{
 const ids=new Set(exercises.map(x=>x.id));
 for(const p of Object.values(programs)) for(const id of p.exercises) assert.ok(ids.has(id),`${p.id}:${id}`);
});
test('no duplicate exercise ids',()=>{
 const ids=exercises.map(x=>x.id);
 assert.equal(new Set(ids).size,ids.length);
});
test('alpha 2 native routes exist',()=>{
 for(const f of [
  'app/(tabs)/index.tsx','app/(tabs)/train.tsx','app/(tabs)/nutrition.tsx','app/(tabs)/analytics.tsx','app/(tabs)/more.tsx',
  'app/workout.tsx','app/share.tsx','app/program-builder.tsx','app/exercise-picker.tsx','app/exercise-history.tsx','app/progress-photos.tsx'
 ]) assert.ok(fs.existsSync(new URL('../'+f,import.meta.url)),f);
});
test('3D anatomy is native GL, not an iframe/webview shim',()=>{
 const body=read('src/components/Body3D.tsx');
 assert.match(body,/from ['"]expo-gl['"]/);
 assert.match(body,/\bGLView\b/);
 assert.doesNotMatch(body,/(WebView|iframe)/);
 assert.ok(read('src/graphics/bodyMesh.ts').length>700_000,'body mesh payload should be embedded');
});
test('programme builder and block periodization actions are wired',()=>{
 const provider=read('src/store/ForgeProvider.tsx');
 for(const token of ['moveProgramExercise','replaceProgramExercise','addProgramExercise','addTrainingBlock','updateTrainingBlock','duplicateTrainingBlock']) assert.ok(provider.includes(token),token);
});
test('smart exercise substitutions and rest timer are wired into workout',()=>{
 const workout=read('app/workout.tsx');
 const provider=read('src/store/ForgeProvider.tsx');
 assert.ok(workout.includes('SMART MATCHES'));
 assert.ok(provider.includes('replaceCurrentExercise'));
 assert.ok(provider.includes('restTimerEndsAt'));
 assert.ok(read('src/services/restTimer.ts').includes('scheduleNotificationAsync'));
});
test('analytics keeps exercise ids for Hall of Fame drill-through',()=>{
 assert.match(read('src/utils/analytics.ts'),/exerciseId:\s*ex\.exerciseId/);
 assert.ok(read('app/(tabs)/analytics.tsx').includes('exercise-history'));
});
test('progress photo studio uses the native image picker',()=>{
 const photos=read('app/progress-photos.tsx');
 assert.match(photos,/expo-image-picker/);
 assert.ok(photos.includes('addProgressPhoto'));
});
