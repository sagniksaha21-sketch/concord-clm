import React from 'react';
import { View, Text, StyleSheet, Pressable, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { GlassCard } from '@/components/GlassCard';
import { ForgeButton } from '@/components/ForgeButton';
import { ProgrammeArt } from '@/components/ProgrammeArt';
import { SectionTitle } from '@/components/SectionTitle';
import { Body3D } from '@/components/Body3D';
import { useForge, exerciseMap } from '@/store/ForgeProvider';
import {programMuscles} from '@/utils/training';
import {trainingRecommendation} from '@/utils/adaptiveTraining';

export default function Train(){
 const router=useRouter();
 const {state,theme,selectProgram,startWorkout,getProgram,programList}=useForge();
 const selected=getProgram(state.selectedProgramId),active=!!state.workout?.startedAt,groups=programMuscles(selected.exercises),recommendation=trainingRecommendation(state);
 return <Screen>
   <SectionTitle eyebrow="TRAIN" title={active?'Workout in progress':'Choose the work.'}/>
   <View style={[styles.hero,{borderColor:theme.line}]}><ImageBackground source={require('../../assets/splash/02.jpg')} resizeMode="cover" style={styles.heroImage} imageStyle={styles.heroImageRadius}><View style={styles.heroShade}/>
    <View style={styles.heroContent}>
     <View style={{flex:1,minWidth:0}}>
      <Text style={[styles.eyebrow,{color:theme.amber}]}>SELECTED PROGRAMME</Text>
      <Text style={[styles.title,{color:theme.text}]}>{selected.name}</Text>
      <Text style={[styles.meta,{color:theme.muted}]}>{selected.subtitle} · {selected.exercises.length} exercises</Text>
      <View style={styles.tags}>{selected.exercises.slice(0,3).map(id=><Text key={id} style={[styles.tag,{color:theme.text,borderColor:theme.line}]}>{exerciseMap[id]?.name}</Text>)}</View>
     </View>
     <ProgrammeArt id={selected.id} style={styles.art}/>
    </View>
    <ForgeButton label={active?'Resume workout':'Start this programme'} onPress={()=>{if(!active)startWorkout(selected.id);router.push('/workout')}}/>
    <ForgeButton label="Open Programme Builder" onPress={()=>router.push('/program-builder')} ghost/>
   </ImageBackground></View>

   <View style={[styles.adaptive,{borderColor:theme.line}]}><View style={{flex:1}}><Text style={[styles.eyebrow,{color:theme.gold}]}>FORGE INTELLIGENCE · {recommendation.kind.replace('_',' ')}</Text><Text style={[styles.adaptiveTitle,{color:theme.text}]}>{recommendation.title}</Text><Text style={[styles.note,{color:theme.muted,marginTop:4}]}>{recommendation.detail}</Text></View><View style={{alignItems:'flex-end',gap:8}}><Text style={[styles.factor,{color:theme.gold}]}>{Math.round(recommendation.volumeFactor*100)}%</Text>{!active&&recommendation.requiresAcceptance&&recommendation.volumeFactor<1&&<Pressable onPress={()=>{startWorkout(selected.id,recommendation.volumeFactor);router.push('/workout')}} style={[styles.accept,{borderColor:theme.amber}]}><Text style={[styles.acceptText,{color:theme.gold}]}>ACCEPT {Math.round(recommendation.volumeFactor*100)}%</Text></Pressable>}</View></View>
   <SectionTitle eyebrow="ANATOMY" title="What this session is built to hit"/>
   <Body3D groups={groups} height={288}/>
   <Text style={[styles.note,{color:theme.muted}]}>Drag the body to rotate. The highlighted regions come from the selected programme’s exercise mix.</Text>

   <SectionTitle eyebrow="PROGRAMMES" title="Training library"/>
   <View style={{gap:10}}>
    {programList.map(p=>{
      const on=p.id===state.selectedProgramId;
      return <Pressable key={p.id} onPress={()=>{selectProgram(p.id)}} onLongPress={()=>{selectProgram(p.id);router.push('/program-builder')}}>
       <GlassCard style={[styles.program,on&&{borderColor:theme.amber}]}>
        <ProgrammeArt id={p.id} style={styles.thumb}/>
        <View style={{flex:1,minWidth:0}}>
         <Text style={[styles.programName,{color:theme.text}]}>{p.name}</Text>
         <Text style={[styles.meta,{color:theme.muted}]}>{p.subtitle}</Text>
         <View style={styles.targets}>{p.exercises.slice(0,3).map(id=><Text key={id} numberOfLines={1} style={[styles.target,{color:theme.gold,borderColor:theme.amber+'33'}]}>{exerciseMap[id]?.name}</Text>)}</View>
         <Text style={[styles.small,{color:on?theme.gold:theme.muted}]}>{on?'SELECTED · TAP TO START / HOLD TO EDIT':`${p.exercises.length} EXERCISES · HOLD TO EDIT`}</Text>
        </View>
        <View style={styles.programActions}><Pressable onPress={()=>{selectProgram(p.id);router.push('/program-builder')}} style={[styles.edit,{borderColor:theme.line}]}><Text style={[styles.editText,{color:theme.muted}]}>EDIT</Text></Pressable><Text style={{color:on?theme.amber:theme.muted,fontSize:19,fontWeight:'900'}}>{on?'◆':'›'}</Text></View>
       </GlassCard>
      </Pressable>
    })}
   </View>
 </Screen>
}
const styles=StyleSheet.create({heroImage:{padding:16,gap:14,minHeight:330,justifyContent:'flex-end'},heroImageRadius:{borderRadius:24},heroShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(0,0,0,.58)',borderRadius:24},hero:{borderWidth:1,borderRadius:24,overflow:'hidden'},accept:{borderWidth:1,paddingHorizontal:10,paddingVertical:7},acceptText:{fontSize:7,fontWeight:'900',letterSpacing:1},adaptive:{borderTopWidth:1,borderBottomWidth:1,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12},adaptiveTitle:{fontSize:15,fontWeight:'900',marginTop:5},factor:{fontSize:22,fontWeight:'900'},heroContent:{flexDirection:'row',gap:14,alignItems:'center'},art:{width:94,height:118},eyebrow:{fontSize:8.5,fontWeight:'900',letterSpacing:1.4},title:{fontSize:25,fontWeight:'900',letterSpacing:-.8,marginTop:5},meta:{fontSize:10.5,lineHeight:15,fontWeight:'600',marginTop:4},tags:{gap:5,marginTop:10},tag:{fontSize:8.5,fontWeight:'700',paddingHorizontal:8,paddingVertical:5,borderRadius:999,borderWidth:1,alignSelf:'flex-start'},program:{flexDirection:'row',alignItems:'center',gap:12,padding:10,minHeight:112},thumb:{width:74,height:92,borderRadius:15},programName:{fontSize:19,fontWeight:'900',letterSpacing:-.35},targets:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:8},target:{fontSize:7.5,fontWeight:'800',paddingHorizontal:6,paddingVertical:4,borderRadius:999,borderWidth:1,maxWidth:120},programActions:{width:52,alignItems:'center',gap:12},edit:{height:34,minWidth:46,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center'},editText:{fontSize:8,fontWeight:'900',letterSpacing:.7},small:{fontSize:8,fontWeight:'900',letterSpacing:1.1,marginTop:8},note:{fontSize:9.5,lineHeight:14,fontWeight:'600',marginTop:-6,paddingHorizontal:2}});
