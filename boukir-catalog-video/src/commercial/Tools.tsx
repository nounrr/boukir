import data from '../data/commercial.json';
import {Arabic,colors,Footer,ProductPhoto,Reveal,Shell,Stage} from './Style';
export const CommercialTools=()=>{
 const tools=data.products.filter(p=>p.group==='tools');
 return <Shell chapter="01 / OUTILLAGE">
  <div data-safe="tools-text" style={{position:'absolute',left:60,top:130,width:665}}>
   <Reveal delay={.15} style={{color:colors.gold,fontSize:21,letterSpacing:5,marginBottom:18}}>L’ÉQUIPEMENT DU CHANTIER</Reveal>
   <Reveal delay={.3} style={{fontSize:72,fontWeight:700,lineHeight:1.04}}>Passez<br/><span style={{color:colors.gold}}>à l’action.</span></Reveal>
   <Reveal delay={.6}><Arabic style={{fontSize:32,textAlign:'left',marginTop:18}}>أدوات ومعدات لكل مشروع</Arabic></Reveal>
   <Reveal delay={.85} style={{fontSize:23,color:colors.muted,marginTop:12}}>Meuleuses • Outils électriques • Accessoires</Reveal>
  </div>
  <Stage>
   {tools.slice(0,2).map((p,i)=><ProductPhoto key={p.id} src={p.image} left={40+i*355} width={300} height={239} delay={.2+i*.28} rotate={i===0?-8:8}/>)}
   <div data-safe="tools-labels" style={{position:'absolute',bottom:24,left:39,right:39,display:'flex',gap:40,color:'#464439',fontSize:20}}>{tools.slice(0,2).map(p=><div key={p.id} style={{width:310,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{p.name.replace(/Meuleuse\s*/i,'')}</div>)}</div>
  </Stage>
  <Footer/>
 </Shell>;
};
