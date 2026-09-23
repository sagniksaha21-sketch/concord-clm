
import React from 'react';
import { Tabs } from 'expo-router';
import { useForge } from '@/store/ForgeProvider';
import { TabIcon } from '@/components/TabIcon';

export default function TabsLayout(){
 const {theme}=useForge();
 const screens=[
  ['index','Today','today'],['train','Train','train'],['nutrition','Nutrition','nutrition'],['analytics','Analytics','analytics'],['more','More','more']
 ] as const;
 return <Tabs screenOptions={{
   headerShown:false,
   tabBarStyle:{height:72,paddingTop:7,paddingBottom:10,backgroundColor:theme.bg,borderTopColor:theme.line,borderTopWidth:1},
   tabBarActiveTintColor:theme.amber,tabBarInactiveTintColor:theme.muted,
   tabBarLabelStyle:{fontSize:9,fontWeight:'800',letterSpacing:.2},
   sceneStyle:{backgroundColor:theme.bg}
 }}>
  {screens.map(([name,title,icon])=><Tabs.Screen key={name} name={name} options={{
    title,tabBarIcon:({color})=><TabIcon name={icon} color={color}/>
  }}/>)}
 </Tabs>
}
