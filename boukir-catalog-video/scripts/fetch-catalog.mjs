import {mkdir, writeFile, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://boukirdiamond.com';
const sourceUrl = `${origin}/en/shop?category_id=107&brand_id=1`;
const apiUrl = `${origin}/api/ecommerce/products?category_id=107&brand_id=1&per_page=100&in_stock_only=false`;
async function request(url) {
  for(let attempt=0;attempt<3;attempt++) {
    try {const r=await fetch(url,{signal:AbortSignal.timeout(15000)}); if(!r.ok) throw new Error(`HTTP ${r.status}: ${url}`); return r;} catch(e) {if(attempt===2) throw e;}
  }
}
await mkdir(path.join(root,'data'),{recursive:true});
await mkdir(path.join(root,'public/products'),{recursive:true});
await mkdir(path.join(root,'src/data'),{recursive:true});
const cached=process.argv.includes('--cached')?JSON.parse(await readFile(path.join(root,'data/source.json'),'utf8')):null;
const listing=cached?.listing??await (await request(apiUrl)).json();
if(listing.pagination.total_items!==7 || listing.products.length!==7) throw new Error('La sélection du site ne contient plus exactement 7 produits. Vérifier la sélection avant de rendre.');
const details=cached?.details??await Promise.all(listing.products.map(p=>request(`${origin}/api/ecommerce/products/${p.id}`).then(r=>r.json())));
await writeFile(path.join(root,'data/source.json'),JSON.stringify({sourceUrl,apiUrl,retrievedAt:cached?.retrievedAt??new Date().toISOString(),listing,details},null,2));
const downloads=new Map();
async function image(src) {
  if(!src) return null;
  const url=new URL(src,origin).href;
  if(downloads.has(url)) return downloads.get(url);
  const pending=(async()=>{
    const file=`products/${path.basename(new URL(url).pathname)}`;
    try {if((await stat(path.join(root,'public',file))).size>0) return file;} catch {}
    try {
      const r=await request(url);
      if(!r.headers.get('content-type')?.startsWith('image/')) throw new Error(`Image invalide: ${url}`);
      await writeFile(path.join(root,'public',file),Buffer.from(await r.arrayBuffer()));
    } catch(error) {
      const result=spawnSync('curl.exe',['--fail','--silent','--show-error','--location','--max-time','30','--retry','2',url,'--output',path.join(root,'public',file)],{encoding:'utf8',windowsHide:true});
      if(result.status!==0) throw error;
    }
    return file;
  })();
  downloads.set(url,pending); return pending;
}
const products=[];
const failures=[];
const assets=[...new Set(details.flatMap(p=>[p.image_url,...(p.variants??[]).map(v=>v.image_url)]).filter(Boolean))];
let next=0;
await Promise.all(Array.from({length:6},async()=>{
  while(next<assets.length) {
    const src=assets[next++];
    try {await image(src);} catch(e) {failures.push({source:src,error:String(e)});}
  }
}));
await writeFile(path.join(root,'data/image-download-report.json'),JSON.stringify(failures,null,2));
for(const p of details) {
  const variants=[];
  // Only the site's explicit variants array establishes a shared parent.
  for(const v of p.variants??[]) variants.push({
    id:v.id,reference:v.reference?.trim()||null,name:v.variant_name,
    price:Number(v.prix_vente),currency:'MAD',parentProductId:String(p.id),
    variant:{color:v.variant_type==='Couleur'?v.color_name:null,size:v.variant_type==='Taille'?v.variant_name:null},
    image:await image(v.image_url).catch(()=>null),imageSource:v.image_url,
    available:v.available,usageVideo:null,videoSource:'none',hasVideo:false,
  });
  const entry={
    reference:p.reference?.trim()||null,name:p.designation,price:Number(p.has_promo?p.prix_promo:p.prix_vente),
    currency:'MAD',category:p.categorie.nom,brand:p.brand.nom,parentProductId:String(p.id),
    variant:{color:null,size:null},image:await image(p.image_url),imageSource:p.image_url,
    usageVideo:null,videoSource:'none',hasVideo:false,
    description:p.description||null,specifications:p.fiche_technique||null,
    sourceUrl:`${origin}/en/product/${p.id}`,variants,
  };
  if(!entry.reference||!entry.image) throw new Error(`Produit ${p.id}: référence ou image absente.`);
  products.push(entry);
  console.log(`${entry.reference}: ${entry.name} | ${entry.price} MAD | ${variants.length} variantes`);
}
const catalog={sourceUrl,retrievedAt:cached?.retrievedAt??new Date().toISOString(),products};
await writeFile(path.join(root,'data/catalog.json'),JSON.stringify(catalog,null,2));
await writeFile(path.join(root,'src/data/catalog.json'),JSON.stringify(catalog,null,2));
console.log(`${downloads.size} images authentiques téléchargées.`);
