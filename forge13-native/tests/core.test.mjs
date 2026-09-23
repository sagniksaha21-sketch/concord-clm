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
test('Forge native routes exist',()=>{
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

test('v14 migration contract protects legacy wrappers and user history',()=>{
 const migration=read('src/store/migration.ts');
 const provider=read('src/store/ForgeProvider.tsx');
 assert.match(migration,/raw\?\.state/);assert.match(migration,/raw\?\.data/);
 for(const field of ['sessions','foodLog','bodyLogs','progressPhotos','programEdits','exerciseSets','exerciseOrder']) assert.ok(migration.includes(field),field);
 assert.ok(migration.includes("state.selectedProgramId='pushA'"));
 assert.ok(migration.includes('state.dataVersion=FORGE_DATA_VERSION'));
 assert.ok(provider.includes('migrateForgeState(raw,DEFAULT)'));
 assert.ok(provider.includes("version:'forge-native-14'"));
});

test('v14 intelligence is deterministic, explainable and user-controlled',()=>{
 const readiness=read('src/utils/readiness.ts'),coach=read('src/utils/coach.ts'),adaptive=read('src/utils/adaptiveTraining.ts'),train=read('app/(tabs)/train.tsx'),provider=read('src/store/ForgeProvider.tsx');
 assert.ok(readiness.includes("ReadinessBand='READY'|'BALANCED'|'RECOVER'"));
 assert.ok(readiness.includes('training history currently available'));
 assert.ok(coach.includes("action:'RECOVER'"));assert.ok(coach.includes("action:'FOCUS'"));
 assert.ok(adaptive.includes('requiresAcceptance:true'));assert.ok(adaptive.includes("sort((a,b)=>Date.parse(b.date||'')-Date.parse(a.date||''))"));
 assert.ok(train.includes('ACCEPT'));assert.ok(train.includes('recommendation.volumeFactor'));
 assert.ok(provider.includes('adaptationFactor:Math.max(.5,Math.min(1,volumeFactor))'));
});
test('workout targets use dated history and PR feedback',()=>{const workout=read('app/workout.tsx');assert.ok(workout.includes('previousSession'));assert.ok(workout.includes('priorBest'));assert.ok(workout.includes('PR RANGE'));});
test('anatomy renderer exposes init and runtime GL diagnostics',()=>{const body=read('src/components/Body3D.tsx');assert.ok(body.includes("assertGl(gl,'buffers')"));assert.ok(body.includes("assertGl(gl,'draw')"));assert.ok(body.includes("failRenderer('frame',e)"));assert.ok(body.includes('ANATOMY RENDERER OFFLINE'));});

test('Records 2.0 derives working-set metrics and tolerates bad imported dates',()=>{const a=read('src/utils/analytics.ts');assert.ok(a.includes('sessionMetrics'));assert.ok(a.includes("set.setType||'working'"));assert.ok(a.includes('Number.isFinite(x.time)'));assert.ok(a.includes('x.m.volume'));});
test('readiness and adaptive training ignore malformed imported dates',()=>{assert.ok(read('src/utils/readiness.ts').includes("Number.isFinite(Date.parse(s.date||''))"));assert.ok(read('src/utils/adaptiveTraining.ts').includes("Number.isFinite(Date.parse(s.date||''))"));});

test('v14 migration sanitizes unsafe legacy values without dropping valid history',()=>{const m=read('src/store/migration.ts');assert.ok(m.includes('Math.max(15,Math.min(300'));for(const field of ['state.sessions=state.sessions.filter','state.foodLog=state.foodLog.filter','state.bodyLogs=state.bodyLogs.filter','state.progressPhotos=state.progressPhotos.filter'])assert.ok(m.includes(field),field);});
test('v14 primary actions are tactile and consume shared geometry',()=>{const b=read('src/components/ForgeButton.tsx'),g=read('src/components/GlassCard.tsx');assert.ok(b.includes('Haptics.selectionAsync'));assert.ok(b.includes('V14.radius.control'));assert.ok(g.includes('V14.radius.surface'));});

test('accepted adaptation is explicit, temporary and observable in workout',()=>{const types=read('src/types.ts'),train=read('app/(tabs)/train.tsx'),workout=read('app/workout.tsx');assert.ok(types.includes('adaptationFactor?: number'));assert.ok(train.includes('recommendation.requiresAcceptance'));assert.ok(workout.includes('ADAPTED SESSION'));assert.ok(workout.includes('permanent programme is unchanged'));assert.ok(workout.includes('ADAPTED VOLUME TARGET REACHED'));});

test('workout history targeting ignores malformed dates and finish copy confirms persistence',()=>{const w=read('app/workout.tsx');assert.ok(w.includes("filter(s=>Number.isFinite(Date.parse(s.date||'')))"));assert.ok(w.includes('sets saved on finish'));assert.ok(w.includes('completedExercises'));});
test('anatomy requires a valid first frame before reporting live',()=>{const b=read('src/components/Body3D.tsx');assert.ok(b.includes("throw new Error('mesh decode: empty geometry')"));assert.ok(b.includes("assertGl(gl,'first frame')"));assert.ok(b.indexOf("assertGl(gl,'first frame')")<b.indexOf('setReady(true)'));assert.ok(b.includes('nextView!==viewRef.current'));});


test('FHM3 analytics binds anatomy to intelligence states',()=>{
 const analytics=read('app/(tabs)/analytics.tsx');
 assert.match(analytics,/undertrained=muscleStates\.filter/);
 assert.match(analytics,/groups=\{undertrained\.length\?undertrained:muscles\}/);
 assert.match(analytics,/NEEDS WORK/);
});


test('workout gives immediate earned PR feedback without claiming persistence early',()=>{
 const workout=read('app/workout.tsx');
 assert.match(workout,/MARK EARNED/);
 assert.match(workout,/Finish the session to commit it to training history/);
 assert.match(workout,/const logSet=/);
});


test('FHM3 exposes stage-explicit shader diagnostics',()=>{
 const body=read('src/components/Body3D.tsx');
 assert.match(body,/shader compile/);
 assert.match(body,/vertex/);
 assert.match(body,/fragment/);
 assert.match(body,/program link/);
 assert.match(body,/mesh decode: empty geometry/);
});


test('Transformation Studio gives repeatable capture guidance',()=>{
 const studio=read('app/progress-photos.tsx');
 assert.match(studio,/CAPTURE PROTOCOL/);
 assert.match(studio,/Camera at mid-torso height/);
 assert.match(studio,/Repeat distance \+ light/);
 assert.match(studio,/comparable\.slice\(0,2\)/);
});

test('Train library avoids returning to a generic GlassCard stack',()=>{
 const train=read('app/(tabs)/train.tsx');
 assert.doesNotMatch(train,/GlassCard/);
 assert.match(train,/borderBottomWidth:1/);
 assert.match(train,/ImageBackground/);
});


test('live workout avoids generic card stacks for decision surfaces',()=>{
 const workout=read('app/workout.tsx');
 assert.doesNotMatch(workout,/GlassCard/);
 assert.match(workout,/setsBlock/);
 assert.match(workout,/nextBlock/);
 assert.match(workout,/restCard/);
});

test('Nutrition keeps logging hierarchy structural rather than card-heavy',()=>{
 const nutrition=read('app/(tabs)/nutrition.tsx');
 assert.doesNotMatch(nutrition,/GlassCard/);
 assert.match(nutrition,/logBlock/);
 assert.match(nutrition,/borderBottomWidth:1/);
});


test('Today and Analytics stay card-light at the primary hierarchy level',()=>{
 const today=read('app/(tabs)/index.tsx');
 const analytics=read('app/(tabs)/analytics.tsx');
 assert.doesNotMatch(today,/GlassCard/);
 assert.doesNotMatch(analytics,/GlassCard/);
 assert.match(today,/weekRail/);
 assert.match(analytics,/bodyBlock/);
 assert.match(analytics,/FORGE HALL OF FAME/);
});


test('exercise history remains evidence-first and card-light',()=>{
 const history=read('app/exercise-history.tsx');
 assert.doesNotMatch(history,/GlassCard/);
 assert.match(history,/bestBlock/);
 assert.match(history,/historyRow/);
});


test('smart substitution results stay structural and anatomy-led',()=>{
 const picker=read('app/exercise-picker.tsx');
 assert.doesNotMatch(picker,/GlassCard/);
 assert.match(picker,/SMART SUBSTITUTE/);
 assert.match(picker,/rankedSubstitutes/);
 assert.match(picker,/borderBottomWidth:1/);
});

test('FHM3 validates its shader interface before reporting a first frame',()=>{
 const body=read('src/components/Body3D.tsx');
 assert.match(body,/program interface: missing vertex attribute/);
 assert.match(body,/program interface: missing \$\{name\}/);
 assert.match(body,/first frame/);
});


test('adaptive intelligence explicitly discloses its evidence source',()=>{
 const adaptive=read('src/utils/adaptiveTraining.ts');
 const train=read('app/(tabs)/train.tsx');
 assert.match(adaptive,/basis:'TRAINING_HISTORY'/);
 assert.match(train,/TRAINING HISTORY ONLY/);
 assert.match(train,/NO WEARABLE OR RECOVERY SENSOR DATA/);
});


test('smart substitutions explain why alternatives are relevant',()=>{
 const training=read('src/utils/training.ts');
 const picker=read('app/exercise-picker.tsx');
 assert.match(training,/reasons/);
 assert.match(training,/same movement pattern/);
 assert.match(training,/same target group/);
 assert.match(training,/score>=4/);
 assert.match(picker,/WHY ·/);
 assert.match(picker,/rankedMatches/);
});
