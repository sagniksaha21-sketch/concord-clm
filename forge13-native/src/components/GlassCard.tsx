
import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useForge } from '../store/ForgeProvider';
import {V14} from '../theme';
export function GlassCard({children,style}:{children:React.ReactNode;style?:StyleProp<ViewStyle>}) {
  const {theme}=useForge();
  return <View style={[styles.card,{backgroundColor:theme.panel,borderColor:theme.line},style]}>{children}</View>
}
const styles=StyleSheet.create({card:{borderWidth:1,borderRadius:V14.radius.surface,padding:V14.space.surface,overflow:'hidden'}});
