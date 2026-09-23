
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ForgeProvider, useForge } from '@/store/ForgeProvider';
import { ForgeIntro } from '@/components/ForgeIntro';

function AppStack(){
 const {theme}=useForge();
 return <ForgeIntro>
   <StatusBar style="light"/>
   <Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:theme.bg},animation:'fade'}}>
     <Stack.Screen name="(tabs)"/>
     <Stack.Screen name="workout" options={{presentation:'fullScreenModal',animation:'slide_from_bottom'}}/>
     <Stack.Screen name="share" options={{presentation:'modal',animation:'slide_from_bottom'}}/>
     <Stack.Screen name="program-builder" options={{presentation:'modal',animation:'slide_from_bottom'}}/>
     <Stack.Screen name="exercise-picker" options={{presentation:'modal',animation:'slide_from_bottom'}}/>
     <Stack.Screen name="exercise-history" options={{animation:'slide_from_right'}}/>
     <Stack.Screen name="progress-photos" options={{presentation:'modal',animation:'slide_from_bottom'}}/>
   </Stack>
 </ForgeIntro>
}
export default function RootLayout(){return <SafeAreaProvider><ForgeProvider><AppStack/></ForgeProvider></SafeAreaProvider>}
