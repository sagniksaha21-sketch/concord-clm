import React,{useEffect,useRef} from 'react';
import {Animated,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import * as Haptics from 'expo-haptics';
import {useForge} from '../store/ForgeProvider';

export type ForgeDialogAction={label:string;onPress?:()=>void;tone?:'primary'|'quiet'|'danger'};

export function ForgeDialog({visible,eyebrow='FORGE',title,message,actions,onDismiss}:{visible:boolean;eyebrow?:string;title:string;message?:string;actions:ForgeDialogAction[];onDismiss?:()=>void}){
 const {theme}=useForge(),opacity=useRef(new Animated.Value(0)).current,scale=useRef(new Animated.Value(.96)).current;
 useEffect(()=>{if(visible){opacity.setValue(0);scale.setValue(.96);Animated.parallel([Animated.timing(opacity,{toValue:1,duration:170,useNativeDriver:true}),Animated.spring(scale,{toValue:1,damping:18,stiffness:240,mass:.8,useNativeDriver:true})]).start();}},[visible]);
 const act=(a:ForgeDialogAction)=>{Haptics.selectionAsync().catch(()=>{});a.onPress?.();};
 return <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={onDismiss}>
  <View style={s.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={onDismiss}/>
   <Animated.View style={[s.shell,{backgroundColor:theme.panel,borderColor:theme.line,opacity,transform:[{scale}]}]}>
    <View style={[s.accent,{backgroundColor:theme.amber}]}/>
    <Text style={[s.eyebrow,{color:theme.gold}]}>{eyebrow}</Text>
    <Text style={[s.title,{color:theme.text}]}>{title}</Text>
    {!!message&&<Text style={[s.message,{color:theme.muted}]}>{message}</Text>}
    <View style={[s.rule,{backgroundColor:theme.line}]}/>
    <View style={s.actions}>{actions.map((a,i)=><Pressable key={a.label} onPress={()=>act(a)} style={({pressed})=>[s.action,{borderColor:a.tone==='primary'?theme.amber:theme.line,backgroundColor:a.tone==='primary'?theme.panel2:'transparent',opacity:pressed?.72:1}]}>
      <Text style={[s.actionText,{color:a.tone==='danger'?theme.ember:a.tone==='primary'?theme.gold:theme.muted}]}>{a.label.toUpperCase()}</Text>
     </Pressable>)}</View>
   </Animated.View>
  </View>
 </Modal>
}
const s=StyleSheet.create({backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.78)',justifyContent:'center',paddingHorizontal:22},shell:{borderWidth:1,borderRadius:22,padding:20,overflow:'hidden',shadowColor:'#000',shadowOpacity:.5,shadowRadius:28,shadowOffset:{width:0,height:18},elevation:22},accent:{position:'absolute',left:0,top:0,bottom:0,width:2},eyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.7,marginBottom:10},title:{fontSize:25,lineHeight:28,fontWeight:'900',letterSpacing:-.8},message:{fontSize:11.5,lineHeight:17,fontWeight:'600',marginTop:9,maxWidth:310},rule:{height:1,marginTop:20,marginBottom:13},actions:{flexDirection:'row',justifyContent:'flex-end',gap:8,flexWrap:'wrap'},action:{minHeight:42,borderWidth:1,borderRadius:13,paddingHorizontal:15,alignItems:'center',justifyContent:'center'},actionText:{fontSize:9,fontWeight:'900',letterSpacing:1}});
