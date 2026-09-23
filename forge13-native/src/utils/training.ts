import {exerciseMap} from '../store/ForgeProvider';
import type {ForgeState} from '../types';
import type {BodyMuscleGroup} from '../components/Body3D';

export function bodyGroup(raw?:string):BodyMuscleGroup|undefined{
 if(!raw)return undefined;
 if(['Quads / Glutes','Hamstrings','Hips','Calves'].includes(raw))return 'Legs';
 if(['Chest','Back','Shoulders','Biceps','Triceps','Core'].includes(raw))return raw as BodyMuscleGroup;
 return undefined;
}
export function programMuscles(ids:string[]):BodyMuscleGroup[]{
 const out:BodyMuscleGroup[]=[];for(const id of ids){const g=bodyGroup(exerciseMap[id]?.group);if(g&&!out.includes(g))out.push(g);}return out;
}
export function rankedSubstitutes(exerciseId:string){
 const current:any=exerciseMap[exerciseId];
 if(!current)return [];
 return Object.values(exerciseMap).filter((e:any)=>e.id!==exerciseId).map((e:any)=>{const sameMovement=e.movement===current.movement,sameGroup=e.group===current.group,sameRegion=bodyGroup(e.group)===bodyGroup(current.group),sameLoading=e.bodyweight===current.bodyweight;const score=(sameMovement?6:0)+(sameGroup?4:0)+(sameRegion?2:0)+(sameLoading?1:0);const reasons=[sameMovement?'same movement pattern':null,sameGroup?'same target group':sameRegion?'same body region':null,sameLoading?'similar loading style':null].filter(Boolean) as string[];return{exercise:e,score,reasons};}).filter((x:any)=>x.score>=4).sort((a:any,b:any)=>b.score-a.score||a.exercise.name.localeCompare(b.exercise.name));
}
export function topMuscles(state:ForgeState,days=30):BodyMuscleGroup[]{
 const cutoff=Date.now()-days*864e5,score=new Map<BodyMuscleGroup,number>();
 for(const s of state.sessions||[]){if(Date.parse(s.date)<cutoff)continue;for(const ex of s.exercises||[]){const g=bodyGroup(exerciseMap[ex.exerciseId]?.group);if(!g)continue;const v=(ex.sets||[]).reduce((a,z)=>a+Number(z.weight||0)*Number(z.reps||0),0);score.set(g,(score.get(g)||0)+v);}}
 return [...score.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);
}
