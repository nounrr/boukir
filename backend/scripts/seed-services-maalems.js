/**
 * Seeder complet du domaine Services / Maalems.
 *
 * Objectif : remplir la base avec un catalogue realiste et surtout VISIBLE,
 * pour voir les ecrans (back-office + vitrine e-commerce) avec de vraies donnees :
 *
 *   - maalem_categories          : 12 metiers (FR + AR)
 *   - services                   : 33 services publies, avec image_url
 *   - contacts                   : artisans (avatar_url) + clients particuliers
 *   - maalem_profiles            : profils approuves et publies, professional_data
 *                                  complet (competences, zones, annees, resume,
 *                                  experiences detaillees, disponibilite, autres infos)
 *   - maalem_profile_history     : le parcours draft -> submitted -> under_review -> approved
 *   - service_requests           : demandes dans tous les statuts du workflow
 *   - service_request_assignments: affectation au Maalem
 *   - service_interventions      : interventions planifiees / en cours / cloturees
 *   - maalem_reviews             : beaucoup d'avis, notes 1..5, tous les statuts
 *   - maalem_review_history      : journal de soumission et de moderation
 *   - maalem_review_cases        : signalements / contestations (si la table existe)
 *   - maalem_review_invitations  : invitations a noter (si la table existe)
 *
 * Seules les interventions cloturees alimentent les statistiques publiques (KAN-22)
 * et seuls les avis "published" comptent dans la note publique (KAN-28) : la chaine
 * complete demande -> affectation -> intervention -> cloture -> avis est donc ecrite,
 * pas seulement des compteurs.
 *
 * Usage :
 *   node backend/scripts/seed-services-maalems.js                      # dry-run, n'ecrit rien
 *   node backend/scripts/seed-services-maalems.js --apply              # ecrit en base
 *   node backend/scripts/seed-services-maalems.js --apply --maalems 14 --customers 18 --missions 9
 *   node backend/scripts/seed-services-maalems.js --apply --seed 42    # autre tirage aleatoire
 *   node backend/scripts/seed-services-maalems.js --revert             # supprime ce qui a ete seme
 *
 * Le script est idempotent sur les referentiels : categories, services, contacts et
 * profils sont retrouves par leur cle naturelle (nom / email) et reutilises. Relancer
 * --apply ajoute de nouvelles missions sans dupliquer le catalogue.
 *
 * Le revert s'appuie sur backend/scripts/seed-services-maalems.manifest.json ecrit a
 * chaque --apply (ids reellement crees) et sur le marqueur SEED_TAG present dans
 * service_requests.problem_description.
 */
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { default: pool } = await import('../db/pool.js');
const { formatServiceRequestNumber } = await import('../utils/serviceRequest.js');

const SEED_TAG = 'SEED_SERVICES_MAALEMS';
const SEED_EMAIL_DOMAIN = 'seed-maalem.local';
const MANIFEST_PATH = path.join(__dirname, 'seed-services-maalems.manifest.json');

// Images : hotes publics deterministes (meme graine => meme image), en HTTPS.
// `toAbsoluteImageUrl` (ecom) et `toBackendUrl` (back-office) laissent passer les
// URL absolues telles quelles, et next.config autorise `https://**`.
// Pour basculer sur des fichiers locaux, remplacer ces deux fonctions.
const serviceImage = (slug) => `https://picsum.photos/seed/svc-${slug}/1200/800`;
const maalemAvatar = (slug) => `https://i.pravatar.cc/400?u=maalem-${slug}`;

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { apply: false, revert: false, maalems: 14, customers: 18, missions: 9, seed: 20260913 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--revert') args.revert = true;
    else if (a === '--maalems') args.maalems = Number(argv[i += 1]);
    else if (a === '--customers') args.customers = Number(argv[i += 1]);
    else if (a === '--missions') args.missions = Number(argv[i += 1]);
    else if (a === '--seed') args.seed = Number(argv[i += 1]);
    else throw new Error(`Argument inconnu : ${a}`);
  }
  const bound = (value, fallback, min, max) =>
    (Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback);
  args.maalems = bound(args.maalems, 14, 1, 60);
  args.customers = bound(args.customers, 18, 1, 120);
  args.missions = bound(args.missions, 9, 1, 40);
  args.seed = bound(args.seed, 20260913, 1, Number.MAX_SAFE_INTEGER);
  return args;
}

// ---------------------------------------------------------------------------
// Aleatoire deterministe : deux executions avec la meme graine donnent la meme base.
// ---------------------------------------------------------------------------

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rnd = makeRandom(1);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const between = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const chance = (probability) => rnd() < probability;

function sample(list, count) {
  const copy = [...list];
  const out = [];
  while (copy.length > 0 && out.length < count) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const sqlDateTime = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const sqlDate = (d) => d.toISOString().slice(0, 10);
const addHours = (d, h) => new Date(d.getTime() + h * 3600000);

// ---------------------------------------------------------------------------
// Referentiel metiers
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { key: 'plomberie', nom: 'Plomberie', nom_ar: 'السباكة', description: "Reseaux d'eau sanitaire, evacuations, appareils de production d'eau chaude et depannage de fuite." },
  { key: 'electricite', nom: 'Electricite', nom_ar: 'الكهرباء', description: 'Installation, mise aux normes et depannage des installations electriques domestiques et tertiaires.' },
  { key: 'peinture', nom: 'Peinture et decoration', nom_ar: 'الصباغة والديكور', description: 'Preparation des supports, peinture interieure et exterieure, enduits decoratifs et finitions.' },
  { key: 'menuiserie_bois', nom: 'Menuiserie bois', nom_ar: 'النجارة الخشبية', description: 'Placards sur mesure, portes, parquet et agencement interieur en bois massif ou panneaux.' },
  { key: 'menuiserie_alu', nom: 'Menuiserie aluminium', nom_ar: 'نجارة الألمنيوم', description: 'Fenetres, baies coulissantes, fermetures de balcon et vitrages en profile aluminium.' },
  { key: 'maconnerie', nom: 'Maconnerie', nom_ar: 'البناء', description: 'Murs, cloisons, dalles, escaliers, saignees et reprises de gros oeuvre.' },
  { key: 'carrelage', nom: 'Carrelage et zellige', nom_ar: 'البلاط والزليج', description: 'Pose de carrelage sol et mur, zellige traditionnel, plinthes et joints.' },
  { key: 'platre', nom: 'Platre et faux plafond', nom_ar: 'الجبس والسقف المستعار', description: 'Faux plafonds, corniches, cloisons seches et decoration en platre.' },
  { key: 'climatisation', nom: 'Climatisation et froid', nom_ar: 'التكييف والتبريد', description: 'Pose et entretien de climatiseurs, recharge de gaz et depannage du froid domestique.' },
  { key: 'etancheite', nom: 'Etancheite', nom_ar: 'العزل المائي', description: 'Etancheite de terrasses et de sous-sols, traitement des infiltrations et des remontees.' },
  { key: 'serrurerie', nom: 'Serrurerie et metallerie', nom_ar: 'الحدادة', description: 'Ouverture de porte, changement de serrure, grilles, portails et garde-corps.' },
  { key: 'jardinage', nom: 'Jardinage et espaces verts', nom_ar: 'البستنة والمساحات الخضراء', description: 'Entretien de jardin, taille, gazon et systemes d arrosage automatique.' },
];

const SERVICES = [
  { key: 'debouchage', cats: ['plomberie'], nom: 'Debouchage de canalisation', nom_ar: 'تسليك القنوات',
    description: "Debouchage mecanique ou haute pression des eviers, douches, WC et colonnes d'evacuation. Controle camera de la conduite quand l'acces le permet.",
    description_ar: 'تسليك ميكانيكي أو بالضغط العالي للمجاري والمغاسل والمراحيض، مع فحص القناة بالكاميرا عند الإمكان.' },
  { key: 'fuite-eau', cats: ['plomberie'], nom: "Recherche et reparation de fuite d'eau", nom_ar: 'البحث عن تسرب الماء وإصلاحه',
    description: "Localisation de la fuite sans casse inutile, remplacement de la section defectueuse en PER ou cuivre, rebouchage de la saignee et test de mise en pression.",
    description_ar: 'تحديد مكان التسرب دون تكسير غير ضروري، تغيير الجزء المعطوب وإعادة الإصلاح مع اختبار الضغط.' },
  { key: 'chauffe-eau', cats: ['plomberie'], nom: "Installation de chauffe-eau", nom_ar: 'تركيب سخان الماء',
    description: "Depose de l'ancien ballon, pose d'un chauffe-eau electrique ou a gaz avec groupe de securite neuf, mise en eau et reglage de la temperature.",
    description_ar: 'نزع السخان القديم وتركيب سخان كهربائي أو غازي مع صمام أمان جديد وضبط درجة الحرارة.' },
  { key: 'sanitaires', cats: ['plomberie', 'carrelage'], nom: 'Pose de sanitaires et robinetterie', nom_ar: 'تركيب الأدوات الصحية والحنفيات',
    description: 'Pose de lavabo, WC, receveur de douche, baignoire et mitigeurs, avec raccordements, joints et essais sur chaque point d eau.',
    description_ar: 'تركيب المغسلة والمرحاض وحوض الاستحمام والخلاطات مع الوصلات والاختبارات اللازمة.' },

  { key: 'depannage-elec', cats: ['electricite'], nom: 'Depannage electrique urgent', nom_ar: 'إصلاح كهربائي مستعجل',
    description: 'Recherche de panne, court-circuit, disjoncteur qui saute, prise ou circuit hors service. Intervention rapide avec controle de la terre et de la continuite.',
    description_ar: 'البحث عن العطل، دارة قصيرة، قاطع يفصل، مأخذ أو دارة معطلة، مع فحص التأريض والاستمرارية.' },
  { key: 'tableau-elec', cats: ['electricite'], nom: 'Mise aux normes du tableau electrique', nom_ar: 'تأهيل اللوحة الكهربائية',
    description: 'Remplacement du tableau, repartition des circuits, pose de differentiels et de disjoncteurs calibres, reperage et etiquetage complet.',
    description_ar: 'تغيير اللوحة وتوزيع الدارات وتركيب القواطع التفاضلية مع ترقيم كامل.' },
  { key: 'luminaires', cats: ['electricite', 'platre'], nom: "Installation d'eclairage et de luminaires", nom_ar: 'تركيب الإنارة',
    description: 'Pose de spots encastres, rubans LED, appliques et lustres, avec creation des points lumineux et des commandes va-et-vient.',
    description_ar: 'تركيب الإنارة المدمجة وأشرطة LED والثريات مع إنشاء نقاط الضوء والمفاتيح.' },
  { key: 'domotique', cats: ['electricite'], nom: 'Interphone, videophone et automatisme', nom_ar: 'الإنترفون والفيديوفون والأتمتة',
    description: "Installation et depannage d'interphones, videophones, motorisation de portail et commandes a distance.",
    description_ar: 'تركيب وإصلاح الإنترفون والفيديوفون ومحركات البوابات والتحكم عن بعد.' },

  { key: 'peinture-interieure', cats: ['peinture'], nom: 'Peinture interieure d appartement', nom_ar: 'صباغة داخلية للشقق',
    description: 'Protection des sols, rebouchage, poncage, sous-couche et deux couches de finition. Nettoyage du chantier avant la livraison.',
    description_ar: 'حماية الأرضية، ترميم الشقوق، الصنفرة، طبقة تحتية وطبقتان للتشطيب مع تنظيف الورش.' },
  { key: 'peinture-facade', cats: ['peinture', 'etancheite'], nom: 'Peinture de facade', nom_ar: 'صباغة الواجهة',
    description: 'Lavage haute pression, traitement des fissures, application d une peinture facade hydrofuge resistante aux intemperies.',
    description_ar: 'غسل بالضغط العالي ومعالجة الشقوق وتطبيق صباغة واجهة مقاومة للماء والعوامل الجوية.' },
  { key: 'tadelakt', cats: ['peinture'], nom: 'Enduit decoratif et tadelakt', nom_ar: 'التادلاكت والأصباغ الديكورية',
    description: 'Finitions traditionnelles et contemporaines : tadelakt, stuc, beton cire et effets matiere sur murs et plans de travail.',
    description_ar: 'تشطيبات تقليدية وعصرية: التادلاكت والجبس المصقول والإسمنت الملمع على الجدران والأسطح.' },

  { key: 'placard', cats: ['menuiserie_bois'], nom: 'Placard et dressing sur mesure', nom_ar: 'خزانة ودريسينغ حسب الطلب',
    description: 'Releve de cotes, plan d amenagement, fabrication en atelier puis pose : portes coulissantes ou battantes, amenagement interieur complet.',
    description_ar: 'أخذ المقاسات وتصميم المخطط والتصنيع بالورشة ثم التركيب مع تجهيز داخلي كامل.' },
  { key: 'parquet', cats: ['menuiserie_bois'], nom: 'Pose de parquet et plinthes', nom_ar: 'تركيب الباركيه والوزرات',
    description: 'Preparation du support, pose flottante ou collee, decoupes autour des huisseries, plinthes assorties et seuils de finition.',
    description_ar: 'تحضير الأرضية، تركيب عائم أو ملصق، قص حول الأبواب ووزرات مطابقة.' },
  { key: 'porte-bois', cats: ['menuiserie_bois', 'serrurerie'], nom: 'Reparation et pose de porte en bois', nom_ar: 'إصلاح وتركيب الأبواب الخشبية',
    description: 'Rabotage, reprise de bati, remplacement de paumelles, pose de bloc-porte neuf et ajustement de la serrure.',
    description_ar: 'تسوية الباب، إصلاح الإطار، تغيير المفصلات، تركيب باب جديد وضبط القفل.' },

  { key: 'fenetre-alu', cats: ['menuiserie_alu'], nom: 'Pose de fenetres et baies en aluminium', nom_ar: 'تركيب نوافذ وأبواب الألمنيوم',
    description: 'Depose de l ancien chassis, pose de menuiserie aluminium a rupture de pont thermique, calfeutrement et reglage des ouvrants.',
    description_ar: 'نزع الإطار القديم وتركيب ألمنيوم بعازل حراري مع الإحكام وضبط فتح النوافذ.' },
  { key: 'balcon-alu', cats: ['menuiserie_alu'], nom: 'Fermeture de balcon et veranda', nom_ar: 'تغطية الشرفة والفيراندا',
    description: 'Etude sur place, structure aluminium, vitrage feuillete ou trempe, evacuation des eaux et finitions etanches.',
    description_ar: 'دراسة بعين المكان، هيكل من الألمنيوم، زجاج مقوى، تصريف المياه وتشطيب محكم.' },

  { key: 'mur-cloison', cats: ['maconnerie'], nom: 'Construction de mur et de cloison', nom_ar: 'بناء الجدران والحواجز',
    description: 'Montage en brique ou en parpaing, chainage si necessaire, enduit de dressage et preparation pour la finition.',
    description_ar: 'بناء بالطوب أو الآجر مع التسليح عند الحاجة وتلبيس الجدار وتحضيره للتشطيب.' },
  { key: 'saignee', cats: ['maconnerie', 'electricite'], nom: 'Ouverture et rebouchage de saignee', nom_ar: 'فتح وسد الحفر',
    description: 'Trace, decoupe propre a la rainureuse, passage des gaines ou des tubes puis rebouchage au mortier et raccord d enduit.',
    description_ar: 'تخطيط وقص نظيف ومرور الأنابيب ثم السد بالملاط وإعادة التلبيس.' },
  { key: 'dalle-escalier', cats: ['maconnerie'], nom: 'Reparation de dalle et d escalier', nom_ar: 'إصلاح البلاطة والدرج',
    description: 'Reprise de beton, ragreage, traitement des fissures structurelles et remise a niveau des marches.',
    description_ar: 'إصلاح الخرسانة وتسوية السطح ومعالجة الشقوق وضبط مستوى الدرجات.' },

  { key: 'carrelage-sol', cats: ['carrelage'], nom: 'Pose de carrelage sol et mur', nom_ar: 'تركيب البلاط للأرضية والجدران',
    description: 'Calepinage, ragreage du support, pose collee au double encollage, coupes d angle, joints et nettoyage de finition.',
    description_ar: 'تخطيط البلاط وتسوية الأرضية والتركيب باللاصق مع القص والفواصل والتنظيف النهائي.' },
  { key: 'zellige', cats: ['carrelage'], nom: 'Zellige traditionnel marocain', nom_ar: 'الزليج التقليدي المغربي',
    description: 'Pose de zellige taille main, frises, fontaines et habillages muraux dans le respect des motifs traditionnels.',
    description_ar: 'تركيب الزليج المنحوت يدويا والأفاريز والنوافير وتلبيس الجدران وفق الزخارف التقليدية.' },
  { key: 'renovation-sdb', cats: ['carrelage', 'plomberie'], nom: 'Renovation complete de salle de bain', nom_ar: 'تجديد كامل للحمام',
    description: 'Depose, reprise des reseaux, etancheite sous carrelage, pose du carrelage et des sanitaires, jusqu a la mise en service.',
    description_ar: 'الهدم وإعادة الشبكات والعزل تحت البلاط وتركيب البلاط والأدوات الصحية حتى التشغيل.' },

  { key: 'faux-plafond', cats: ['platre'], nom: 'Faux plafond en platre', nom_ar: 'سقف مستعار من الجبس',
    description: 'Ossature metallique, plaques de platre, reservations pour spots et climatisation, bandes et enduit pret a peindre.',
    description_ar: 'هيكل معدني وألواح جبسية مع فتحات للإنارة والتكييف وتشطيب جاهز للصباغة.' },
  { key: 'corniche', cats: ['platre'], nom: 'Corniche et decoration en gypse', nom_ar: 'الجبس الديكوري والأفاريز',
    description: 'Moulures, corniches lumineuses, rosaces et decors sur mesure, coules sur place ou prefabriques.',
    description_ar: 'زخارف وأفاريز مضيئة وورود جبسية حسب الطلب، مصبوبة في المكان أو جاهزة.' },

  { key: 'clim-split', cats: ['climatisation'], nom: 'Installation de climatiseur split', nom_ar: 'تركيب مكيف سبليت',
    description: 'Choix de l emplacement, percement, liaison frigorifique, tirage au vide, mise en service et remise des consignes d usage.',
    description_ar: 'اختيار المكان والثقب وتمديد الأنابيب وتفريغ الهواء والتشغيل مع شرح الاستعمال.' },
  { key: 'clim-entretien', cats: ['climatisation'], nom: 'Entretien et recharge de climatisation', nom_ar: 'صيانة وتعبئة غاز التكييف',
    description: 'Nettoyage des filtres et de l echangeur, controle d etancheite du circuit, recharge de gaz et verification des performances.',
    description_ar: 'تنظيف الفلاتر والمبادل وفحص تسرب الدارة وتعبئة الغاز والتحقق من الأداء.' },
  { key: 'froid-domestique', cats: ['climatisation'], nom: 'Reparation de refrigerateur et congelateur', nom_ar: 'إصلاح الثلاجة والمجمد',
    description: 'Diagnostic du circuit frigorifique, remplacement de thermostat, de compresseur ou de joint, et controle de la temperature.',
    description_ar: 'تشخيص دارة التبريد وتغيير الثرموستات أو الضاغط أو الحشوة ومراقبة الحرارة.' },

  { key: 'etancheite-terrasse', cats: ['etancheite'], nom: 'Etancheite de terrasse', nom_ar: 'عزل السطح',
    description: 'Preparation du support, forme de pente si necessaire, membrane bitumineuse soudee ou resine, relevés et evacuations.',
    description_ar: 'تحضير السطح وعمل الميل وتركيب العزل البيتومي أو الراتنجي مع المصارف.' },
  { key: 'infiltration', cats: ['etancheite', 'maconnerie'], nom: 'Traitement d infiltration et d humidite', nom_ar: 'معالجة التسربات والرطوبة',
    description: 'Diagnostic de l origine de l humidite, traitement des remontees capillaires, injection et reprise des enduits.',
    description_ar: 'تشخيص مصدر الرطوبة ومعالجة الصعود الشعري والحقن وإعادة التلبيس.' },

  { key: 'serrure', cats: ['serrurerie'], nom: 'Ouverture de porte et changement de serrure', nom_ar: 'فتح الباب وتغيير القفل',
    description: 'Ouverture sans degat quand c est possible, remplacement du cylindre ou de la serrure complete, reglage et remise des cles.',
    description_ar: 'الفتح دون إتلاف عند الإمكان وتغيير الأسطوانة أو القفل كاملا مع الضبط وتسليم المفاتيح.' },
  { key: 'ferronnerie', cats: ['serrurerie'], nom: 'Grille, portail et garde-corps', nom_ar: 'الشبابيك والبوابات والدرابزين',
    description: 'Fabrication sur mesure en fer forge ou en acier, traitement antirouille, peinture et pose scellee.',
    description_ar: 'تصنيع حسب الطلب من الحديد المطاوع مع معالجة الصدأ والصباغة والتثبيت.' },

  { key: 'jardin-entretien', cats: ['jardinage'], nom: 'Entretien de jardin et taille', nom_ar: 'صيانة الحديقة والتقليم',
    description: 'Tonte, taille des haies et des arbustes, desherbage, ramassage et evacuation des dechets verts.',
    description_ar: 'قص العشب وتقليم الأشجار والأسيجة وإزالة الأعشاب وجمع النفايات الخضراء.' },
  { key: 'arrosage', cats: ['jardinage', 'plomberie'], nom: 'Installation d arrosage automatique', nom_ar: 'تركيب السقي الآلي',
    description: 'Etude des zones, pose du reseau goutte a goutte ou asperseurs, programmateur et reglage des cycles par secteur.',
    description_ar: 'دراسة المناطق وتركيب شبكة التنقيط أو الرشاشات مع المبرمج وضبط الدورات.' },
];

// ---------------------------------------------------------------------------
// Artisans
// ---------------------------------------------------------------------------

const CITIES = [
  { city: 'Tanger', areas: ['Tanger Centre', 'Malabata', 'Iberia', 'Branes', 'Beni Makada', 'Mesnana', 'Cap Spartel'] },
  { city: 'Tetouan', areas: ['Tetouan Centre', 'Martil', 'Mdiq', 'Fnideq', 'Cabo Negro'] },
  { city: 'Asilah', areas: ['Asilah Centre', 'Briech', 'Sidi Mghait'] },
  { city: 'Larache', areas: ['Larache Centre', 'Lixus', 'Riad'] },
];

const AVAILABILITIES = ['immediate', 'weekdays', 'weekends', 'evenings', 'on_request'];

const MAALEMS = [
  { key: 'karim-benali', nom: 'Karim Benali', cat: 'plomberie', years: 16 },
  { key: 'youssef-tazi', nom: 'Youssef Tazi', cat: 'electricite', years: 12 },
  { key: 'said-ouazzani', nom: 'Said Ouazzani', cat: 'peinture', years: 21 },
  { key: 'hamid-lamrani', nom: 'Hamid Lamrani', cat: 'menuiserie_bois', years: 18 },
  { key: 'rachid-bouhaddou', nom: 'Rachid Bouhaddou', cat: 'menuiserie_alu', years: 9 },
  { key: 'abdellah-saidi', nom: 'Abdellah Saidi', cat: 'maconnerie', years: 27 },
  { key: 'mustapha-chaoui', nom: 'Mustapha Chaoui', cat: 'carrelage', years: 14 },
  { key: 'nabil-elfassi', nom: 'Nabil El Fassi', cat: 'platre', years: 11 },
  { key: 'anouar-berrada', nom: 'Anouar Berrada', cat: 'climatisation', years: 8 },
  { key: 'omar-znaidi', nom: 'Omar Znaidi', cat: 'etancheite', years: 19 },
  { key: 'driss-alaoui', nom: 'Driss Alaoui', cat: 'serrurerie', years: 13 },
  { key: 'hicham-marzouki', nom: 'Hicham Marzouki', cat: 'jardinage', years: 7 },
  { key: 'jamal-idrissi', nom: 'Jamal Idrissi', cat: 'plomberie', years: 6 },
  { key: 'khalid-naciri', nom: 'Khalid Naciri', cat: 'electricite', years: 23 },
  { key: 'samir-belkadi', nom: 'Samir Belkadi', cat: 'carrelage', years: 10 },
  { key: 'tarik-mansouri', nom: 'Tarik Mansouri', cat: 'peinture', years: 5 },
  { key: 'younes-harrak', nom: 'Younes Harrak', cat: 'maconnerie', years: 15 },
  { key: 'reda-bennani', nom: 'Reda Bennani', cat: 'climatisation', years: 4 },
];

const SKILLS_BY_CATEGORY = {
  plomberie: ['Plomberie sanitaire', 'Detection de fuite', 'Chauffe-eau et ballon', 'Debouchage canalisation', 'Robinetterie', 'Reseau PER et cuivre', 'Pompe de relevage'],
  electricite: ['Tableau electrique', 'Depannage de panne', 'Eclairage LED', 'Mise a la terre', 'Interphone et videophone', 'Motorisation de portail', 'Cablage reseau'],
  peinture: ['Peinture interieure', 'Peinture de facade', 'Enduit et ratissage', 'Tadelakt', 'Beton cire', 'Laque et vernis', 'Preparation de support'],
  menuiserie_bois: ['Placard sur mesure', 'Pose de parquet', 'Bloc-porte', 'Agencement de cuisine', 'Restauration de meuble', 'Plan de travail', 'Lamelle-colle'],
  menuiserie_alu: ['Fenetre aluminium', 'Baie coulissante', 'Fermeture de balcon', 'Vitrage feuillete', 'Moustiquaire', 'Rupture de pont thermique'],
  maconnerie: ['Mur et cloison', 'Dalle beton', 'Escalier', 'Saignee et rebouchage', 'Enduit de dressage', 'Ouverture de mur porteur', 'Chape'],
  carrelage: ['Carrelage grand format', 'Zellige traditionnel', 'Mosaique', 'Etancheite sous carrelage', 'Plinthe et nez de marche', 'Joint epoxy'],
  platre: ['Faux plafond', 'Corniche lumineuse', 'Cloison seche', 'Rosace', 'Bande et enduit', 'Decor sur mesure'],
  climatisation: ['Split mural', 'Gainable', 'Recharge de gaz', 'Tirage au vide', 'Froid domestique', 'Entretien de filtre', 'Pompe a chaleur'],
  etancheite: ['Membrane bitumineuse', 'Resine polyurethane', 'Forme de pente', 'Traitement de fissure', 'Remontee capillaire', 'Relevé et acrotere'],
  serrurerie: ['Ouverture de porte', 'Cylindre de securite', 'Porte blindee', 'Grille de fenetre', 'Portail en fer forge', 'Garde-corps', 'Soudure'],
  jardinage: ['Tonte et gazon', 'Taille de haie', 'Elagage', 'Arrosage automatique', 'Plantation', 'Traitement phytosanitaire'],
};

const SUMMARY_OPENERS = [
  "Artisan {metier} installe a {ville} depuis plus de {annees} ans, forme sur chantier puis en centre de qualification professionnelle.",
  "{metier} de metier, {annees} annees d'experience entre {ville} et sa region, dont plusieurs sur des chantiers de renovation complete.",
  "Je travaille comme {metier} independant a {ville} depuis {annees} ans, apres un apprentissage aupres d'un maalem de la ville.",
  "Specialise en {metier} depuis {annees} ans, j'interviens principalement a {ville} en renovation d'appartement et en depannage.",
];

const SUMMARY_METHOD = [
  "Je travaille proprement : protection des sols, reprise des finitions et nettoyage du poste avant de partir.",
  "Chaque intervention se termine par un essai devant le client, avec explication de ce qui a ete fait et de ce qu'il faut surveiller.",
  "Je donne un prix clair avant de commencer, et je previens tout de suite si un imprevu change le montant.",
  "Je fournis le materiel sur demande, avec les factures d'achat, ou je pose ce que le client a deja achete.",
];

const SUMMARY_CLOSING = [
  "Devis gratuit apres visite sur place, deplacement offert dans un rayon de 15 km.",
  "Disponible pour les urgences le week-end, avec un delai de reponse inferieur a deux heures en journee.",
  "Je travaille aussi avec des syndics et des agences de location pour l'entretien courant.",
  "Garantie d'un an sur la main d'oeuvre, piece garanties selon le fournisseur.",
];

const EXPERIENCE_BLOCKS = {
  plomberie: [
    "2019 - aujourd'hui : artisan independant. Renovation complete de salles de bain, remplacement de colonnes d'evacuation en immeuble, depannage d'urgence pour deux agences de gestion locative.",
    "2015 - 2019 : plombier chez une entreprise de second oeuvre a {ville}. Installation sanitaire de 60 logements neufs, reseaux PER encastres et production d'eau chaude collective.",
    "2012 - 2015 : apprenti puis ouvrier qualifie. Pose de chauffe-eau, debouchage, remplacement de robinetterie sur du parc ancien.",
    "Chantiers marquants : residence de 24 appartements a {zone} (reseau complet), hammam prive avec reprise totale des evacuations, villa avec systeme de recuperation d'eau de pluie.",
  ],
  electricite: [
    "2018 - aujourd'hui : electricien independant. Mise aux normes de tableaux anciens, creation de circuits dedies, eclairage LED sur mesure.",
    "2014 - 2018 : technicien chez un installateur de {ville}. Cablage de plateaux de bureaux, interphonie collective, motorisation de portails de residence.",
    "2011 - 2014 : ouvrier electricien sur chantiers neufs. Tirage de gaines, pose d'appareillage, reperage et mise en service.",
    "Chantiers marquants : immeuble de 5 niveaux entierement recable, cafe-restaurant avec eclairage scenique, villa avec domotique d'eclairage et volets.",
  ],
  peinture: [
    "2016 - aujourd'hui : peintre decorateur independant. Appartements complets, facades, tadelakt de salle de bain et beton cire de plan de travail.",
    "2010 - 2016 : chef d'equipe peinture. Suivi de 3 ouvriers sur des chantiers de residence, preparation des supports et respect des delais de livraison.",
    "2005 - 2010 : ouvrier peintre. Ratissage, enduit, laque sur boiserie et peinture de facade en nacelle.",
    "Chantiers marquants : facade d'un immeuble de 6 etages a {zone}, riad renove entierement en tadelakt, showroom avec effets matiere.",
  ],
  menuiserie_bois: [
    "2017 - aujourd'hui : menuisier a son compte, atelier equipe a {ville}. Placards, dressings, cuisines et agencement sur mesure.",
    "2011 - 2017 : menuisier d'agencement en entreprise. Mobilier de bureaux, banques d'accueil, habillages muraux en panneaux plaques.",
    "2007 - 2011 : apprentissage puis poste d'ouvrier. Portes, fenetres bois, escaliers et restauration de meubles anciens.",
    "Chantiers marquants : dressing de 9 metres lineaires avec portes coulissantes, bibliotheque sur mesure toute hauteur, cuisine en chene massif.",
  ],
  menuiserie_alu: [
    "2020 - aujourd'hui : poseur independant en menuiserie aluminium. Fenetres, baies coulissantes et fermetures de balcon.",
    "2016 - 2020 : poseur chez un fabricant de {ville}. Prise de cotes, pose sur chantier neuf et renovation, service apres-vente.",
    "Chantiers marquants : fermeture de 12 balcons sur une meme residence, veranda de 22 m2 avec toiture vitree, vitrine de commerce en aluminium noir.",
  ],
  maconnerie: [
    "2013 - aujourd'hui : maitre macon independant. Gros oeuvre de villas, extensions, dalles et escaliers beton.",
    "2004 - 2013 : chef de chantier chez une entreprise generale. Suivi d'equipes de 6 a 10 ouvriers sur des chantiers de logements.",
    "1998 - 2004 : macon coffreur. Fondations, poteaux, poutres et planchers sur du batiment collectif.",
    "Chantiers marquants : extension de 45 m2 sur deux niveaux, escalier beton helicoidal, ouverture de mur porteur avec pose d'IPN.",
  ],
  carrelage: [
    "2015 - aujourd'hui : carreleur independant. Sols grand format, murs de salle de bain, terrasses et zellige traditionnel.",
    "2010 - 2015 : carreleur en entreprise de finition. Chantiers de residences neuves, jusqu'a 8 appartements livres par mois.",
    "Chantiers marquants : 240 m2 de gres cerame grand format pose sans joint apparent, fontaine en zellige taille main, salle de bain complete avec etancheite sous carrelage.",
  ],
  platre: [
    "2018 - aujourd'hui : platrier decorateur independant. Faux plafonds, corniches lumineuses et cloisons seches.",
    "2013 - 2018 : ouvrier platrier. Plafonds de commerces, bureaux et logements, avec reservations pour l'eclairage et la climatisation.",
    "Chantiers marquants : plafond decoratif d'un salon marocain de 40 m2, corniche lumineuse sur trois niveaux d'une cage d'escalier, cloisons d'un plateau de bureaux.",
  ],
  climatisation: [
    "2021 - aujourd'hui : frigoriste independant. Pose de splits, entretien annuel et depannage du froid domestique.",
    "2017 - 2021 : technicien chez un distributeur de climatisation a {ville}. Installation, mise en service et SAV sous garantie constructeur.",
    "Chantiers marquants : 14 splits installes dans un meme immeuble de bureaux, gainable de villa avec reseau de gaines isolees, chambre froide de commerce remise en service.",
  ],
  etancheite: [
    "2012 - aujourd'hui : etancheur independant. Terrasses accessibles et inaccessibles, traitement d'infiltrations et de remontees capillaires.",
    "2005 - 2012 : ouvrier etancheur. Membranes bitumineuses soudees au chalumeau, relevés d'acrotere et evacuations d'eaux pluviales.",
    "Chantiers marquants : 600 m2 de terrasse d'immeuble refaits en deux semaines, sous-sol de villa traite contre les remontees, terrasse-jardin avec complexe drainant.",
  ],
  serrurerie: [
    "2016 - aujourd'hui : serrurier metallier independant. Ouverture de porte, securisation, grilles et portails sur mesure.",
    "2011 - 2016 : metallier en atelier. Fabrication de garde-corps, escaliers metalliques et portails coulissants motorises.",
    "Chantiers marquants : securisation complete d'une villa (porte blindee, grilles, portail), garde-corps en fer forge sur 30 metres lineaires, portail coulissant de 5 metres.",
  ],
  jardinage: [
    "2022 - aujourd'hui : jardinier independant. Entretien regulier de jardins prives et de copropietes, creation d'espaces verts.",
    "2018 - 2022 : ouvrier paysagiste. Plantation, gazon en plaques, arrosage automatique et taille raisonnee.",
    "Chantiers marquants : jardin de 800 m2 cree de zero avec arrosage automatique par secteurs, entretien mensuel de trois residences, elagage de palmiers en hauteur.",
  ],
};

const OTHER_INFORMATION = [
  "Je me deplace avec mon propre outillage et un vehicule utilitaire. Je peux fournir les materiaux avec facture, ou poser ce que le client a achete.",
  "Je parle darija, arabe et francais. Je peux envoyer des photos d'avancement par WhatsApp pour les proprietaires qui ne sont pas sur place.",
  "Auto-entrepreneur declare, je fournis une facture pour chaque intervention. Paiement en especes ou par virement.",
  "Je travaille seul sur les petites interventions et avec un aide sur les chantiers de plus de trois jours.",
];

// ---------------------------------------------------------------------------
// Clients particuliers
// ---------------------------------------------------------------------------

const CUSTOMERS = [
  'Amina Berrada', 'Youssef Haddad', 'Fatima Zahra Kabbaj', 'Mehdi Sekkat', 'Salma Bennis',
  'Othmane Rifai', 'Nadia Chraibi', 'Ayoub Belhaj', 'Ghita Lahlou', 'Ismail Kettani',
  'Meryem Sabri', 'Anas Filali', 'Houda Amrani', 'Zakaria Tahiri', 'Loubna Cherkaoui',
  'Bilal Ouahbi', 'Sanaa Mekouar', 'Hamza Regragui', 'Imane Bouzidi', 'Soufiane Daoudi',
  'Kenza Alami', 'Marouane Skalli', 'Rim Benjelloun', 'Adil Hakimi',
];

// ---------------------------------------------------------------------------
// Missions par metier
// ---------------------------------------------------------------------------

const MISSIONS = {
  plomberie: [
    { title: 'Fuite sous evier de cuisine', problem: "Fuite continue au niveau du siphon sous l'evier, l'eau commence a abimer le meuble bas.", summary: "Remplacement du siphon et des joints d'etancheite, reprise du raccordement mural. Test d'ecoulement sur 20 minutes sans reprise de fuite." },
    { title: 'Remplacement chauffe-eau 80L', problem: "Chauffe-eau hors service, plus aucune eau chaude dans le logement depuis trois jours.", summary: "Depose de l'ancien ballon, pose d'un chauffe-eau 80L avec groupe de securite neuf. Mise en eau et controle de la temperature de sortie." },
    { title: 'Debouchage colonne salle de bain', problem: "Evacuation de la douche bouchee, remontee d'eau dans le bac a chaque utilisation.", summary: 'Debouchage mecanique de la colonne, retrait des depots calcaires et controle camera sur trois metres de conduite.' },
    { title: 'Reprise du reseau apres degat des eaux', problem: 'Canalisation percee derriere le mur de la cuisine apres des travaux de percage.', summary: 'Localisation de la fuite, remplacement de la section percee en PER, rebouchage propre de la saignee et test de mise en pression.' },
    { title: 'Pose de machine a laver', problem: "Besoin d'un raccordement propre en eau et en evacuation pour une machine neuve.", summary: "Creation du piquage d'arrivee avec robinet dedie, raccordement de l'evacuation et calage de la machine. Cycle de test complet." },
  ],
  electricite: [
    { title: 'Disjoncteur general qui saute', problem: 'Le disjoncteur general saute des que le chauffe-eau et le four fonctionnent ensemble.', summary: "Recherche de defaut sur l'ensemble des circuits, isolement d'une resistance defectueuse, repartition des circuits et remplacement du differentiel." },
    { title: 'Mise aux normes du tableau', problem: 'Tableau ancien a fusibles, sans differentiel, dans un appartement en cours de renovation.', summary: 'Depose du tableau a fusibles, pose d un tableau neuf avec deux differentiels 30 mA, reperage complet des circuits et schema laisse au client.' },
    { title: 'Eclairage de salon en spots LED', problem: 'Le client souhaite remplacer le lustre unique par un eclairage encastre dans le faux plafond.', summary: 'Creation de 8 points lumineux, pose de spots LED orientables, variateur et commande va-et-vient depuis les deux entrees du salon.' },
    { title: 'Panne de prises dans deux chambres', problem: 'Plus aucune prise ne fonctionne dans deux chambres depuis un orage.', summary: "Identification d'une borne brulee dans une boite de derivation, remplacement du connecteur et controle de la continuite de chaque prise." },
    { title: 'Installation d un videophone', problem: 'Interphone audio hors service, la famille souhaite passer au videophone.', summary: 'Depose de l ancien combine, pose de la platine de rue et du moniteur interieur, reglage de la gache et essais depuis les deux postes.' },
  ],
  peinture: [
    { title: 'Peinture complete d un appartement', problem: 'Appartement de 90 m2 a repeindre entierement avant emmenagement.', summary: 'Protection des sols, rebouchage et poncage, sous-couche et deux couches de finition sur murs et plafonds. Nettoyage complet a la livraison.' },
    { title: 'Reprise de facade apres infiltration', problem: 'Facade cote nord marquee par des cloques de peinture et des traces d humidite.', summary: 'Lavage haute pression, decapage des parties cloquees, traitement des fissures et application d une peinture facade hydrofuge.' },
    { title: 'Tadelakt de salle de bain', problem: 'Le client souhaite remplacer le carrelage mural par un tadelakt traditionnel.', summary: 'Preparation du support, application du tadelakt en deux passes, ferrage a la pierre et traitement au savon noir pour l etancheite.' },
    { title: 'Peinture de cage d escalier', problem: 'Cage d escalier de copropriete tres marquee, murs et rampes a reprendre.', summary: 'Travail en hauteur avec echafaudage, ratissage des murs, deux couches de finition lessivable et laque sur la rampe metallique.' },
    { title: 'Laque des boiseries et portes', problem: 'Portes et plinthes jaunies par le temps, a remettre en blanc satine.', summary: 'Egrenage, sous-couche accrochante et deux couches de laque satinee sur 7 portes, huisseries et plinthes.' },
  ],
  menuiserie_bois: [
    { title: 'Dressing sur mesure de 4 metres', problem: 'Chambre parentale sans rangement, le client veut un dressing toute hauteur.', summary: 'Releve de cotes, fabrication en atelier, pose de 4 metres de dressing avec portes coulissantes, penderies, tiroirs et eclairage LED interieur.' },
    { title: 'Pose de parquet dans deux chambres', problem: 'Sol carrele froid, le client souhaite un parquet dans les chambres.', summary: 'Ragreage du support, pose flottante de 32 m2 avec sous-couche acoustique, decoupes autour des huisseries et plinthes assorties.' },
    { title: 'Porte d entree qui ne ferme plus', problem: "La porte frotte en bas et la serrure ne s'aligne plus avec la gache.", summary: 'Rabotage du bas de porte, reprise du bati, remplacement des paumelles et realignement de la gache. Fermeture testee sur 20 cycles.' },
    { title: 'Bibliotheque sur mesure de salon', problem: 'Mur de salon vide a habiller avec une bibliotheque toute hauteur.', summary: 'Conception sur plan, fabrication en MDF plaque chene, pose scellee au mur avec niches eclairees et portes basses.' },
    { title: 'Renovation de plan de travail', problem: 'Plan de travail de cuisine gonfle par l humidite autour de l evier.', summary: 'Depose de l ancien plan, pose d un plan stratifie neuf avec joint silicone sanitaire et decoupe adaptee a l evier existant.' },
  ],
  menuiserie_alu: [
    { title: 'Remplacement de 5 fenetres', problem: 'Fenetres bois anciennes, non etanches, avec beaucoup de courants d air.', summary: 'Depose des chassis bois, pose de 5 fenetres aluminium a rupture de pont thermique, calfeutrement et reglage des ouvrants.' },
    { title: 'Fermeture de balcon en aluminium', problem: 'Balcon de 8 m2 a fermer pour gagner une piece utilisable toute l annee.', summary: 'Structure aluminium sur mesure, vitrage feuillete, coulissants sur trois faces, evacuation des eaux et finitions etanches.' },
    { title: 'Baie coulissante bloquee', problem: 'La grande baie du salon ne coulisse plus et prend l eau par le bas.', summary: 'Remplacement des galets, nettoyage et reprise du rail, changement des joints brosse et debouchage des trous d evacuation.' },
    { title: 'Pose de moustiquaires', problem: 'Le client souhaite des moustiquaires sur toutes les ouvertures de la maison.', summary: 'Prise de cotes, fabrication et pose de 9 moustiquaires enroulables, reglage de la tension et essai de chaque ouvrant.' },
  ],
  maconnerie: [
    { title: 'Ouverture entre cuisine et salon', problem: 'Le client veut supprimer le mur entre la cuisine et le salon pour ouvrir l espace.', summary: 'Etaiement, ouverture du mur porteur, pose d un IPN avec appuis beton, rebouchage et enduit de dressage pret a peindre.' },
    { title: 'Construction d un mur de cloture', problem: 'Terrain a delimiter par un mur de cloture de 18 metres.', summary: 'Fondations, montage en parpaing sur 18 metres, chainage horizontal et vertical, enduit exterieur et chaperon de finition.' },
    { title: 'Reparation de dalle de terrasse', problem: 'Dalle de terrasse fissuree sur plusieurs metres avec un affaissement visible.', summary: 'Ouverture des fissures, traitement et pontage, reprise de la forme de pente et chape de finition talochee.' },
    { title: 'Escalier beton exterieur', problem: 'Acces au jardin en terre battue, le client souhaite un escalier beton de 6 marches.', summary: 'Coffrage, ferraillage, coulage du beton, decoffrage et finition des nez de marche antiderapants.' },
    { title: 'Saignees pour renovation electrique', problem: 'Renovation complete d un appartement, toutes les gaines doivent passer en encastre.', summary: 'Trace avec l electricien, decoupe a la rainureuse sur 60 metres lineaires, passage des gaines et rebouchage au mortier.' },
  ],
  carrelage: [
    { title: 'Carrelage de sejour en grand format', problem: 'Sejour de 42 m2 a carreler en gres cerame 120x60 avec joints minces.', summary: 'Ragreage du support, calepinage depuis l axe de la piece, pose au double encollage, joints de 2 mm et nettoyage de finition.' },
    { title: 'Renovation complete de salle de bain', problem: 'Salle de bain des annees 90 a refaire entierement, carrelage et sanitaires compris.', summary: 'Depose totale, etancheite sous carrelage, pose du carrelage sol et mur, installation des sanitaires et joints sanitaires.' },
    { title: 'Fontaine en zellige traditionnel', problem: 'Le client souhaite une fontaine murale en zellige taille main dans le patio.', summary: 'Traçage du motif, pose du zellige taille main sur la vasque et le fond de fontaine, joints a la chaux et lustrage final.' },
    { title: 'Carrelage de terrasse antiderapant', problem: 'Terrasse glissante par temps de pluie, a recouvrir avec un carrelage adapte.', summary: 'Pose sur plots de 26 m2 de gres antiderapant R11, respect de la pente d evacuation et joints souples en peripherie.' },
    { title: 'Reprise de joints et de plinthes', problem: 'Joints noircis dans la cuisine et plinthes descellees dans le couloir.', summary: 'Depose des joints degrades, nettoyage des rives, refection des joints et rescellement de 14 metres de plinthes.' },
  ],
  platre: [
    { title: 'Faux plafond de salon marocain', problem: 'Salon marocain de 38 m2 a equiper d un faux plafond decoratif avec eclairage indirect.', summary: 'Ossature metallique, plaques de platre, corniche lumineuse peripherique, reservations pour spots et finition prete a peindre.' },
    { title: 'Cloison seche pour creer un bureau', problem: 'Le client veut separer une partie du salon pour en faire un bureau ferme.', summary: 'Montage d une cloison de 3,2 metres avec isolant acoustique, reservation pour bloc-porte, bandes et enduit de finition.' },
    { title: 'Corniche lumineuse de couloir', problem: 'Couloir sombre a mettre en valeur avec un eclairage indirect.', summary: 'Pose de 11 metres lineaires de corniche a gorge lumineuse, integration du ruban LED et raccordement au circuit existant.' },
    { title: 'Reparation de plafond apres degat des eaux', problem: 'Plafond du salon affaisse et tache apres une fuite de l etage superieur.', summary: 'Depose de la partie endommagee, sechage, remplacement des plaques, bandes, enduit et raccord de finition invisible.' },
  ],
  climatisation: [
    { title: 'Installation de deux splits', problem: 'Appartement sans climatisation, deux chambres a equiper avant l ete.', summary: 'Pose de deux splits muraux 12000 BTU, percement, liaison frigorifique, tirage au vide, mise en service et consignes d usage.' },
    { title: 'Climatiseur qui ne refroidit plus', problem: 'Le split fonctionne mais souffle de l air tiede depuis une semaine.', summary: 'Controle d etancheite du circuit, reparation d un raccord fuyard, recharge de gaz et verification des pressions en fonctionnement.' },
    { title: 'Entretien annuel avant saison', problem: 'Trois climatiseurs a entretenir avant la periode chaude.', summary: 'Nettoyage des filtres et des echangeurs, desinfection des bacs de condensats, controle des pressions et des consommations.' },
    { title: 'Refrigerateur qui givre en continu', problem: 'Le refrigerateur forme une couche de givre au fond et ne tient plus la temperature.', summary: 'Degivrage complet, remplacement du thermostat defectueux, debouchage de l evacuation de condensats et controle sur 24 heures.' },
  ],
  etancheite: [
    { title: 'Etancheite de terrasse de 120 m2', problem: 'Infiltrations dans l appartement du dessous a chaque forte pluie.', summary: 'Depose de l ancien complexe, reprise de la forme de pente, membrane bitumineuse bicouche soudee, relevés d acrotere et evacuations neuves.' },
    { title: 'Traitement de remontees capillaires', problem: 'Bas de murs du rez-de-chaussee humides et salpetre sur 40 cm de hauteur.', summary: 'Piquage des enduits degrades, injection de resine hydrofuge en pied de mur, sechage puis enduit d assainissement.' },
    { title: 'Reprise d etancheite autour des evacuations', problem: 'Auréoles au plafond du garage, sous les descentes d eaux pluviales.', summary: 'Depose des platines, mise en place de manchettes neuves, soudure de renfort et test a l eau sur les deux descentes.' },
    { title: 'Etancheite liquide de balcon', problem: 'Balcon fissure qui laisse passer l eau vers la facade.', summary: 'Ponçage, traitement des fissures, application d une resine polyurethane en trois couches avec armature en peripherie.' },
  ],
  serrurerie: [
    { title: 'Ouverture de porte claquee', problem: 'Porte d entree claquee avec les cles restees a l interieur.', summary: 'Ouverture fine sans degradation du cylindre, controle du fonctionnement de la serrure et graissage du mecanisme.' },
    { title: 'Pose d une porte blindee', problem: 'Apres une tentative d effraction, le client veut securiser son entree.', summary: 'Depose de l ancien bloc, pose d une porte blindee avec serrure 5 points, pattes de scellement et reglage de la fermeture.' },
    { title: 'Grilles de securite pour fenetres', problem: 'Trois fenetres de rez-de-chaussee a securiser sans fermer la vue.', summary: 'Fabrication sur mesure en fer plein, traitement antirouille, peinture epoxy noire et pose scellee au mortier.' },
    { title: 'Portail coulissant motorise', problem: 'Portail battant lourd et difficile a manoeuvrer, a remplacer par un coulissant.', summary: 'Fabrication d un portail coulissant de 4,5 metres, pose du rail, motorisation avec telecommandes et cellules de securite.' },
  ],
  jardinage: [
    { title: 'Remise en etat de jardin', problem: 'Jardin laisse a l abandon pendant un an, herbes hautes et haies non taillees.', summary: 'Debroussaillage complet, taille des haies et des arbustes, tonte, desherbage des allees et evacuation de six remorques de dechets verts.' },
    { title: 'Installation d arrosage automatique', problem: 'Jardin de 400 m2 arrose a la main, le client veut automatiser.', summary: 'Etude des secteurs, pose du reseau enterre, 9 asperseurs et une ligne goutte a goutte, programmateur regle par saison.' },
    { title: 'Gazon en plaques sur 180 m2', problem: 'Terrain nu a transformer en pelouse avant la fin du printemps.', summary: 'Decompactage, apport de terre vegetale, nivellement, pose du gazon en plaques et premier arrosage abondant.' },
    { title: 'Elagage de palmiers', problem: 'Quatre palmiers a elaguer, palmes seches dangereuses au-dessus du passage.', summary: 'Elagage en hauteur avec harnais, retrait des palmes seches et des regimes, broyage et evacuation des dechets.' },
  ],
};

// ---------------------------------------------------------------------------
// Avis
// ---------------------------------------------------------------------------

const REVIEW_COMMENTS = {
  5: [
    "Travail impeccable, ponctuel et tres propre. Il a pris le temps d'expliquer ce qu'il faisait et a tout nettoye avant de partir.",
    "Rien a redire. Prix annonce respecte, intervention rapide et resultat parfait. Je le recommande sans hesiter.",
    "Tres bon professionnel. Il est venu le jour meme pour une urgence et a regle le probleme en moins de deux heures.",
    "Excellent maalem, serieux et a l'ecoute. Il a propose une solution plus simple et moins chere que ce que j'imaginais.",
    "Finition soignee, materiel de qualite et respect des delais. Le chantier a ete livre propre, comme promis.",
    "Ponctuel, poli et competent. Il a refait le travail mal fait par un autre artisan sans rien facturer en plus.",
  ],
  4: [
    'Bon travail dans l ensemble, resultat conforme a ce qui etait annonce. Un petit retard le premier jour, mais rien de genant.',
    'Professionnel competent et prix correct. J aurais aime un peu plus de nettoyage a la fin, sinon rien a redire.',
    'Intervention efficace et bien expliquee. Le devis a legerement augmente en cours de chantier, mais c etait justifie.',
    'Satisfait du resultat. Le maalem connait son metier, il a juste fallu le relancer une fois pour fixer la date.',
    'Tres bien dans l ensemble. Le travail tient, la finition est propre, je referai appel a lui.',
  ],
  3: [
    'Le travail est correct mais le chantier a dure plus longtemps que prevu. Le resultat final reste acceptable.',
    'Prestation moyenne : le probleme est regle, mais la finition aurait pu etre plus soignee autour des angles.',
    'Correct sans plus. Il faut rester derriere pour les details, mais le principal a bien ete fait.',
    'Resultat convenable. Communication difficile sur les horaires, il a fallu plusieurs appels pour confirmer.',
  ],
  2: [
    'Travail bacle par endroits, j ai du faire reprendre une partie. Le maalem est revenu, mais apres plusieurs relances.',
    'Deçu du resultat : le probleme est revenu deux semaines apres l intervention.',
    'Retards repetes et finitions a reprendre. Le prix ne correspondait pas non plus a ce qui avait ete annonce.',
  ],
  1: [
    'Intervention non terminee, le maalem n est jamais revenu finir le travail malgre ses promesses.',
    'Tres mauvaise experience : degats sur le mur et aucune prise en charge de sa part.',
  ],
};

const MODERATION_REASONS = [
  { code: 'OFF_TOPIC', reason: 'Avis sans rapport avec la prestation realisee.' },
  { code: 'PERSONAL_DATA', reason: 'Avis contenant des donnees personnelles (numero de telephone).' },
  { code: 'INSULT', reason: 'Propos insultants envers l artisan.' },
  { code: 'SUSPECTED_FAKE', reason: 'Avis suspecte de ne pas correspondre a une intervention reelle.' },
];

// ---------------------------------------------------------------------------
// Acces base
// ---------------------------------------------------------------------------

async function tableExists(db, name) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [name]
  );
  return Number(rows[0]?.n || 0) > 0;
}

async function pickEmployees(db) {
  const [rows] = await db.query(
    `SELECT id, nom_complet FROM employees WHERE nom_complet IS NOT NULL ORDER BY (role = 'PDG') DESC, id ASC LIMIT 6`
  );
  return rows;
}

async function nextRequestNumber(conn) {
  await conn.query(
    `INSERT IGNORE INTO service_request_sequences (sequence_name, current_value) VALUES ('service_request', 0)`
  );
  await conn.query(
    `UPDATE service_request_sequences SET current_value = current_value + 1 WHERE sequence_name = 'service_request'`
  );
  const [[row]] = await conn.query(
    `SELECT current_value FROM service_request_sequences WHERE sequence_name = 'service_request'`
  );
  return formatServiceRequestNumber(Number(row.current_value));
}

// ---------------------------------------------------------------------------
// Manifeste (pour un revert exact)
// ---------------------------------------------------------------------------

function emptyManifest() {
  return {
    generated_at: null,
    categories: [], services: [], service_category_links: [],
    contacts: [], profiles: [], requests: [],
  };
}

function readManifest() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    return { ...emptyManifest(), ...JSON.parse(raw) };
  } catch {
    return emptyManifest();
  }
}

/**
 * Le manifeste s'accumule : un second --apply reutilise le catalogue existant et
 * n'y ajoute que ses nouvelles lignes. Sans fusion, un --revert posterieur
 * laisserait les services et profils du premier passage orphelins.
 */
function writeManifest(manifest) {
  const previous = readManifest();
  const mergeIds = (a, b) => [...new Set([...a, ...b])];
  const mergeLinks = (a, b) => {
    const seen = new Set(a.map((pair) => pair.join(':')));
    return [...a, ...b.filter((pair) => !seen.has(pair.join(':')))];
  };
  const merged = {
    generated_at: manifest.generated_at,
    first_generated_at: previous.first_generated_at ?? previous.generated_at ?? manifest.generated_at,
    categories: mergeIds(previous.categories, manifest.categories),
    services: mergeIds(previous.services, manifest.services),
    service_category_links: mergeLinks(previous.service_category_links, manifest.service_category_links),
    contacts: mergeIds(previous.contacts, manifest.contacts),
    profiles: mergeIds(previous.profiles, manifest.profiles),
    requests: mergeIds(previous.requests, manifest.requests),
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Referentiels : categories et services
// ---------------------------------------------------------------------------

async function ensureCategories(conn, manifest, employeeId) {
  const byKey = new Map();
  for (const category of CATEGORIES) {
    const [rows] = await conn.query('SELECT id FROM maalem_categories WHERE nom = ? LIMIT 1', [category.nom]);
    if (rows[0]) {
      byKey.set(category.key, Number(rows[0].id));
      continue;
    }
    const [result] = await conn.query(
      `INSERT INTO maalem_categories (nom, nom_ar, description, is_active, created_by, updated_by)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [category.nom, category.nom_ar, category.description, employeeId, employeeId]
    );
    byKey.set(category.key, result.insertId);
    manifest.categories.push(result.insertId);
  }
  return byKey;
}

async function ensureServices(conn, manifest, categoryIds, employeeId) {
  const byKey = new Map();
  for (const service of SERVICES) {
    const [rows] = await conn.query('SELECT id FROM services WHERE nom = ? LIMIT 1', [service.nom]);
    let serviceId;
    if (rows[0]) {
      serviceId = Number(rows[0].id);
    } else {
      const [result] = await conn.query(
        `INSERT INTO services
           (nom, nom_ar, description, description_ar, image_url, is_active, is_published, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`,
        [service.nom, service.nom_ar, service.description, service.description_ar,
          serviceImage(service.key), employeeId, employeeId]
      );
      serviceId = result.insertId;
      manifest.services.push(serviceId);
    }
    byKey.set(service.key, { id: serviceId, cats: service.cats, nom: service.nom });

    for (const catKey of service.cats) {
      const categoryId = categoryIds.get(catKey);
      if (!categoryId) continue;
      const [linkRows] = await conn.query(
        'SELECT 1 FROM service_maalem_categories WHERE service_id = ? AND category_id = ? LIMIT 1',
        [serviceId, categoryId]
      );
      if (linkRows[0]) continue;
      await conn.query(
        'INSERT INTO service_maalem_categories (service_id, category_id) VALUES (?, ?)',
        [serviceId, categoryId]
      );
      manifest.service_category_links.push([serviceId, categoryId]);
    }
  }
  return byKey;
}

// ---------------------------------------------------------------------------
// Contacts et profils
// ---------------------------------------------------------------------------

const slugify = (value) => value
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const seedEmail = (slug) => `${slug}@${SEED_EMAIL_DOMAIN}`;

async function ensureContact(conn, manifest, { nom, email, telephone, typeCompte, avatarUrl, city, area, employeeId }) {
  const [rows] = await conn.query('SELECT id FROM contacts WHERE email = ? LIMIT 1', [email]);
  if (rows[0]) return Number(rows[0].id);
  const parts = nom.split(' ');
  const isArtisan = typeCompte === 'Artisan/Promoteur';
  const [result] = await conn.query(
    `INSERT INTO contacts
       (nom_complet, type, telephone, email, adresse, prenom, nom, type_compte,
        demande_artisan, artisan_approuve, artisan_approuve_par, artisan_approuve_le,
        auth_provider, avatar_url, email_verified, locale, is_active, is_blocked, source,
        shipping_address_line1, shipping_city, shipping_country, created_by, updated_by)
     VALUES (?, 'Client', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', ?, 1, 'fr', 1, 0, 'ecommerce', ?, ?, 'Maroc', ?, ?)`,
    [nom, telephone, email, `${area}, ${city}`, parts[0], parts.slice(1).join(' ') || parts[0], typeCompte,
      isArtisan ? 1 : 0, isArtisan ? 1 : 0, isArtisan ? employeeId : null,
      isArtisan ? sqlDateTime(daysAgo(between(200, 900))) : null,
      avatarUrl, area, city, employeeId, employeeId]
  );
  manifest.contacts.push(result.insertId);
  return result.insertId;
}

function buildProfessionalData(maalem, categoryNom, place) {
  const skills = sample(SKILLS_BY_CATEGORY[maalem.cat], between(4, 6));
  const areas = sample(place.areas, between(3, Math.min(5, place.areas.length)));
  const fill = (text) => text
    .replace('{metier}', categoryNom.toLowerCase())
    .replace('{ville}', place.city)
    .replace('{annees}', String(maalem.years))
    .replace('{zone}', areas[0] ?? place.city);

  const summary = [fill(pick(SUMMARY_OPENERS)), fill(pick(SUMMARY_METHOD)), fill(pick(SUMMARY_CLOSING))].join('\n\n');
  const experiences = EXPERIENCE_BLOCKS[maalem.cat].map(fill).join('\n\n');

  return {
    skills,
    contact_phone: null, // rempli avec le telephone du contact juste apres
    city: place.city,
    intervention_areas: areas,
    experience_years: maalem.years,
    professional_summary: summary.slice(0, 2000),
    experiences: experiences.slice(0, 5000),
    availability: pick(AVAILABILITIES),
    other_information: pick(OTHER_INFORMATION),
  };
}

async function ensureMaalemProfile(conn, manifest, { contactId, categoryId, professionalData, employeeId, nom }) {
  const [rows] = await conn.query(
    'SELECT id FROM maalem_profiles WHERE contact_id = ? AND deleted_at IS NULL LIMIT 1',
    [contactId]
  );
  if (rows[0]) {
    await conn.query(
      `UPDATE maalem_profiles
       SET category_id = ?, status = 'approved', is_public = 1, professional_data = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [categoryId, JSON.stringify(professionalData), rows[0].id]
    );
    return Number(rows[0].id);
  }

  const createdAt = daysAgo(between(400, 900));
  const submittedAt = addHours(createdAt, between(4, 72));
  const reviewStartAt = addHours(submittedAt, between(6, 96));
  const approvedAt = addHours(reviewStartAt, between(6, 120));
  const origin = pick(['SELF_SERVICE', 'NEW_REGISTRATION', 'ARTISAN_CONVERSION', 'TEAM_CREATED']);

  const [result] = await conn.query(
    `INSERT INTO maalem_profiles
       (contact_id, category_id, status, is_public, origin, professional_data,
        submitted_at, reviewed_at, reviewed_by, created_by_employee_id, created_at, updated_at)
     VALUES (?, ?, 'approved', 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [contactId, categoryId, origin, JSON.stringify(professionalData),
      sqlDateTime(submittedAt), sqlDateTime(approvedAt), employeeId,
      origin === 'TEAM_CREATED' ? employeeId : null, sqlDateTime(createdAt), sqlDateTime(approvedAt)]
  );
  const profileId = result.insertId;
  manifest.profiles.push(profileId);

  const steps = [
    ['STATUS_CHANGED', 'draft', 'submitted', 'Dossier complete et envoye par le candidat.', 'CANDIDATE', nom, submittedAt],
    ['STATUS_CHANGED', 'submitted', 'under_review', 'Prise en charge du dossier par le back-office.', 'BACKOFFICE', null, reviewStartAt],
    ['STATUS_CHANGED', 'under_review', 'approved', 'References verifiees, profil approuve et publie sur la vitrine.', 'BACKOFFICE', null, approvedAt],
  ];
  for (const [eventType, oldStatus, newStatus, note, actorType, actorName, at] of steps) {
    await conn.query(
      `INSERT INTO maalem_profile_history
         (profile_id, event_type, old_status, new_status, note, actor_type,
          actor_employee_id, actor_contact_id, actor_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [profileId, eventType, oldStatus, newStatus, note, actorType,
        actorType === 'BACKOFFICE' ? employeeId : null,
        actorType === 'CANDIDATE' ? contactId : null,
        actorName || 'Back-office', sqlDateTime(at)]
    );
  }
  return profileId;
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

/** Demande hors workflow d'affectation : new / to_contact / processing / waiting_customer / confirmed / cancelled. */
async function createOpenRequest(conn, ctx, { maalem, service, customer, status, mission, ageDays }) {
  const createdAt = daysAgo(ageDays);
  const number = await nextRequestNumber(conn);
  const employeeId = ctx.employee.id;
  const needsHandler = status !== 'new';
  const confirmed = status === 'confirmed';
  const cancelled = status === 'cancelled';
  const confirmedAt = confirmed ? addHours(createdAt, between(2, 40)) : null;
  const cancelledAt = cancelled ? addHours(createdAt, between(2, 60)) : null;

  const [result] = await conn.query(
    `INSERT INTO service_requests
       (request_number, requester_contact_id, request_source, service_id, requested_maalem_profile_id,
        qualified_category_id, qualified_service_id, title, problem_description, qualified_description,
        requester_name, requester_phone, requester_email, city, intervention_address, desired_date,
        desired_time_slot, status, priority, handled_by_employee_id, confirmed_by_employee_id, confirmed_at,
        cancelled_by_employee_id, cancelled_at, cancellation_reason, cancellation_public_reason,
        request_channel, created_at, updated_at)
     VALUES (?, ?, 'selected_maalem', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ECOMMERCE', ?, ?)`,
    [number, customer.id, service.id, maalem.profileId, maalem.categoryId, service.id,
      mission.title, `${mission.problem} [${SEED_TAG}]`,
      needsHandler ? `Qualifie en ${service.nom.toLowerCase()} apres echange telephonique avec le client.` : null,
      customer.nom, customer.telephone, customer.email, maalem.city,
      `${pick(maalem.areas)}, ${maalem.city}`, sqlDate(daysAgo(ageDays - between(2, 8))),
      pick(['Matin (9h-12h)', 'Apres-midi (14h-17h)', 'Journee complete', 'Fin de journee (17h-19h)']),
      status, pick(['low', 'normal', 'normal', 'high', 'urgent']),
      needsHandler ? employeeId : null,
      confirmed ? employeeId : null, confirmed ? sqlDateTime(confirmedAt) : null,
      cancelled ? employeeId : null, cancelled ? sqlDateTime(cancelledAt) : null,
      cancelled ? 'Le client a fait realiser les travaux par un proche avant la planification.' : null,
      cancelled ? 'Demande annulee a la demande du client.' : null,
      sqlDateTime(createdAt), sqlDateTime(confirmedAt || cancelledAt || createdAt)]
  );
  ctx.manifest.requests.push(result.insertId);
  return result.insertId;
}

/**
 * Mission complete. `finalStatus` vaut 'closed', 'work_in_progress' ou 'scheduled'.
 * L'ordre est impose par les CHECK : la demande est d'abord 'confirmed' (sans affectation),
 * puis l'affectation est creee, puis le statut final est pose.
 */
async function createAssignedMission(conn, ctx, { maalem, service, customer, mission, ageDays, source, finalStatus }) {
  const employeeId = ctx.employee.id;
  const createdAt = daysAgo(ageDays);
  const confirmedAt = addHours(createdAt, between(3, 30));
  const scheduledAt = addHours(confirmedAt, between(2, 24));
  const plannedDate = daysAgo(Math.max(0, ageDays - between(2, 6)));
  const number = await nextRequestNumber(conn);
  const isSelectedMaalem = source === 'selected_maalem';
  const area = pick(maalem.areas);

  const [request] = await conn.query(
    `INSERT INTO service_requests
       (request_number, requester_contact_id, request_source, service_id, requested_maalem_profile_id,
        qualified_category_id, qualified_service_id, title, problem_description, qualified_description,
        requester_name, requester_phone, requester_email, city, intervention_address, desired_date,
        desired_time_slot, status, priority, handled_by_employee_id, confirmed_by_employee_id, confirmed_at,
        request_channel, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, 'ECOMMERCE', ?, ?)`,
    [number, customer.id, source, service.id,
      isSelectedMaalem ? maalem.profileId : null,
      isSelectedMaalem ? maalem.categoryId : null,
      service.id, mission.title, `${mission.problem} [${SEED_TAG}]`,
      `Qualifie en ${service.nom.toLowerCase()} apres echange telephonique avec le client.`,
      customer.nom, customer.telephone, customer.email, maalem.city, `${area}, ${maalem.city}`,
      sqlDate(plannedDate), pick(['Matin (9h-12h)', 'Apres-midi (14h-17h)', 'Journee complete']),
      pick(['low', 'normal', 'normal', 'normal', 'high']), employeeId, employeeId, sqlDateTime(confirmedAt),
      sqlDateTime(createdAt), sqlDateTime(confirmedAt)]
  );
  const requestId = request.insertId;
  ctx.manifest.requests.push(requestId);

  const [assignment] = await conn.query(
    `INSERT INTO service_request_assignments
       (service_request_id, maalem_profile_id, assigned_by_employee_id, assigned_at,
        assignment_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [requestId, maalem.profileId, employeeId, sqlDateTime(scheduledAt),
      isSelectedMaalem
        ? 'Maalem demande par le client et compatible avec la categorie qualifiee.'
        : 'Maalem le plus proche disponible sur la zone, compatible avec la categorie du service.',
      sqlDateTime(scheduledAt), sqlDateTime(scheduledAt)]
  );
  const assignmentId = assignment.insertId;

  await conn.query(
    'UPDATE service_requests SET current_assignment_id = ?, status = ?, updated_at = ? WHERE id = ?',
    [assignmentId, finalStatus, sqlDateTime(scheduledAt), requestId]
  );

  const timeSlot = pick(['Matin (9h-12h)', 'Apres-midi (14h-17h)', 'Journee complete']);
  const base = {
    requestId, assignmentId, plannedDate, timeSlot, area,
    address: `${area}, ${maalem.city}`, city: maalem.city,
    serviceId: service.id, categoryId: maalem.categoryId,
    customer, employeeId, scheduledAt,
  };

  if (finalStatus === 'scheduled') {
    await insertIntervention(conn, { ...base, status: 'scheduled', progress: 0, mission, maalem });
    return { requestId, assignmentId, interventionId: null };
  }
  if (finalStatus === 'work_in_progress') {
    await insertIntervention(conn, { ...base, status: 'work_in_progress', progress: between(30, 80), mission, maalem });
    return { requestId, assignmentId, interventionId: null };
  }

  // Une mission cloturee ne peut pas l'avoir ete dans le futur.
  const notAfterNow = (d) => (d.getTime() > Date.now() ? new Date(Date.now() - between(1, 6) * 3600000) : d);
  const completedAt = notAfterNow(addHours(plannedDate, between(2, 8)));
  const closedAt = notAfterNow(addHours(completedAt, between(2, 72)));
  const interventionId = await insertIntervention(conn, {
    ...base, status: 'closed', progress: 100, mission, maalem, completedAt, closedAt,
  });
  return { requestId, assignmentId, interventionId, closedAt, completedAt };
}

async function insertIntervention(conn, args) {
  const {
    requestId, assignmentId, status, plannedDate, timeSlot, address, city, serviceId, categoryId,
    customer, employeeId, scheduledAt, progress, mission, maalem, completedAt, closedAt,
  } = args;
  const isClosed = status === 'closed';
  const started = status === 'work_in_progress' || isClosed;
  const enRouteAt = started ? addHours(plannedDate, 1) : null;
  const arrivedAt = started ? addHours(plannedDate, 1.5) : null;
  const startedAt = started ? addHours(plannedDate, 2) : null;

  const [result] = await conn.query(
    `INSERT INTO service_interventions
       (service_request_id, executing_assignment_id, status, planned_date, planned_time_slot,
        mission_address, mission_city, planned_service_id, planned_category_id,
        mission_contact_name, mission_contact_phone, shared_instructions, special_information,
        progress_percent, work_summary, maalem_observations, work_finished, additional_intervention_required,
        scheduled_by_employee_id, scheduled_at, en_route_at, en_route_by_contact_id,
        arrived_at, arrived_by_contact_id, started_at, started_by_contact_id,
        completed_at, completed_by_contact_id, closed_at, closed_by_employee_id, closure_internal_note,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [requestId, isClosed ? assignmentId : null, status, sqlDate(plannedDate), timeSlot,
      address, city, serviceId, categoryId, customer.nom, customer.telephone,
      'Prevenir le client 30 minutes avant l arrivee. Acces par la porte principale.',
      pick([null, 'Presence d un animal de compagnie dans le logement.', 'Parking difficile, prevoir une place en amont.',
        'Le client travaille : appeler avant de se deplacer.', null]),
      progress,
      isClosed ? mission.summary : null,
      isClosed ? pick([
        'Materiel fourni par mes soins, facture remise au client.',
        'Intervention conforme au devis, rien a signaler.',
        'Le client souhaite un devis complementaire pour une autre piece.',
        null,
      ]) : null,
      isClosed ? 1 : null,
      isClosed ? (chance(0.15) ? 1 : 0) : null,
      employeeId, sqlDateTime(scheduledAt),
      enRouteAt ? sqlDateTime(enRouteAt) : null, started ? maalem.contactId : null,
      arrivedAt ? sqlDateTime(arrivedAt) : null, started ? maalem.contactId : null,
      startedAt ? sqlDateTime(startedAt) : null, started ? maalem.contactId : null,
      isClosed ? sqlDateTime(completedAt) : null, isClosed ? maalem.contactId : null,
      isClosed ? sqlDateTime(closedAt) : null, isClosed ? employeeId : null,
      isClosed ? 'Compte rendu conforme, photos verifiees, mission cloturee.' : null,
      sqlDateTime(scheduledAt), sqlDateTime(closedAt || startedAt || scheduledAt)]
  );
  return result.insertId;
}

// ---------------------------------------------------------------------------
// Avis
// ---------------------------------------------------------------------------

function drawRating() {
  const r = rnd();
  if (r < 0.52) return 5;
  if (r < 0.80) return 4;
  if (r < 0.92) return 3;
  if (r < 0.98) return 2;
  return 1;
}

async function createReview(conn, ctx, { maalem, mission, customer, requestId, interventionId, closedAt }) {
  const rating = drawRating();
  const submittedAt = addHours(closedAt, between(6, 240));
  const r = rnd();
  let status = 'published';
  if (r > 0.88 && r <= 0.94) status = 'pending';
  else if (r > 0.94 && r <= 0.975) status = 'hidden';
  else if (r > 0.975) status = 'rejected';

  const moderated = status === 'hidden' || status === 'rejected';
  const moderation = moderated ? pick(MODERATION_REASONS) : null;
  const moderatedAt = moderated ? addHours(submittedAt, between(2, 96)) : null;

  const [result] = await conn.query(
    `INSERT INTO maalem_reviews
       (service_request_id, intervention_id, customer_contact_id, maalem_profile_id, rating, comment,
        status, submitted_at, moderated_at, moderated_by, moderation_reason,
        moderation_reason_code, moderation_internal_note, moderation_version,
        hidden_at, hidden_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [requestId, interventionId, customer.id, maalem.profileId, rating, pick(REVIEW_COMMENTS[rating]),
      status, sqlDateTime(submittedAt),
      moderatedAt ? sqlDateTime(moderatedAt) : null, moderated ? ctx.employee.id : null,
      moderation?.reason ?? null, moderation?.code ?? null,
      moderated ? `Signalement traite par le back-office. Mission ${mission.title}.` : null,
      moderated ? 1 : 0,
      status === 'hidden' ? sqlDateTime(moderatedAt) : null,
      status === 'hidden' ? ctx.employee.id : null,
      sqlDateTime(submittedAt), sqlDateTime(moderatedAt || submittedAt)]
  );
  const reviewId = result.insertId;

  await conn.query(
    `INSERT INTO maalem_review_history
       (review_id, event_type, new_rating, new_comment, new_status, actor_type, actor_contact_id, actor_name, created_at)
     VALUES (?, 'REVIEW_SUBMITTED', ?, NULL, ?, 'CONTACT', ?, ?, ?)`,
    [reviewId, rating, status === 'pending' ? 'pending' : 'published',
      customer.id, customer.nom, sqlDateTime(submittedAt)]
  );
  if (moderated) {
    await conn.query(
      `INSERT INTO maalem_review_history
         (review_id, event_type, old_status, new_status, reason, reason_code, internal_note,
          actor_type, actor_employee_id, actor_name, created_at)
       VALUES (?, 'REVIEW_MODERATED', 'published', ?, ?, ?, ?, 'EMPLOYEE', ?, ?, ?)`,
      [reviewId, status, moderation.reason, moderation.code,
        'Decision prise apres verification du compte rendu de mission.',
        ctx.employee.id, ctx.employee.nom_complet, sqlDateTime(moderatedAt)]
    );
    if (ctx.hasReviewCases) {
      await conn.query(
        `INSERT INTO maalem_review_cases
           (review_id, case_type, status, opened_by_type, opened_by_contact_id, assigned_to_employee_id,
            reason_code, description, resolution_note, opened_at, resolved_at, created_at, updated_at)
         VALUES (?, 'maalem_report', 'resolved', 'CONTACT', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [reviewId, maalem.contactId, ctx.employee.id, moderation.code,
          "L'artisan conteste cet avis et indique que la prestation decrite ne correspond pas a son intervention.",
          `Avis ${status === 'hidden' ? 'masque' : 'rejete'} apres verification : ${moderation.reason}`,
          sqlDateTime(addHours(submittedAt, 1)), sqlDateTime(moderatedAt),
          sqlDateTime(addHours(submittedAt, 1)), sqlDateTime(moderatedAt)]
      );
    }
  }
  return { reviewId, submittedAt, status };
}

async function createInvitation(conn, ctx, { maalem, customer, requestId, interventionId, closedAt, review }) {
  if (!ctx.hasReviewInvitations) return;
  const scheduledAt = addHours(closedAt, 2);
  const expiresAt = addHours(closedAt, 24 * 30);
  const sentAt = addHours(scheduledAt, between(0, 6));
  const publicKey = crypto.randomBytes(32).toString('base64url').slice(0, 43);

  await conn.query(
    `INSERT INTO maalem_review_invitations
       (public_key, service_request_id, intervention_id, customer_contact_id, maalem_profile_id, review_id,
        status, scheduled_at, next_attempt_at, expires_at, first_sent_at, last_sent_at, next_reminder_at,
        reminder_count, max_reminders, processing_attempts, opened_at, submitted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, 1, ?, ?, ?, ?, ?)`,
    [publicKey, requestId, interventionId, customer.id, maalem.profileId,
      review?.reviewId ?? null,
      review ? 'review_received' : pick(['sent', 'sent', 'expired']),
      sqlDateTime(scheduledAt), sqlDateTime(expiresAt),
      sqlDateTime(sentAt), sqlDateTime(sentAt),
      review ? 0 : between(0, 1), between(1, 3),
      review ? sqlDateTime(addHours(sentAt, between(1, 48))) : (chance(0.4) ? sqlDateTime(addHours(sentAt, 6)) : null),
      review ? sqlDateTime(review.submittedAt) : null,
      sqlDateTime(scheduledAt), sqlDateTime(review?.submittedAt ?? sentAt)]
  );
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed(args) {
  rnd = makeRandom(args.seed);

  const employees = await pickEmployees(pool);
  if (employees.length === 0) throw new Error('Aucun employe en base : le back-office doit exister pour jouer les actions internes.');

  const hasReviewInvitations = await tableExists(pool, 'maalem_review_invitations');
  const hasReviewCases = await tableExists(pool, 'maalem_review_cases');

  const maalemCount = Math.min(args.maalems, MAALEMS.length);
  const customerCount = Math.min(args.customers, CUSTOMERS.length);
  const estimatedMissions = maalemCount * (args.missions + 3);

  console.log('--- Seeder Services / Maalems ---');
  console.log(`Back-office   : #${employees[0].id} ${employees[0].nom_complet} (+${employees.length - 1} autres)`);
  console.log(`Categories    : ${CATEGORIES.length}`);
  console.log(`Services      : ${SERVICES.length} (publies, avec image)`);
  console.log(`Maalems       : ${maalemCount} (profils approuves et publics)`);
  console.log(`Clients       : ${customerCount}`);
  console.log(`Missions      : ~${estimatedMissions} dont ~${maalemCount * args.missions} cloturees`);
  console.log(`Avis          : ~${Math.round(maalemCount * args.missions * 0.78)}`);
  console.log(`Invitations   : ${hasReviewInvitations ? 'oui' : 'table absente, ignoree'}`);
  console.log(`Dossiers avis : ${hasReviewCases ? 'oui' : 'table absente, ignoree'}`);
  console.log(`Graine        : ${args.seed}`);

  if (!args.apply) {
    console.log('\n--- DRY RUN : aucune ecriture. Relancez avec --apply pour appliquer. ---');
    return;
  }

  const manifest = emptyManifest();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const employee = employees[0];
    const ctx = { employee, employees, manifest, hasReviewInvitations, hasReviewCases };

    const categoryIds = await ensureCategories(conn, manifest, employee.id);
    const servicesByKey = await ensureServices(conn, manifest, categoryIds, employee.id);

    const servicesByCategory = new Map();
    for (const [, service] of servicesByKey) {
      for (const catKey of service.cats) {
        if (!servicesByCategory.has(catKey)) servicesByCategory.set(catKey, []);
        servicesByCategory.get(catKey).push(service);
      }
    }

    // Clients particuliers
    const customers = [];
    for (const nom of CUSTOMERS.slice(0, customerCount)) {
      const slug = slugify(nom);
      const place = pick(CITIES);
      const area = pick(place.areas);
      const telephone = `+2126${between(10000000, 99999999)}`;
      const email = seedEmail(slug);
      const id = await ensureContact(conn, manifest, {
        nom, email, telephone, typeCompte: 'Client', avatarUrl: null,
        city: place.city, area, employeeId: employee.id,
      });
      customers.push({ id, nom, email, telephone, city: place.city });
    }

    // Artisans
    const maalems = [];
    for (const definition of MAALEMS.slice(0, maalemCount)) {
      const place = pick(CITIES);
      const categoryId = categoryIds.get(definition.cat);
      const categoryNom = CATEGORIES.find((c) => c.key === definition.cat).nom;
      const telephone = `+2126${between(10000000, 99999999)}`;
      const email = seedEmail(definition.key);
      const professionalData = buildProfessionalData(definition, categoryNom, place);
      professionalData.contact_phone = telephone;

      const contactId = await ensureContact(conn, manifest, {
        nom: definition.nom, email, telephone, typeCompte: 'Artisan/Promoteur',
        avatarUrl: maalemAvatar(definition.key), city: place.city,
        area: professionalData.intervention_areas[0], employeeId: employee.id,
      });
      const profileId = await ensureMaalemProfile(conn, manifest, {
        contactId, categoryId, professionalData, employeeId: employee.id, nom: definition.nom,
      });
      maalems.push({
        ...definition, contactId, profileId, categoryId,
        city: place.city, areas: professionalData.intervention_areas,
      });
    }

    // Missions
    let closedCount = 0;
    let reviewCount = 0;
    let openCount = 0;
    const openStatuses = ['new', 'to_contact', 'processing', 'waiting_customer', 'confirmed', 'cancelled'];

    for (const maalem of maalems) {
      const catalogue = servicesByCategory.get(maalem.cat) ?? [...servicesByKey.values()];
      const templates = MISSIONS[maalem.cat];
      const closedTotal = between(Math.max(1, args.missions - 3), args.missions + 3);

      for (let i = 0; i < closedTotal; i += 1) {
        const mission = templates[i % templates.length];
        // L'agregat public exige sr.requester_contact_id = mr.customer_contact_id :
        // le meme client doit porter la demande et l'avis.
        const customer = pick(customers);
        const result = await createAssignedMission(conn, ctx, {
          maalem,
          service: pick(catalogue),
          customer,
          mission,
          ageDays: between(5, 420),
          source: chance(0.6) ? 'selected_maalem' : 'selected_service',
          finalStatus: 'closed',
        });
        closedCount += 1;

        let review = null;
        if (chance(0.78)) {
          review = await createReview(conn, ctx, {
            maalem, mission, customer,
            requestId: result.requestId, interventionId: result.interventionId, closedAt: result.closedAt,
          });
          reviewCount += 1;
        }
        await createInvitation(conn, ctx, {
          maalem, customer, requestId: result.requestId,
          interventionId: result.interventionId, closedAt: result.closedAt, review,
        });
      }

      // Missions en cours, pour que le dashboard operationnel ne soit pas vide.
      for (const finalStatus of ['scheduled', 'work_in_progress']) {
        if (!chance(0.7)) continue;
        await createAssignedMission(conn, ctx, {
          maalem, service: pick(catalogue), customer: pick(customers),
          mission: pick(templates), ageDays: between(1, 12),
          source: chance(0.5) ? 'selected_maalem' : 'selected_service', finalStatus,
        });
        openCount += 1;
      }

      // Demandes encore au stade back-office.
      for (let i = 0; i < between(1, 3); i += 1) {
        await createOpenRequest(conn, ctx, {
          maalem, service: pick(catalogue), customer: pick(customers),
          status: pick(openStatuses), mission: pick(templates), ageDays: between(1, 45),
        });
        openCount += 1;
      }
    }

    manifest.generated_at = new Date().toISOString();
    await conn.commit();
    writeManifest(manifest);

    console.log('\nOK.');
    console.log(`  categories creees : ${manifest.categories.length}`);
    console.log(`  services crees    : ${manifest.services.length}`);
    console.log(`  contacts crees    : ${manifest.contacts.length}`);
    console.log(`  profils crees     : ${manifest.profiles.length}`);
    console.log(`  missions cloturees: ${closedCount}`);
    console.log(`  demandes ouvertes : ${openCount}`);
    console.log(`  avis crees        : ${reviewCount}`);
    console.log(`\nManifeste : ${MANIFEST_PATH}`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Revert
// ---------------------------------------------------------------------------

async function revert() {
  const manifest = readManifest();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [requestRows] = await conn.query(
      'SELECT id FROM service_requests WHERE problem_description LIKE ?',
      [`%${SEED_TAG}%`]
    );
    const requestIds = requestRows.map((r) => Number(r.id));

    let interventionIds = [];
    if (requestIds.length > 0) {
      const [interventions] = await conn.query(
        'SELECT id FROM service_interventions WHERE service_request_id IN (?)', [requestIds]
      );
      interventionIds = interventions.map((r) => Number(r.id));

      // Les CHECK interdisent de detacher l'affectation tant que le statut l'exige :
      // on redescend d'abord demande et intervention a un etat sans affectation.
      await conn.query(
        `UPDATE service_requests SET status = 'confirmed', current_assignment_id = NULL WHERE id IN (?)`,
        [requestIds]
      );
      if (interventionIds.length > 0) {
        await conn.query(
          `UPDATE service_interventions
           SET status = 'assigned', executing_assignment_id = NULL, closed_at = NULL, closed_by_employee_id = NULL
           WHERE id IN (?)`,
          [interventionIds]
        );
      }

      if (await tableExists(conn, 'maalem_review_invitations')) {
        await conn.query('DELETE FROM maalem_review_invitations WHERE service_request_id IN (?)', [requestIds]);
      }
      const [reviews] = await conn.query(
        'SELECT id FROM maalem_reviews WHERE service_request_id IN (?)', [requestIds]
      );
      const reviewIds = reviews.map((r) => Number(r.id));
      if (reviewIds.length > 0) {
        if (await tableExists(conn, 'maalem_review_cases')) {
          await conn.query('DELETE FROM maalem_review_cases WHERE review_id IN (?)', [reviewIds]);
        }
        await conn.query('DELETE FROM maalem_review_history WHERE review_id IN (?)', [reviewIds]);
        await conn.query('DELETE FROM maalem_reviews WHERE id IN (?)', [reviewIds]);
      }

      if (interventionIds.length > 0) {
        await conn.query('DELETE FROM service_intervention_history WHERE intervention_id IN (?)', [interventionIds]);
        await conn.query('DELETE FROM service_intervention_photos WHERE intervention_id IN (?)', [interventionIds]);
        await conn.query('DELETE FROM service_interventions WHERE id IN (?)', [interventionIds]);
      }
      await conn.query('DELETE FROM service_request_assignments WHERE service_request_id IN (?)', [requestIds]);
      await conn.query('DELETE FROM service_request_history WHERE request_id IN (?)', [requestIds]);
      await conn.query('DELETE FROM service_request_notes WHERE request_id IN (?)', [requestIds]);
      await conn.query('DELETE FROM service_request_contacts WHERE request_id IN (?)', [requestIds]);
      await conn.query('DELETE FROM service_request_attachments WHERE request_id IN (?)', [requestIds]);
      await conn.query('DELETE FROM service_requests WHERE id IN (?)', [requestIds]);
    }

    if (manifest.profiles.length > 0) {
      await conn.query('DELETE FROM maalem_profile_history WHERE profile_id IN (?)', [manifest.profiles]);
      await conn.query('DELETE FROM maalem_profile_documents WHERE profile_id IN (?)', [manifest.profiles]);
      await conn.query('DELETE FROM maalem_profiles WHERE id IN (?)', [manifest.profiles]);
    }
    if (manifest.service_category_links.length > 0) {
      for (const [serviceId, categoryId] of manifest.service_category_links) {
        await conn.query(
          'DELETE FROM service_maalem_categories WHERE service_id = ? AND category_id = ?',
          [serviceId, categoryId]
        );
      }
    }
    if (manifest.services.length > 0) {
      await conn.query('DELETE FROM services WHERE id IN (?)', [manifest.services]);
    }
    if (manifest.categories.length > 0) {
      await conn.query('DELETE FROM maalem_categories WHERE id IN (?)', [manifest.categories]);
    }
    const [contactRows] = await conn.query(
      'SELECT id FROM contacts WHERE email LIKE ?', [`%@${SEED_EMAIL_DOMAIN}`]
    );
    const contactIds = contactRows.map((r) => Number(r.id));
    if (contactIds.length > 0) {
      await conn.query('DELETE FROM contacts WHERE id IN (?)', [contactIds]);
    }

    await conn.commit();
    try { fs.unlinkSync(MANIFEST_PATH); } catch { /* manifeste deja absent */ }

    console.log('Supprime :');
    console.log(`  demandes      : ${requestIds.length}`);
    console.log(`  interventions : ${interventionIds.length}`);
    console.log(`  profils       : ${manifest.profiles.length}`);
    console.log(`  services      : ${manifest.services.length}`);
    console.log(`  categories    : ${manifest.categories.length}`);
    console.log(`  contacts      : ${contactIds.length}`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------

const args = parseArgs(process.argv);
try {
  if (args.revert) await revert();
  else await seed(args);
  process.exit(0);
} catch (error) {
  console.error('Echec :', error.message);
  if (process.env.DEBUG) console.error(error);
  process.exit(1);
}
