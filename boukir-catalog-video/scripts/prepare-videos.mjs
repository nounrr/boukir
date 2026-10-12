import {readFile,writeFile,mkdir,readdir,stat,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {chooseVideo,key} from './matching.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(await readFile(path.join(root,'data/catalog.json'),'utf8'));
const policy=JSON.parse(await readFile(path.join(root,'data/video-policy.json'),'utf8'));
const branding=JSON.parse(await readFile(path.join(root,'data/branding.json'),'utf8'));
const bin=path.join(root,'node_modules/@remotion/compositor-win32-x64-msvc');
await mkdir(path.join(root,'public/product-videos/originals'),{recursive:true});
await mkdir(path.join(root,'out'),{recursive:true});
const paths=[];
for(const supplied of process.argv.slice(2)) {
  const absolute=path.resolve(supplied);
  const s=await stat(absolute);
  if(s.isDirectory()) for(const name of await readdir(absolute)) paths.push(path.join(absolute,name));
  else paths.push(absolute);
}
const all=catalog.products.flatMap(p=>[p,...p.variants]);
const refs=new Set(all.map(p=>key(p.reference)).filter(Boolean));
const clips=[],rejected=[];
try {
  const previous=JSON.parse(await readFile(path.join(root,'out/video-report.json'),'utf8'));
  for(const clip of previous.clips??[]) {
    if(!refs.has(clip.reference)) continue;
    try {await stat(path.join(root,'public',clip.path)); clips.push({...clip,reviewedUsageScore:policy.reviewedUsageScores[path.basename(clip.original)]??null});} catch {}
  }
} catch {}
for(const absolute of [...new Set(paths)]) {
  if(!/\.(mp4|mov|m4v|webm|mkv)$/i.test(absolute)) continue;
  const name=path.basename(absolute),reference=path.parse(name).name.split('__')[0];
  if(!refs.has(reference)) {rejected.push({file:name,reason:'Aucune référence exacte du site (les codes couleur ne sont pas des références).'}); continue;}
  if(all.filter(p=>key(p.reference)===reference).length!==1) {rejected.push({file:name,reason:'Référence ambiguë dans le catalogue.'}); continue;}
  const probe=spawnSync(path.join(bin,'ffprobe.exe'),['-v','error','-show_streams','-show_format','-of','json',absolute],{encoding:'utf8',windowsHide:true});
  let metadata; try {metadata=JSON.parse(probe.stdout);} catch {metadata={};}
  const stream=metadata.streams?.find(s=>s.codec_type==='video');
  const duration=Number(metadata.format?.duration??stream?.duration);
  if(probe.status!==0||!stream||!(duration>0)) {rejected.push({file:name,reason:'Vidéo non lisible: repli sur image.'});continue;}
  const original=`product-videos/originals/${name}`;
  await copyFile(absolute,path.join(root,'public',original));
  const output=`product-videos/${path.parse(name).name}.mp4`;
  const scale=Math.min(1280/stream.width,720/stream.height,1);
  const width=Math.max(2,Math.floor(stream.width*scale/2)*2),height=Math.max(2,Math.floor(stream.height*scale/2)*2);
  // The bundled FFmpeg supports scale, but does not include pad or setsar.
  // Keep the original aspect ratio; the Remotion media component handles fitting.
  const encode=spawnSync(path.join(bin,'ffmpeg.exe'),['-v','error','-y','-i',absolute,'-t','12','-map','0:v:0','-an','-vf',`scale=${width}:${height}`,'-r','30','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,'public',output)],{encoding:'utf8',windowsHide:true});
  if(encode.status!==0) {rejected.push({file:name,reason:'Décodage/normalisation impossible: repli sur image.',diagnostic:encode.stderr?.slice(0,500)});continue;}
  const prior=clips.findIndex(c=>c.path===output);
  if(prior>=0) clips.splice(prior,1);
  clips.push({reference,path:output,original,duration,width:Number(stream.width),height:Number(stream.height),usable:true,reviewedUsageScore:policy.reviewedUsageScores[name]??null});
}
for(const p of catalog.products) {
  for(const v of p.variants) Object.assign(v,chooseVideo({...v,variants:p.variants},clips,policy.sharedApprovals));
  Object.assign(p,chooseVideo(p,clips,policy.sharedApprovals));
  p.usageVideoDuration=p.usageVideo?Math.min(12,clips.find(c=>c.path===p.usageVideo).duration):null;
}
const variantPriceNotes=catalog.products.filter(p=>p.variants.length).map(p=>`${p.reference}: prix publiés de ${Math.min(...p.variants.map(v=>v.price))} à ${Math.max(...p.variants.map(v=>v.price))} DH; ${p.variants.filter(v=>v.price===0).length} prix à zéro à confirmer. Pas de promesse de gratuité.`);
const report={createdAt:new Date().toISOString(),sourceUrl:catalog.sourceUrl,branding,attachmentInputs:process.argv.slice(2),clips,rejected,products:catalog.products.map(p=>({reference:p.reference,name:p.name,videoSource:p.videoSource,usageVideo:p.usageVideo,variantCount:p.variants.length})),notes:[
  '7 articles parents; les 68 variantes de 6190 restent dans une séquence de 12 secondes.',
  'Tetra Fix: articles distincts du site; aucun parent commun confirmé, donc aucun regroupement déduit du nom.',
  'Les références de toutes les variantes de 6190 sont vides. Les codes couleur restent des noms et ne sont pas utilisés pour associer des vidéos.',
  ...variantPriceNotes,
  'Absence de descriptions/fiches techniques: aucune performance technique inventée.',
  'Clips de moins de 12 secondes: vidéo complète, puis image réelle du produit jusqu’à la fin de la séquence; aucune répétition ni ralenti.',
  clips.some(c=>c.reviewedUsageScore===null)?'Choix des clips non revus: classement technique par durée utile puis résolution. Revue visuelle recommandée avant publication.':'Aucune sélection de clip non revu.',
]};
await writeFile(path.join(root,'data/catalog.json'),JSON.stringify(catalog,null,2));
await writeFile(path.join(root,'src/data/catalog.json'),JSON.stringify(catalog,null,2));
await writeFile(path.join(root,'out/video-report.json'),JSON.stringify(report,null,2));
const labels={exact_reference:'Vidéo exacte',shared_variant:'Vidéo partagée',none:'Image animée (aucune vidéo)'};
const rows=report.products.map(p=>`| ${p.reference} | ${p.name} | ${p.variantCount} | ${labels[p.videoSource]} |`).join('\n');
await writeFile(path.join(root,'out/rapport-videos.md'),`# Rapport avant rendu\n\nSource : ${catalog.sourceUrl}\n\nLogo fourni : ${branding.source}\nPlacement : ${branding.placement}. Image conservée sans modification.\n\n| Référence | Article | Variantes | Présentation |\n| --- | --- | ---: | --- |\n${rows}\n\n${report.notes.map(n=>'- '+n).join('\n')}\n\nFichiers vidéo utilisables : ${clips.length}. Fichiers refusés : ${rejected.length}.\n${rejected.map(r=>'- '+r.file+': '+r.reason).join('\n')}\n`);
console.log(report.products.map(p=>`${p.reference}: ${labels[p.videoSource]}`).join('\n'));
