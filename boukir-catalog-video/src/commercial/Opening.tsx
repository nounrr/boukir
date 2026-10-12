import {CanvasImage,interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Arabic,colors,ease,Footer,Reveal,Shell,clamp} from './Style';
export const CommercialOpening=()=>{
 const f=useCurrentFrame();const {fps}=useVideoConfig();
 const build=interpolate(f,[0,3*fps],[0,1],ease);
 return <Shell chapter="DE L’IDÉE À LA RÉALISATION">
  <svg width="1548" height="516" style={{position:'absolute',opacity:.35}}>
   <g stroke={colors.gold} fill="none" strokeWidth="1.1" strokeDasharray="2200" strokeDashoffset={2200*(1-build)}>
    <path d="M790 436 H1488 M846 436 V202 L1030 114 L1164 173 V436 M1030 114 V436 M1164 173 L1346 241 V436 M846 202 L1030 289 L1164 173 M1030 289 L1346 356 M880 218 V402 M928 242 V422 M1080 198 V433 M1121 179 V433 M1208 191 V433 M1254 210 V433 M1300 226 V433 M846 254 L1030 338 L1346 390 M846 309 L1030 385 L1346 428"/>
    <path d="M827 196 H1397 M885 196 V93 L895 71 L905 93 V196 M895 92 H1437 M895 108 H1390 M930 108 L956 92 L981 108 L1007 92 L1033 108 L1058 92 L1084 108 L1110 92 L1136 108 L1162 92 L1188 108 L1214 92 L1240 108 L1266 92 L1292 108 L1318 92 L1344 108 M1390 108 V210"/>
   </g>
  </svg>
  <div data-safe="opening-text" style={{position:'absolute',left:60,top:121,width:785}}>
   <Reveal delay={.15} style={{fontSize:20,letterSpacing:5,color:colors.gold,marginBottom:19}}>BOUKIR DIAMOND CONSTRUCTIONS</Reveal>
   <Reveal delay={.35} style={{fontSize:78,fontWeight:700,lineHeight:1.02,letterSpacing:-2}}>Vos projets.<br/><span style={{color:colors.gold}}>Notre passion.</span></Reveal>
   <Reveal delay={.75}><Arabic style={{fontSize:34,marginTop:22,textAlign:'left',color:'#e3dccd'}}>مشاريعكم، شغفنا</Arabic></Reveal>
  </div>
  <CanvasImage src={staticFile('branding/logo.png')} premountFor={fps} style={{position:'absolute',right:230,top:104,width:279,height:315,objectFit:'contain',opacity:interpolate(f,[.4*fps,1.2*fps],[0,1],clamp),scale:interpolate(f,[.4*fps,6*fps],[.88,1.025],ease),filter:'drop-shadow(0px 14px 18px #0008)'}}/>
  <Footer label="VOTRE PARTENAIRE À TANGER"/>
 </Shell>;
};
