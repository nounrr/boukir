import fs from 'node:fs/promises';
const files=['layout/categories-mega-menu.tsx','layout/categories-mobile-menu.tsx','layout/footer.tsx','layout/header-search.tsx','home/home-catalog-highlights.tsx','home/home-brands-carousel.tsx','home/professional/professional-catalog.tsx','home/home-hero.tsx','home/professional/professional-hero.tsx'];
for(const file of files){const path='ecom/src/components/'+file;let s=await fs.readFile(path,'utf8');const old=s;
s=s.replace(/`\/\$\{locale\}\/shop\?category_id=\$\{encodeURIComponent\(String\(([^)]+)\)\)\}`/g,(_,id)=>`catalogHref(locale, 'categories', ${id})`);
s=s.replace(/`\/\$\{locale\}\/shop\?brand_id=\$\{encodeURIComponent\(String\(([^)]+)\)\)\}`/g,(_,id)=>`catalogHref(locale, 'marques', ${id})`);
s=s.replace('`/${locale}/shop?category_id=${encodeURIComponent(raw)}`',"catalogHref(locale, 'categories', raw)").replace('`/${locale}/shop?brand_id=${encodeURIComponent(raw)}`',"catalogHref(locale, 'marques', raw)");
s=s.replace('`/${activeLocale}/shop?category_id=${targetId ?? 23}`',"catalogHref(activeLocale, 'categories', targetId ?? 23)").replace('`/${activeLocale}/shop?brand_id=${targetId ?? DEFAULT_BRAND_ID}`',"catalogHref(activeLocale, 'marques', targetId ?? DEFAULT_BRAND_ID)");
s=s.replace('`/${locale}/shop?category_id=${id ?? 23}`',"catalogHref(locale, 'categories', id ?? 23)").replace('`/${locale}/shop?brand_id=${id ?? 1}`',"catalogHref(locale, 'marques', id ?? 1)");
if(s!==old){const i=s.indexOf('\n');s=s.slice(0,i+1)+"import { catalogHref } from '@/lib/catalog/registry'\n"+s.slice(i+1);await fs.writeFile(path,s);console.log(file);}}
