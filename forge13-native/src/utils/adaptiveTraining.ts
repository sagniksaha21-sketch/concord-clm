import type {ForgeState} from '../types';
import {readiness} from './readiness';
export type TrainingRecommendation={kind:'PROCEED'|'REDUCE_VOLUME'|'DELOAD';title:string;detail:string;volumeFactor:number;requiresAcceptance:true};
export function trainingRecommendation(state:ForgeState):TrainingRecommendation{
 const r=readiness(state);const recent=[...(state.sessions||[])].sort((a,b)=>Date.parse(b.date||'')-Date.parse(a.date||'')).slice(0,4);const declining=recent.length>=3&&recent[0].volume<recent[1].volume&&recent[1].volume<recent[2].volume;
 if(r.band==='RECOVER'&&declining)return{kind:'DELOAD',title:'Consider a lighter session',detail:'Recent training volume is declining and readiness is in recovery range. Keep the programme intact unless you choose to adapt it.',volumeFactor:.7,requiresAcceptance:true};
 if(r.band==='RECOVER')return{kind:'REDUCE_VOLUME',title:'Consider trimming working volume',detail:r.reason+' Forge will not change the programme unless you accept an adaptation.',volumeFactor:.8,requiresAcceptance:true};
 return{kind:'PROCEED',title:'Run the programme as planned',detail:r.reason,volumeFactor:1,requiresAcceptance:true};
}
