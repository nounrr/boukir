import {CanvasImage,staticFile,useVideoConfig} from 'remotion';
import data from '../data/commercial.json';
import {Arabic,colors,Reveal,Shell} from './Style';
export const CommercialContact=()=>{
 const {fps}=useVideoConfig();
 return <Shell chapter="DONNONS VIE À VOS PROJETS">
  <Reveal delay={.1} style={{position:'absolute',left:92,top:114}}><CanvasImage src={staticFile('branding/logo.png')} premountFor={fps} style={{width:266,height:302,objectFit:'contain',filter:'drop-shadow(0 14px 20px #0008)'}}/></Reveal>
  <div style={{position:'absolute',left:422,top:117,width:1066}}>
   <Reveal delay={.15} style={{fontSize:21,letterSpacing:5,color:colors.gold,marginBottom:18}}>RENDEZ-VOUS CHEZ BOUKIR DIAMOND</Reveal>
   <Reveal delay={.3} style={{fontSize:76,fontWeight:700,lineHeight:1.1,letterSpacing:-1}}>boukirdiamond.com</Reveal>
   <Reveal delay={.55}><Arabic style={{fontSize:33,textAlign:'left',color:colors.gold,marginTop:17}}>زورونا في طنجة أو عبر موقعنا</Arabic></Reveal>
   <Reveal delay={.7} style={{display:'flex',alignItems:'center',gap:26,marginTop:24}}><span style={{width:40,height:40,border:'1.5px solid #d7b366',borderRadius:'50%',fontSize:26,textAlign:'center',lineHeight:'42px',color:colors.gold}}>☎</span><span style={{fontSize:47,fontWeight:600,letterSpacing:3}}>{data.contact.phone.replace(/(\d{2})(?=\d)/g,'$1 ')}</span><span style={{fontSize:24,color:colors.muted}}>TANGER</span></Reveal>
   <Reveal delay={.85} style={{fontSize:23,color:colors.muted,marginTop:18}}>{data.contact.email}</Reveal>
  </div>
  <div data-safe="contact-address" style={{position:'absolute',left:60,right:60,bottom:35,borderTop:'1px solid #d7b36640',paddingTop:17,display:'flex',justifyContent:'space-between',fontSize:17,color:colors.muted}}><span>IKAMAT REDOUAN 1 · AZIB HAJ KADDOUR · LOCAL 1 & N° 2 · TANGER</span><span>MATÉRIAUX • OUTILLAGE • FINITIONS</span></div>
 </Shell>;
};
