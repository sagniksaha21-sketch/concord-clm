
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useForge } from '../store/ForgeProvider';
export function GlassCard({children,style}:{children:React.ReactNode;style?:ViewStyle|ViewStyle[]}) {
  const {theme}=useForge();
  return <View style={[styles.card,{backgroundColor:theme.panel,borderColor:theme.line},style]}>{children}</View>
}
const styles=StyleSheet.create({card:{borderWidth:1,borderRadius:22,padding:16,overflow:'hidden'}});
