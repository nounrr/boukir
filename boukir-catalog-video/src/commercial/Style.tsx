import React from 'react';
import {AbsoluteFill, CanvasImage, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
export const colors={ink:'#111210',gold:'#D7B366',cream:'#F2EEE3',muted:'#AAA79E'};
export const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
export const ease={...clamp,easing:Easing.bezier(.16,1,.3,1)};
export const enter=(frame:number,fps:number,delay=0)=>interpolate(frame,[delay*fps,(delay+.8)*fps],[0,1],ease);
export const Arabic=({children,style}: {children:React.ReactNode;style?:React.CSSProperties})=><div dir="rtl" style={{fontFamily:'Tahoma, Arial, sans-serif',lineHeight:1.5,...style}}>{children}</div>;
export const Brand=()=>{
  const {fps}=useVideoConfig();
  return <div data-safe="brand" style={{position:'absolute',left:60,top:35,display:'flex',alignItems:'center',gap:13,height:46,zIndex:10}}>
    <CanvasImage src={staticFile('branding/logo.png')} premountFor={fps} style={{width:42,height:46,objectFit:'contain'}}/>
    <div style={{fontSize:22,fontWeight:700,letterSpacing:2}}>BOUKIR <span style={{color:colors.gold,fontWeight:400}}>DIAMOND</span></div>
  </div>;
};
export const Shell=({children,chapter,light=false}: {children:React.ReactNode;chapter:string;light?:boolean})=>{
 const f=useCurrentFrame(); const {fps}=useVideoConfig();
 return <AbsoluteFill style={{background:light?colors.cream:colors.ink,color:light?colors.ink:colors.cream,fontFamily:'Bahnschrift, Arial, sans-serif',overflow:'hidden'}}>
  <AbsoluteFill style={{background:light?'radial-gradient(ellipse at 80% 70%, #fff 0%, #f2eee3 60%)':'radial-gradient(ellipse at 78% 60%, #373124 0%, #171814 43%, #111210 80%)'}}/>
  <svg width="1548" height="516" style={{position:'absolute',opacity:light?.10:.09}}>
   <defs><pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0 H0 V64" fill="none" stroke={light?'#2d302b':'#dbbc7a'} strokeWidth=".6"/></pattern></defs>
   <rect width="1548" height="516" fill="url(#grid)"/>
   <path d="M0 466 L1548 466 M1054 0 L1054 516" stroke={colors.gold} strokeWidth="1"/>
  </svg>
  <div style={{position:'absolute',left:interpolate(f,[0,7*fps],[-240,1400],clamp),top:0,width:130,height:516,background:'linear-gradient(90deg,transparent,#dab86d0a,transparent)',rotate:'-18deg'}}/>
  <Brand/>
  <div data-safe="chapter" style={{position:'absolute',right:60,top:43,fontSize:18,color:light?'#766448':colors.gold,letterSpacing:3}}>{chapter}</div>
  {children}
 </AbsoluteFill>;
};
export const Reveal=({children,delay=0,style}: {children:React.ReactNode;delay?:number;style?:React.CSSProperties})=>{
 const frame=useCurrentFrame(); const {fps}=useVideoConfig();
 return <div style={{opacity:interpolate(frame,[delay*fps,(delay+.6)*fps],[0,1],clamp),translate:`0px ${interpolate(frame,[delay*fps,(delay+.8)*fps],[32,0],ease)}px`,...style}}>{children}</div>;
};
export const Footer=({label='MATÉRIAUX • OUTILLAGE • FINITIONS'}:{label?:string})=><div data-safe="footer" style={{position:'absolute',left:60,right:60,bottom:35,display:'flex',justifyContent:'space-between',fontSize:17,letterSpacing:2,color:colors.muted}}><span>{label}</span><span>boukirdiamond.com</span></div>;
export const Stage=({children}:{children:React.ReactNode})=><div style={{position:'absolute',right:60,top:112,width:742,height:326,background:'linear-gradient(135deg,#fffdf7,#e3dfd5)',clipPath:'polygon(5% 0,100% 0,100% 88%,95% 100%,0 100%,0 12%)'}}>{children}</div>;
export const ProductPhoto=({src,left,width=260,height=250,delay=0,rotate=0}:{src:string;left:number;width?:number;height?:number;delay?:number;rotate?:number})=>{
 const f=useCurrentFrame(); const {fps}=useVideoConfig();
 return <div style={{position:'absolute',left,top:16,width,height,opacity:interpolate(f,[delay*fps,(delay+.6)*fps],[0,1],clamp),translate:`${interpolate(f,[delay*fps,(delay+.9)*fps],[55,0],ease)}px ${interpolate(f,[delay*fps,(delay+.9)*fps],[28,0],ease)+Math.sin(f/fps*1.1+left)*3}px`,rotate:`${interpolate(f,[delay*fps,(delay+1)*fps],[rotate,0],ease)}deg`,scale:interpolate(f,[0,7*fps],[.95,1.035],clamp)}}>
  <CanvasImage src={staticFile(src)} premountFor={fps} style={{width,height,objectFit:'contain',mixBlendMode:'multiply'}}/>
  <div style={{position:'absolute',bottom:-18,left:'15%',width:'70%',height:10,borderRadius:'50%',background:'#39342635',filter:'blur(9px)'}}/>
 </div>;
};
