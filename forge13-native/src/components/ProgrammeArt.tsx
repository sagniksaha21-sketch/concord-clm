
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
const art:any = {
  pushA: require('../../assets/programmes/chest-shoulders.jpg'),
  pullA: require('../../assets/programmes/back-biceps.jpg'),
  legsA: require('../../assets/programmes/legs-triceps.jpg'),
  chestDay: require('../../assets/programmes/chest-shoulders.jpg'),
  backDay: require('../../assets/programmes/back-biceps.jpg'),
  legsDay: require('../../assets/programmes/legs-triceps.jpg'),
};
export function ProgrammeArt({id,style}:{id:string;style?:any}) {
  const src=art[id] || art.pushA;
  return <View style={[styles.shell,style]}><Image source={src} style={styles.img}/></View>;
}
const styles=StyleSheet.create({shell:{overflow:'hidden',borderRadius:18,backgroundColor:'#12100D'},img:{width:'100%',height:'100%',resizeMode:'cover'}});
