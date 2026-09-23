import React from 'react';
import {View,StyleSheet,StyleProp,ViewStyle} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useForge} from '../store/ForgeProvider';
import {V14} from '../theme';
export function GlassCard({children,style}:{children:React.ReactNode;style?:StyleProp<ViewStyle>}){
 const {theme}=useForge();
 return <View style={[styles.card,{borderColor:theme.line,shadowColor:theme.amber},style]}><LinearGradient colors={[theme.panel2,theme.panel,theme.bg]} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/><View pointerEvents="none" style={[styles.edge,{backgroundColor:theme.gold+'35'}]}/><View pointerEvents="none" style={[styles.corner,{backgroundColor:theme.amber+'12'}]}/>{children}</View>
}
const styles=StyleSheet.create({card:{borderWidth:1,borderRadius:V14.radius.surface,padding:V14.space.surface,overflow:'hidden',shadowOpacity:.12,shadowRadius:18,shadowOffset:{width:0,height:9},elevation:3},edge:{position:'absolute',left:18,right:54,top:0,height:1},corner:{position:'absolute',width:90,height:90,borderRadius:90,right:-45,top:-45}});
