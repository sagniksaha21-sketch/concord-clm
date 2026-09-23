import React,{useEffect,useState} from 'react';
import {View,Text,StyleSheet,Pressable,Image,Linking} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as SecureStore from 'expo-secure-store';
import {Screen} from '@/components/Screen';
import {ForgeButton} from '@/components/ForgeButton';
import {SectionTitle} from '@/components/SectionTitle';
import {useForge} from '@/store/ForgeProvider';
import {fetchMyPlaylists,musicHome,musicPlaylistUrl,YouTubePlaylist} from '@/services/youtube';
import {readiness} from '@/utils/readiness';
WebBrowser.maybeCompleteAuthSession();
function Connected({clientId,theme}:{clientId:string;theme:any}){
 const [items,setItems]=useState<YouTubePlaylist[]>([]),[token,setToken]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const [,response,promptAsync]=Google.useAuthRequest({androidClientId:clientId,scopes:['openid','profile','https://www.googleapis.com/auth/youtube.readonly']});
 useEffect(()=>{SecureStore.getItemAsync('forge_google_access_token').then(setToken).catch(()=>{})},[]);
 useEffect(()=>{if(response?.type==='success'){const t=(response.authentication as any)?.accessToken||(response.params as any)?.access_token;if(t){setToken(t);SecureStore.setItemAsync('forge_google_access_token',t).catch(()=>{})}}},[response]);
 useEffect(()=>{if(!token)return;setBusy(true);fetchMyPlaylists(token).then(setItems).finally(()=>setBusy(false)).catch(()=>{})},[token]);
 if(!token)return <ForgeButton label="Connect Google / YouTube" onPress={()=>promptAsync()}/>;
 return <View style={{gap:10}}><Text style={[s.micro,{color:theme.gold}]}>{busy?'SYNCING YOUR LIBRARY…':'YOUR YOUTUBE PLAYLISTS'}</Text>{items.map(p=><Pressable key={p.id} onPress={()=>Linking.openURL(musicPlaylistUrl(p.id))}><View style={[s.row,{borderColor:theme.line}]}>{p.thumbnail?<Image source={{uri:p.thumbnail}} style={s.art}/>:<View style={[s.art,{backgroundColor:theme.panel2}]}/>}<View style={{flex:1}}><Text numberOfLines={1} style={[s.name,{color:theme.text}]}>{p.title}</Text><Text style={[s.micro,{color:theme.muted}]}>{p.count||0} TRACKS · OPEN IN YT MUSIC</Text></View><Text style={[s.go,{color:theme.amber}]}>▶</Text></View></Pressable>)}</View>
}
export default function Music(){
 const {theme,state}=useForge(); const ready=readiness(state); const mode=state.workout?.startedAt?(ready.band==='RECOVER'?'CARDIO':ready.band==='READY'?'PR MODE':'HYPERTROPHY'):(ready.band==='RECOVER'?'RECOVERY':'HYPERTROPHY'); const clientId=process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID||'';
 return <Screen><SectionTitle eyebrow="FORGE AUDIO" title="Soundtrack the work."/>
 <View style={[s.heroBlock,{borderColor:theme.line}]}><Text style={[s.hero,{color:theme.text}]}>YOUTUBE MUSIC</Text><Text style={[s.copy,{color:theme.muted}]}>Your training music lives inside Forge. Browse connected playlists here, then hand playback to YouTube Music using Google's supported experience.</Text><ForgeButton label="Open YouTube Music" onPress={()=>Linking.openURL(musicHome)}/></View>
 <View style={[s.sessionSignal,{borderColor:theme.line}]}><Text style={[s.micro,{color:theme.muted}]}>SESSION SIGNAL</Text><Text style={[s.signal,{color:theme.text}]}>{state.workout?.startedAt?'WORKOUT LIVE':'READY WHEN YOU ARE'}</Text><Text style={[s.copy,{color:theme.muted,marginVertical:0}]}>{state.workout?.startedAt?'Forge Audio keeps playback in YouTube Music while your workout stays active in Forge.':'Choose a mode below or open your own library.'}</Text></View>
 <View style={[s.recommend,{borderColor:theme.line}]}><View style={{flex:1}}><Text style={[s.micro,{color:theme.gold}]}>FORGE AUDIO RECOMMENDS</Text><Text style={[s.signal,{color:theme.text}]}>{mode}</Text><Text style={[s.copy,{color:theme.muted,marginVertical:0}]}>Based on today’s training state. Playback choice remains yours.</Text></View><Pressable onPress={()=>Linking.openURL(`https://music.youtube.com/search?q=${encodeURIComponent(mode+' workout')}`)}><Text style={[s.go,{color:theme.amber}]}>▶</Text></Pressable></View>
 <SectionTitle eyebrow="QUICK MODES" title="Match the session"/>
 <View style={s.modes}>{['HEAVY','HYPERTROPHY','PR MODE','CARDIO'].map(x=><Pressable key={x} onPress={()=>Linking.openURL(`https://music.youtube.com/search?q=${encodeURIComponent(x+' workout')}`)} style={[s.mode,{borderColor:theme.line,backgroundColor:theme.panel}]}><Text style={[s.modeText,{color:theme.gold}]}>{x}</Text></Pressable>)}</View>
 <SectionTitle eyebrow="LIBRARY" title="Your playlists"/>
 {clientId?<Connected clientId={clientId} theme={theme}/>:<View style={[s.config,{borderColor:theme.line}]}><Text style={[s.name,{color:theme.text}]}>Google connection not configured in this build.</Text><Text style={[s.copy,{color:theme.muted}]}>YouTube Music launch and workout searches still work. Personal playlist sync activates when the Android OAuth client ID is supplied to the release build.</Text></View>}
 </Screen>
}
const s=StyleSheet.create({heroBlock:{borderTopWidth:1,borderBottomWidth:1,paddingVertical:14},config:{borderLeftWidth:2,paddingLeft:12,paddingVertical:6},recommend:{borderLeftWidth:2,paddingLeft:12,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:12},sessionSignal:{borderTopWidth:1,borderBottomWidth:1,paddingVertical:13,gap:5},signal:{fontSize:16,fontWeight:'900',letterSpacing:-.3},hero:{fontSize:28,fontWeight:'900',letterSpacing:-1},copy:{fontSize:11,lineHeight:17,fontWeight:'600',marginVertical:10},micro:{fontSize:8,fontWeight:'900',letterSpacing:1},row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:10,borderBottomWidth:1},art:{width:58,height:58,borderRadius:12},name:{fontSize:13,fontWeight:'900'},go:{fontSize:20,fontWeight:'900'},modes:{flexDirection:'row',flexWrap:'wrap',gap:8},mode:{width:'48%',minHeight:64,borderWidth:1,borderRadius:16,alignItems:'center',justifyContent:'center'},modeText:{fontSize:10,fontWeight:'900',letterSpacing:1.2}});