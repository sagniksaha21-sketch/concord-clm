import type {ForgeState} from '../types';
import {exerciseMap} from '../store/ForgeProvider';
import {bodyGroup} from './training';
import type {BodyMuscleGroup} from '../components/Body3D';

export type MuscleState={group:BodyMuscleGroup;volume:number;sets:number;lastTrained:string|null;daysSince:number|null;status:'RECENT'|'READY'|'UNDERTRAINED'};
const GROUPS:BodyMuscleGroup[]=['Chest','Back','Shoulders','Biceps','Triceps','Core','Legs'];
export function muscleIntelligence(state:ForgeState,now=Date.now()):MuscleState[]{
 const stats=new Map<BodyMuscleGroup,{volume:number;sets:number;last:number}>();
 for(const g of GROUPS)stats.set(g,{volume:0,sets:0,last:0});
 for(const session of state.sessions||[]){const t=Date.parse(session.date);if(!Number.isFinite(t)||t<now-30*864e5)continue;for(const ex of session.exercises||[]){const g=bodyGroup(exerciseMap[ex.exerciseId]?.group);if(!g)continue;const s=stats.get(g)!;s.last=Math.max(s.last,t);for(const set of ex.sets||[]){if((set.setType||'working')==='warmup')continue;s.sets++;s.volume+=Number(set.weight||0)*Number(set.reps||0);}}}
 return GROUPS.map(group=>{const s=stats.get(group)!;const days=s.last?Math.max(0,(now-s.last)/864e5):null;return{group,volume:Math.round(s.volume),sets:s.sets,lastTrained:s.last?new Date(s.last).toISOString():null,daysSince:days,status:days===null||days>=7?'UNDERTRAINED':days<2?'RECENT':'READY'};}).sort((a,b)=>b.volume-a.volume);
}
