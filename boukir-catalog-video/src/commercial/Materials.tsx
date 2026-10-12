import {interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import data from '../data/commercial.json';
import {Arabic,colors,Footer,ProductPhoto,Reveal,Shell,Stage,ease} from './Style';
export const CommercialMaterials=()=>{
 const f=useCurrentFrame();const {fps}=useVideoConfig();
 const products=data.products.filter(p=>p.group==='materials');
 return <Shell chapter="02 / MATÉRIAUX">
  <svg width="1548" height="516" style={{position:'absolute',opacity:.15}}><g fill="none" stroke={colors.gold} strokeWidth="1.2">{Array.from({length:6},(_,row)=>Array.from({length:6},(_,col)=><rect key={`${row}-${col}`} x={775+col*135-(row%2)*65} y={130+row*58+interpolate(f,[(row*.14)*fps,(row*.14+1)*fps],[80,0],ease)} width="129" height="51" opacity={interpolate(f,[row*.14*fps,(row*.14+.8)*fps],[0,1],ease)}/>))}</g></svg>
  <div data-safe="materials-text" style={{position:'absolute',left:60,top:130,width:670}}>
   <Reveal delay={.1} style={{color:colors.gold,fontSize:21,letterSpacing:5,marginBottom:18}}>CHAQUE ÉTAPE COMPTE</Reveal>
   <Reveal delay={.3} style={{fontSize:70,fontWeight:700,lineHeight:1.04}}>Construisez<br/><span style={{color:colors.gold}}>avec confiance.</span></Reveal>
   <Reveal delay={.6}><Arabic style={{fontSize:32,textAlign:'left',marginTop:18}}>مواد البناء لمشاريعكم</Arabic></Reveal>
   <Reveal delay={.85} style={{fontSize:23,color:colors.muted,marginTop:12}}>Matériaux • Mortiers • Colles</Reveal>
  </div>
  <Stage>
   {products.slice(0,2).map((p,i)=><ProductPhoto key={p.id} src={p.image} left={52+i*350} width={285} height={245} delay={.2+i*.25} rotate={i===0?-4:4}/>)}
   <div style={{position:'absolute',bottom:23,left:60,right:60,display:'flex',justifyContent:'space-between',fontSize:23,color:'#464439'}}><span>SIKA 522 · 25 kg</span><span>SIKA I 80 · 25 kg</span></div>
  </Stage>
  <Footer/>
 </Shell>;
};
