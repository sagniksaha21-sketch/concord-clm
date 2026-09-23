
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useForge } from '../store/ForgeProvider';

export function ForgeBrand({compact=false}:{compact?:boolean}) {
  const {theme}=useForge();
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <LinearGradient colors={[theme.gold, theme.amber, theme.ember]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.badge}>
        <Text style={styles.f}>F</Text>
      </LinearGradient>
      <View>
        <Text style={[styles.word,{color:theme.text},compact&&styles.wordCompact]}>FORGE</Text>
        {!compact && <Text style={[styles.sub,{color:theme.amber}]}>ADAPT · EXECUTE · EVOLVE</Text>}
      </View>
    </View>
  )
}
const styles=StyleSheet.create({
  wrap:{flexDirection:'row',alignItems:'center',gap:10},
  compact:{gap:8},
  badge:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',transform:[{skewX:'-8deg'}]},
  f:{fontSize:25,fontWeight:'1000',color:'#120B03',fontStyle:'italic',letterSpacing:-2},
  word:{fontSize:28,fontWeight:'1000',fontStyle:'italic',letterSpacing:-1.4,lineHeight:29},
  wordCompact:{fontSize:23,lineHeight:24},
  sub:{fontSize:7.7,fontWeight:'900',letterSpacing:1.7,marginTop:2}
});
