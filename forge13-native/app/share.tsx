import React,{useMemo,useRef,useState} from 'react';
import { View,Text,StyleSheet,Pressable,Image,Alert,ScrollView,TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import ViewShot,{captureRef} from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import { useForge } from '@/store/ForgeProvider';
import { ForgeBrand } from '@/components/ForgeBrand';
import { ForgeButton } from '@/components/ForgeButton';
import { hallOfFame,latestSession,weekSessions } from '@/utils/analytics';
import { shortDate,tons } from '@/utils/format';

type Achievement={label:string;headline:string;mark:string;sub:string;kind?:'custom'};

export default function ShareStudio(){
 const router=useRouter();
 const {state,theme}=useForge();
 const shotRef=useRef<any>(null);
 const latestPhoto=useMemo(()=>[...(state.progressPhotos||[])].filter(p=>p?.uri||p?.data).sort((a,b)=>Date.parse(b.date||'')-Date.parse(a.date||''))[0],[state.progressPhotos]);
 const [photo,setPhoto]=useState<string|null>(()=>latestPhoto?.uri||latestPhoto?.data||null);
 const [format,setFormat]=useState<'post'|'story'>('post');
 const [customHeadline,setCustomHeadline]=useState('Built under pressure.');
 const [customMark,setCustomMark]=useState('FORGED TODAY');
 const hof=hallOfFame(state), last=latestSession(state), week=weekSessions(state);
 const achievements=useMemo<Achievement[]>(()=>{
   const first=hof[0];
   const latestPr=[...hof].sort((a,b)=>Date.parse(b.date||'')-Date.parse(a.date||''))[0];
   return [
    {label:'HALL OF FAME',headline:first?.name||'First record incoming',mark:first?`${first.weight} KG × ${first.reps}`:'EARN THE MARK',sub:first?`Record · ${shortDate(first.date)}`:'Train. Progress. Earn the plaque.'},
    {label:'LATEST PR',headline:latestPr?.name||'Personal record',mark:latestPr?`${latestPr.weight} KG × ${latestPr.reps}`:'NEXT MARK',sub:latestPr?`Latest PR · ${shortDate(latestPr.date)}`:'Your next record will appear here.'},
    {label:'LATEST WORKOUT',headline:last?.name||'Training session',mark:last?`${last.setCount} SETS · ${tons(last.volume)}`:'READY TO FORGE',sub:last?`${last.duration} min · ${shortDate(last.date)}`:'Your work will appear here.'},
    {label:'CONSISTENCY',headline:'This week',mark:`${week} SESSION${week===1?'':'S'}`,sub:'Consistency compounds.'},
    {label:'CUSTOM',headline:customHeadline||'Built under pressure.',mark:customMark||'FORGED TODAY',sub:'Your work. Your words.',kind:'custom'}
   ];
 },[state,customHeadline,customMark]);
 const [achievementIndex,setAchievementIndex]=useState(0);
 const a=achievements[achievementIndex]||achievements[0];

 async function pick(){
   const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:.9,allowsEditing:true,aspect:format==='post'?[4,5]:[9,16]});
   if(!result.canceled)setPhoto(result.assets[0].uri);
 }
 function useLatestProgressPhoto(){
   const uri=latestPhoto?.uri||latestPhoto?.data||null;
   if(!uri){Alert.alert('No progress photo yet','Add a progress photo first, then return to Share Studio.');return;}
   setPhoto(uri);
 }
 async function share(){
   try{
    const uri=await captureRef(shotRef,{format:'png',quality:1,result:'tmpfile'});
    if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri,{mimeType:'image/png',dialogTitle:'Share your FORGE achievement'});
    else Alert.alert('Sharing unavailable','The card was generated, but this device cannot open a share sheet.');
   }catch(e:any){Alert.alert('Could not create card',e?.message||'Unknown error')}
 }
 const ratio=format==='post'?4/5:9/16;
 return <SafeAreaView edges={['top','bottom']} style={[styles.safe,{backgroundColor:theme.bg}]}>
  <View style={styles.header}><ForgeBrand compact/><Pressable onPress={()=>router.back()}><Text style={[styles.close,{color:theme.muted}]}>CLOSE</Text></Pressable></View>
  <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
   <Text style={[styles.kicker,{color:theme.amber}]}>SHARE STUDIO</Text>
   <Text style={[styles.h1,{color:theme.text}]}>Make the work visible.</Text>
   <Text style={[styles.copy,{color:theme.muted}]}>Choose an achievement and a photo. FORGE renders a clean 1080-ready composition and hands it to Android’s native share sheet.</Text>

   <View style={styles.segment}>
    {(['post','story'] as const).map(x=><Pressable key={x} onPress={()=>setFormat(x)} style={[styles.seg,{borderColor:x===format?theme.amber:theme.line,backgroundColor:theme.panel}]}>
     <Text style={[styles.segText,{color:x===format?theme.gold:theme.muted}]}>{x==='post'?'POST 4:5':'STORY 9:16'}</Text>
    </Pressable>)}
   </View>

   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.achievementRow}>
    {achievements.map((x,i)=><Pressable key={x.label} onPress={()=>setAchievementIndex(i)} style={[styles.ach,{borderColor:i===achievementIndex?theme.amber:theme.line,backgroundColor:theme.panel}]}>
      <Text style={[styles.achText,{color:i===achievementIndex?theme.text:theme.muted}]}>{x.label}</Text>
    </Pressable>)}
   </ScrollView>

   {a.kind==='custom'&&<View style={[styles.customBox,{backgroundColor:theme.panel,borderColor:theme.line}]}>
     <Text style={[styles.customLabel,{color:theme.amber}]}>CUSTOM ACHIEVEMENT</Text>
     <TextInput value={customHeadline} onChangeText={setCustomHeadline} placeholder="Headline" placeholderTextColor={theme.muted} style={[styles.input,{color:theme.text,borderColor:theme.line}]}/>
     <TextInput value={customMark} onChangeText={setCustomMark} placeholder="Achievement mark" placeholderTextColor={theme.muted} style={[styles.input,{color:theme.text,borderColor:theme.line}]}/>
   </View>}

   <View style={styles.previewWrap}>
    <ViewShot ref={shotRef} options={{format:'png',quality:1}} style={[styles.shot,{aspectRatio:ratio,backgroundColor:'#070707'}]}>
      {photo?<Image source={{uri:photo}} style={StyleSheet.absoluteFill} resizeMode="cover"/>:<View style={[StyleSheet.absoluteFill,{backgroundColor:'#16120E'}]}/>}
      <LinearGradient colors={['rgba(0,0,0,.08)','rgba(0,0,0,.1)','rgba(0,0,0,.92)']} locations={[0,.48,1]} style={StyleSheet.absoluteFill}/>
      <View style={styles.cardBrand}><Text style={styles.cardForge}>FORGE</Text><View style={styles.cardRuleTop}/><Text style={styles.cardTag}>ADAPT · EXECUTE · EVOLVE</Text></View>
      <View style={styles.cardBottom}>
       <Text style={styles.cardLabel}>{a.label}</Text>
       <Text style={styles.cardHeadline}>{a.headline}</Text>
       <Text style={styles.cardMark}>{a.mark}</Text>
       <Text style={styles.cardSub}>{a.sub}</Text>
       <View style={styles.cardRule}/>
       <Text style={styles.cardFooter}>FORGED, NOT GIVEN.</Text>
      </View>
    </ViewShot>
   </View>

   <View style={{gap:9}}>
    <ForgeButton label={photo?'Change photo':'Choose photo'} onPress={pick} ghost/>
    <ForgeButton label="Use latest progress photo" onPress={useLatestProgressPhoto} ghost/>
    <ForgeButton label="Share achievement" onPress={share}/>
   </View>
  </ScrollView>
 </SafeAreaView>
}
const styles=StyleSheet.create({
 safe:{flex:1},header:{height:60,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},close:{fontSize:8.5,fontWeight:'900',letterSpacing:1.2},
 content:{padding:16,paddingBottom:36,gap:14},kicker:{fontSize:8.5,fontWeight:'900',letterSpacing:1.5},h1:{fontSize:30,fontWeight:'900',letterSpacing:-1.1},copy:{fontSize:10.5,lineHeight:16,fontWeight:'600'},
 segment:{flexDirection:'row',gap:8},seg:{flex:1,borderWidth:1,borderRadius:14,padding:10,alignItems:'center'},segText:{fontSize:8.5,fontWeight:'900',letterSpacing:.8},
 achievementRow:{gap:7,paddingRight:6},ach:{minWidth:104,borderWidth:1,borderRadius:13,paddingVertical:10,paddingHorizontal:9,alignItems:'center'},achText:{fontSize:7.6,fontWeight:'900',letterSpacing:.45,textAlign:'center'},
 customBox:{borderWidth:1,borderRadius:16,padding:12,gap:8},customLabel:{fontSize:7.8,fontWeight:'900',letterSpacing:1.2},input:{borderWidth:1,borderRadius:12,paddingHorizontal:11,paddingVertical:9,fontSize:12,fontWeight:'700'},
 previewWrap:{alignItems:'center'},shot:{width:'82%',borderRadius:24,overflow:'hidden'},cardBrand:{position:'absolute',left:18,top:18},cardForge:{color:'#FFD98B',fontSize:26,fontWeight:'900',fontStyle:'italic',letterSpacing:-1.7},cardRuleTop:{width:61,height:2,backgroundColor:'#F5A623',borderRadius:2,marginTop:1},cardTag:{color:'#F5A623',fontSize:5.8,fontWeight:'900',letterSpacing:1.35,marginTop:3},
 cardBottom:{position:'absolute',left:18,right:18,bottom:19},cardLabel:{color:'#F5A623',fontSize:7,fontWeight:'900',letterSpacing:1.5},cardHeadline:{color:'#FFF7EA',fontSize:21,fontWeight:'900',letterSpacing:-.8,marginTop:5},cardMark:{color:'#FFD37A',fontSize:24,fontWeight:'900',letterSpacing:-.8,marginTop:3},cardSub:{color:'#B7ADA1',fontSize:8.5,fontWeight:'700',marginTop:3},cardRule:{height:1,backgroundColor:'rgba(255,196,92,.35)',marginVertical:10},cardFooter:{color:'#FFF7EA',fontSize:6.8,fontWeight:'900',letterSpacing:1.55}
});
