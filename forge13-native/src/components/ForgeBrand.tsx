import React,{useEffect,useRef} from 'react';
import {Animated,Pressable,StyleSheet,Text,View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {useForge} from '../store/ForgeProvider';

export function ForgeBrand({compact=false}:{compact?:boolean}){
 const {theme}=useForge(),ignite=useRef(new Animated.Value(0)).current,pulse=useRef(new Animated.Value(0)).current;
 useEffect(()=>{Animated.sequence([Animated.timing(ignite,{toValue:1,duration:520,useNativeDriver:true}),Animated.spring(pulse,{toValue:1,damping:13,stiffness:150,useNativeDriver:true})]).start();const loop=Animated.loop(Animated.sequence([Animated.timing(pulse,{toValue:.72,duration:1800,useNativeDriver:true}),Animated.timing(pulse,{toValue:1,duration:1800,useNativeDriver:true})]));loop.start();return()=>loop.stop()},[]);
 const sparkOpacity=pulse.interpolate({inputRange:[.72,1],outputRange:[.28,1]});
 return <Pressable onPress={()=>Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{})} accessibilityLabel="FORGE — Adapt, Execute, Evolve">
  <Animated.View style={[styles.wrap,compact&&styles.compact,{opacity:ignite,transform:[{translateX:ignite.interpolate({inputRange:[0,1],outputRange:[-8,0]})}]}]}>
   <View style={styles.markWrap}><Animated.View style={{transform:[{scale:pulse.interpolate({inputRange:[.72,1],outputRange:[.985,1]})}]}}>
    <LinearGradient colors={[theme.gold,theme.amber,theme.ember]} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.badge,compact&&styles.badgeCompact]}><Text style={[styles.f,compact&&styles.fCompact]}>F</Text><Animated.View pointerEvents="none" style={[styles.sheen,{backgroundColor:'rgba(255,255,255,.32)',opacity:sparkOpacity}]}/></LinearGradient>
   </Animated.View><Animated.View style={[styles.spark,{backgroundColor:theme.gold,opacity:sparkOpacity}]}/></View>
   <View style={styles.wordWrap}><Text style={[styles.word,{color:theme.gold,textShadowColor:theme.amber+'55'},compact&&styles.wordCompact]}>FORGE</Text><LinearGradient colors={[theme.ember,theme.amber,theme.gold,'transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={[styles.rule,compact&&styles.ruleCompact]}/>{!compact&&<Text style={[styles.sub,{color:theme.amber}]}>ADAPT · EXECUTE · EVOLVE</Text>}</View>
  </Animated.View>
 </Pressable>
}
const styles=StyleSheet.create({wrap:{flexDirection:'row',alignItems:'center',gap:11},compact:{gap:9},markWrap:{position:'relative'},badge:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center',overflow:'hidden',transform:[{skewX:'-8deg'}],shadowColor:'#F5A623',shadowOpacity:.38,shadowRadius:12,elevation:6},badgeCompact:{width:36,height:36,borderRadius:11},f:{fontSize:27,fontWeight:'900',color:'#120B03',fontStyle:'italic',letterSpacing:-2.3},fCompact:{fontSize:24},sheen:{position:'absolute',width:8,height:70,top:-15,right:5,transform:[{rotate:'24deg'}]},spark:{position:'absolute',right:-2,top:2,width:5,height:5,borderRadius:3,shadowColor:'#FFD37A',shadowOpacity:.9,shadowRadius:7,elevation:7},wordWrap:{alignItems:'flex-start'},word:{fontSize:30,fontWeight:'900',fontStyle:'italic',letterSpacing:-1.65,lineHeight:31,textShadowRadius:10},wordCompact:{fontSize:25,lineHeight:26,letterSpacing:-1.4},rule:{height:2.5,width:72,borderRadius:2,marginTop:1},ruleCompact:{width:57,height:2},sub:{fontSize:7.7,fontWeight:'900',letterSpacing:1.7,marginTop:3}});
