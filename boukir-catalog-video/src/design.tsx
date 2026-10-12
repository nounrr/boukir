import {AbsoluteFill,CanvasImage,staticFile,interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import type {ReactNode} from 'react';
export const palette={ink:'#233830',paper:'#f4f2eb',olive:'#667753',muted:'#747e72',line:'#d9ddce',gold:'#c4db83'};
export const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
export const Shell=({children,dark=false}: {children:ReactNode;dark?:boolean})=>{
  const f=useCurrentFrame(); const {fps}=useVideoConfig();
  return <AbsoluteFill style={{background:dark?palette.ink:palette.paper,color:dark?palette.paper:palette.ink,fontFamily:'Arial, Helvetica, sans-serif',overflow:'hidden'}}>
    <div style={{position:'absolute',width:700,height:700,border:'1px solid',borderColor:dark?'#536148':palette.line,borderRadius:'50%',right:-130,top:-350,translate:`${interpolate(f,[0,12*fps],[0,40],clamp)}px 0px`,opacity:.6}}/>
    <div style={{position:'absolute',width:490,height:490,border:'1px solid',borderColor:dark?'#536148':palette.line,borderRadius:'50%',right:-30,top:-255,opacity:.45}}/>
    <div style={{position:'absolute',left:58,top:14,display:'flex',alignItems:'center',gap:12,fontSize:20,fontWeight:700,letterSpacing:2}}>
      <CanvasImage src={staticFile('branding/logo.png')} premountFor={fps} style={{width:48,height:55,objectFit:'contain'}}/>
      BOUKIR <span style={{fontWeight:400,opacity:.6,fontSize:15}}>DIAMOND</span>
    </div>
    <div style={{position:'absolute',right:58,top:32,fontSize:16,letterSpacing:3,opacity:.65}}>KERAKOLL / SILICONE</div>
    {children}
    <div style={{position:'absolute',bottom:26,left:58,fontSize:16,letterSpacing:1,opacity:.65}}>boukirdiamond.com</div>
    <div style={{position:'absolute',bottom:26,right:58,fontSize:14,letterSpacing:2,opacity:.65}}>CATALOGUE · 11 OCTOBRE 2026</div>
  </AbsoluteFill>;
};
