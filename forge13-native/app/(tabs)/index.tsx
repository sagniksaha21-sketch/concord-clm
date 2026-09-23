
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { GlassCard } from '@/components/GlassCard';
import { ForgeButton } from '@/components/ForgeButton';
import { ProgrammeArt } from '@/components/ProgrammeArt';
import { Metric } from '@/components/Metric';
import { ProgressBar } from '@/components/ProgressBar';
import { useForge, programs } from '@/store/ForgeProvider';
import { hallOfFame, last30, latestSession, weekSessions } from '@/utils/analytics';
import { tons, shortDate } from '@/utils/format';

export default function Today(){
 const router=useRouter();
 const {state,theme,startWorkout}=useForge();
 const prog:any=(programs as any)[state.selectedProgramId] || (programs as any).pushA;
 const tr=last30(state), last=latestSession(state), hof=hallOfFame(state), week=weekSessions(state);
 const calPct=state.calTarget?state.kcal/state.calTarget*100:0;
 const proPct=state.proteinTarget?state.protein/state.proteinTarget*100:0;
 const active=!!state.workout?.startedAt;
 return <Screen>
   <View style={styles.heroRow}>
    <View style={{flex:1,minWidth:0}}>
      <Text style={[styles.kicker,{color:theme.amber}]}>TODAY · {String(state.phase).toUpperCase()}</Text>
      <Text style={[styles.h1,{color:theme.text}]}>{active?'Finish what you started.':'Build the next version.'}</Text>
      <Text style={[styles.copy,{color:theme.muted}]}>
       {active?`Resume ${prog.name} exactly where you left it.`:`${prog.name} · ${prog.exercises.length} exercises`}
      </Text>
    </View>
    <ProgrammeArt id={state.selectedProgramId} style={styles.heroArt}/>
   </View>

   <ForgeButton label={active?'Resume workout':'Start workout'} onPress={()=>{
     if(!active) startWorkout();
     router.push('/workout');
   }}/>

   <GlassCard>
     <Text style={[styles.eyebrow,{color:theme.amber}]}>30 DAY PERFORMANCE</Text>
     <View style={styles.metrics}>
       <Metric value={tr.sessions} label="sessions"/>
       <Metric value={tr.sets} label="working sets"/>
       <Metric value={tons(tr.volume)} label="volume" accent/>
     </View>
     <Text style={[styles.micro,{color:theme.muted,marginTop:14}]}>
       {last?`Last trained ${shortDate(last.date)} · ${last.name}`:'Training history will build here as you log sessions.'}
     </Text>
   </GlassCard>

   <GlassCard>
     <View style={styles.cardHead}>
       <View>
        <Text style={[styles.eyebrow,{color:theme.amber}]}>NUTRITION</Text>
        <Text style={[styles.cardTitle,{color:theme.text}]}>{Math.round(state.kcal).toLocaleString()} / {state.calTarget.toLocaleString()} kcal</Text>
       </View>
       <Text style={[styles.side,{color:theme.gold}]}>{Math.max(0,state.calTarget-state.kcal).toLocaleString()} left</Text>
     </View>
     <View style={{gap:9,marginTop:14}}>
      <ProgressBar value={calPct}/>
      <View style={styles.rowBetween}><Text style={[styles.micro,{color:theme.muted}]}>Protein</Text><Text style={[styles.micro,{color:theme.text}]}>{Math.round(state.protein)} / {state.proteinTarget}g</Text></View>
      <ProgressBar value={proPct}/>
     </View>
   </GlassCard>

   <View style={styles.two}>
    <GlassCard style={styles.half}>
      <Text style={[styles.eyebrow,{color:theme.amber}]}>THIS WEEK</Text>
      <Text style={[styles.big,{color:theme.text}]}>{week}</Text>
      <Text style={[styles.micro,{color:theme.muted}]}>sessions forged</Text>
    </GlassCard>
    <Pressable style={{flex:1}} onPress={()=>router.push('/(tabs)/analytics')}>
      <GlassCard style={styles.half}>
       <Text style={[styles.eyebrow,{color:theme.amber}]}>HALL OF FAME</Text>
       <Text style={[styles.big,{color:theme.text}]}>{hof.length}</Text>
       <Text style={[styles.micro,{color:theme.muted}]}>earned records</Text>
      </GlassCard>
    </Pressable>
   </View>
 </Screen>
}
const styles=StyleSheet.create({
 heroRow:{flexDirection:'row',gap:14,alignItems:'center'},
 heroArt:{width:112,height:140},
 kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.6},
 h1:{fontSize:31,lineHeight:31,fontWeight:'1000',letterSpacing:-1.4,marginTop:7},
 copy:{fontSize:12,lineHeight:17,fontWeight:'600',marginTop:8},
 eyebrow:{fontSize:8.5,fontWeight:'900',letterSpacing:1.45},
 metrics:{flexDirection:'row',gap:10,marginTop:15},
 micro:{fontSize:10.5,lineHeight:15,fontWeight:'650'},
 cardHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:12},
 cardTitle:{fontSize:18,fontWeight:'900',letterSpacing:-.4,marginTop:4},
 side:{fontSize:10,fontWeight:'900',marginTop:3},
 rowBetween:{flexDirection:'row',justifyContent:'space-between'},
 two:{flexDirection:'row',gap:12},
 half:{flex:1,minHeight:125},
 big:{fontSize:34,fontWeight:'1000',letterSpacing:-1.4,marginTop:8}
});
