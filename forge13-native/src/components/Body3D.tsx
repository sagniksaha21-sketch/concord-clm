import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Image, PanResponder, Pressable, StyleSheet, Text, View} from 'react-native';
import {GLView} from 'expo-gl';
import * as Haptics from 'expo-haptics';
import {BODY_MESH_B64} from '../graphics/bodyMesh';
import {useForge} from '../store/ForgeProvider';

export type BodyMuscleGroup='Chest'|'Back'|'Shoulders'|'Biceps'|'Triceps'|'Core'|'Legs';
const GROUPS:BodyMuscleGroup[]=['Chest','Back','Shoulders','Biceps','Triceps','Core','Legs'];
const FOV=38*Math.PI/180, CAM_Y=.03, CAM_Z=6.2, MODEL_SCALE=2.36;
const ZONES=[
 ['Chest',[-.22,.98,.30],[.23,.25,.105],1],['Chest',[.22,.98,.30],[.23,.25,.105],1],
 ['Back',[-.20,.96,-.23],[.30,.38,.11],-1],['Back',[.20,.96,-.23],[.30,.38,.11],-1],
 ['Shoulders',[-.52,1.22,.09],[.18,.20,.15],0],['Shoulders',[.52,1.22,.09],[.18,.20,.15],0],
 ['Biceps',[-.58,.66,.15],[.13,.30,.11],1],['Biceps',[.58,.66,.15],[.13,.30,.11],1],
 ['Triceps',[-.58,.66,-.12],[.13,.30,.11],-1],['Triceps',[.58,.66,-.12],[.13,.30,.11],-1],
 ['Core',[0,.34,.28],[.24,.36,.09],1],
 ['Legs',[-.24,-.56,.10],[.22,.55,.17],0],['Legs',[.24,-.56,.10],[.22,.55,.17],0],
 ['Legs',[-.20,-1.48,.04],[.16,.42,.14],0],['Legs',[.20,-1.48,.04],[.16,.42,.14],0]
] as const;

type Geometry={p:Float32Array;n:Float32Array;i:Uint16Array;vertexCount:number;triangleCount:number};
let GEOMETRY:Geometry|null=null;
function fromB64(s:string){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 const clean=s.replace(/[^A-Za-z0-9+/=]/g,'');
 const out=new Uint8Array(Math.floor(clean.length*3/4)-(clean.endsWith('==')?2:clean.endsWith('=')?1:0));
 let o=0,buffer=0,bits=0;
 for(let k=0;k<clean.length;k++){
  const c=clean[k]; if(c==='=')break; const v=alphabet.indexOf(c); if(v<0)continue;
  buffer=(buffer<<6)|v; bits+=6;
  if(bits>=8){bits-=8; if(o<out.length)out[o++]=(buffer>>bits)&255;}
 }
 return out;
}
function normals(p:Float32Array,i:Uint16Array){
 const n=new Float32Array(p.length);
 for(let k=0;k<i.length;k+=3){
  const ia=i[k]*3,ib=i[k+1]*3,ic=i[k+2]*3;
  const ax=p[ia],ay=p[ia+1],az=p[ia+2],bx=p[ib],by=p[ib+1],bz=p[ib+2],cx=p[ic],cy=p[ic+1],cz=p[ic+2];
  const abx=bx-ax,aby=by-ay,abz=bz-az,acx=cx-ax,acy=cy-ay,acz=cz-az;
  const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
  n[ia]+=nx;n[ia+1]+=ny;n[ia+2]+=nz;n[ib]+=nx;n[ib+1]+=ny;n[ib+2]+=nz;n[ic]+=nx;n[ic+1]+=ny;n[ic+2]+=nz;
 }
 for(let v=0;v<p.length;v+=3){const L=Math.hypot(n[v],n[v+1],n[v+2])||1;n[v]/=L;n[v+1]/=L;n[v+2]/=L;}
 return n;
}
function geometry(){
 if(GEOMETRY)return GEOMETRY;
 const u=fromB64(BODY_MESH_B64),d=new DataView(u.buffer,u.byteOffset,u.byteLength);
 if(String.fromCharCode(u[0],u[1],u[2],u[3])!=='FHM2')throw new Error('FORGE body mesh header invalid');
 const vc=d.getUint32(4,true),ic=d.getUint32(8,true),sx=d.getFloat32(12,true),sy=d.getFloat32(16,true),sz=d.getFloat32(20,true),p=new Float32Array(vc*3);
 let q=24;
 for(let i=0;i<vc;i++){p[i*3]=d.getInt16(q,true)/32767*sx;q+=2;p[i*3+1]=d.getInt16(q,true)/32767*sy;q+=2;p[i*3+2]=d.getInt16(q,true)/32767*sz;q+=2;}
 const ii=new Uint16Array(ic);for(let i=0;i<ic;i++){ii[i]=d.getUint16(q,true);q+=2;}
 return GEOMETRY={p,n:normals(p,ii),i:ii,vertexCount:vc,triangleCount:ic/3};
}
function shader(gl:any,type:number,src:string){const s=gl.createShader(type);if(!s)throw new Error('shader alloc');gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'shader');return s;}
function program(gl:any,vs:string,fs:string){const p=gl.createProgram();if(!p)throw new Error('program alloc');gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'program');return p;}
function perspective(out:Float32Array,fovy:number,aspect:number,near:number,far:number){const f=1/Math.tan(fovy/2),nf=1/(near-far);out[0]=f/aspect;out[1]=0;out[2]=0;out[3]=0;out[4]=0;out[5]=f;out[6]=0;out[7]=0;out[8]=0;out[9]=0;out[10]=(far+near)*nf;out[11]=-1;out[12]=0;out[13]=0;out[14]=2*far*near*nf;out[15]=0;return out;}
function normAngle(a:number){a%=Math.PI*2;if(a<0)a+=Math.PI*2;return a;}
function nearestView(a:number){const views:[string,number][]=[['Front',0],['Side',Math.PI/2],['Back',Math.PI],['Side',Math.PI*3/2]];let best=views[0],bd=99;for(const v of views){const d=Math.abs(Math.atan2(Math.sin(a-v[1]),Math.cos(a-v[1])));if(d<bd){best=v;bd=d;}}return best[0];}

const VS=`attribute vec3 aPos;attribute vec3 aNormal;uniform vec3 uScale;uniform vec3 uTranslate;uniform float uBodyY;uniform mat4 uProj;uniform float uCamY;varying vec3 vN;varying vec3 vP;varying vec3 vLocal;mat3 rY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}void main(){mat3 ry=rY(uBodyY);vec3 p=aPos*uScale+uTranslate;vLocal=p;p=ry*p;vec3 n=normalize(ry*(aNormal/max(uScale,vec3(.001))));vec3 view=p-vec3(0.,uCamY,6.2);vN=n;vP=view;gl_Position=uProj*vec4(view,1.);}`;
const FS=`precision mediump float;uniform vec3 uColor;uniform float uHuman;uniform vec4 uSelA;uniform vec4 uSelB;varying vec3 vN;varying vec3 vP;varying vec3 vLocal;float ell(vec3 p,vec3 c,vec3 r){vec3 d=(p-c)/r;return 1.0-smoothstep(.70,1.02,dot(d,d));}void main(){vec3 n=normalize(vN);vec3 L=normalize(vec3(-.48,.74,.72));float ndl=max(dot(n,L),0.0);float soft=abs(dot(n,normalize(vec3(.56,.22,.60))));float rim=pow(1.0-max(dot(n,normalize(-vP)),0.0),2.2);vec3 V=normalize(-vP);vec3 H=normalize(L+V);float spec=pow(max(dot(n,H),0.0),42.0);vec3 base=uColor;float reg=0.0;reg=max(reg,uSelA.x*max(ell(vLocal,vec3(-.22,.98,.30),vec3(.23,.26,.11)),ell(vLocal,vec3(.22,.98,.30),vec3(.23,.26,.11))));reg=max(reg,uSelA.y*max(ell(vLocal,vec3(-.22,.94,-.23),vec3(.24,.34,.10)),ell(vLocal,vec3(.22,.94,-.23),vec3(.24,.34,.10))));reg=max(reg,uSelA.z*max(ell(vLocal,vec3(-.52,1.22,.09),vec3(.20,.22,.16)),ell(vLocal,vec3(.52,1.22,.09),vec3(.20,.22,.16))));reg=max(reg,uSelA.w*ell(vLocal,vec3(0.,.34,.28),vec3(.22,.36,.10)));reg=max(reg,uSelB.x*max(ell(vLocal,vec3(-.58,.66,.15),vec3(.14,.31,.13)),ell(vLocal,vec3(.58,.66,.15),vec3(.14,.31,.13))));reg=max(reg,uSelB.y*max(ell(vLocal,vec3(-.58,.66,-.12),vec3(.14,.31,.13)),ell(vLocal,vec3(.58,.66,-.12),vec3(.14,.31,.13))));float legs=max(max(ell(vLocal,vec3(-.24,-.56,.10),vec3(.22,.55,.17)),ell(vLocal,vec3(.24,-.56,.10),vec3(.22,.55,.17))),max(ell(vLocal,vec3(-.20,-1.48,.04),vec3(.16,.42,.14)),ell(vLocal,vec3(.20,-1.48,.04),vec3(.16,.42,.14))));reg=max(reg,uSelB.z*legs);float bodyLight=.66+ndl*.55+soft*.10;vec3 c=base*bodyLight+vec3(1.0,.69,.20)*spec*.16+vec3(.82,.43,.07)*rim*.11;if(reg>.08){float mask=smoothstep(.20,.27,reg);vec3 orange=vec3(1.0,.32,.018);vec3 orangeLit=orange*(.82+ndl*.20)+vec3(1.0,.67,.24)*spec*.10+vec3(.96,.38,.035)*rim*.045;c=mix(c,orangeLit,mask*.985);}gl_FragColor=vec4(c,1.0);}`;

type Props={groups?:string[];selectable?:boolean;onSelectionChange?:(groups:BodyMuscleGroup[])=>void;height?:number;autoRotate?:boolean};
export function Body3D({groups=[],selectable=false,onSelectionChange,height=276,autoRotate=true}:Props){
 const {theme}=useForge();
 const [ready,setReady]=useState(false),[failure,setFailure]=useState<string|null>(null),[viewName,setViewName]=useState('Front'),[internal,setInternal]=useState<BodyMuscleGroup[]>(()=>groups.filter((x):x is BodyMuscleGroup=>GROUPS.includes(x as BodyMuscleGroup)));
 const glRef=useRef<any>(null),resRef=useRef<any>(null),rafRef=useRef<number|undefined>(undefined),mountedRef=useRef(true),angleRef=useRef(0),targetRef=useRef<number|null>(null),lastRef=useRef(0),viewRef=useRef('Front'),resumeRef=useRef(0),sizeRef=useRef({w:320,h:height}),selectedRef=useRef<Set<BodyMuscleGroup>>(new Set(internal)),hotspotsRef=useRef<any[]>([]),dragRef=useRef({x:0,y:0,lastX:0,moved:false});
 useEffect(()=>{const next=groups.filter((x):x is BodyMuscleGroup=>GROUPS.includes(x as BodyMuscleGroup));setInternal(next);selectedRef.current=new Set(next);},[groups.join('|')]);
 useEffect(()=>()=>{mountedRef.current=false;if(rafRef.current!=null)cancelAnimationFrame(rafRef.current);glRef.current=null;resRef.current=null;},[]);
 const failRenderer=(stage:string,e:any)=>{const reason=`${stage}: ${String(e?.message||e||'GL error')}`.slice(0,96);console.warn('FORGE native 3D runtime failed',stage,e);if(mountedRef.current){setFailure(reason);setReady(false);}if(rafRef.current!=null){cancelAnimationFrame(rafRef.current);rafRef.current=undefined;}};
 const assertGl=(gl:any,stage:string)=>{const code=gl.getError?.();if(code!=null&&code!==gl.NO_ERROR)throw new Error(`${stage} GL ${code}`);};
 const draw=()=>{
  const gl=glRef.current,r=resRef.current;if(!gl||!r)return;
  const w=gl.drawingBufferWidth||Math.max(1,sizeRef.current.w),h=gl.drawingBufferHeight||Math.max(1,sizeRef.current.h);
  gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.useProgram(r.prog);
  const proj=new Float32Array(16);perspective(proj,FOV,w/h,.1,30);gl.uniformMatrix4fv(r.loc.uProj,false,proj);gl.uniform1f(r.loc.uCamY,CAM_Y);gl.uniform1f(r.loc.uBodyY,angleRef.current);
  const sel=selectedRef.current;gl.uniform4fv(r.loc.uSelA,new Float32Array([sel.has('Chest')?1:0,sel.has('Back')?1:0,sel.has('Shoulders')?1:0,sel.has('Core')?1:0]));gl.uniform4fv(r.loc.uSelB,new Float32Array([sel.has('Biceps')?1:0,sel.has('Triceps')?1:0,sel.has('Legs')?1:0,0]));
  gl.bindBuffer(gl.ARRAY_BUFFER,r.buf);gl.enableVertexAttribArray(r.loc.aPos);gl.vertexAttribPointer(r.loc.aPos,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(r.loc.aNormal);gl.vertexAttribPointer(r.loc.aNormal,3,gl.FLOAT,false,24,12);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,r.ibo);gl.uniform3fv(r.loc.uScale,new Float32Array([MODEL_SCALE,MODEL_SCALE,MODEL_SCALE]));gl.uniform3fv(r.loc.uTranslate,new Float32Array([0,-.02,0]));gl.uniform3fv(r.loc.uColor,new Float32Array([.56,.34,.23]));gl.uniform1f(r.loc.uHuman,1);gl.drawElements(gl.TRIANGLES,r.count,gl.UNSIGNED_SHORT,0);assertGl(gl,'draw');gl.flush();if(typeof gl.endFrameEXP==='function')gl.endFrameEXP();
  const logical=sizeRef.current,fy=1/Math.tan(FOV/2),aspect=logical.w/logical.h,ca=Math.cos(angleRef.current),sa=Math.sin(angleRef.current);
  hotspotsRef.current=ZONES.flatMap(z=>{const [g,p,scale,front]=z as any;if(front===1&&ca<-.22)return[];if(front===-1&&ca>.22)return[];const qx=ca*p[0]+sa*p[2],qz=-sa*p[0]+ca*p[2],depth=CAM_Z-qz,x=logical.w*.5+(qx*fy/aspect/depth)*logical.w*.5,y=logical.h*.5-((p[1]-CAM_Y)*fy/depth)*logical.h*.5,rx=Math.max(26,(scale[0]*fy/depth)*(logical.h*.5)*1.55),ry=Math.max(28,(scale[1]*fy/depth)*(logical.h*.5)*1.35);return[{g,x,y,rx,ry}];});
  const nextView=nearestView(angleRef.current);if(mountedRef.current&&nextView!==viewRef.current){viewRef.current=nextView;setViewName(nextView);}
 };
 const animate=(ts:number)=>{try{const dt=Math.min(55,lastRef.current?ts-lastRef.current:16);lastRef.current=ts;if(targetRef.current!=null){const diff=Math.atan2(Math.sin(targetRef.current-angleRef.current),Math.cos(targetRef.current-angleRef.current));angleRef.current+=diff*.18;if(Math.abs(diff)<.012){angleRef.current=targetRef.current;targetRef.current=null;}}else if(autoRotate&&ts>resumeRef.current)angleRef.current+=dt*(Math.PI*2/14000);angleRef.current=normAngle(angleRef.current);draw();rafRef.current=requestAnimationFrame(animate);}catch(e){failRenderer('frame',e);}};
 const onContextCreate=(gl:any)=>{try{setFailure(null);const geom=geometry();if(!geom.vertexCount||!geom.triangleCount)throw new Error('mesh empty'),prog=program(gl,VS,FS),loc={aPos:gl.getAttribLocation(prog,'aPos'),aNormal:gl.getAttribLocation(prog,'aNormal'),uScale:gl.getUniformLocation(prog,'uScale'),uTranslate:gl.getUniformLocation(prog,'uTranslate'),uBodyY:gl.getUniformLocation(prog,'uBodyY'),uProj:gl.getUniformLocation(prog,'uProj'),uCamY:gl.getUniformLocation(prog,'uCamY'),uColor:gl.getUniformLocation(prog,'uColor'),uHuman:gl.getUniformLocation(prog,'uHuman'),uSelA:gl.getUniformLocation(prog,'uSelA'),uSelB:gl.getUniformLocation(prog,'uSelB')};const packed=new Float32Array((geom.p.length/3)*6);for(let i=0;i<geom.p.length/3;i++){packed[i*6]=geom.p[i*3];packed[i*6+1]=geom.p[i*3+1];packed[i*6+2]=geom.p[i*3+2];packed[i*6+3]=geom.n[i*3];packed[i*6+4]=geom.n[i*3+1];packed[i*6+5]=geom.n[i*3+2];}const buf=gl.createBuffer(),ibo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,packed,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,geom.i,gl.STATIC_DRAW);assertGl(gl,'buffers');glRef.current=gl;resRef.current={prog,loc,buf,ibo,count:geom.i.length};draw();assertGl(gl,'first frame');setReady(true);requestAnimationFrame(()=>{if(rafRef.current==null)rafRef.current=requestAnimationFrame(animate);});}catch(e:any){const reason=String(e?.message||e||'unknown renderer error').slice(0,96);console.warn('FORGE native 3D init failed',e);setFailure(reason);setReady(false);}};
 const toggleAt=(x:number,y:number)=>{if(!selectable)return;let best:any=null,score=99;for(const h of hotspotsRef.current){const d=((x-h.x)/h.rx)**2+((y-h.y)/h.ry)**2;if(d<1&&d<score){best=h;score=d;}}if(!best)return;const next=new Set(selectedRef.current);if(next.has(best.g))next.delete(best.g);else next.add(best.g);selectedRef.current=next;const arr=[...next];setInternal(arr);onSelectionChange?.(arr);Haptics.selectionAsync().catch(()=>{});draw();};
 const pan=useMemo(()=>PanResponder.create({onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,onPanResponderGrant:e=>{const p=e.nativeEvent;dragRef.current={x:p.locationX,y:p.locationY,lastX:p.locationX,moved:false};resumeRef.current=performance.now()+3800;},onPanResponderMove:e=>{const x=e.nativeEvent.locationX,dx=x-dragRef.current.lastX;dragRef.current.lastX=x;if(Math.abs(x-dragRef.current.x)>5||Math.abs(e.nativeEvent.locationY-dragRef.current.y)>5)dragRef.current.moved=true;angleRef.current=normAngle(angleRef.current+dx*.012);targetRef.current=null;resumeRef.current=performance.now()+3800;draw();},onPanResponderRelease:e=>{resumeRef.current=performance.now()+3500;if(!dragRef.current.moved)toggleAt(e.nativeEvent.locationX,e.nativeEvent.locationY);}}),[selectable,onSelectionChange]);
 const snap=(name:'front'|'side'|'back')=>{targetRef.current={front:0,side:Math.PI/2,back:Math.PI}[name];resumeRef.current=performance.now()+3200;Haptics.selectionAsync().catch(()=>{});};
 return <View style={[styles.wrap,{height,borderColor:theme.line,backgroundColor:theme.panel2}]} onLayout={e=>{sizeRef.current={w:e.nativeEvent.layout.width,h:e.nativeEvent.layout.height};}}>
  {!ready&&<Image source={require('../../assets/body-poster.png')} resizeMode="contain" style={styles.fallback}/>} 
  <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate}/>
  <View style={StyleSheet.absoluteFill} {...pan.panHandlers}/>
  {failure&&<View style={[styles.failure,{borderColor:theme.line,backgroundColor:theme.panel}]} pointerEvents="none"><Text style={[styles.failureTitle,{color:theme.gold}]}>ANATOMY RENDERER OFFLINE</Text><Text numberOfLines={2} style={[styles.failureText,{color:theme.muted}]}>{failure}</Text></View>}
  <View style={styles.topline} pointerEvents="none"><Text style={[styles.badge,{color:theme.gold,borderColor:theme.line}]}>{ready?'LIVE ANATOMY':'ANATOMY PREVIEW'}</Text><Text style={[styles.view,{color:theme.muted}]}>{viewName.toUpperCase()}</Text></View>
  <View style={styles.snaps}>
   {(['front','side','back'] as const).map(x=><Pressable key={x} onPress={()=>snap(x)} style={[styles.snap,{borderColor:theme.line,backgroundColor:theme.panel}]}><Text style={[styles.snapText,{color:theme.text}]}>{x.toUpperCase()}</Text></Pressable>)}
  </View>
  {selectable&&<View style={styles.selected} pointerEvents="none"><Text style={[styles.selectedText,{color:theme.gold}]}>{internal.length?internal.join(' + '):'Tap a muscle · drag to rotate'}</Text></View>}
 </View>;
}
const styles=StyleSheet.create({failure:{position:'absolute',left:12,right:12,bottom:58,borderWidth:1,padding:9,zIndex:5},failureTitle:{fontSize:7,fontWeight:'900',letterSpacing:1},failureText:{fontSize:7.5,lineHeight:11,fontWeight:'600',marginTop:3},wrap:{borderWidth:1,borderRadius:22,overflow:'hidden',position:'relative'},fallback:{...StyleSheet.absoluteFill,width:'100%',height:'100%',opacity:.82},topline:{position:'absolute',left:12,right:12,top:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},badge:{fontSize:7.5,fontWeight:'900',letterSpacing:1.1,borderWidth:1,borderRadius:999,paddingHorizontal:8,paddingVertical:5},view:{fontSize:8,fontWeight:'900',letterSpacing:1.2},snaps:{position:'absolute',right:10,bottom:10,gap:6},snap:{borderWidth:1,borderRadius:10,paddingHorizontal:9,paddingVertical:7},snapText:{fontSize:7,fontWeight:'900',letterSpacing:.8},selected:{position:'absolute',left:12,bottom:12,maxWidth:'66%'},selectedText:{fontSize:8.5,fontWeight:'900',letterSpacing:.5}});
