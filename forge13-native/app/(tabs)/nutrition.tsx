
import React,{useState} from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { GlassCard } from '@/components/GlassCard';
import { ForgeButton } from '@/components/ForgeButton';
import { ProgressBar } from '@/components/ProgressBar';
import { SectionTitle } from '@/components/SectionTitle';
import { useForge } from '@/store/ForgeProvider';
import {readiness} from '@/utils/readiness';

export default function Nutrition(){
 const {state,theme,addFood,resetDayNutrition}=useForge();
 const [name,setName]=useState('Meal');
 const [kcal,setKcal]=useState('350'),[protein,setProtein]=useState('30'),[carbs,setCarbs]=useState('35'),[fat,setFat]=useState('10');
 const ready=readiness(state);
 const dayType=ready.band==='RECOVER'?'RECOVERY':ready.band==='READY'?'TRAINING':'BALANCED';
 const pct=state.calTarget?state.kcal/state.calTarget*100:0;
 const ppct=state.proteinTarget?state.protein/state.proteinTarget*100:0;
 const log=()=>{addFood({name:name||'Meal',kcal:Number(kcal)||0,p:Number(protein)||0,c:Number(carbs)||0,f:Number(fat)||0,at:Date.now()});};
 return <Screen>
  <SectionTitle eyebrow="NUTRITION" title="Fuel the work."/>
  <View style={[styles.context,{borderColor:theme.line}]}><Text style={[styles.label,{color:theme.gold}]}>TODAY · {dayType}</Text><Text style={[styles.micro,{color:theme.muted}]}>Targets remain yours. Forge uses training context as guidance and does not silently change calories or macros.</Text></View>
  <View style={[styles.fuel,{borderColor:theme.line}]}>
   <Text style={[styles.big,{color:theme.text}]}>{Math.round(state.kcal).toLocaleString()} <Text style={{fontSize:18,color:theme.muted}}>/ {state.calTarget.toLocaleString()} kcal</Text></Text>
   <Text style={[styles.micro,{color:theme.muted,marginTop:4}]}>{Math.max(0,state.calTarget-state.kcal).toLocaleString()} kcal remaining</Text>
   <View style={{marginTop:15,gap:8}}><ProgressBar value={pct}/><Text style={[styles.micro,{color:theme.text}]}>{Math.round(state.protein)} / {state.proteinTarget}g protein</Text><ProgressBar value={ppct}/></View>
   <View style={styles.macroRow}>
    {[['Protein',state.protein,'g'],['Carbs',state.carbs,'g'],['Fat',state.fat,'g']].map(([l,v,u]:any)=><View key={l} style={{flex:1}}><Text style={[styles.macro,{color:theme.text}]}>{Math.round(v)}{u}</Text><Text style={[styles.label,{color:theme.muted}]}>{l}</Text></View>)}
   </View>
  </View>

  <SectionTitle eyebrow="QUICK LOG" title="Add a meal"/>
  <GlassCard>
   <TextInput value={name} onChangeText={setName} placeholder="Meal name" placeholderTextColor={theme.muted} style={[styles.input,{color:theme.text,borderColor:theme.line,backgroundColor:theme.panel2}]}/>
   <View style={styles.grid}>
    {[
      ['Calories',kcal,setKcal],['Protein',protein,setProtein],['Carbs',carbs,setCarbs],['Fat',fat,setFat]
    ].map(([l,v,set]:any)=><View key={l} style={{width:'48%'}}><Text style={[styles.label,{color:theme.muted}]}>{l}</Text><TextInput value={v} onChangeText={set} keyboardType="decimal-pad" style={[styles.input,{color:theme.text,borderColor:theme.line,backgroundColor:theme.panel2}]}/></View>)}
   </View>
   <ForgeButton label="Log meal" onPress={log}/>
  </GlassCard>

  <SectionTitle eyebrow="RECENT" title="Today’s food"/>
  <View style={{gap:9}}>
   {(state.foodLog||[]).slice(0,6).map((f,i)=><GlassCard key={`${f.at}-${i}`} style={styles.rowCard}>
      <View style={{flex:1}}><Text style={[styles.food,{color:theme.text}]}>{f.name}</Text><Text style={[styles.micro,{color:theme.muted}]}>{Math.round(f.p||0)}g protein · {Math.round(f.c||0)}g carbs · {Math.round(f.f||0)}g fat</Text></View>
      <Text style={[styles.kcal,{color:theme.gold}]}>{Math.round(f.kcal)} kcal</Text>
   </GlassCard>)}
   {!state.foodLog.length && <GlassCard><Text style={[styles.micro,{color:theme.muted}]}>Nothing logged yet.</Text></GlassCard>}
  </View>
  <Pressable onPress={resetDayNutrition}><Text style={[styles.reset,{color:theme.muted}]}>Reset today’s macro totals</Text></Pressable>
 </Screen>
}
const styles=StyleSheet.create({
 fuel:{borderTopWidth:1,borderBottomWidth:1,paddingVertical:18},context:{borderBottomWidth:1,paddingBottom:13,gap:3},big:{fontSize:31,fontWeight:'900',letterSpacing:-1.2},micro:{fontSize:10.5,lineHeight:15,fontWeight:'600'},
 macroRow:{flexDirection:'row',marginTop:18,gap:10},macro:{fontSize:20,fontWeight:'900'},label:{fontSize:8,fontWeight:'900',letterSpacing:1.1,textTransform:'uppercase',marginBottom:5},
 input:{height:45,borderWidth:1,borderRadius:13,paddingHorizontal:12,fontSize:13,fontWeight:'700',marginBottom:11},
 grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},rowCard:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:13},food:{fontSize:14,fontWeight:'900'},kcal:{fontSize:11,fontWeight:'900'},reset:{textAlign:'center',fontSize:9,fontWeight:'700',paddingVertical:6}
});
