
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function pickForgeBackup(){
 const result=await DocumentPicker.getDocumentAsync({type:['application/json','text/plain'],copyToCacheDirectory:true});
 if(result.canceled) return null;
 const asset=result.assets[0];
 const text=await FileSystem.readAsStringAsync(asset.uri);
 return JSON.parse(text);
}

export async function shareForgeBackup(json:string){
 const uri=(FileSystem.cacheDirectory||'')+'forge-native-backup.json';
 await FileSystem.writeAsStringAsync(uri,json,{encoding:FileSystem.EncodingType.UTF8});
 if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri,{mimeType:'application/json',dialogTitle:'Export FORGE backup'});
 return uri;
}
