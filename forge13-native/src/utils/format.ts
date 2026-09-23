
export const kg = (n:number) => `${Number(n || 0).toFixed(n % 1 ? 1 : 0)} kg`;
export const tons = (n:number) => n ? `${(n/1000).toFixed(1)}t` : '—';
export const shortDate = (iso?:string) => iso ? new Date(iso).toLocaleDateString(undefined,{day:'numeric',month:'short'}) : '—';
export const clamp = (n:number,min:number,max:number) => Math.min(max,Math.max(min,n));
