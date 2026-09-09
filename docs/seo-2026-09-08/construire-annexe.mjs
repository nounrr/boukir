import fs from 'node:fs/promises';
const suggestionData=JSON.parse(await fs.readFile(new URL('./preuves-suggestions-google.json',import.meta.url),'utf8'));
const observed=new Map();
for(const entry of suggestionData.results) for(const phrase of entry.suggestions||[]) observed.set(phrase,{seed:entry.seed,url:entry.url});
const groups=[
 ['Magasin et fournisseur à Tanger','A','/fr et /ar',
  ['droguerie tanger','droguerie tanger ouvert actuellement','quincaillerie tanger','matériaux de construction tanger','magasin matériaux construction tanger','fournisseur matériaux construction tanger','grossiste matériaux construction tanger'],
  ['مواد البناء طنجة','بيع مواد البناء طنجة','عقاقير طنجة','دروكري طنجة','دروجري طنجة','محل مواد البناء طنجة','لوازم البناء طنجة']],
 ['Ciment','A','/fr/materiaux-construction/ciment + équivalent /ar',
  ['ciment tanger','prix ciment maroc','prix ciment 45 maroc','prix ciment 35 maroc','prix ciment blanc maroc','prix sac ciment maroc','ciment CPJ 45 Tanger','livraison ciment tanger'],
  ['ثمن الاسمنت في المغرب','ثمن الاسمنت بالمغرب 2026','ثمن الاسمنت الابيض في المغرب','إسمنت طنجة','اسمنت طنجة','أسمنت طنجة','ثمن السيما بطنجة','سيما طنجة']],
 ['Sable et livraison','A','/fr/materiaux-construction/sable-gravette + équivalent /ar',
  ['prix sable m3 maroc','prix sable lavé maroc','prix sable construction maroc','prix camion sable maroc','sable de construction tanger','livraison sable tanger','sable lavé tanger','prix sable m3 tanger'],
  ['ثمن الرملة بالمغرب','ثمن الرملة في المغرب بالدرهم','ثمن فياج الرملة','ثمن خنشة الرملة بالمغرب','رملة طنجة','رمل البناء طنجة','توصيل الرمل طنجة','ثمن متر الرمل']],
 ['Gravette, briques et gros œuvre','B, selon stock','Sous-catégories distinctes de /fr/materiaux-construction et /ar',
  ['gravette tanger','prix gravette m3 maroc','gravier construction tanger','brique tanger','prix brique maroc','fer à béton tanger'],
  ['حصى البناء طنجة','ثمن الحصى بالمغرب','آجور طنجة','ثمن الآجور بالمغرب','حديد البناء طنجة','ثمن حديد البناء بالمغرب']],
 ['Carrelage et céramique','A, confirmer la vente de carreaux','/fr/carrelage-ceramique + équivalent /ar',
  ['carrelage tanger','carrelage tanger prix','magasin carrelage tanger','grossiste carrelage tanger','carrelage tanger vente','céramique tanger','carrelage piscine tanger','carrelage maroc salle de bain'],
  ['سيراميك طنجة','زليج طنجة','بيع زليج طنجة','ثمن الزليج بالمغرب','ثمن الزليج 60/60','ثمن الزليج 120 60','ثمن الزليج للمتر','زليج الحمام طنجة']],
 ['Outils du carreleur','A','/fr/outillage-carreleur + équivalent /ar',
  ['matériel carreleur tanger','outillage carrelage maroc','coupe carrelage maroc','coupe carrelage 120 cm maroc','ventouse carrelage maroc','clips nivelants carrelage maroc','vibreur carrelage maroc'],
  ['أدوات الزليج','معدات تركيب السيراميك','آلة قطع الزليج','ماكينة قطع السيراميك','كليبس الزليج','شفاطة الزليج','هزاز البلاط']],
 ['Colles et joints','B','/fr/colles-joints-carrelage + équivalent /ar',
  ['colle carrelage tanger','mortier colle carrelage maroc','joint carrelage maroc','colle carrelage extérieur maroc','croisillons carrelage maroc'],
  ['كولا الزليج','لاصق البلاط','لاصق السيراميك المغرب','فواصل البلاط','مواد ملء فواصل الزليج']],
 ['Membranes bitumineuses / zeft','A','/fr/etancheite/bitume-membranes + équivalent /ar',
  ['rouleau bitume toiture prix maroc','rouleau bitume prix maroc','rouleau bitume maroc','bitume prix maroc','fournisseur bitume maroc','rouleau bitume tanger','membrane bitumineuse 4 mm maroc','zeft tanger'],
  ['زفت السطح','زفت الاسطح','ثمن زفت السطح في المغرب','ثمن زفت السطح','زفت المنيوم','رولو زفت طنجة','بيتومين للعزل','لفائف العزل المائي']],
 ['Étanchéité liquide et réparation','B','/fr/etancheite + sous-catégories précises /ar',
  ['bitume liquide maroc','bitume froid maroc','étanchéité bitume maroc','produit étanchéité terrasse maroc','résine étanchéité maroc','primaire bitumineux maroc','bande étanchéité autocollante maroc'],
  ['مواد العزل المائي','بيتومين سائل المغرب','زفت بارد','عزل السطح من الماء','مواد منع تسرب الماء','شريط عازل للماء','عزل الاسطح المغرب']],
 ['Marques attestées en étanchéité','B','Pages Danosa / Soprema et fiches existantes',
  ['danosa maroc','danosa tanger','rouleau danosa prix maroc','soprema maroc','soprema tanger','bitu flex maroc','self dan maroc'],
  ['دانوزا المغرب','دانوسا المغرب','زفت دانوزا','سوبريما المغرب','زفت سوبريما','رولو زفت دانوزا']],
 ['Disques et découpe','B','/fr/outillage/disques-diamant + équivalent /ar',
  ['disque diamant carrelage maroc','disque diamant béton maroc','disque diamant 125 maroc','scie cloche carrelage maroc','disque marbre maroc'],
  ['ديسك الزليج','قرص ألماس للسيراميك','قرص قطع الخرسانة','قرص قطع الرخام','ثقب السيراميك']],
 ['Peinture et droguerie','B','/fr/peinture + équivalent /ar',
  ['peinture bâtiment tanger','peinture façade maroc','peinture intérieure tanger','matériel peinture tanger','rouleau peinture maroc'],
  ['صباغة طنجة','صباغة الحيطان','صباغة الواجهات','ثمن الصباغة بالمغرب','أدوات الصباغة']],
 ['Plomberie et eau','B','/fr/plomberie et /fr/pompes-eau + équivalents /ar',
  ['plomberie tanger','raccord PPR maroc','tuyau plomberie maroc','pompe à eau maroc','pompe à eau tanger'],
  ['لوازم السباكة طنجة','بلومبري طنجة','أنابيب الماء','مضخة ماء المغرب','ثمن مضخة الماء']],
 ['Outillage et machines','B, selon stock','Sous-catégories outillage distinctes FR/AR',
  ['outillage tanger','outillage professionnel maroc','perceuse maroc','meuleuse maroc','bétonnière tanger','malaxeur mortier maroc'],
  ['أدوات البناء طنجة','معدات البناء المغرب','مثقاب كهربائي المغرب','صاروخ كهربائي المغرب','خلاطة إسمنت المغرب','خلاط المونة']],
 ['Livraison et devis','A','/fr/livraison-tanger + équivalent /ar',
  ['livraison matériaux construction tanger','devis matériaux construction tanger','prix matériaux construction tanger','matériaux chantier tanger','achat matériaux construction en ligne maroc'],
  ['توصيل مواد البناء طنجة','أثمنة مواد البناء طنجة','ثمن مواد البناء بالمغرب','طلب مواد البناء','بيع مواد البناء عبر الإنترنت']],
 ['Pose / services à séparer de la vente','B, seulement si service réel','Pages /services pertinentes FR/AR, distinctes des catégories produits',
  ['societe etancheite tanger','etancheite toit terrasse tanger','pose carrelage tanger','artisan étanchéité tanger'],
  ['معلم زليج طنجة','معلم عزل السطح طنجة','تركيب السيراميك طنجة','إصلاح تسربات السطح طنجة']],
];
const candidates=[];
const lines=[
 '# Annexe — Mots-clés Boukir Diamond',
 '',
 '**8 septembre 2026 · Tanger / Maroc · français, arabe et darija**',
 '',
 'Cette liste est une base de travail pour les pages SEO et la mesure Google Ads. Elle ne classe pas les expressions par volume de recherche.',
 '',
 '- **G** : expression exacte présente dans une réponse de suggestions Google recueillie lors de cet audit. Cela ne prouve pas un volume élevé ni une intention commerciale exclusive.',
 '- **P** : proposition éditoriale ou variante métier à vérifier dans Keyword Planner / Search Console. Sa demande n’est pas mesurée.',
 '- **A / B** : priorité commerciale proposée, sous réserve du catalogue, de la marge et de la livraison. Ce n’est pas une difficulté SEO mesurée.',
 '- **Volume mensuel : non mesuré pour toutes les lignes.** Ne pas additionner automatiquement les variantes proches.',
 '- Les URL sont des destinations proposées. Une même page peut répondre à plusieurs formulations : ne pas créer une page par ligne.',
 '',
 '## Expressions à travailler par besoin',
 ''
];
for(const [group,priority,target,fr,ar] of groups){
 lines.push('### '+group,'','Priorité : **'+priority+'** · Destination : `'+target+'`','','| Français | Statut | Arabe / darija | Statut |','|---|---|---|---|');
 for(let i=0;i<Math.max(fr.length,ar.length);i++){
  lines.push('| '+(fr[i]||'—')+' | '+(fr[i]?(observed.has(fr[i])?'G':'P'):'—')+' | '+(ar[i]||'—')+' | '+(ar[i]?(observed.has(ar[i])?'G':'P'):'—')+' |');
 }
 for(const [lang,phrases] of [['fr',fr],['ar',ar]])for(const keyword of phrases){
  candidates.push({keyword,language:lang,cluster:group,priority,target,status:observed.has(keyword)?'Google suggestion observed':'Proposed; demand not measured',monthlySearches:null,source:observed.get(keyword)||null});
 }
 lines.push('');
}
lines.push('## Variantes utiles à la recherche interne','',
 '| Notion | Variantes candidates | Précaution |',
 '|---|---|---|',
 '| Droguerie | drogerie, drougerie, droguerie, drokri, دروكري, دروجري, عقاقير | Préférer les graphies correctes dans les pages publiques. |',
 '| Ciment | ciment, cimant, sima, سيما, إسمنت, أسمنت, اسمنت | Garder la référence, le poids et la classe exacts. |',
 '| Sable | sable, rmel, ramla, رمل, رملة | Séparer sable de construction, filtre à sable et lieux nommés Sable d’Or. |',
 '| Carrelage | carrelage, carelage, céramique, ceramique, zlij, zellige, زليج, بلاط, سيراميك | Distinguer carrelage industriel et زليج بلدي artisanal. |',
 '| Bitume | bitume, bitum, zeft, zeft surface, زفت, بيتومين, رولو زفت | Clarifier étanchéité, acoustique et usage routier ; ne pas rendre tous les produits interchangeables. |',
 '| Étanchéité | étanchéité, etancheite, etanchite, عزل مائي, عزل السطح | Distinguer achat du produit et recherche d’un poseur. |',
 '',
 'Les écritures latines de darija sont des candidates à tester, pas des expressions dont la fréquence aurait été démontrée. Les accents et fautes ne justifient pas des pages dupliquées.',
 '',
 '## Suggestions Google retenues : preuve par requête de départ','',
 'Les réponses intégrales, y compris les variantes hors sujet, figurent dans `preuves-suggestions-google.json`. Les liens sources ci-dessous permettent de renouveler la consultation ; les réponses peuvent changer.',
 '');
const keep={
 'droguerie tanger':['droguerie tanger','droguerie tanger ouvert actuellement','droguerie gzenaya tanger'],
 'matériaux de construction tanger':['matériaux de construction tanger'],
 'ciment tanger':['ciment tanger','carreaux ciment tanger','ciment du maroc tanger'],
 'prix ciment maroc':['prix ciment maroc','prix ciment maroc 2026','prix ciment 45 maroc','prix sac ciment maroc','prix ciment 35 maroc','prix ciment blanc maroc','prix tonne ciment maroc'],
 'sable tanger':['sable tanger','sable haloui tanger'],
 'prix sable maroc':['prix sable maroc','prix sable m3 maroc','prix sable lavé maroc','prix sac sable maroc','prix sable construction maroc','prix camion sable maroc'],
 'carrelage tanger':['carrelage tanger','carrelage tanger maroc','carrelage tanger prix','carrelage tanger vente','magasin carrelage tanger','grossiste carrelage tanger','carrelage piscine tanger'],
 'carrelage maroc':['carrelage maroc','carrelage maroc prix','carrelage marocain traditionnel sol','carrelage maroc salle de bain'],
 'étanchéité tanger':['etancheite tanger','societe etancheite tanger','etancheite toit terrasse tanger'],
 'bitume maroc':['bitume maroc','bitume prix maroc','rouleau bitume maroc','bitume liquide maroc','bitume froid maroc','étanchéité bitume maroc','fournisseur bitume maroc'],
 'rouleau bitume':['rouleau bitume toiture prix maroc','rouleau bitume prix maroc','rouleau bitume toiture','rouleau bitume maroc','rouleau bitume terrasse'],
 'مواد البناء طنجة':['مواد البناء طنجة','بيع مواد البناء طنجة'],
 'ثمن الاسمنت':['ثمن الاسمنت في المغرب','ثمن الاسمنت بالمغرب 2026','ثمن الاسمنت الابيض في المغرب','ثمن الاسمنت اليوم'],
 'ثمن الرمل':['ثمن الرملة بالمغرب','ثمن الرملة في المغرب بالدرهم','ثمن متر الرمل','ثمن فياج الرملة','ثمن خنشة الرملة بالمغرب'],
 'سيراميك طنجة':['سيراميك طنجة'],
 'زليج طنجة':['زليج طنجة','معلم زليج طنجة','زليج بلدي طنجة','بيع زليج طنجة'],
 'ثمن الزليج':['ثمن الزليج بالمغرب بالدرهم 2026','ثمن الزليج بالمغرب','ثمن الزليج 120 60','ثمن الزليج 60/60','ثمن الزليج للمتر'],
 'زفت':['زفت السطح','زفت الاسطح','زفت المنيوم','زفت الحائط'],
 'زفت السطح':['زفت السطح','ثمن زفت السطح في المغرب','ثمن زفت السطح'],
 'دروكري طنجة':['دروكري طنجة'],
 'عقاقير طنجة':['عقاقير طنجة'],
};
for(const entry of suggestionData.results){
 const selected=(keep[entry.seed]||[]).filter(s=>(entry.suggestions||[]).includes(s));
 lines.push('### '+entry.seed,'','[Source Google Suggestions]('+entry.url+')','',selected.length?selected.map(x=>'- '+x).join('\n'):'Aucune suggestion dans cette réponse ; cela ne signifie pas absence de recherches.','');
}
lines.push('## Mesure à compléter','',
 'Pour chaque expression : renseigner recherches mensuelles Tanger, recherches mensuelles Maroc, période et réseau, saisonnalité, URL cible, impressions/clics Search Console, intention, produits correspondants, marge et demandes/ventes. Ne pas traduire un volume français en volume arabe : mesurer chaque groupe et tenir compte du regroupement des variantes proches.',
 '',
 '**Total : '+candidates.length+' expressions candidates, dont '+candidates.filter(x=>x.source).length+' retrouvées à l’identique dans les suggestions recueillies.**',
 '');
await fs.writeFile(new URL('./ANNEXE-MOTS-CLES.md',import.meta.url),lines.join('\n'));
await fs.writeFile(new URL('./mots-cles-candidats.json',import.meta.url),JSON.stringify({date:'2026-09-08',volumes:'Not measured',candidates},null,2));
console.log(JSON.stringify({total:candidates.length,observed:candidates.filter(x=>x.source).length,groups:groups.length}));
