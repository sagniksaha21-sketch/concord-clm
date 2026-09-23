import React,{useEffect,useRef,useState} from 'react';
import {Animated,Image,StyleSheet,Text,View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useForge} from '../store/ForgeProvider';

export function ForgeIntro({children}:{children:React.ReactNode}){
 const {ready}=useForge(); const [show,setShow]=useState(true); const fade=useRef(new Animated.Value(1)).current;
 useEffect(()=>{if(!ready)return;const t=setTimeout(()=>Animated.timing(fade,{toValue:0,duration:430,useNativeDriver:true}).start(()=>setShow(false)),1650);return()=>clearTimeout(t)},[ready]);
 if(!ready||show)return <Animated.View style={[styles.root,{opacity:fade}]}>
  <View style={styles.triptych}>
   <Image source={require('../../assets/splash/01.jpg')} style={styles.photo}/>
   <Image source={require('../../assets/splash/02.jpg')} style={styles.photo}/>
   <Image source={require('../../assets/splash/03.jpg')} style={styles.photo}/>
   <Image source={require('../../assets/splash/04.jpg')} style={styles.photo}/>
  </View>
  <LinearGradient colors={['rgba(3,3,3,.80)','rgba(3,3,3,.42)','rgba(3,3,3,.84)']} start={{x:0,y:.5}} end={{x:1,y:.5}} style={StyleSheet.absoluteFillObject}/>
  <LinearGradient colors={['rgba(3,3,3,.20)','rgba(3,3,3,.08)','rgba(3,3,3,.90)']} style={StyleSheet.absoluteFillObject}/>
  <View style={styles.lockup}>
   <Text style={styles.word}>FORGE</Text>
   <LinearGradient colors={['transparent','#D88922','#FF7A14','transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.line}/>
   <Text style={styles.tag}>BUILT UNDER PRESSURE</Text>
   <Text style={styles.ver}>TRAIN · TRACK · TRANSFORM</Text>
  </View>
 </Animated.View>;
 return <>{children}</>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:'#030303',alignItems:'center',justifyContent:'center',overflow:'hidden'},
 triptych:{...StyleSheet.absoluteFillObject,flexDirection:'row',transform:[{scale:1.06}]},
 photo:{flex:1,height:'100%',opacity:.42},
 lockup:{width:'92%',alignItems:'center',justifyContent:'center'},
 word:{fontSize:78,lineHeight:82,fontWeight:'900',fontStyle:'italic',letterSpacing:-6,color:'#FFF0D4',textShadowColor:'rgba(0,0,0,.75)',textShadowRadius:24,textShadowOffset:{width:0,height:12}},
 line:{width:'70%',height:3,borderRadius:99,marginTop:16},
 tag:{marginTop:12,fontSize:10,letterSpacing:3,fontWeight:'900',color:'#C7B9A5'},
 ver:{marginTop:9,fontSize:9,letterSpacing:1.5,fontWeight:'700',color:'#746C63'}
});
