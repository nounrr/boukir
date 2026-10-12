import {Audio} from '@remotion/media';
import {AbsoluteFill,interpolate,Sequence,Series,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {CommercialOpening} from './Opening';
import {CommercialTools} from './Tools';
import {CommercialMaterials} from './Materials';
import {CommercialFinishes} from './Finishes';
import {CommercialWebsite} from './Website';
import {CommercialContact} from './Contact';
import {clamp,colors} from './Style';
const ConstructionWipe=()=>{
 const f=useCurrentFrame();const {fps}=useVideoConfig();
 return <AbsoluteFill style={{overflow:'hidden',pointerEvents:'none'}}>
  <div style={{position:'absolute',left:0,top:-120,height:760,width:1900,background:colors.gold,rotate:'-11deg',translate:`${interpolate(f,[0,.2*fps,.4*fps],[-2200,0,2200],clamp)}px 0px`}}/>
  <div style={{position:'absolute',left:0,top:-120,height:760,width:1780,background:colors.ink,rotate:'-11deg',translate:`${interpolate(f,[0,.2*fps,.4*fps],[-2260,-60,2200],clamp)}px 0px`}}/>
 </AbsoluteFill>;
};
export const BoukirCommercial=()=>{
 const {fps}=useVideoConfig();
 return <AbsoluteFill>
  <Series>
   <Series.Sequence name="Signature Boukir" durationInFrames={6*fps} premountFor={fps}><CommercialOpening/></Series.Sequence>
   <Series.Sequence name="Outillage" durationInFrames={7*fps} premountFor={fps}><CommercialTools/></Series.Sequence>
   <Series.Sequence name="Matériaux" durationInFrames={7*fps} premountFor={fps}><CommercialMaterials/></Series.Sequence>
   <Series.Sequence name="Finitions" durationInFrames={7*fps} premountFor={fps}><CommercialFinishes/></Series.Sequence>
   <Series.Sequence name="Catalogue en ligne" durationInFrames={7*fps} premountFor={fps}><CommercialWebsite/></Series.Sequence>
   <Series.Sequence name="Contact et adresse" durationInFrames={6*fps} premountFor={fps}><CommercialContact/></Series.Sequence>
  </Series>
  <Sequence name="Transition vers outillage" from={6*fps-.2*fps} durationInFrames={.4*fps} premountFor={fps}><ConstructionWipe/></Sequence>
  <Sequence name="Transition vers matériaux" from={13*fps-.2*fps} durationInFrames={.4*fps} premountFor={fps}><ConstructionWipe/></Sequence>
  <Sequence name="Transition vers finitions" from={20*fps-.2*fps} durationInFrames={.4*fps} premountFor={fps}><ConstructionWipe/></Sequence>
  <Sequence name="Transition vers site" from={27*fps-.2*fps} durationInFrames={.4*fps} premountFor={fps}><ConstructionWipe/></Sequence>
  <Sequence name="Transition vers contact" from={34*fps-.2*fps} durationInFrames={.4*fps} premountFor={fps}><ConstructionWipe/></Sequence>
  <Audio src={staticFile('commercial/original-soundtrack.wav')} premountFor={fps} volume={.7}/>
 </AbsoluteFill>;
};
