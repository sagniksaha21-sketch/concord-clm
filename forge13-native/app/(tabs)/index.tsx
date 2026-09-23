import React from 'react';
import {View,Text,StyleSheet,Pressable,ImageBackground} from 'react-native';
import {useRouter} from 'expo-router';
import {Screen} from '@/components/Screen';
import {ForgeButton} from '@/components/ForgeButton';
import {Metric} from '@/components/Metric';
import {ProgressBar} from '@/components/ProgressBar';
import {useForge,programs} from '@/store/ForgeProvider';
import {hallOfFame,last30,latestSession,weekSessions} from '@/utils/analytics';
import {tons,shortDate} from '@/utils/format';
import {readiness} from '@/utils/readiness';
import {coachAction} from '@/utils/coach';

export default function Today(){
 const router=useRouter(),{state,theme,startWorkout}=useForge();
 const prog:any=(programs as any)[state.selectedProgramId]||(programs as any).pushA;
 const tr=last30(state),last=latestSession(state),hof=hallOfFame(state),week=weekSessions(state),ready=readiness(state),coach=coachAction(state),active=!!state.workout?.startedAt;
 const calPct=state.calTarget?state.kcal/state.calTarget*100:0,proPct=state.proteinTarget?state.protein/state.proteinTarget*100:0;
 return <Screen>
  <ImageBackground source={require('../../assets/splash/01.jpg')} imageStyle={s.heroImage} style={s.hero}>
   <View style={s.heroShade}/><View style={s.heroTop}><Text style={[s.phase,{color:theme.gold}]}>COMMAND / TODAY</Text><Text style={[s.phase,{color:theme.amber}]}>{String(state.phase).toUpperCase()}</Text></View>
   <View><Text style={[s.overline,{color:theme.amber}]}>{active?'SESSION IN PROGRESS':'TODAY / PRIMARY MISSION'}</Text><Text style={[s.h1,{color:theme.text}]}>{active?'Finish what you started.':'Build the next version.'}</Text><Text style={[s.heroCopy,{color:theme.text}]}>{prog.name} · {prog.exercises.length} exercises</Text></View>
  </ImageBackground>
  <ForgeButton label={active?'RESUME WORKOUT':'START WORKOUT'} onPress={()=>{if(!active)startWorkout();router.push('/workout')}}/>
  <View style={[s.signal,{borderColor:theme.line}]}>
   <View style={s.score}><Text style={[s.overline,{color:theme.teal}]}>TRAINING SIGNAL</Text><Text style={[s.signalBand,{color:theme.text}]}>{ready.band}</Text><Text style={[s.phase,{color:theme.muted}]}>HISTORY-BASED · {ready.score}/100</Text></View>
   <View style={{flex:1}}><Text style={[s.overline,{color:theme.gold}]}>FORGE COACH · {coach.action}</Text><Text style={[s.signalTitle,{color:theme.text}]}>{coach.title}</Text><Text style={[s.micro,{color:theme.muted}]}>{coach.why}</Text><Text style={[s.evidence,{color:theme.muted}]}>Based only on sessions recorded in FORGE · no watch, ring or sensor data.</Text></View>
  </View>
  <View><Text style={[s.sectionKicker,{color:theme.amber}]}>THE WORK / 30 DAYS</Text><Text style={[s.sectionTitle,{color:theme.text}]}>Momentum at a glance.</Text></View>
  <View style={[s.metrics,{borderColor:theme.line}]}><Metric value={tr.sessions} label="sessions"/><Metric value={tr.sets} label="working sets"/><Metric value={tons(tr.volume)} label="volume" accent/></View>
  <View style={s.week}><View><Text style={[s.overline,{color:theme.amber}]}>THIS WEEK</Text><Text style={[s.weekValue,{color:theme.text}]}>{week}</Text><Text style={[s.micro,{color:theme.muted}]}>sessions forged</Text></View><Pressable onPress={()=>router.push('/(tabs)/analytics')}><Text style={[s.overline,{color:theme.gold}]}>HALL OF FAME</Text><Text style={[s.weekValue,{color:theme.text}]}>{hof.length}</Text><Text style={[s.micro,{color:theme.muted}]}>earned marks ›</Text></Pressable></View>
  <View style={[s.fuel,{borderColor:theme.line}]}><View style={s.row}><View><Text style={[s.overline,{color:theme.amber}]}>FUEL STATUS</Text><Text style={[s.fuelTitle,{color:theme.text}]}>{Math.round(state.kcal).toLocaleString()} / {state.calTarget.toLocaleString()} kcal</Text></View><Text style={[s.phase,{color:theme.gold}]}>{Math.max(0,state.calTarget-state.kcal).toLocaleString()} LEFT</Text></View><View style={{gap:8,marginTop:12}}><ProgressBar value={calPct}/><View style={s.row}><Text style={[s.micro,{color:theme.muted}]}>Protein</Text><Text style={[s.micro,{color:theme.text}]}>{Math.round(state.protein)} / {state.proteinTarget}g</Text></View><ProgressBar value={proPct}/></View></View>
  <Text style={[s.micro,{color:theme.muted}]}>{last?`Last forged ${shortDate(last.date)} · ${last.name}`:'Your training history becomes the intelligence layer as you log sessions.'}</Text>
 </Screen>
}
const s=StyleSheet.create({hero:{minHeight:300,justifyContent:'space-between',padding:20,overflow:'hidden'},heroImage:{opacity:.68},heroShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(0,0,0,.43)'},heroTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},wordmark:{fontSize:22,fontWeight:'900',fontStyle:'italic',letterSpacing:-1},phase:{fontSize:8,fontWeight:'900',letterSpacing:1.1},overline:{fontSize:8,fontWeight:'900',letterSpacing:1.45},h1:{fontSize:38,lineHeight:38,fontWeight:'900',letterSpacing:-1.8,marginTop:8,maxWidth:310},heroCopy:{fontSize:12,fontWeight:'800',marginTop:9},signal:{borderTopWidth:1,borderBottomWidth:1,paddingVertical:15,flexDirection:'row',gap:18,alignItems:'center'},score:{width:116},signalBand:{fontSize:21,fontWeight:'900',letterSpacing:-.8,marginTop:5},evidence:{fontSize:7.5,lineHeight:11,fontWeight:'800',letterSpacing:.25,marginTop:7},signalTitle:{fontSize:17,fontWeight:'900',letterSpacing:-.4,marginTop:5},micro:{fontSize:9.5,lineHeight:14,fontWeight:'600'},sectionKicker:{fontSize:8,fontWeight:'900',letterSpacing:1.5},sectionTitle:{fontSize:24,fontWeight:'900',letterSpacing:-.8,marginTop:5},metrics:{flexDirection:'row',borderTopWidth:1,borderBottomWidth:1,paddingVertical:13,gap:8},week:{flexDirection:'row',justifyContent:'space-between',paddingVertical:4},weekValue:{fontSize:34,fontWeight:'900',letterSpacing:-1.4,marginTop:5},fuel:{borderLeftWidth:2,paddingLeft:13,paddingVertical:4},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},fuelTitle:{fontSize:19,fontWeight:'900',letterSpacing:-.4,marginTop:4}});
