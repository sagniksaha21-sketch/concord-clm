import React,{useRef} from 'react';
import {Animated,Pressable,Text,StyleSheet,StyleProp,ViewStyle} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useForge} from '../store/ForgeProvider';
import * as Haptics from 'expo-haptics';
import {V14} from '../theme';
export function ForgeButton({label,onPress,ghost=false,style}:{label:string;onPress:()=>void;ghost?:boolean;style?:StyleProp<ViewStyle>}){
 const {theme}=useForge(),scale=useRef(new Animated.Value(1)).current;
 const down=()=>Animated.spring(scale,{toValue:.975,damping:18,stiffness:350,useNativeDriver:true}).start(),up=()=>Animated.spring(scale,{toValue:1,damping:14,stiffness:300,useNativeDriver:true}).start();
 const press=()=>{Haptics.selectionAsync().catch(()=>{});onPress();};
 return <Animated.View style={[{transform:[{scale}]},style]}><Pressable onPress={press} onPressIn={down} onPressOut={up}>
  {ghost?<View style={[styles.btn,{borderColor:theme.line,backgroundColor:theme.panel2}]}><Text style={[styles.txt,{color:theme.text}]}>{label}</Text></View>:<LinearGradient colors={[theme.gold,theme.amber,theme.ember]} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.btn,styles.primary]}><View pointerEvents="none" style={styles.highlight}/><Text style={[styles.txt,{color:'#160D03'}]}>{label}</Text><Text style={styles.arrow}>›</Text></LinearGradient>}
 </Pressable></Animated.View>
}
const styles=StyleSheet.create({btn:{height:50,borderRadius:V14.radius.control,alignItems:'center',justifyContent:'center',borderWidth:1,paddingHorizontal:16,overflow:'hidden'},primary:{borderColor:'rgba(255,255,255,.18)',shadowColor:'#F5A623',shadowOpacity:.22,shadowRadius:12,elevation:4},highlight:{position:'absolute',left:12,right:12,top:1,height:1,backgroundColor:'rgba(255,255,255,.48)'},txt:{fontSize:11.5,fontWeight:'900',letterSpacing:1,textTransform:'uppercase'},arrow:{position:'absolute',right:16,color:'#160D03',fontSize:22,fontWeight:'900'}});
