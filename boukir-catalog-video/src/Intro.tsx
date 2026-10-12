import {CanvasImage,interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Shell,palette,clamp} from './design';
export const Intro=()=>{
  const f=useCurrentFrame(); const {fps}=useVideoConfig();
  return <Shell dark>
    <div style={{position:'absolute',left:72,top:124,opacity:interpolate(f,[0,.6*fps],[0,1],clamp),translate:`0px ${interpolate(f,[0,.9*fps],[25,0],clamp)}px`}}>
      <div style={{fontSize:19,letterSpacing:5,color:palette.gold,marginBottom:20}}>LA SÉLECTION BOUKIR DIAMOND</div>
      <div style={{fontSize:86,lineHeight:.97,letterSpacing:-4,fontWeight:700}}>Kerakoll.</div>
      <div style={{fontSize:52,marginTop:15,letterSpacing:-2}}>La collection silicone.</div>
      <div style={{fontSize:24,marginTop:29,opacity:.65}}>7 articles · 68 variantes de silicone coloré</div>
    </div>
    <CanvasImage src={staticFile('branding/logo.png')} premountFor={fps} style={{position:'absolute',right:132,top:84,width:334,height:369,objectFit:'contain',opacity:interpolate(f,[0,.8*fps],[0,1],clamp),scale:interpolate(f,[0,4*fps],[.94,1],clamp),translate:`0px ${interpolate(f,[0,.8*fps],[20,0],clamp)}px`}}/>
    <div style={{position:'absolute',left:0,bottom:0,height:5,background:palette.gold,width:interpolate(f,[0,4*fps],[0,1548],clamp)}}/>
  </Shell>;
};
