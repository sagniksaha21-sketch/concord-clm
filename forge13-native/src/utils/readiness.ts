import type {ForgeState} from '../types';

export type ReadinessBand='READY'|'BALANCED'|'RECOVER';
export type Readiness={score:number;band:ReadinessBand;headline:string;reason:string;sessionGapHours:number|null;weekSessions:number};

export function readiness(state:ForgeState,now=Date.now()):Readiness{
 const sessions=[...(state.sessions||[])].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 const last=sessions[0];
 const gap=last?Math.max(0,(now-Date.parse(last.date))/36e5):null;
 const week=sessions.filter(s=>Date.parse(s.date)>=now-7*864e5).length;
 let score=72;
 const reasons:string[]=[];
 if(gap===null){score=68;reasons.push('No recent training history yet');}
 else if(gap<18){score-=18;reasons.push('You trained less than 18 hours ago');}
 else if(gap>=36&&gap<=96){score+=12;reasons.push('Your recent training gap supports another quality session');}
 else if(gap>120){score+=5;reasons.push('You have had an extended training gap');}
 if(week>=5){score-=10;reasons.push('Training frequency is high this week');}
 else if(week<=2){score+=5;reasons.push('Weekly training load is currently moderate');}
 score=Math.max(35,Math.min(95,Math.round(score)));
 const band:ReadinessBand=score>=80?'READY':score>=60?'BALANCED':'RECOVER';
 return {score,band,headline:band==='READY'?'Good window to train':band==='BALANCED'?'Train with intent':'Recovery deserves priority',reason:reasons.slice(0,2).join(' · ')||'Readiness is based on the training history currently available to Forge.',sessionGapHours:gap,weekSessions:week};
}
