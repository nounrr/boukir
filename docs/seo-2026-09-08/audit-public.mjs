import fs from 'node:fs/promises';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const out = decodeURIComponent(dir);
const urls = [
 'https://boukirdiamond.com/',
 'https://www.boukirdiamond.com/fr',
 'https://www.boukirdiamond.com/ar',
 'https://www.boukirdiamond.com/robots.txt',
 'https://www.boukirdiamond.com/sitemap.xml',
 'https://www.boukirdiamond.com/fr/shop',
 'https://www.boukirdiamond.com/fr/shop?page=2',
 'https://www.boukirdiamond.com/fr/shop?category_id=1',
 'https://www.boukirdiamond.com/fr/contact',
 'https://www.boukirdiamond.com/fr/product/999999999',
 'https://boukirdiamond.com/fr/product/6376',
 'https://boukirdiamond.com/ar/product/6376',
 'https://boukirdiamond.com/fr/product/6696',
 'https://boukirdiamond.com/fr/product/7325',
];
const results = [];
for (let i=0;i<urls.length;i+=3) {
 const batch=await Promise.all(urls.slice(i,i+3).map(async (url)=>{
  const start=Date.now();
  try {
   const res=await fetch(url,{headers:{'Accept-Language':'fr-MA,fr;q=0.9'},signal:AbortSignal.timeout(25000)});
   const html=await res.text();
   const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
   return {url,finalUrl:res.url,status:res.status,elapsedMs:Date.now()-start,bytes:Buffer.byteLength(html),
    headers:Object.fromEntries(['content-type','x-robots-tag','location','cache-control'].map(k=>[k,res.headers.get(k)])),
    title:html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1],
    seoTags:[...html.matchAll(/<(?:meta|link)\b[^>]*(?:canonical|alternate|description|robots)[^>]*>/gi)].map(x=>x[0]),
    h1:[...visible.matchAll(/<h1\b[^>]*>(.*?)<\/h1>/gis)].map(x=>x[1].replace(/<[^>]+>/g,'')),
    productLinks:[...new Set([...visible.matchAll(/<a\b[^>]*href="([^"]*\/product\/[^"?]*)/g)].map(x=>x[1]))],
    sitemapLocs:[...html.matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]),
    jsonLd:[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gis)].map(x=>{try{return JSON.parse(x[1])}catch{return x[1]}}),
    text:visible.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,15000),
   };
  } catch(e) {return {url,error:String(e),elapsedMs:Date.now()-start};}
 }));
 results.push(...batch);
}
await fs.writeFile(path.join(out,'preuves-http.json'),JSON.stringify({capturedAt:new Date().toISOString(),method:'Public HTTP GET, French Accept-Language; no Googlebot impersonation. elapsedMs is not a Core Web Vitals metric.',results},null,2));
console.log(JSON.stringify(results.map(({url,status,title,seoTags,h1,jsonLd,sitemapLocs,error})=>({url,status,title,canonical:seoTags?.find(t=>t.includes('canonical')),robots:seoTags?.find(t=>t.includes('name="robots"')),h1,jsonLd,sitemapCount:sitemapLocs?.length,error})),null,2));
