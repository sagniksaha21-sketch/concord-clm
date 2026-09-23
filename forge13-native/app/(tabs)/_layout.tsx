import React from 'react';
import {Tabs} from 'expo-router';
import {StyleSheet,View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useForge} from '@/store/ForgeProvider';
import {TabIcon} from '@/components/TabIcon';
import * as Haptics from 'expo-haptics';

export default function TabsLayout(){
 const {theme}=useForge();const screens=[['index','Today','today'],['train','Train','train'],['nutrition','Nutrition','nutrition'],['analytics','Analytics','analytics'],['more','More','more']] as const;
 return <Tabs screenOptions={{headerShown:false,tabBarHideOnKeyboard:true,tabBarStyle:{height:76,paddingTop:7,paddingBottom:11,backgroundColor:'transparent',borderTopColor:theme.amber+'24',borderTopWidth:1,position:'absolute',elevation:0},tabBarBackground:()=> <View style={StyleSheet.absoluteFill}><LinearGradient colors={[theme.panel+'F7',theme.bg+'FC']} style={StyleSheet.absoluteFill}/><View style={[styles.glow,{backgroundColor:theme.amber+'14'}]}/></View>,tabBarActiveTintColor:theme.gold,tabBarInactiveTintColor:theme.muted,tabBarLabelStyle:{fontSize:8,fontWeight:'900',letterSpacing:.85,textTransform:'uppercase'},sceneStyle:{backgroundColor:theme.bg}}}>
  {screens.map(([name,title,icon])=><Tabs.Screen key={name} name={name} listeners={{tabPress:()=>{Haptics.selectionAsync().catch(()=>{})}}} options={{title,tabBarIcon:({color,focused})=><View style={[styles.iconWell,focused&&{backgroundColor:theme.amber+'13',borderColor:theme.amber+'2E'}]}><TabIcon name={icon} color={String(color)}/>{focused&&<View style={[styles.dot,{backgroundColor:theme.amber}]}/>}</View>}}/>)}
 </Tabs>
}
const styles=StyleSheet.create({glow:{position:'absolute',width:110,height:60,borderRadius:60,left:'37%',top:3},iconWell:{width:44,height:34,borderRadius:13,borderWidth:1,borderColor:'transparent',alignItems:'center',justifyContent:'center'},dot:{position:'absolute',bottom:2,width:12,height:2,borderRadius:2}});
