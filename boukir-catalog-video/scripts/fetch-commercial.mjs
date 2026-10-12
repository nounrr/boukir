import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const origin='https://boukirdiamond.com';
const dir=path.join(root,'public/commercial');
await mkdir(dir,{recursive:true});
function download(url,file){return new Promise((resolve,reject)=>{
  const child=spawn('curl.exe',['--fail','--silent','--show-error','--compressed','--location','--max-time','180','--retry','1',url,'--output',file],{windowsHide:true});
  let error='';child.stderr.on('data',d=>error+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(error)));
});}
const groups=[{key:'tools',search:'Meuleuse'},{key:'materials',search:'Sika'},{key:'finishes',search:'H40',brand:1}];
const source={retrievedAt:new Date().toISOString(),origin,contact:{phone:'0650812894',email:'boukir.diamond23@gmail.com',city:'Tanger'},groups:[]};
await Promise.all(groups.map(async g=>{
  const url=origin+'/api/ecommerce/products?'+new URLSearchParams({per_page:'8',search:g.search,in_stock_only:'false',...(g.brand?{brand_id:String(g.brand)}:{})});
  const dest=path.join(root,`data/commercial-${g.key}.json`);
  try {const previous=JSON.parse(await readFile(dest,'utf8'));if(g.key==='tools'&&!previous.products.length)throw new Error('empty');}
  catch {await download(url,dest);}
  const data=JSON.parse(await readFile(dest,'utf8'));
  console.log(g.key,JSON.stringify(data.products.map(p=>({id:p.id,name:p.designation,image:p.image_url}))));
  source.groups.push({key:g.key,url,products:data.products});
}));
await writeFile(path.join(root,'data/commercial-source.json'),JSON.stringify(source,null,2));
const chosen=[
  ...source.groups.find(g=>g.key==='tools').products.filter(p=>p.image_url&&[4746,6937].includes(p.id)).slice(0,2).map(p=>({...p,group:'tools'})),
  ...source.groups.find(g=>g.key==='materials').products.filter(p=>p.image_url).slice(0,2).map(p=>({...p,group:'materials'})),
  ...source.groups.find(g=>g.key==='finishes').products.filter(p=>p.image_url).slice(0,2).map(p=>({...p,group:'finishes'})),
];
const fallback=JSON.parse(await readFile(path.join(root,'data/catalog.json'),'utf8')).products.find(p=>p.reference==='6190');
chosen.push({id:Number(fallback.parentProductId),reference:fallback.reference,designation:fallback.name,image_url:fallback.imageSource,group:'finishes'});
for(const p of chosen)p.localImage=`commercial/${p.id}${p.image_url.endsWith('.png')?'-small.webp':path.extname(new URL(p.image_url,origin).pathname)}`;
await writeFile(path.join(root,'src/data/commercial.json'),JSON.stringify({retrievedAt:source.retrievedAt,products:chosen.map(p=>({id:p.id,reference:p.reference,name:p.designation,image:p.localImage,group:p.group,url:`${origin}/fr/product/${p.id}`})),contact:source.contact},null,2));
await Promise.all(chosen.map(async p=>{
  if(p.image_url.endsWith('.png')) {
    const optimized=origin+'/_next/image?'+new URLSearchParams({url:new URL(p.image_url,origin).href,w:'384',q:'75'});
    await download(optimized,path.join(root,'public',p.localImage));
    return;
  }
  const existing=path.join(root,'../backend',p.image_url.replace(/^\//,''));
  try {await writeFile(path.join(root,'public',p.localImage),await readFile(existing));}
  catch {await download(new URL(p.image_url,origin).href,path.join(root,'public',p.localImage));}
}));
await writeFile(path.join(root,'src/data/commercial.json'),JSON.stringify({retrievedAt:source.retrievedAt,products:chosen.map(p=>({id:p.id,reference:p.reference,name:p.designation,image:p.localImage,group:p.group,url:`${origin}/fr/product/${p.id}`})),contact:source.contact},null,2));
console.log('Commercial: assets saved',chosen.length);
