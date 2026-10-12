import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {imageSize} from 'image-size';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(await readFile(path.join(root,'data/catalog.json'),'utf8'));
if(catalog.products.length!==7) throw new Error('Le catalogue doit contenir 7 parents.');
const refs=new Set();let variants=0;
const images=new Set();
images.add('branding/logo.png');
for(const p of catalog.products) {
  if(!p.reference||refs.has(p.reference)) throw new Error('Référence manquante ou ambiguë.');
  refs.add(p.reference);
  if(!Number.isFinite(p.price)||p.currency!=='MAD') throw new Error('Prix/devise invalide.');
  if(!['none','exact_reference','shared_variant'].includes(p.videoSource)) throw new Error('Source vidéo invalide.');
  if(p.hasVideo!==Boolean(p.usageVideo)||p.hasVideo!==(p.videoSource!=='none')) throw new Error('Champs vidéo incohérents.');
  if(p.usageVideo) await stat(path.join(root,'public',p.usageVideo));
  images.add(p.image);
  for(const v of p.variants) {
    if(v.parentProductId!==p.parentProductId) throw new Error('Parent de variante non confirmé.');
    if(v.image) images.add(v.image);
    variants++;
  }
}
for(const image of images) {
  if(!image||!(await stat(path.join(root,'public',image))).size) throw new Error('Image absente.');
  const dimensions=imageSize(await readFile(path.join(root,'public',image)));
  if(!(dimensions.width>0&&dimensions.height>0)) throw new Error(`Image illisible: ${image}`);
}
console.log(`Vérification réussie : 7 parents, ${variants} variantes, ${images.size} images lisibles, prix et sources vidéo cohérents.`);
