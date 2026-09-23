import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';

let currentId:string|null=null;
Notifications.setNotificationHandler({
  handleNotification: async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:false,shouldSetBadge:false})
});

export async function enableRestNotifications(){
  const current=await Notifications.getPermissionsAsync();
  let granted=current.granted;
  if(!granted){const next=await Notifications.requestPermissionsAsync();granted=next.granted;}
  if(granted && Platform.OS==='android'){
    await Notifications.setNotificationChannelAsync('forge-rest',{name:'FORGE rest timer',importance:Notifications.AndroidImportance.DEFAULT,sound:'default'});
  }
  return granted;
}
export async function replaceRestNotification(endsAt:number|null){
  if(currentId){await Notifications.cancelScheduledNotificationAsync(currentId).catch(()=>{});currentId=null;}
  if(!endsAt)return;
  const seconds=Math.max(1,Math.ceil((endsAt-Date.now())/1000));
  currentId=await Notifications.scheduleNotificationAsync({
    content:{title:'FORGE · Rest complete',body:'Next set. Clean execution.',sound:'default'},
    trigger:{type:Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,seconds,channelId:'forge-rest'} as any
  });
}
export async function cancelRestNotification(){
  if(currentId){await Notifications.cancelScheduledNotificationAsync(currentId).catch(()=>{});currentId=null;}
}
