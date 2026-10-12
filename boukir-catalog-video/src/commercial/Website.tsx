import {CanvasImage,interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import data from '../data/commercial.json';
import {Arabic,Footer,Reveal,Shell,clamp,ease} from './Style';
export const CommercialWebsite=()=>{
 const f=useCurrentFrame();const {fps}=useVideoConfig();
 const items=f<2.5*fps?data.products.slice(0,6):data.products.filter(p=>p.group==='finishes');
 const search=interpolate(f,[1.2*fps,2.3*fps],[0,8],clamp);
 return <Shell chapter="04 / BOUTIQUE EN LIGNE" light>
  <div data-safe="website-text" style={{position:'absolute',left:60,top:139,width:570}}>
   <Reveal delay={.15} style={{fontSize:20,letterSpacing:4,color:'#8c6a2d',marginBottom:20}}>VOTRE PROJET, EN QUELQUES CLICS</Reveal>
   <Reveal delay={.35} style={{fontSize:66,fontWeight:700,lineHeight:1.04}}>Explorez.<br/>Choisissez.<br/><span style={{color:'#9e7735'}}>Commandez.</span></Reveal>
   <Reveal delay={.7}><Arabic style={{fontSize:29,textAlign:'left',marginTop:14}}>اكتشفوا منتجاتنا عبر الموقع</Arabic></Reveal>
  </div>
  <div data-safe="website-demo" style={{position:'absolute',left:692,right:60,top:103,height:328,background:'#fff',border:'1px solid #d5d2c9',borderRadius:10,overflow:'hidden',boxShadow:'0 16px 35px #19180f26',translate:`${interpolate(f,[0,.8*fps],[100,0],ease)}px 0px`,opacity:interpolate(f,[0,.6*fps],[0,1],clamp)}}>
   <div style={{height:37,display:'flex',alignItems:'center',background:'#e7e7e3',padding:'0 15px',gap:7}}><i style={{width:7,height:7,borderRadius:'50%',background:'#b5b4ac'}}/><i style={{width:7,height:7,borderRadius:'50%',background:'#b5b4ac'}}/><i style={{width:7,height:7,borderRadius:'50%',background:'#b5b4ac'}}/><div style={{marginLeft:18,width:510,textAlign:'center',background:'#f7f7f3',padding:5,borderRadius:4,fontSize:16,color:'#52544e'}}>boukirdiamond.com</div></div>
   <div style={{height:49,background:'#10251d',color:'#fff',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 25px'}}><b style={{fontSize:21,letterSpacing:1}}>BOUKIR</b><span style={{fontSize:15,wordSpacing:17}}>Boutique Marques Contact</span></div>
   <div style={{padding:'13px 22px',display:'flex',alignItems:'center',gap:17}}><span style={{fontSize:18,fontWeight:600}}>Catalogue</span><div style={{height:30,border:'1px solid #d8dbd3',borderRadius:5,width:478,padding:'5px 11px',fontSize:17,color:'#666'}}>⌕ {'Kerakoll'.slice(0,Math.floor(search))}<span style={{opacity:Math.floor(f/12)%2}}>│</span></div></div>
   <div style={{display:'flex',gap:11,padding:'0 22px',translate:`${interpolate(f,[3*fps,5.9*fps],[0,-60],ease)}px 0px`,width:1210}}>{items.map(p=><div key={p.id} style={{width:223,height:157,border:'1px solid #e3e4de',borderRadius:5,flexShrink:0,padding:10}}><CanvasImage src={staticFile(p.image)} premountFor={fps} style={{width:201,height:93,objectFit:'contain'}}/><div style={{fontSize:15,lineHeight:1.18,height:34,overflow:'hidden',marginTop:5}}>{p.name}</div><div style={{fontSize:11,color:'#899480',marginTop:4}}>Voir le produit →</div></div>)}</div>
   <div style={{position:'absolute',right:30,top:interpolate(f,[.5*fps,1.5*fps,3*fps,5*fps],[250,112,112,272],ease),fontSize:30,color:'#182019',filter:'drop-shadow(2px 2px 1px white)',rotate:'-20deg'}}>➤</div>
  </div>
  <Footer label="LIVRAISON PARTOUT AU MAROC"/>
 </Shell>;
};
