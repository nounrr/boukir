import raw from './data/catalog.json';
export type CatalogVariant = {
  id:number; reference:string|null; name:string; price:number; currency:string;
  parentProductId:string; variant:{color:string|null;size:string|null};
  image:string|null; imageSource:string|null; available:boolean;
  usageVideo:string|null;videoSource:string;hasVideo:boolean;
  usageVideoDuration?:number|null;
};
export type Product = {
  reference:string;name:string;price:number;currency:string;category:string;brand:string;
  parentProductId:string;variant:{color:string|null;size:string|null};image:string;
  usageVideo:string|null;videoSource:string;hasVideo:boolean;
  usageVideoDuration?:number|null;
  description:string|null;specifications:string|null;sourceUrl:string;variants:CatalogVariant[];
};
export const products=raw.products as Product[];
export const number=(value:number)=>new Intl.NumberFormat('fr-MA',{maximumFractionDigits:2}).format(value);
export const price=(product:Product)=>{
  if(!product.variants.length) return `${number(product.price)} DH`;
  const amounts=product.variants.map(v=>v.price);
  const low=Math.min(...amounts),high=Math.max(...amounts);
  return low===high?`${number(low)} DH`:`${number(low)}–${number(high)} DH`;
};
export const title=(p:Product)=>p.name.replace(p.variants.length?/^$/:/^silicone\s+/i,'').replace(/\s*(?:-\s*)?KERAKOLL$/i,'').trim();
