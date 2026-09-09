import fs from 'node:fs/promises';
const base='https://boukirdiamond.com';
const targets=['/api/categories','/api/ecommerce/products?page=1&per_page=20',...['ciment','sable','bitume','carrelage','soprema'].map(s=>'/api/ecommerce/products?per_page=5&search='+s)];
const results=[];
for(const endpoint of targets){
 try {
  const res=await fetch(base+endpoint,{headers:{Platform:'web'},signal:AbortSignal.timeout(20000)});
  const raw=await res.text();
  let data;try{data=JSON.parse(raw)}catch{data={body:raw.slice(0,100)}};
  const array=Array.isArray(data)?data:(data.products||data.data||[]);
  const sample=Array.isArray(array)?array.map(p=>({id:p.id,nom:p.nom,nom_ar:p.nom_ar,parent_id:p.parent_id,designation:p.designation,designation_ar:p.designation_ar,descriptionLength:p.description?.length,descriptionArLength:p.description_ar?.length,price:p.prix_vente,promo:p.prix_promo,stock:p.quantite_disponible,category:p.categorie?.nom})):array;
  results.push({url:base+endpoint,status:res.status,keys:Object.keys(data),pagination:data.pagination,sample});
 }catch(e){results.push({url:base+endpoint,error:String(e)})}
}
await fs.writeFile(new URL('./preuves-catalogue.json',import.meta.url),JSON.stringify({capturedAt:new Date().toISOString(),results},null,2));
console.log(JSON.stringify(results,null,2));
