import React from 'react';
import { ScrollView, StyleSheet, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForge } from '../store/ForgeProvider';
import { ForgeBrand } from './ForgeBrand';

export function Screen({children,refreshing=false,onRefresh}:{children:React.ReactNode;refreshing?:boolean;onRefresh?:()=>void}) {
 const {theme}=useForge();
 return <SafeAreaView edges={['top']} style={[styles.safe,{backgroundColor:theme.bg}]}>
   <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
     contentInsetAdjustmentBehavior="never"
     refreshControl={onRefresh?<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.amber}/>:undefined}>
     <View style={styles.brand}><ForgeBrand compact/></View>
     {children}
     <View style={styles.tail}/>
   </ScrollView>
 </SafeAreaView>
}
const styles=StyleSheet.create({
 safe:{flex:1},
 scroll:{flex:1},
 content:{paddingHorizontal:16,paddingTop:10,gap:14},
 brand:{paddingVertical:4},
 tail:{height:40}
});