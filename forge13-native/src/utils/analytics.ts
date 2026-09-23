
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
