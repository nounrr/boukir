import {CanvasImage,staticFile,interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import {products,price,title} from './catalog';
import {Shell,palette,clamp} from './design';
export const Recap=()=>{
  const f=useCurrentFrame();const {fps}=useVideoConfig();
  return <Shell dark>
    <div style={{position:'absolute',left:58,top:78,fontSize:40,fontWeight:700,letterSpacing:-1}}>Votre sélection Kerakoll.</div>
    <div style={{position:'absolute',right:58,top:96,fontSize:18,color:palette.gold}}>7 ARTICLES · IMAGES ET PRIX DU SITE</div>
    <div style={{position:'absolute',left:58,right:58,top:142,display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:12}}>
      {products.map((p,i)=><div key={p.reference} style={{background:palette.paper,color:palette.ink,borderRadius:16,overflow:'hidden',height:290,opacity:interpolate(f,[i*.1*fps,(i*.1+.55)*fps],[0,1],clamp),translate:`0px ${interpolate(f,[i*.1*fps,(i*.1+.7)*fps],[30,0],clamp)}px`}}>
        <div style={{background:'#fff',height:158,padding:8}}><CanvasImage src={staticFile(p.image)} premountFor={fps} style={{width:'100%',height:'100%',objectFit:'contain'}}/></div>
        <div style={{padding:'12px 13px'}}><div style={{fontSize:13,color:palette.muted,letterSpacing:1,marginBottom:6}}>RÉF. {p.reference}</div><div style={{fontSize:18,lineHeight:1.12,fontWeight:700,height:43}}>{title(p)}</div><div style={{fontSize:p.variants.length?17:25,fontWeight:700,marginTop:6}}>{price(p)}{p.variants.length?'*':''}</div><div style={{fontSize:12,marginTop:4,opacity:.7}}>{p.variants.length?'68 teintes · tarifs à confirmer':'KERAKOLL · SILICONE'}</div></div>
      </div>)}
    </div>
    <div style={{position:'absolute',left:58,top:448,fontSize:14,opacity:.65}}>* Silicone Coloré : prix publiés {price(products[1])}. Prix à 0 DH à confirmer. Tarifs relevés le 11/10/2026.</div>
  </Shell>;
};
