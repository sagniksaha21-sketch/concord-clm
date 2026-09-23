
import React from 'react';
import { Pressable, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useForge } from '../store/ForgeProvider';
export function ForgeButton({label,onPress,ghost=false,style}:{label:string;onPress:()=>void;ghost?:boolean;style?:StyleProp<ViewStyle>}) {
 const {theme}=useForge();
 if(ghost) return <Pressable onPress={onPress} style={({pressed})=>[styles.btn,{borderColor:theme.line,backgroundColor:theme.panel2,opacity:pressed?.8:1},style]}><Text style={[styles.txt,{color:theme.text}]}>{label}</Text></Pressable>
 return <Pressable onPress={onPress} style={({pressed})=>[style,{opacity:pressed?.86:1}]}>
   <LinearGradient colors={[theme.gold,theme.amber,theme.ember]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.btn}>
    <Text style={[styles.txt,{color:'#160D03'}]}>{label}</Text>
   </LinearGradient>
 </Pressable>
}
const styles=StyleSheet.create({btn:{height:48,borderRadius:15,alignItems:'center',justifyContent:'center',borderWidth:1,paddingHorizontal:16},txt:{fontSize:12,fontWeight:'900',letterSpacing:.8,textTransform:'uppercase'}});
