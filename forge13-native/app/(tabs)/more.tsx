import React from 'react';
import {View,Text,StyleSheet,Pressable,Alert,ScrollView} from 'react-native';
import {useRouter} from 'expo-router';
import {Screen} from '@/components/Screen';
import {GlassCard} from '@/components/GlassCard';
import {ForgeButton} from '@/components/ForgeButton';
import {SectionTitle} from '@/components/SectionTitle';
import {useForge} from '@/store/ForgeProvider';
import {THEMES,ForgeThemeName} from '@/theme';
import {pickForgeBackup,shareForgeBackup} from '@/services/backup';
export default function More(){
 const router=useRouter();
 const {theme,themeName,setTheme,importState,exportState,state,setRestDuration,setRestNotifications}=useForge();
 async function importBackup(){try{const raw=await pickForgeBackup();if(raw){await importState(raw);Alert.alert('FORGE','Backup imported into the native app.')}}catch(e:any){Alert.alert('Import failed',e?.message||'Could not read that file.')}}
 async function exportBackup(){try{const json=await exportState();await shareForgeBackup(json)}catch(e:any){Alert.alert('Export failed',e?.message||'Could not export backup.')}}

 return <Screen>
  <SectionTitle eyebrow="MORE" title="Your Forge, your way."/>
  <SectionTitle eyebrow="APPEARANCE" title="Theme"/>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeGrid}>{(Object.entries(THEMES) as any).map(([key,t]:[ForgeThemeName,any])=><Pressable key={key} onPress={()=>setTheme(key)} style={[styles.themeCard,{backgroundColor:t.panel,borderColor:key===themeName?t.amber:t.line}]}><View style={[styles.swatch,{backgroundColor:t.amber}]}/><Text style={[styles.themeName,{color:t.text}]}>{t.name}</Text><Text style={[styles.micro,{color:t.muted}]}>{key===themeName?'ACTIVE':'TAP TO APPLY'}</Text></Pressable>)}</ScrollView>

  <SectionTitle eyebrow="TRAINING" title="Rest timer"/>
  <GlassCard>
   <View style={styles.row}><View><Text style={[styles.title,{color:theme.text}]}>Automatic set rest</Text><Text style={[styles.copy,{color:theme.muted,marginVertical:3}]}>Starts after every logged set.</Text></View><Text style={[styles.restValue,{color:theme.gold}]}>{state.settings.restSeconds}s</Text></View>
   <View style={styles.restGrid}>{[60,90,120,180].map(sec=><Pressable key={sec} onPress={()=>setRestDuration(sec)} style={[styles.restChoice,{borderColor:state.settings.restSeconds===sec?theme.amber:theme.line,backgroundColor:theme.panel2}]}><Text style={[styles.restText,{color:state.settings.restSeconds===sec?theme.gold:theme.muted}]}>{sec}s</Text></Pressable>)}</View>
   <Pressable onPress={async()=>{const next=!state.settings.restNotifications;const ok=await setRestNotifications(next);if(next&&!ok)Alert.alert('Rest alerts','Notification permission was not granted.')}} style={[styles.toggleRow,{borderColor:theme.line}]}><View style={{flex:1}}><Text style={[styles.playlistTitle,{color:theme.text}]}>Background rest-complete alert</Text><Text style={[styles.micro,{color:theme.muted}]}>Useful when the app is minimized between sets.</Text></View><Text style={[styles.toggle,{color:state.settings.restNotifications?theme.gold:theme.muted}]}>{state.settings.restNotifications?'ON':'OFF'}</Text></Pressable>
  </GlassCard>

  <SectionTitle eyebrow="SOCIAL" title="Achievement cards"/>
  <GlassCard><Text style={[styles.title,{color:theme.text}]}>FORGE Share Studio</Text><Text style={[styles.copy,{color:theme.muted}]}>Create PR, workout, consistency and custom achievement cards with your own photos.</Text><ForgeButton label="Open Share Studio" onPress={()=>router.push('/share')}/></GlassCard>

  <SectionTitle eyebrow="DATA" title="Portable by design"/>
  <GlassCard><Text style={[styles.copy,{color:theme.muted}]}>Import or export your Forge JSON backup without wiping your original web data.</Text><View style={{gap:9}}><ForgeButton label="Import Forge backup" onPress={importBackup}/><ForgeButton label="Export native backup" onPress={exportBackup} ghost/></View></GlassCard>
  <GlassCard><View style={styles.row}><Text style={[styles.micro,{color:theme.muted}]}>NATIVE STATE</Text><Text style={[styles.micro,{color:theme.gold}]}>{state.sessions.length} sessions · {state.foodLog.length} foods</Text></View><View style={styles.row}><Text style={[styles.micro,{color:theme.muted}]}>BUILD</Text><Text style={[styles.micro,{color:theme.text}]}>FORGE 14 · DEVELOPMENT</Text></View></GlassCard>
 </Screen>;
}
const styles=StyleSheet.create({
 themeGrid:{flexDirection:'row',gap:9,paddingRight:16},themeCard:{width:132,borderWidth:1,borderRadius:17,padding:11,minHeight:92},swatch:{width:24,height:4,borderRadius:9,marginBottom:12},
 themeName:{fontSize:10,fontWeight:'900',letterSpacing:.4},micro:{fontSize:8.5,fontWeight:'800',letterSpacing:.8,marginTop:5},title:{fontSize:18,fontWeight:'900',letterSpacing:-.4},copy:{fontSize:10.5,lineHeight:16,fontWeight:'600',marginVertical:8},
 row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},playlist:{flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderRadius:14,padding:8},thumb:{width:44,height:44,borderRadius:9},playlistTitle:{fontSize:11,fontWeight:'900'},
 restValue:{fontSize:22,fontWeight:'900'},restGrid:{flexDirection:'row',gap:7,marginVertical:10},restChoice:{flex:1,borderWidth:1,borderRadius:12,paddingVertical:10,alignItems:'center'},restText:{fontSize:9,fontWeight:'900'},toggleRow:{borderTopWidth:1,paddingTop:11,marginTop:2,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},toggle:{fontSize:9,fontWeight:'900',letterSpacing:.7}
});
