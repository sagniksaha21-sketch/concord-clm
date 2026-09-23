import React,{useMemo,useState} from 'react';
import {Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {ForgeBrand} from '@/components/ForgeBrand';
import {Body3D,BodyMuscleGroup} from '@/components/Body3D';
import {useForge,exercises,exerciseMap} from '@/store/ForgeProvider';
import {bodyGroup,rankedSubstitutes} from '@/utils/training';

export default function ExercisePicker(){
 const router=useRouter(),params=useLocalSearchParams<{mode?:string;programId?:string;index?:string;exerciseId?:string}>();
 const {theme,replaceCurrentExercise,addProgramExercise,replaceProgramExercise}=useForge();
 const current:any=params.exerciseId?exerciseMap[params.exerciseId]:null;
 const [q,setQ]=useState(''),[groups,setGroups]=useState<BodyMuscleGroup[]>(()=>{const g=bodyGroup(current?.group);return g?[g]:[]});
 const ranked=useMemo(()=>params.mode==='workout'&&current?rankedSubstitutes(current.id).map(x=>x.exercise):(exercises as any[]),[params.mode,current?.id]);
 const list=ranked.filter((e:any)=>{const term=q.trim().toLowerCase(),g=bodyGroup(e.group);return(!term||(`${e.name} ${e.group} ${e.movement}`).toLowerCase().includes(term))&&(!groups.length||(g&&groups.includes(g)));});
 function choose(id:string){if(params.mode==='workout')replaceCurrentExercise(id);else if(params.mode==='programAdd'&&params.programId)addProgramExercise(params.programId,id);else if(params.mode==='programReplace'&&params.programId)replaceProgramExercise(params.programId,Number(params.index||0),id);router.back();}
 return <SafeAreaView style={[styles.safe,{backgroundColor:theme.bg}]}><View style={styles.header}><ForgeBrand compact/><Pressable onPress={()=>router.back()}><Text style={[styles.close,{color:theme.muted}]}>CLOSE</Text></Pressable></View><ScrollView contentContainerStyle={styles.content}>
  <Text style={[styles.kicker,{color:theme.amber}]}>{params.mode==='workout'?'SMART SUBSTITUTE':'EXERCISE LIBRARY'}</Text><Text style={[styles.h1,{color:theme.text}]}>{current?`Replace ${current.name}`:'Choose the movement.'}</Text><Text style={[styles.copy,{color:theme.muted}]}>{params.mode==='workout'?'Best matches are ranked by movement pattern, muscle group and equipment style.':'Tap muscle regions to filter the full 85-exercise library.'}</Text>
  <Body3D groups={groups} selectable onSelectionChange={setGroups} height={300}/>
  <TextInput value={q} onChangeText={setQ} placeholder="Search exercise, muscle or movement" placeholderTextColor={theme.muted} style={[styles.search,{color:theme.text,borderColor:theme.line,backgroundColor:theme.panel}]}/>
  <View style={styles.summary}><Text style={[styles.micro,{color:theme.muted}]}>{list.length} MATCHES</Text>{groups.length?<Pressable onPress={()=>setGroups([])}><Text style={[styles.micro,{color:theme.gold}]}>CLEAR BODY FILTER</Text></Pressable>:null}</View>
  <View>{list.slice(0,50).map((e:any,i:number)=><Pressable key={e.id} onPress={()=>choose(e.id)} style={[styles.row,{borderColor:theme.line}]}><View style={{flex:1,minWidth:0}}><View style={styles.nameRow}><Text style={[styles.name,{color:theme.text}]}>{e.name}</Text>{params.mode==='workout'&&i<3?<Text style={[styles.best,{color:theme.amber,borderColor:theme.amber}]}>BEST MATCH</Text>:null}</View><Text style={[styles.meta,{color:theme.muted}]}>{e.group} · {String(e.movement).replaceAll('_',' ')} · {e.bodyweight?'bodyweight':`${e.increment||2.5} kg steps`}</Text></View><Text style={{fontSize:20,color:theme.gold}}>›</Text></Pressable>)}</View>
 </ScrollView></SafeAreaView>
}
const styles=StyleSheet.create({safe:{flex:1},header:{height:60,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},close:{fontSize:8.5,fontWeight:'900',letterSpacing:1.2},content:{padding:16,paddingBottom:42,gap:13},kicker:{fontSize:8.5,fontWeight:'900',letterSpacing:1.5},h1:{fontSize:28,fontWeight:'900',letterSpacing:-1},copy:{fontSize:10.5,lineHeight:16,fontWeight:'600'},search:{height:48,borderWidth:1,borderRadius:15,paddingHorizontal:13,fontWeight:'700'},summary:{flexDirection:'row',justifyContent:'space-between'},micro:{fontSize:8,fontWeight:'900',letterSpacing:.8},row:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:13,borderBottomWidth:1},nameRow:{flexDirection:'row',gap:7,alignItems:'center'},name:{fontSize:12.5,fontWeight:'900',flexShrink:1},best:{fontSize:6.5,fontWeight:'900',letterSpacing:.6,borderWidth:1,borderRadius:999,paddingHorizontal:6,paddingVertical:3},meta:{fontSize:8.5,fontWeight:'600',marginTop:4}});
