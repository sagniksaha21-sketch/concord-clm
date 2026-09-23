
export type YouTubePlaylist={id:string;title:string;thumbnail?:string;count?:number};

export async function fetchMyPlaylists(accessToken:string):Promise<YouTubePlaylist[]>{
 const url='https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=25';
 const res=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
 if(!res.ok) throw new Error(`YouTube API ${res.status}`);
 const json=await res.json();
 return (json.items||[]).map((x:any)=>({
   id:x.id,title:x.snippet?.title||'Playlist',
   thumbnail:x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.default?.url,
   count:x.contentDetails?.itemCount||0
 }));
}

export const musicPlaylistUrl=(id:string)=>`https://music.youtube.com/playlist?list=${encodeURIComponent(id)}`;
export const musicHome='https://music.youtube.com/';
