export type SetLog = { weight: number; reps: number; rir?: number; setType?: string; side?: string };
export type ExerciseLog = { exerciseId: string; name?: string; sets: SetLog[]; note?: string };
export type SessionLog = {
  date: string; name: string; programId: string; duration: number; volume: number;
  setCount: number; exercises: ExerciseLog[];
};
export type FoodLog = { name: string; kcal: number; p?: number; c?: number; f?: number; at: number | string };
export type ProgressPhoto = { id?: string; date: string; data?: string; uri?: string; view?: string; note?: string };
export type TrainingBlock = { id:string; name:string; weeks:number; focus:'Hypertrophy'|'Strength'|'Maintenance'|'Deload'|string };
export type ProgramEdit = { name?:string; exercises:string[]; blocks?:TrainingBlock[] };
export type WorkoutState = {
  startedAt: number | null; programId: string; exerciseIndex: number;
  exerciseSets: Record<string, SetLog[]>; input: SetLog; inputExerciseId?: string;
  exerciseOrder: string[]; restTimerEndsAt: number | null; restSeconds: number; adaptationFactor?: number;
};
export type ForgeState = {
  dataVersion: number; selectedProgramId: string; phase: string; phaseWeek: number; phaseLength: number;
  calTarget: number; proteinTarget: number; kcal: number; protein: number; carbs: number; fat: number;
  foodLog: FoodLog[]; sessions: SessionLog[]; bodyLogs: Array<{date:string;weight:number;smm?:number}>;
  progressPhotos: ProgressPhoto[]; goals: {weight:number;smm:number;maintenance:number};
  workout: WorkoutState; programEdits:Record<string,ProgramEdit>;
  settings:{restSeconds:number;restNotifications:boolean;[key:string]:any};
  theme?: string; v11?: any; sync?: any; [key:string]: any;
};
