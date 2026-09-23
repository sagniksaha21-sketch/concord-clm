
import { ForgeState, SessionLog } from '../types';

export function last30(state: ForgeState) {
  const cutoff = Date.now() - 30 * 864e5;
  const sessions = (state.sessions || []).filter(s => Date.parse(s.date || '') >= cutoff);
  let sets = 0, volume = 0;
  for (const session of sessions) for (const exercise of session.exercises || []) {
    for (const set of exercise.sets || []) {
      if ((set.setType || 'working') !== 'warmup' && Number(set.reps || 0) > 0) {
        sets += 1;
        volume += Number(set.weight || 0) * Number(set.reps || 0);
      }
    }
  }
  return { sessions: sessions.length, sets, volume };
}

export function hallOfFame(state: ForgeState) {
  const best = new Map<string, { exerciseId:string; name:string; weight:number; reps:number; score:number; date:string }>();
  for (const session of state.sessions || []) {
    for (const ex of session.exercises || []) for (const set of ex.sets || []) {
      if ((set.setType || 'working') === 'warmup') continue;
      const score = Number(set.weight || 0) * Number(set.reps || 0);
      const current = best.get(ex.exerciseId);
      if (!current || score > current.score) best.set(ex.exerciseId, {
        exerciseId: ex.exerciseId, name: ex.name || ex.exerciseId.replaceAll('_',' '),
        weight: Number(set.weight || 0), reps: Number(set.reps || 0), score, date: session.date,
      });
    }
  }
  return [...best.values()].sort((a,b)=>b.score-a.score);
}

export function latestSession(state: ForgeState): SessionLog | undefined {
  return [...(state.sessions || [])].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date))[0];
}

export function weekSessions(state: ForgeState) {
  const cutoff = Date.now() - 7 * 864e5;
  return (state.sessions || []).filter(s => Date.parse(s.date || '') >= cutoff).length;
}

function sessionMetrics(s:SessionLog){let volume=0,sets=0;for(const ex of s.exercises||[])for(const set of ex.sets||[]){if((set.setType||'working')==='warmup'||Number(set.reps||0)<=0)continue;sets++;volume+=Number(set.weight||0)*Number(set.reps||0);}return{volume,sets};}
export function records2(state:ForgeState){
 const sessions=[...(state.sessions||[])].map(s=>({s,time:Date.parse(s.date||''),m:sessionMetrics(s)})).filter(x=>Number.isFinite(x.time)).sort((a,b)=>a.time-b.time);
 let bestVolume=0,bestSets=0,longest=0,current=0,lastDay:number|null=null;
 for(const x of sessions){bestVolume=Math.max(bestVolume,x.m.volume);bestSets=Math.max(bestSets,x.m.sets);const day=Math.floor(x.time/864e5);if(lastDay!=null){const gap=day-lastDay;current=gap<=2?current+1:1;}else current=1;longest=Math.max(longest,current);lastDay=day;}
 const recent=sessions.slice(-6),prior=sessions.slice(-12,-6),avg=(xs:typeof sessions)=>xs.length?xs.reduce((a,x)=>a+x.m.volume,0)/xs.length:0,a=avg(recent),b=avg(prior),trend=b?Math.round((a-b)/b*100):0;
 return{bestSessionVolume:bestVolume,bestSessionSets:bestSets,longestRhythm:longest,volumeTrend:trend};
}
