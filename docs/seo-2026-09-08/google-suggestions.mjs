import fs from 'node:fs/promises';
const seeds = ['droguerie tanger','matériaux de construction tanger','ciment tanger','prix ciment maroc','sable tanger','prix sable maroc','carrelage tanger','carrelage maroc','étanchéité tanger','bitume maroc','rouleau bitume','مواد البناء طنجة','ثمن الاسمنت','ثمن الرمل','سيراميك طنجة','زليج طنجة','ثمن الزليج','عزل الاسطح المغرب','زفت','زفت السطح','دروكري طنجة','عقاقير طنجة'];
const results=[];
for(let i=0;i<seeds.length;i+=3) {
 results.push(...await Promise.all(seeds.slice(i,i+3).map(async seed=>{
  const lang=/[\u0600-\u06ff]/.test(seed)?'ar':'fr';
  const url='https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&gl=ma&hl='+lang+'&q='+encodeURIComponent(seed);
  try {
   const r=await fetch(url,{signal:AbortSignal.timeout(15000)});
   const body=await r.text();
   const data=JSON.parse(body);
   return {seed,lang,url,status:r.status,suggestions:data[1]};
  } catch(e) {return {seed,lang,url,error:String(e)};}
 })));
}
await fs.writeFile(new URL('./preuves-suggestions-google.json',import.meta.url),JSON.stringify({capturedAt:new Date().toISOString(),method:'Public Google suggestions, gl=ma, hl=fr/ar; not monthly search volumes, not a Tangier geolocated SERP, and not an exhaustive keyword list.',results},null,2));
console.log(JSON.stringify(results.map(({seed,suggestions,error})=>({seed,suggestions,error})),null,2));
