import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import type { ForgeState, SessionLog, FoodLog, SetLog, ProgressPhoto, TrainingBlock } from '../types';
import programs from '../data/programs.json';
import exercises from '../data/exercises.json';
import { THEMES, ForgeThemeName } from '../theme';
import {cancelRestNotification,enableRestNotifications,replaceRestNotification} from '../services/restTimer';
import {FORGE_DATA_VERSION,migrateForgeState} from './migration';

const KEY = 'forge_v2_functional_state_v3';
const DATA_VERSION = FORGE_DATA_VERSION;
const exerciseMap = Object.fromEntries((exercises as any[]).map(x => [x.id, x]));
const DEFAULT_BLOCKS:TrainingBlock[]=[
  {id:'hypertrophy',name:'Build',weeks:6,focus:'Hypertrophy'},
  {id:'strength',name:'Intensify',weeks:4,focus:'Strength'},
  {id:'deload',name:'Deload',weeks:1,focus:'Deload'}
];
const DEFAULT: ForgeState = {
  dataVersion: DATA_VERSION, selectedProgramId: 'pushA', phase: 'Hypertrophy', phaseWeek: 5, phaseLength: 12,
  calTarget: 2750, proteinTarget: 160, kcal: 0, protein: 0, carbs: 0, fat: 0,
  foodLog: [], sessions: [], bodyLogs: [], progressPhotos: [], goals: { weight: 76, smm: 37, maintenance: 2450 },
  programEdits:{}, settings:{restSeconds:90,restNotifications:false},
  workout: {startedAt:null,programId:'pushA',exerciseIndex:0,exerciseSets:{},input:{weight:20,reps:8,rir:2,setType:'working'},exerciseOrder:[],restTimerEndsAt:null,restSeconds:90},
  theme: 'black-amber', sync: { status: 'local' }
};

type Program={id:string;name:string;subtitle:string;exercises:string[];blocks:TrainingBlock[]};
type Context = {
  state: ForgeState; ready: boolean; themeName: ForgeThemeName; theme: (typeof THEMES)[ForgeThemeName];
  setTheme: (t: ForgeThemeName) => void; selectProgram: (id:string) => void;
  getProgram:(id?:string)=>Program; programList:Program[];
  moveProgramExercise:(id:string,index:number,delta:number)=>void; removeProgramExercise:(id:string,index:number)=>void;
  addProgramExercise:(id:string,exerciseId:string)=>void; replaceProgramExercise:(id:string,index:number,exerciseId:string)=>void;
  resetProgram:(id:string)=>void; renameProgram:(id:string,name:string)=>void;
  addTrainingBlock:(id:string)=>void; updateTrainingBlock:(id:string,blockId:string,patch:Partial<TrainingBlock>)=>void; duplicateTrainingBlock:(id:string,blockId:string)=>void; removeTrainingBlock:(id:string,blockId:string)=>void;
  startWorkout: (id?:string,volumeFactor?:number) => void; adjustInput: (key:'weight'|'reps'|'rir', delta:number) => void; addSet: () => void;
  nextExercise: () => void; replaceCurrentExercise:(id:string)=>void; finishWorkout: () => void;
  setRestDuration:(seconds:number)=>void; clearRestTimer:()=>void; adjustRestTimer:(seconds:number)=>void; setRestNotifications:(enabled:boolean)=>Promise<boolean>;
  addFood: (f:FoodLog) => void; resetDayNutrition: () => void;
  addProgressPhoto:(photo:ProgressPhoto)=>void; removeProgressPhoto:(idOrUri:string)=>void;
  importState: (raw:any) => Promise<void>; exportState: () => Promise<string>;
};
const ForgeContext = createContext<Context | null>(null);

function mergedProgram(state:ForgeState,id?:string):Program{
  const pid=id && (programs as any)[id]?id:state.selectedProgramId;
  const base:any=(programs as any)[pid] || (programs as any).pushA,edit=state.programEdits?.[pid];
  return {...base,id:base.id,name:edit?.name||base.name,exercises:Array.isArray(edit?.exercises)?edit.exercises:base.exercises,blocks:Array.isArray(edit?.blocks)&&edit.blocks.length?edit.blocks:DEFAULT_BLOCKS};
}
function normalize(raw:any): ForgeState { return migrateForgeState(raw,DEFAULT); }

export function ForgeProvider({children}:{children:React.ReactNode}) {
  const [state, setState] = useState<ForgeState>(DEFAULT); const [ready, setReady] = useState(false);
  useEffect(()=>{(async()=>{try{const raw=await AsyncStorage.getItem(KEY);if(raw)setState(normalize(JSON.parse(raw)));}finally{setReady(true);}})();},[]);
  useEffect(()=>{if(ready)AsyncStorage.setItem(KEY,JSON.stringify(state)).catch(()=>{});},[state,ready]);
  useEffect(()=>{if(!ready)return;if(state.settings.restNotifications&&state.workout.restTimerEndsAt&&state.workout.restTimerEndsAt>Date.now())replaceRestNotification(state.workout.restTimerEndsAt).catch(()=>{});else cancelRestNotification().catch(()=>{});},[ready,state.settings.restNotifications,state.workout.restTimerEndsAt]);
  const buzz=()=>Haptics.selectionAsync().catch(()=>{}); const themeName=(state.theme&&state.theme in THEMES?state.theme:'black-amber') as ForgeThemeName; const theme=THEMES[themeName];
  const getProgram=useCallback((id?:string)=>mergedProgram(state,id),[state.selectedProgramId,state.programEdits]);
  const programList=useMemo(()=>Object.keys(programs as any).map(id=>mergedProgram(state,id)),[state.programEdits]);
  const setTheme=useCallback((name:ForgeThemeName)=>{setState(s=>({...s,theme:name,v11:{...(s.v11||{}),settings:{...(s.v11?.settings||{}),theme:name}}}));buzz();},[]);
  const selectProgram=useCallback((id:string)=>{if((programs as any)[id]){setState(s=>({...s,selectedProgramId:id}));buzz();}},[]);
  const editProgram=(id:string,fn:(ex:string[],blocks:TrainingBlock[],name?:string)=>{exercises?:string[];blocks?:TrainingBlock[];name?:string})=>setState(s=>{const base=mergedProgram(s,id),prev=s.programEdits?.[id]||{exercises:[...base.exercises],blocks:[...base.blocks]},next=fn([...(prev.exercises||base.exercises)],[...(prev.blocks||base.blocks)],prev.name);return {...s,programEdits:{...s.programEdits,[id]:{...prev,exercises:next.exercises||prev.exercises||base.exercises,blocks:next.blocks||prev.blocks||base.blocks,name:next.name===undefined?prev.name:next.name}}};});
  const moveProgramExercise=useCallback((id:string,index:number,delta:number)=>{editProgram(id,ex=>{const j=index+delta;if(j<0||j>=ex.length)return{exercises:ex};[ex[index],ex[j]]=[ex[j],ex[index]];return{exercises:ex};});buzz();},[]);
  const removeProgramExercise=useCallback((id:string,index:number)=>{editProgram(id,ex=>({exercises:ex.length>1?ex.filter((_,i)=>i!==index):ex}));buzz();},[]);
  const addProgramExercise=useCallback((id:string,exerciseId:string)=>{if(!exerciseMap[exerciseId])return;editProgram(id,ex=>({exercises:[...ex,exerciseId]}));buzz();},[]);
  const replaceProgramExercise=useCallback((id:string,index:number,exerciseId:string)=>{if(!exerciseMap[exerciseId])return;editProgram(id,ex=>{if(index>=0&&index<ex.length)ex[index]=exerciseId;return{exercises:ex};});buzz();},[]);
  const resetProgram=useCallback((id:string)=>{setState(s=>{const e={...s.programEdits};delete e[id];return{...s,programEdits:e};});buzz();},[]);
  const renameProgram=useCallback((id:string,name:string)=>editProgram(id,(ex,blocks)=>({exercises:ex,blocks,name:name.trim()||undefined})),[]);
  const addTrainingBlock=useCallback((id:string)=>editProgram(id,(ex,blocks)=>({exercises:ex,blocks:[...blocks,{id:`block_${Date.now()}`,name:'New block',weeks:4,focus:'Hypertrophy'}]})),[]);
  const updateTrainingBlock=useCallback((id:string,blockId:string,patch:Partial<TrainingBlock>)=>editProgram(id,(ex,blocks)=>({exercises:ex,blocks:blocks.map(b=>b.id===blockId?{...b,...patch}:b)})),[]);
  const duplicateTrainingBlock=useCallback((id:string,blockId:string)=>editProgram(id,(ex,blocks)=>{const i=blocks.findIndex(b=>b.id===blockId);if(i<0)return{exercises:ex,blocks};const c={...blocks[i],id:`block_${Date.now()}`,name:`${blocks[i].name} copy`};blocks.splice(i+1,0,c);return{exercises:ex,blocks};}),[]);
  const removeTrainingBlock=useCallback((id:string,blockId:string)=>editProgram(id,(ex,blocks)=>({exercises:ex,blocks:blocks.length>1?blocks.filter(b=>b.id!==blockId):blocks})),[]);
  const startWorkout=useCallback((id?:string,volumeFactor=1)=>{setState(s=>{const p=mergedProgram(s,id),first=p.exercises[0],inc=exerciseMap[first]?.increment||2.5;return {...s,selectedProgramId:p.id,workout:{startedAt:Date.now(),programId:p.id,exerciseIndex:0,exerciseSets:{},exerciseOrder:[...p.exercises],adaptationFactor:Math.max(.5,Math.min(1,volumeFactor)),input:{weight:inc<=1?10:20,reps:8,rir:2,setType:'working'},inputExerciseId:first,restTimerEndsAt:null,restSeconds:Number(s.settings.restSeconds||90)}};});Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(()=>{});},[]);
  const adjustInput=useCallback((key:'weight'|'reps'|'rir',delta:number)=>{setState(s=>{const order=s.workout.exerciseOrder.length?s.workout.exerciseOrder:mergedProgram(s,s.workout.programId).exercises,exId=order[s.workout.exerciseIndex],ex=exerciseMap[exId]||{},step=key==='weight'?(ex.increment||2.5):1,min=key==='reps'?1:0,max=key==='rir'?5:key==='reps'?50:400,next=Math.min(max,Math.max(min,Number(s.workout.input[key]||0)+delta*step));return{...s,workout:{...s.workout,input:{...s.workout.input,[key]:next}}};});buzz();},[]);
  const addSet=useCallback(()=>{setState(s=>{const order=s.workout.exerciseOrder.length?s.workout.exerciseOrder:mergedProgram(s,s.workout.programId).exercises,exId=order[s.workout.exerciseIndex];if(!exId)return s;const set:SetLog={...s.workout.input},nextSets=[...(s.workout.exerciseSets[exId]||[]),set],seconds=Number(s.settings.restSeconds||90);return{...s,workout:{...s.workout,exerciseSets:{...s.workout.exerciseSets,[exId]:nextSets},restSeconds:seconds,restTimerEndsAt:Date.now()+seconds*1000}};});Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});},[]);
  const nextExercise=useCallback(()=>{setState(s=>{const order=s.workout.exerciseOrder.length?s.workout.exerciseOrder:mergedProgram(s,s.workout.programId).exercises,max=Math.max(0,order.length-1),idx=Math.min(max,s.workout.exerciseIndex+1),exId=order[idx];return{...s,workout:{...s.workout,exerciseIndex:idx,inputExerciseId:exId,input:{...s.workout.input,reps:8,rir:2},restTimerEndsAt:null}};});buzz();},[]);
  const replaceCurrentExercise=useCallback((id:string)=>{if(!exerciseMap[id])return;setState(s=>{const order=s.workout.exerciseOrder.length?[...s.workout.exerciseOrder]:[...mergedProgram(s,s.workout.programId).exercises],idx=s.workout.exerciseIndex,old=order[idx];order[idx]=id;const inc=exerciseMap[id]?.increment||2.5;return{...s,workout:{...s.workout,exerciseOrder:order,inputExerciseId:id,input:{...s.workout.input,weight:inc<=1?10:Number(s.workout.input.weight||20),reps:8,rir:2},exerciseSets:{...s.workout.exerciseSets,[id]:s.workout.exerciseSets[id]||[]},replacedFrom:old}} as any;});Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});},[]);
  const finishWorkout=useCallback(()=>{setState(s=>{if(!s.workout.startedAt)return s;const p=mergedProgram(s,s.workout.programId),order=s.workout.exerciseOrder.length?s.workout.exerciseOrder:p.exercises,logged=order.map((id:string)=>({exerciseId:id,name:exerciseMap[id]?.name||id,sets:s.workout.exerciseSets[id]||[]})).filter((x:any)=>x.sets.length),volume=Math.round(logged.reduce((a:number,x:any)=>a+x.sets.reduce((b:number,z:any)=>b+Number(z.weight||0)*Number(z.reps||0),0),0)),setCount=logged.reduce((a:number,x:any)=>a+x.sets.length,0),session:SessionLog={date:new Date().toISOString(),name:p.name,programId:p.id,duration:Math.max(1,Math.round((Date.now()-s.workout.startedAt)/60000)),volume,setCount,exercises:logged};return{...s,sessions:[session,...s.sessions].slice(0,150),workout:{...DEFAULT.workout,programId:s.selectedProgramId,restSeconds:Number(s.settings.restSeconds||90)}};});cancelRestNotification().catch(()=>{});Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});},[]);
  const setRestDuration=useCallback((seconds:number)=>setState(s=>({...s,settings:{...s.settings,restSeconds:Math.max(15,Math.min(300,seconds))},workout:{...s.workout,restSeconds:Math.max(15,Math.min(300,seconds))}})),[]);
  const clearRestTimer=useCallback(()=>setState(s=>({...s,workout:{...s.workout,restTimerEndsAt:null}})),[]);
  const adjustRestTimer=useCallback((seconds:number)=>setState(s=>({...s,workout:{...s.workout,restTimerEndsAt:Math.max(Date.now(),s.workout.restTimerEndsAt||Date.now())+seconds*1000}})),[]);
  const setRestNotifications=useCallback(async(enabled:boolean)=>{if(!enabled){setState(s=>({...s,settings:{...s.settings,restNotifications:false}}));return true;}const ok=await enableRestNotifications().catch(()=>false);setState(s=>({...s,settings:{...s.settings,restNotifications:ok}}));return ok;},[]);
  const addFood=useCallback((f:FoodLog)=>{setState(s=>({...s,kcal:Number(s.kcal||0)+Number(f.kcal||0),protein:Number(s.protein||0)+Number(f.p||0),carbs:Number(s.carbs||0)+Number(f.c||0),fat:Number(s.fat||0)+Number(f.f||0),foodLog:[{...f,at:f.at||Date.now()},...s.foodLog]}));buzz();},[]);
  const resetDayNutrition=useCallback(()=>setState(s=>({...s,kcal:0,protein:0,carbs:0,fat:0})),[]);
  const addProgressPhoto=useCallback((photo:ProgressPhoto)=>setState(s=>({...s,progressPhotos:[{...photo,id:photo.id||`photo_${Date.now()}`},...s.progressPhotos].slice(0,60)})),[]);
  const removeProgressPhoto=useCallback((idOrUri:string)=>setState(s=>({...s,progressPhotos:s.progressPhotos.filter(p=>(p.id||p.uri)!==idOrUri)})),[]);
  const importState=useCallback(async(raw:any)=>{const next=normalize(raw);setState(next);await AsyncStorage.setItem(KEY,JSON.stringify(next));Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});},[]);
  const exportState=useCallback(async()=>JSON.stringify({version:'forge-native-14',state},null,2),[state]);
  const value=useMemo(()=>({state,ready,themeName,theme,setTheme,selectProgram,getProgram,programList,moveProgramExercise,removeProgramExercise,addProgramExercise,replaceProgramExercise,resetProgram,renameProgram,addTrainingBlock,updateTrainingBlock,duplicateTrainingBlock,removeTrainingBlock,startWorkout,adjustInput,addSet,nextExercise,replaceCurrentExercise,finishWorkout,setRestDuration,clearRestTimer,adjustRestTimer,setRestNotifications,addFood,resetDayNutrition,addProgressPhoto,removeProgressPhoto,importState,exportState}),[state,ready,themeName,theme,getProgram,programList]);
  return <ForgeContext.Provider value={value}>{children}</ForgeContext.Provider>;
}
export function useForge(){const ctx=useContext(ForgeContext);if(!ctx)throw new Error('useForge must be used inside ForgeProvider');return ctx;}
export { programs, exercises, exerciseMap };
