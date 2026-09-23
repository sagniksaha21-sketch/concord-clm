import React,{useEffect,useMemo,useRef,useState} from 'react';
import {FlatList,StyleSheet,Text,View,ViewToken} from 'react-native';
import * as Haptics from 'expo-haptics';
import {useForge} from '../store/ForgeProvider';

const ITEM=48;
export function ForgeWheel({label,value,min,max,step,onChange,suffix=''}:{label:string;value:number;min:number;max:number;step:number;onChange:(deltaSteps:number)=>void;suffix?:string}){
 const {theme}=useForge(),list=useRef<FlatList<number>>(null),last=useRef(value);
 const values=useMemo(()=>Array.from({length:Math.round((max-min)/step)+1},(_,i)=>Number((min+i*step).toFixed(2))),[min,max,step]);
 const index=Math.max(0,Math.min(values.length-1,Math.round((value-min)/step)));const [active,setActive]=useState(index);
 useEffect(()=>{const i=Math.max(0,Math.min(values.length-1,Math.round((value-min)/step)));setActive(i);list.current?.scrollToIndex({index:i,animated:false});last.current=value},[value,min,step,values.length]);
 const settle=(i:number)=>{const next=values[Math.max(0,Math.min(values.length-1,i))];const steps=Math.round((next-last.current)/step);if(steps){onChange(steps);last.current=next;Haptics.selectionAsync().catch(()=>{})}};
 return <View style={s.wrap}><Text style={[s.label,{color:theme.muted}]}>{label}</Text><View style={[s.wheel,{borderColor:theme.line,backgroundColor:theme.panel2}]}><View pointerEvents="none" style={[s.focus,{borderColor:theme.amber+'66',backgroundColor:theme.amber+'0D'}]}/><FlatList ref={list} data={values} horizontal showsHorizontalScrollIndicator={false} snapToInterval={ITEM} decelerationRate="fast" contentContainerStyle={s.pad} getItemLayout={(_,i)=>({length:ITEM,offset:ITEM*i,index:i})} onScrollToIndexFailed={()=>{}} onMomentumScrollEnd={e=>{const i=Math.round(e.nativeEvent.contentOffset.x/ITEM);setActive(i);settle(i)}} onViewableItemsChanged={useRef(({viewableItems}:{viewableItems:Array<ViewToken>})=>{const mid=viewableItems[Math.floor(viewableItems.length/2)]?.index;if(mid!=null&&mid!==active){setActive(mid);Haptics.selectionAsync().catch(()=>{})}}).current} viewabilityConfig={useRef({itemVisiblePercentThreshold:60}).current} renderItem={({item,index:i})=><View style={s.item}><Text style={[s.value,{color:i===active?theme.text:theme.muted,opacity:i===active?1:.42}]}>{item}{suffix}</Text></View>}/></View></View>
}
const s=StyleSheet.create({wrap:{flex:1},label:{fontSize:7.5,fontWeight:'900',letterSpacing:1.2,marginBottom:6},wheel:{height:72,borderWidth:1,borderRadius:16,overflow:'hidden',justifyContent:'center'},pad:{paddingHorizontal:48},item:{width:ITEM,height:70,alignItems:'center',justifyContent:'center'},value:{fontSize:16,fontWeight:'900',letterSpacing:-.4},focus:{position:'absolute',zIndex:2,left:'50%',marginLeft:-24,width:48,height:52,top:9,borderWidth:1,borderRadius:13}});
