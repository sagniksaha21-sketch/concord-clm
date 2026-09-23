
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useForge } from '../store/ForgeProvider';
export function SectionTitle({eyebrow,title,right}:{eyebrow:string;title:string;right?:React.ReactNode}) {
 const {theme}=useForge();
 return <View style={styles.row}><View style={{flex:1}}>
   <Text style={[styles.eyebrow,{color:theme.amber}]}>{eyebrow}</Text>
   <Text style={[styles.title,{color:theme.text}]}>{title}</Text>
 </View>{right}</View>
}
const styles=StyleSheet.create({row:{flexDirection:'row',alignItems:'flex-end',gap:12},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.6},title:{fontSize:24,fontWeight:'900',letterSpacing:-.7,marginTop:4}});
