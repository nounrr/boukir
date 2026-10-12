import {CanvasImage,interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';
import {Component,type ReactNode} from 'react';
import {products,price,title,number,type Product} from './catalog';
import {Shell,palette,clamp} from './design';
class MediaFallback extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
const ProductMedia=({product,compact=false}:{product:Product;compact?:boolean})=>{
  const f=useCurrentFrame();const {fps}=useVideoConfig();
  const fallback=<CanvasImage src={staticFile(product.image)} premountFor={fps} style={{width:'100%',height:'100%',objectFit:'contain',scale:interpolate(f,[0,12*fps],[.9,1.04],clamp),translate:`${interpolate(f,[0,12*fps],[-8,8],clamp)}px ${interpolate(f,[0,12*fps],[5,-5],clamp)}px`,transform:`perspective(1200px) rotateY(${interpolate(f,[0,12*fps],[-3,3],clamp)}deg)`}}/>;
  return <div style={{position:'absolute',left:74,top:compact?132:94,width:compact?335:588,height:compact?280:351,background:'#e9eae4',borderRadius:30,overflow:'hidden',opacity:interpolate(f,[0,.6*fps],[0,1],clamp)}}>
    {product.hasVideo&&product.usageVideo&&f<Math.min(product.usageVideoDuration??12,12)*fps?<MediaFallback fallback={fallback}><Video src={staticFile(product.usageVideo)} premountFor={fps} durationInFrames={Math.round(Math.min(product.usageVideoDuration??12,12)*fps)} muted objectFit="contain" style={{width:'100%',height:'100%'}}/></MediaFallback>:fallback}
    <div style={{position:'absolute',left:19,top:18,padding:'7px 12px',background:palette.paper,borderRadius:7,fontSize:15,color:palette.ink}}>KERAKOLL</div>
  </div>;
};
export const ProductScene=({index}:{index:number})=>{
  const p=products[index];const f=useCurrentFrame();const {fps}=useVideoConfig();
  const variantView=p.variants.length>0&&f>=3*fps&&f<10*fps;
  const page=Math.min(Math.floor((f-3*fps)/(7*fps/Math.ceil(p.variants.length/12))),Math.ceil(p.variants.length/12)-1);
  const shown=p.variants.slice(Math.max(0,page)*12,Math.max(0,page)*12+12);
  return <Shell>
    <ProductMedia product={p} compact={variantView}/>
    {variantView?<>
      <div style={{position:'absolute',left:462,top:84,right:74,display:'flex',justifyContent:'space-between',alignItems:'baseline'}}><div style={{fontSize:34,fontWeight:700}}>Silicone Coloré <span style={{fontSize:21,fontWeight:400}}>· 68 teintes</span></div><div style={{fontSize:18}}>NUANCIER {page+1}/6</div></div>
      <div style={{position:'absolute',left:462,top:137,right:74,display:'grid',gridTemplateColumns:'repeat(6, 1fr)',gap:11}}>
        {shown.map(v=><div key={v.id} style={{background:'#fff',border:'1px solid #e2e5dc',borderRadius:12,height:135,overflow:'hidden',display:'flex',flexDirection:'column',alignItems:'center'}}>
          {v.image?<CanvasImage src={staticFile(v.image)} premountFor={fps} style={{width:'100%',height:90,objectFit:'contain'}}/>:<div style={{height:90,display:'flex',alignItems:'center',fontSize:14}}>Image indisponible</div>}
          <div style={{fontSize:17,fontWeight:700,display:'flex',gap:7,alignItems:'center'}}>{v.variant.color&&/^#?[0-9a-f]{6}$/i.test(v.variant.color)?<span style={{width:11,height:11,border:'1px solid #aaa',borderRadius:3,background:'#'+v.variant.color.replace('#','')}}/>:null}{v.name}</div>
          <div style={{fontSize:15,opacity:.7}}>{number(v.price)} DH{v.price===0?'*':''}</div>
        </div>)}
      </div>
      <div style={{position:'absolute',left:74,top:425,fontSize:18}}>Réf. {p.reference}</div>
      <div style={{position:'absolute',left:462,top:425,fontSize:16,opacity:.7}}>* Prix à 0 DH à confirmer · Codes couleur du site · Références variantes non renseignées</div>
    </>:<div style={{position:'absolute',left:738,top:105,width:735,opacity:interpolate(f,[.15*fps,.9*fps],[0,1],clamp),translate:`${interpolate(f,[0,.9*fps],[35,0],clamp)}px 0px`}}>
      <div style={{fontSize:17,letterSpacing:4,color:palette.olive,marginBottom:19}}>ARTICLE {String(index+1).padStart(2,'0')} / 07</div>
      <div style={{fontSize:title(p).length>24?46:61,lineHeight:1.08,fontWeight:700,letterSpacing:-2,maxWidth:715}}>{title(p)}</div>
      <div style={{fontSize:21,marginTop:17,opacity:.65}}>{p.name}</div>
      <div style={{display:'flex',gap:14,marginTop:24,alignItems:'center'}}><div style={{border:'1px solid '+palette.line,padding:'9px 16px',borderRadius:7,fontSize:19}}>Réf. {p.reference}</div><div style={{fontSize:19,color:palette.olive}}>{p.variants.length?`${p.variants.length} variantes · même article`:'SILICONE · KERAKOLL'}</div></div>
      <div style={{fontSize:p.variants.length?53:76,fontWeight:700,letterSpacing:-3,marginTop:22,color:palette.ink}}>{price(p)}{p.variants.some(v=>v.price===0)?'*':''}<span style={{fontSize:19,fontWeight:400,letterSpacing:0,marginLeft:13}}> / pièce</span></div>
      {p.variants.some(v=>v.price===0)?<div style={{fontSize:17,opacity:.65,marginTop:5}}>* Prix à 0 DH à confirmer auprès de Boukir Diamond.</div>:null}
    </div>}
    <div style={{position:'absolute',left:74,bottom:61,display:'flex',gap:8}}>{products.map((_,i)=><div key={i} style={{width:25,height:4,borderRadius:4,background:i===index?palette.olive:palette.line}}/>)}</div>
    <div style={{position:'absolute',bottom:0,left:0,height:4,background:palette.olive,width:interpolate(f,[0,12*fps],[0,1548],clamp)}}/>
  </Shell>;
};
