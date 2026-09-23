
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useForge } from '../store/ForgeProvider';

export function ForgeIntro({children}:{children:React.ReactNode}) {
  const {ready,theme}=useForge();
  const [show,setShow]=useState(true);
  useEffect(()=>{ if(ready){ const t=setTimeout(()=>setShow(false),1500); return()=>clearTimeout(t); }},[ready]);
  if(!ready || show) return (
    <View style={[styles.root,{backgroundColor:theme.bg}]}>
      <View style={styles.photos}>
        <Image source={require('../../assets/splash/01.jpg')} style={[styles.photo,{transform:[{rotate:'-4deg'}]}]}/>
        <Image source={require('../../assets/splash/03.jpg')} style={[styles.photo,styles.photo2,{transform:[{rotate:'4deg'}]}]}/>
      </View>
      <LinearGradient colors={[theme.gold,theme.amber,theme.ember]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.line}/>
      <Text style={[styles.word,{color:theme.text}]}>FORGE</Text>
      <Text style={[styles.sub,{color:theme.amber}]}>ADAPT · EXECUTE · EVOLVE</Text>
      <Text style={[styles.ver,{color:theme.muted}]}>NATIVE · 13.0</Text>
    </View>
  );
  return <>{children}</>;
}
const styles=StyleSheet.create({
  root:{flex:1,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  photos:{height:210,width:250,flexDirection:'row',alignItems:'center',justifyContent:'center',marginBottom:25},
  photo:{width:130,height:185,borderRadius:22,borderWidth:1,borderColor:'rgba(255,190,80,.18)'},
  photo2:{marginLeft:-24,marginTop:18},
  line:{width:70,height:3,borderRadius:9,marginBottom:12},
  word:{fontSize:54,fontWeight:'1000',fontStyle:'italic',letterSpacing:-4,lineHeight:56},
  sub:{fontSize:9,fontWeight:'900',letterSpacing:2.6,marginTop:5},
  ver:{fontSize:8,fontWeight:'800',letterSpacing:1.5,marginTop:13}
});
