import type {ForgeState} from '../types';
import programs from '../data/programs.json';
export const FORGE_DATA_VERSION=8;
export function migrateForgeState(raw:any,defaults:ForgeState):ForgeState{
 const source=raw?.state&&typeof raw.state==='object'?raw.state:raw?.data&&typeof raw.data==='object'?raw.data:raw;
 const s:any=source&&typeof source==='object'?source:{};
 const state:ForgeState={...defaults,...s,goals:{...defaults.goals,...(s.goals||{})},settings:{...defaults.settings,...(s.settings||{})},programEdits:{...(s.programEdits||{})},workout:{...defaults.workout,...(s.workout||{}),exerciseSets:{...(s.workout?.exerciseSets||{})},exerciseOrder:Array.isArray(s.workout?.exerciseOrder)?s.workout.exerciseOrder:[]},sessions:Array.isArray(s.sessions)?s.sessions:[],foodLog:Array.isArray(s.foodLog)?s.foodLog:[],bodyLogs:Array.isArray(s.bodyLogs)?s.bodyLogs:[],progressPhotos:Array.isArray(s.progressPhotos)?s.progressPhotos:[]};
 if(!(programs as any)[state.selectedProgramId])state.selectedProgramId='pushA';
 if(!(programs as any)[state.workout.programId])state.workout.programId=state.selectedProgramId;
 state.workout.restSeconds=Number(state.workout.restSeconds||state.settings.restSeconds||90);
 state.dataVersion=FORGE_DATA_VERSION;
 return state;
}
