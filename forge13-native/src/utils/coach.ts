import type {ForgeState} from '../types';
import {readiness} from './readiness';
import {muscleIntelligence} from './muscleIntelligence';
export type CoachAction={title:string;why:string;action:'TRAIN'|'RECOVER'|'FOCUS';muscle?:string};
export function coachAction(state:ForgeState):CoachAction{
 const r=readiness(state);const muscles=muscleIntelligence(state);const neglected=muscles.find(m=>m.status==='UNDERTRAINED');
 if(r.band==='RECOVER')return{title:'Protect the next quality session',why:r.reason,action:'RECOVER'};
 if(neglected)return{title:'Bring '+neglected.group.toLowerCase()+' back into the week',why:neglected.daysSince==null?'No recent working sets are recorded for this region.':'Last trained about '+Math.floor(neglected.daysSince)+' days ago.',action:'FOCUS',muscle:neglected.group};
 return{title:r.band==='READY'?'A strong training window is open':'Stay on programme today',why:r.reason,action:'TRAIN'};
}
