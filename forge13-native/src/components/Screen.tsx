import React,{useEffect,useRef} from 'react';
import {Animated,ScrollView,StyleSheet,View,RefreshControl} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {LinearGradient} from 'expo-linear-gradient';
import {useForge} from '../store/ForgeProvider';
import {ForgeBrand} from './ForgeBrand';

export function Screen({children,refreshing=false,onRefresh}:{children:React.ReactNode;refreshing?:boolean;onRefresh?:()=>void}){
 const {theme}=useForge(),enter=useRef(new Animated.Value(0)).current;
 useEffect(()=>{Animated.timing(enter,{toValue:1,duration:330,useNativeDriver:true}).start()},[]);
 return <SafeAreaView edges={['top']} style={[styles.safe,{backgroundColor:theme.bg}]}>
   <View pointerEvents="none" style={StyleSheet.absoluteFill}><LinearGradient colors={[theme.amber+'16','transparent',theme.bg]} locations={[0,.34,1]} style={StyleSheet.absoluteFill}/><View style={[styles.aura,{backgroundColor:theme.amber+'0D'}]}/></View>
   <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never" refreshControl={onRefresh?<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.amber}/>:undefined}>
    <Animated.View style={[styles.stage,{opacity:enter,transform:[{translateY:enter.interpolate({inputRange:[0,1],outputRange:[9,0]})}]}]}><View style={styles.brandRail}><ForgeBrand compact/></View>{children}</Animated.View><View style={styles.tail}/>
   </ScrollView>
 </SafeAreaView>
}
const styles=StyleSheet.create({safe:{flex:1},scroll:{flex:1},content:{paddingHorizontal:16,paddingTop:10},stage:{gap:14},brandRail:{minHeight:48,justifyContent:'center'},aura:{position:'absolute',width:230,height:230,borderRadius:230,right:-110,top:-100,opacity:.7},tail:{height:40}});
