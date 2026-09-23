import React,{useEffect,useState} from 'react';
import {View,Text,StyleSheet,Pressable,Image,Linking,Alert} from 'react-native';
import {useRouter} from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as SecureStore from 'expo-secure-store';
import {Screen} from '@/components/Screen';
import {GlassCard} from '@/components/GlassCard';
import {ForgeButton} from '@/components/ForgeButton';
import {SectionTitle} from '@/components/SectionTitle';
import {useForge} from '@/store/ForgeProvider';
import {THEMES,ForgeThemeName} from '@/theme';
import {pickForgeBackup,shareForgeBackup} from '@/services/backup';
import {fetchMyPlaylists,musicHome,musicPlaylistUrl,YouTubePlaylist} from '@/services/youtube';

WebBrowser.maybeCompleteAuthSession();

function GoogleMusic({theme,clientId}:{theme:any;clientId:string}){
 const [playlists,setPlaylists]=useState<YouTubePlaylist[]>([]);
 const [busy,setBusy]=useState(false);
 const [token,setToken]=useState<string|null>(null);
 const [request,response,promptAsync]=Google.useAuthRequest({androidClientId:clientId,scopes:['openid','profile','https://www.googleapis.com/auth/youtube.readonly']});
 useEffect(()=>{SecureStore.getItemAsync('forge_google_access_token').then(setToken).catch(()=>{});},[]);
 useEffect(()=>{if(response?.type==='success'){const t=(response.authentication as any)?.accessToken||(response.params as any)?.access_token;if(t){setToken(t);SecureStore.setItemAsync('forge_google_access_token',t).catch(()=>{});}}},[response]);
 useEffect(()=>{if(!token)return;setBusy(true);fetchMyPlaylists(token).then(setPlaylists).catch(()=>setPlaylists([])).finally(()=>setBusy(false));},[token]);
 const signOut=async()=>{await SecureStore.deleteItemAsync('forge_google_access_token');setToken(null);setPlaylists([])};
 if(!token)return <ForgeButton label="Sign in with Google" onPress={()=>promptAsync()}/>;
 return <View style={{gap:9}}>
  <View style={styles.row}><Text style={[styles.micro,{color:theme.gold}]}>{busy?'SYNCING PLAYLISTS…':'GOOGLE CONNECTED'}</Text><Pressable onPress={signOut}><Text style={[styles.micro,{color:theme.muted}]}>SIGN OUT</Text></Pressable></View>
  {playlists.slice(0,5).map(p=><Pressable key={p.id} onPress={()=>Linking.openURL(musicPlaylistUrl(p.id))}><View style={[styles.playlist,{borderColor:theme.line,backgroundColor:theme.panel2}]}>{p.thumbnail?<Image source={{uri:p.thumbnail}} style={styles.thumb}/>:<View style={[styles.thumb,{backgroundColor:theme.panel}]}/>}<View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={[styles.playlistTitle,{color:theme.text}]}>{p.title}</Text><Text style={[styles.micro,{color:theme.muted}]}>{p.count||0} items</Text></View><Text style={{color:theme.amber,fontSize:19}}>›</Text></View></Pressable>)}
 </View>;
}

export default function More(){
 const router=useRouter();
 const {theme,themeName,setTheme,importState,exportState,state,setRestDuration,setRestNotifications}=useForge();
 const clientId=process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID||'';
 async function importBackup(){try{const raw=await pickForgeBackup();if(raw){await importState(raw);Alert.alert('FORGE','Backup imported into the native app.')}}catch(e:any){Alert.alert('Import failed',e?.message||'Could not read that file.')}}
 async function exportBackup(){try{const json=await exportState();await shareForgeBackup(json)}catch(e:any){Alert.alert('Export failed',e?.message||'Could not export backup.')}}

 return <Screen>
  <SectionTitle eyebrow="MORE" title="Your Forge, your way."/>
  <SectionTitle eyebrow="APPEARANCE" title="Theme"/>
  <View style={styles.themeGrid}>{(Object.entries(THEMES) as any).map(([key,t]:[ForgeThemeName,any])=><Pressable key={key} onPress={()=>setTheme(key)} style={[styles.themeCard,{backgroundColor:t.panel,borderColor:key===themeName?t.amber:t.line}]}><View style={[styles.swatch,{backgroundColor:t.amber}]}/><Text style={[styles.themeName,{color:t.text}]}>{t.name}</Text><Text style={[styles.micro,{color:t.muted}]}>{key===themeName?'ACTIVE':'TAP TO APPLY'}</Text></Pressable>)}</View>

  <SectionTitle eyebrow="TRAINING" title="Rest timer"/>
  <GlassCard>
   <View style={styles.row}><View><Text style={[styles.title,{color:theme.text}]}>Automatic set rest</Text><Text style={[styles.copy,{color:theme.muted,marginVertical:3}]}>Starts after every logged set.</Text></View><Text style={[styles.restValue,{color:theme.gold}]}>{state.settings.restSeconds}s</Text></View>
   <View style={styles.restGrid}>{[60,90,120,180].map(sec=><Pressable key={sec} onPress={()=>setRestDuration(sec)} style={[styles.restChoice,{borderColor:state.settings.restSeconds===sec?theme.amber:theme.line,backgroundColor:theme.panel2}]}><Text style={[styles.restText,{color:state.settings.restSeconds===sec?theme.gold:theme.muted}]}>{sec}s</Text></Pressable>)}</View>
   <Pressable onPress={async()=>{const next=!state.settings.restNotifications;const ok=await setRestNotifications(next);if(next&&!ok)Alert.alert('Rest alerts','Notification permission was not granted.')}} style={[styles.toggleRow,{borderColor:theme.line}]}><View style={{flex:1}}><Text style={[styles.playlistTitle,{color:theme.text}]}>Background rest-complete alert</Text><Text style={[styles.micro,{color:theme.muted}]}>Useful when the app is minimized between sets.</Text></View><Text style={[styles.toggle,{color:state.settings.restNotifications?theme.gold:theme.muted}]}>{state.settings.restNotifications?'ON':'OFF'}</Text></Pressable>
  </GlassCard>

  <SectionTitle eyebrow="SOCIAL" title="Achievement cards"/>
  <GlassCard><Text style={[styles.title,{color:theme.text}]}>FORGE Share Studio</Text><Text style={[styles.copy,{color:theme.muted}]}>Create PR, workout, consistency and custom achievement cards with your own photos.</Text><ForgeButton label="Open Share Studio" onPress={()=>router.push('/share')}/></GlassCard>

  <SectionTitle eyebrow="MUSIC" title="Forge Audio"/>
  <GlassCard>
   <Text style={[styles.title,{color:theme.text}]}>Train with your playlists.</Text>
   <Text style={[styles.copy,{color:theme.muted}]}>Open YouTube Music directly. When the Google Android client ID is configured, FORGE also surfaces your own playlists through Google's official YouTube API.</Text>
   {clientId?<GoogleMusic theme={theme} clientId={clientId}/>:<Text style={[styles.micro,{color:theme.gold}]}>YOUTUBE MUSIC READY · PLAYLIST SIGN-IN NEEDS GOOGLE CLIENT ID</Text>}
   <View style={{height:9}}/><ForgeButton label="Open Forge Audio" onPress={()=>router.push("/music")}/>
  </GlassCard>

  <SectionTitle eyebrow="DATA" title="Portable by design"/>
  <GlassCard><Text style={[styles.copy,{color:theme.muted}]}>Import or export your Forge JSON backup without wiping your original web data.</Text><View style={{gap:9}}><ForgeButton label="Import Forge backup" onPress={importBackup}/><ForgeButton label="Export native backup" onPress={exportBackup} ghost/></View></GlassCard>
  <GlassCard><View style={styles.row}><Text style={[styles.micro,{color:theme.muted}]}>NATIVE STATE</Text><Text style={[styles.micro,{color:theme.gold}]}>{state.sessions.length} sessions · {state.foodLog.length} foods</Text></View><View style={styles.row}><Text style={[styles.micro,{color:theme.muted}]}>BUILD</Text><Text style={[styles.micro,{color:theme.text}]}>FORGE 14 · DEVELOPMENT</Text></View></GlassCard>
 </Screen>;
}
const styles=StyleSheet.create({
 themeGrid:{flexDirection:'row',gap:9},themeCard:{flex:1,borderWidth:1,borderRadius:17,padding:11,minHeight:92},swatch:{width:24,height:4,borderRadius:9,marginBottom:12},
 themeName:{fontSize:10,fontWeight:'900',letterSpacing:.4},micro:{fontSize:8.5,fontWeight:'800',letterSpacing:.8,marginTop:5},title:{fontSize:18,fontWeight:'900',letterSpacing:-.4},copy:{fontSize:10.5,lineHeight:16,fontWeight:'600',marginVertical:8},
 row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},playlist:{flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderRadius:14,padding:8},thumb:{width:44,height:44,borderRadius:9},playlistTitle:{fontSize:11,fontWeight:'900'},
 restValue:{fontSize:22,fontWeight:'900'},restGrid:{flexDirection:'row',gap:7,marginVertical:10},restChoice:{flex:1,borderWidth:1,borderRadius:12,paddingVertical:10,alignItems:'center'},restText:{fontSize:9,fontWeight:'900'},toggleRow:{borderTopWidth:1,paddingTop:11,marginTop:2,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},toggle:{fontSize:9,fontWeight:'900',letterSpacing:.7}
});
