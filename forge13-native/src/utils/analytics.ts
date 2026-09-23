
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

export function records2(state:ForgeState){
 const sessions=[...(state.sessions||[])].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 let bestVolume=0,bestSets=0,longest=0,current=0,lastDay='';
 for(const s of sessions){bestVolume=Math.max(bestVolume,Number(s.volume||0));bestSets=Math.max(bestSets,Number(s.setCount||0));const day=new Date(s.date).toISOString().slice(0,10);if(lastDay){const gap=Math.round((Date.parse(day)-Date.parse(lastDay))/864e5);current=gap<=2?current+1:1;}else current=1;longest=Math.max(longest,current);lastDay=day;}
 const recent=sessions.slice(-6);const prior=sessions.slice(-12,-6);const avg=(xs:SessionLog[])=>xs.length?xs.reduce((a,s)=>a+Number(s.volume||0),0)/xs.length:0;const a=avg(recent),b=avg(prior);const trend=b?Math.round((a-b)/b*100):0;
 return{bestSessionVolume:bestVolume,bestSessionSets:bestSets,longestRhythm:longest,volumeTrend:trend};
}
