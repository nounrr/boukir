import {interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import data from '../data/commercial.json';
import {Arabic,colors,Footer,ProductPhoto,Reveal,Shell,Stage,ease} from './Style';
export const CommercialFinishes=()=>{
 const f=useCurrentFrame();const {fps}=useVideoConfig();
 const products=data.products.filter(p=>p.group==='finishes');
 return <Shell chapter="03 / FINITIONS">
  <div data-safe="finishes-text" style={{position:'absolute',left:60,top:130,width:680}}>
   <Reveal delay={.1} style={{color:colors.gold,fontSize:21,letterSpacing:5,marginBottom:18}}>LE SENS DU DÉTAIL</Reveal>
   <Reveal delay={.3} style={{fontSize:72,fontWeight:700,lineHeight:1.04}}>La finition<br/><span style={{color:colors.gold}}>fait la différence.</span></Reveal>
   <Reveal delay={.6}><Arabic style={{fontSize:31,textAlign:'left',marginTop:18}}>جمال المشروع في تفاصيله</Arabic></Reveal>
   <Reveal delay={.85} style={{fontSize:23,color:colors.muted,marginTop:12}}>Kerakoll • Colles • Silicones</Reveal>
  </div>
  <Stage>
   {products.slice(0,3).map((p,i)=><ProductPhoto key={p.id} src={p.image} left={27+i*239} width={210} height={238} delay={.15+i*.23} rotate={(i-1)*5}/>)}
   <div style={{position:'absolute',bottom:34,left:33,right:33,display:'flex',justifyContent:'space-around',fontSize:21,color:'#464439'}}><span>H40 GEL</span><span>H40 ICON</span><span>SILICONE COLORÉ</span></div>
   <div style={{position:'absolute',bottom:0,left:0,width:interpolate(f,[.5*fps,1.8*fps],[0,742],ease),height:7,background:'linear-gradient(90deg,#c7bead,#a8967e,#443b36,#ad7652,#ece6db)'}}/>
  </Stage>
  <Footer/>
 </Shell>;
};
