import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useForge } from '../store/ForgeProvider';

export function ForgeBrand({compact=false}:{compact?:boolean}) {
  const {theme}=useForge();
  return (
    <View style={[styles.wrap, compact && styles.compact]} accessibilityLabel="FORGE — Adapt, Execute, Evolve">
      <View style={styles.markWrap}>
        <LinearGradient colors={[theme.gold, theme.amber, theme.ember]} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.badge,compact&&styles.badgeCompact]}>
          <Text style={[styles.f,compact&&styles.fCompact]}>F</Text>
        </LinearGradient>
        <View style={[styles.spark,{backgroundColor:theme.gold}]}/>
      </View>
      <View style={styles.wordWrap}>
        <Text style={[styles.word,{color:theme.gold},compact&&styles.wordCompact]}>FORGE</Text>
        <LinearGradient colors={[theme.ember,theme.amber,theme.gold,'transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={[styles.rule,compact&&styles.ruleCompact]}/>
        {!compact && <Text style={[styles.sub,{color:theme.amber}]}>ADAPT · EXECUTE · EVOLVE</Text>}
      </View>
    </View>
  )
}
const styles=StyleSheet.create({
  wrap:{flexDirection:'row',alignItems:'center',gap:11},
  compact:{gap:9},
  markWrap:{position:'relative'},
  badge:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center',transform:[{skewX:'-8deg'}],shadowColor:'#F5A623',shadowOpacity:.22,shadowRadius:9,elevation:4},
  badgeCompact:{width:36,height:36,borderRadius:11},
  f:{fontSize:27,fontWeight:'1000',color:'#120B03',fontStyle:'italic',letterSpacing:-2.3},
  fCompact:{fontSize:24},
  spark:{position:'absolute',right:-2,top:2,width:5,height:5,borderRadius:3,shadowColor:'#FFD37A',shadowOpacity:.75,shadowRadius:5,elevation:5},
  wordWrap:{alignItems:'flex-start'},
  word:{fontSize:30,fontWeight:'1000',fontStyle:'italic',letterSpacing:-1.65,lineHeight:31,textShadowColor:'rgba(245,166,35,.18)',textShadowRadius:8},
  wordCompact:{fontSize:25,lineHeight:26,letterSpacing:-1.4},
  rule:{height:2.5,width:72,borderRadius:2,marginTop:1},
  ruleCompact:{width:57,height:2},
  sub:{fontSize:7.7,fontWeight:'900',letterSpacing:1.7,marginTop:3}
});
