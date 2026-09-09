import fs from 'node:fs/promises';
const brands=await(await fetch('https://boukirdiamond.com/api/brands')).json();
const categories=await(await fetch('https://boukirdiamond.com/api/categories')).json();
const slug=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
await fs.writeFile('ecom/src/lib/catalog/brands.json',JSON.stringify(brands.map(b=>({id:b.id,slug:`${b.id}-${slug(b.nom)}`,name:b.nom})),null,2));
await fs.writeFile('docs/seo-2026-09-08/correction-04-taxonomies.json',JSON.stringify({checkedAt:new Date().toISOString(),categories:categories.map(c=>({id:c.id,nom:c.nom,parent_id:c.parent_id})),brands:brands.map(b=>({id:b.id,nom:b.nom}))},null,2));
