
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useForge } from '../store/ForgeProvider';
export function ProgressBar({value}:{value:number}) {
 const {theme}=useForge();
 const pct=Math.max(0,Math.min(100,value));
 return <View style={[styles.track,{backgroundColor:theme.panel2}]}><View style={[styles.fill,{backgroundColor:theme.amber,width:`${pct}%`}]} /></View>
}
const styles=StyleSheet.create({track:{height:7,borderRadius:99,overflow:'hidden'},fill:{height:'100%',borderRadius:99}});
