
import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View, RefreshControl } from 'react-native';
import { useForge } from '../store/ForgeProvider';
import { ForgeBrand } from './ForgeBrand';
export function Screen({children,refreshing=false,onRefresh}:{children:React.ReactNode;refreshing?:boolean;onRefresh?:()=>void}) {
 const {theme}=useForge();
 return <SafeAreaView style={[styles.safe,{backgroundColor:theme.bg}]}>
   <ScrollView style={{flex:1}} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
     refreshControl={onRefresh?<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.amber}/>:undefined}>
     <View style={styles.brand}><ForgeBrand compact/></View>
     {children}
     <View style={{height:104}}/>
   </ScrollView>
 </SafeAreaView>
}
const styles=StyleSheet.create({safe:{flex:1},content:{paddingHorizontal:16,paddingTop:8,gap:14},brand:{paddingVertical:4}});
