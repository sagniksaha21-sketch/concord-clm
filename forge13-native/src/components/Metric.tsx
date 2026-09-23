
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useForge } from '../store/ForgeProvider';
export function Metric({value,label,accent=false}:{value:string|number;label:string;accent?:boolean}) {
 const {theme}=useForge();
 return <View style={styles.wrap}><Text style={[styles.value,{color:accent?theme.gold:theme.text}]}>{value}</Text><Text style={[styles.label,{color:theme.muted}]}>{label}</Text></View>
}
const styles=StyleSheet.create({wrap:{flex:1},value:{fontSize:23,fontWeight:'900',letterSpacing:-.6},label:{fontSize:9,fontWeight:'800',letterSpacing:1,textTransform:'uppercase',marginTop:4}});
