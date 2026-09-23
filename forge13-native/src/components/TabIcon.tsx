
import React from 'react';
import Svg,{Path,Circle,Rect,Line} from 'react-native-svg';
export function TabIcon({name,color,size=23}:{name:'today'|'train'|'nutrition'|'analytics'|'more';color:string;size?:number}) {
 const common={stroke:color,strokeWidth:1.9,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,fill:'none'};
 return <Svg width={size} height={size} viewBox="0 0 24 24">
  {name==='today' && <><Path {...common} d="M3.5 10.5 12 3l8.5 7.5"/><Path {...common} d="M5.5 9.5V21h13V9.5"/><Path {...common} d="M9.5 21v-6h5v6"/></>}
  {name==='train' && <><Rect {...common} x="2" y="9" width="4" height="6" rx="1"/><Rect {...common} x="18" y="9" width="4" height="6" rx="1"/><Rect {...common} x="7" y="7" width="3" height="10" rx="1"/><Rect {...common} x="14" y="7" width="3" height="10" rx="1"/><Line {...common} x1="10" y1="12" x2="14" y2="12"/></>}
  {name==='nutrition' && <><Path {...common} d="M7 3v7M4.5 3v5.5A2.5 2.5 0 0 0 7 11v10M9.5 3v5.5A2.5 2.5 0 0 1 7 11"/><Path {...common} d="M16 3v18M16 3c3 1 4 4 4 7 0 2-1 3-4 3"/></>}
  {name==='analytics' && <><Path {...common} d="M4 20V11h4v9M10 20V5h4v15M16 20v-7h4v7"/><Line {...common} x1="3" y1="20" x2="21" y2="20"/></>}
  {name==='more' && <><Circle cx="5" cy="12" r="1.7" fill={color}/><Circle cx="12" cy="12" r="1.7" fill={color}/><Circle cx="19" cy="12" r="1.7" fill={color}/></>}
 </Svg>
}
