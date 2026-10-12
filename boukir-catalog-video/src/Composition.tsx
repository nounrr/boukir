import {Series,useVideoConfig} from 'remotion';
import {Intro} from './Intro';
import {ProductScene} from './ProductScene';
import {Recap} from './Recap';
export const CatalogVideo=()=>{
  const {fps}=useVideoConfig();
  return <Series>
    <Series.Sequence name="Introduction" durationInFrames={4*fps} premountFor={fps}><Intro/></Series.Sequence>
    <Series.Sequence name="6140 Bioscud" durationInFrames={12*fps} premountFor={fps}><ProductScene index={0}/></Series.Sequence>
    <Series.Sequence name="6190 Silicone Colore - 68 variantes" durationInFrames={12*fps} premountFor={fps}><ProductScene index={1}/></Series.Sequence>
    <Series.Sequence name="1285 Tetra Fix Blanc" durationInFrames={12*fps} premountFor={fps}><ProductScene index={2}/></Series.Sequence>
    <Series.Sequence name="1284 Tetra Fix Crystal" durationInFrames={12*fps} premountFor={fps}><ProductScene index={3}/></Series.Sequence>
    <Series.Sequence name="1286 Tetra Fix Gris" durationInFrames={12*fps} premountFor={fps}><ProductScene index={4}/></Series.Sequence>
    <Series.Sequence name="1354 Tetra Fix Noir" durationInFrames={12*fps} premountFor={fps}><ProductScene index={5}/></Series.Sequence>
    <Series.Sequence name="7059 Tetra Seal Gris" durationInFrames={12*fps} premountFor={fps}><ProductScene index={6}/></Series.Sequence>
    <Series.Sequence name="Recapitulatif des 7 articles" durationInFrames={8*fps} premountFor={fps}><Recap/></Series.Sequence>
  </Series>;
};
