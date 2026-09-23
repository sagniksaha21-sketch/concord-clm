import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {useRouter} from 'expo-router';
import { Screen } from '@/components/Screen';
import { GlassCard } from '@/components/GlassCard';
import { Metric } from '@/components/Metric';
import { SectionTitle } from '@/components/SectionTitle';
import {Body3D} from '@/components/Body3D';
import { useForge } from '@/store/ForgeProvider';
import { hallOfFame, last30 } from '@/utils/analytics';
import {topMuscles} from '@/utils/training';
import { tons, shortDate } from '@/utils/format';
import {muscleIntelligence} from '@/utils/muscleIntelligence';

export default function Analytics(){
 const router=useRouter(),{state,theme}=useForge(); const tr=last30(state),hof=hallOfFame(state),featured=hof[0],body=state.bodyLogs?.at(-1),muscles=topMuscles(state),muscleStates=muscleIntelligence(state);
 return <Screen>
  <SectionTitle eyebrow="ANALYTICS" title="Evidence, not noise."/>
  <View style={styles.metrics}><GlassCard style={styles.metricCard}><Metric value={tr.sessions} label="30d sessions"/></GlassCard><GlassCard style={styles.metricCard}><Metric value={tr.sets} label="working sets"/></GlassCard><GlassCard style={styles.metricCard}><Metric value={tons(tr.volume)} label="volume" accent/></GlassCard></View>
  <SectionTitle eyebrow="FORGE HALL OF FAME" title="Every mark earned under load."/>
  <GlassCard style={styles.hof}><View style={styles.hofTop}><View style={[styles.crown,{backgroundColor:theme.amber}]}><Text style={styles.crownText}>◆</Text></View><View style={{flex:1}}><Text style={[styles.eyebrow,{color:theme.amber}]}>FEATURED MARK</Text><Text style={[styles.hofName,{color:theme.text}]}>{featured?.name || 'Your first record belongs here.'}</Text><Text style={[styles.hofValue,{color:theme.gold}]}>{featured?`${featured.weight} kg × ${featured.reps}`:'No marks yet'}</Text><Text style={[styles.micro,{color:theme.muted}]}>{featured?shortDate(featured.date):'Train. Progress. Earn the plaque.'}</Text></View></View>
    <View style={styles.plaques}>{hof.slice(0,14).map((r,i)=><Pressable key={`${r.exerciseId}-${i}`} style={{width:'48.5%'}} onPress={()=>router.push({pathname:'/exercise-history',params:{exerciseId:r.exerciseId}})}><View style={[styles.plaque,{borderColor:theme.line,backgroundColor:theme.panel2}]}><Text style={[styles.plaqueName,{color:theme.text}]} numberOfLines={2}>{r.name}</Text><Text style={[styles.plaqueMark,{color:theme.gold}]}>{r.weight} kg × {r.reps}</Text><Text style={[styles.micro,{color:theme.muted}]}>{shortDate(r.date)} · OPEN ›</Text></View></Pressable>)}</View>
  </GlassCard>
  <SectionTitle eyebrow="FHM3 · MUSCLE INTELLIGENCE" title="Your training map, with memory."/>
  <View style={styles.muscleGrid}>{muscleStates.map(m=><View key={m.group} style={[styles.muscleRow,{borderColor:theme.line}]}><View style={{flex:1}}><Text style={[styles.muscleName,{color:theme.text}]}>{m.group}</Text><Text style={[styles.micro,{color:theme.muted}]}>{m.sets} working sets · {tons(m.volume)} volume</Text></View><View style={{alignItems:'flex-end'}}><Text style={[styles.muscleStatus,{color:m.status==='RECENT'?theme.ember:m.status==='READY'?theme.teal:theme.gold}]}>{m.status}</Text><Text style={[styles.micro,{color:theme.muted}]}>{m.daysSince==null?'no recent history':m.daysSince<1?'today':`${Math.floor(m.daysSince)}d ago`}</Text></View></View>)}</View>
  <SectionTitle eyebrow="BODY" title="Physique + training distribution"/>
  <GlassCard style={{gap:13}}><Body3D groups={muscles} height={308}/><View style={styles.bodyStats}><View><Text style={[styles.eyebrow,{color:theme.amber}]}>CURRENT WEIGHT</Text><Text style={[styles.bodyValue,{color:theme.text}]}>{body?.weight?`${Number(body.weight).toFixed(1)} kg`:'—'}</Text></View><View><Text style={[styles.eyebrow,{color:theme.amber}]}>GOAL</Text><Text style={[styles.bodyValue,{color:theme.text}]}>{Number(state.goals?.weight||0).toFixed(1)} kg</Text></View></View><Text style={[styles.micro,{color:theme.muted}]}>Highlighted regions reflect your highest recorded training volume over the last 30 days. Drag to rotate the native 3D body.</Text></GlassCard>
  <SectionTitle eyebrow="PROGRESS STUDIO" title="Photos that stay useful"/><GlassCard><Text style={[styles.hofName,{color:theme.text}]}>Compare the work, not the lighting.</Text><Text style={[styles.micro,{color:theme.muted,marginVertical:9}]}>{state.progressPhotos.length} progress photo{state.progressPhotos.length===1?'':'s'} saved locally.</Text><Pressable onPress={()=>router.push('/progress-photos')} style={[styles.open,{borderColor:theme.line,backgroundColor:theme.panel2}]}><Text style={[styles.openText,{color:theme.gold}]}>OPEN PROGRESS PHOTO STUDIO ›</Text></Pressable></GlassCard>
 </Screen>
}
const styles=StyleSheet.create({muscleGrid:{gap:0},muscleRow:{minHeight:58,borderBottomWidth:1,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:10},muscleName:{fontSize:14,fontWeight:'900'},muscleStatus:{fontSize:8,fontWeight:'900',letterSpacing:1.1},metrics:{flexDirection:'row',gap:9},metricCard:{flex:1,padding:12,minHeight:92},hof:{gap:14},hofTop:{flexDirection:'row',gap:13},crown:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},crownText:{color:'#160D03',fontSize:18,fontWeight:'900'},eyebrow:{fontSize:8.5,fontWeight:'900',letterSpacing:1.45},hofName:{fontSize:19,fontWeight:'900',letterSpacing:-.5,marginTop:5},hofValue:{fontSize:18,fontWeight:'900',marginTop:5},micro:{fontSize:9.5,lineHeight:14,fontWeight:'600'},plaques:{flexDirection:'row',flexWrap:'wrap',gap:8},plaque:{width:'100%',borderWidth:1,borderRadius:16,padding:11,minHeight:105},plaqueName:{fontSize:11,fontWeight:'900',lineHeight:14},plaqueMark:{fontSize:13,fontWeight:'900',marginTop:12},bodyStats:{flexDirection:'row',justifyContent:'space-between',gap:16},bodyValue:{fontSize:25,fontWeight:'900',marginTop:3},open:{borderWidth:1,borderRadius:14,padding:13,alignItems:'center'},openText:{fontSize:8.5,fontWeight:'900',letterSpacing:.8}});
