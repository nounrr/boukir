/**
 * Seeder de démonstration pour la vitrine publique d'un Maalem.
 *
 * Crée une histoire cohérente et vérifiable : des demandes de service réelles,
 * confirmées, affectées au Maalem, exécutées puis clôturées. Seules les
 * interventions clôturées alimentent les statistiques publiques (KAN-22),
 * c'est donc toute la chaîne qui doit être écrite, pas seulement des compteurs.
 *
 * Enrichit aussi le profil professionnel (résumé, compétences, zones) pour que
 * la page de détail ne tombe pas sur ses textes de repli.
 *
 * Usage :
 *   node backend/scripts/seed-maalem-showcase.js                  # dry-run, n'écrit rien
 *   node backend/scripts/seed-maalem-showcase.js --apply          # écrit en base
 *   node backend/scripts/seed-maalem-showcase.js --apply --profile-id 2
 *   node backend/scripts/seed-maalem-showcase.js --apply --count 8
 *   node backend/scripts/seed-maalem-showcase.js --revert         # supprime ce qui a été semé
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { default: pool } = await import('../db/pool.js');
const { formatServiceRequestNumber } = await import('../utils/serviceRequest.js');

// Marqueur permettant un --revert sûr : on ne supprime que ce que ce script a créé.
const SEED_TAG = 'SEED_MAALEM_SHOWCASE';

function parseArgs(argv) {
  const args = { apply: false, revert: false, profileId: null, count: 6 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--revert') args.revert = true;
    else if (a === '--profile-id') args.profileId = Number(argv[++i]);
    else if (a === '--count') args.count = Number(argv[++i]);
  }
  if (!Number.isSafeInteger(args.count) || args.count < 1 || args.count > 30) args.count = 6;
  return args;
}

/** Missions plausibles pour un artisan du batiment. */
const MISSIONS = [
  {
    title: 'Fuite sous evier de cuisine',
    problem: "Fuite continue au niveau du siphon sous l'evier, degat des eaux commencant sous le meuble.",
    summary: "Remplacement du siphon et des joints d'etancheite, reprise du raccordement au mur. Test d'ecoulement sur 20 minutes sans reprise de fuite.",
    city: 'Tanger', area: 'Malabata', days: 96,
  },
  {
    title: 'Remplacement chauffe-eau 80L',
    problem: 'Chauffe-eau hors service, plus aucune eau chaude dans le logement depuis trois jours.',
    summary: "Depose de l'ancien ballon, pose d'un chauffe-eau 80L avec groupe de securite neuf. Mise en eau et controle de la temperature de sortie.",
    city: 'Tanger', area: 'Iberia', days: 84,
  },
  {
    title: 'Debouchage colonne salle de bain',
    problem: "Evacuation de la douche bouchee, remontee d'eau dans le bac a chaque utilisation.",
    summary: 'Debouchage mecanique de la colonne, retrait des depots calcaires et controle camera de la conduite sur trois metres.',
    city: 'Tanger', area: 'Branes', days: 71,
  },
  {
    title: 'Installation robinetterie salle de bain',
    problem: 'Robinets du lavabo et de la baignoire a remplacer, entartres et fuyants.',
    summary: "Pose de deux mitigeurs neufs, remplacement des flexibles et des joints. Verification de la pression sur les deux points d'eau.",
    city: 'Tetouan', area: 'Centre', days: 58,
  },
  {
    title: 'Reprise reseau eau apres degat',
    problem: 'Canalisation percee derriere un mur de la cuisine apres travaux de percage.',
    summary: 'Localisation de la fuite, remplacement de la section percee en PER, rebouchage propre de la saignee et test de mise en pression.',
    city: 'Tanger', area: 'Centre-ville', days: 44,
  },
  {
    title: 'Entretien annuel plomberie',
    problem: 'Controle general demande avant la saison des pluies pour un logement locatif.',
    summary: "Controle des points d'eau, detartrage des mousseurs, verification des evacuations et du groupe de securite du chauffe-eau.",
    city: 'Tanger', area: 'Malabata', days: 31,
  },
  {
    title: 'Pose de machine a laver',
    problem: "Besoin d'un raccordement propre en eau et evacuation pour une machine neuve.",
    summary: "Creation du piquage d'arrivee avec robinet dedie, raccordement de l'evacuation et calage de la machine. Cycle de test complet.",
    city: 'Tanger', area: 'Iberia', days: 19,
  },
  {
    title: 'Urgence fuite compteur',
    problem: "Fuite au niveau du compteur d'eau, ecoulement permanent dans le local technique.",
    summary: "Remplacement du raccord defectueux en amont du compteur et pose d'un robinet d'arret neuf accessible.",
    city: 'Tanger', area: 'Branes', days: 8,
  },
];

/** Profil professionnel enrichi : ce que la page publique affiche reellement. */
const PROFESSIONAL_ENRICHMENT = {
  professional_summary: [
    'Plombier installateur depuis plus de dix ans a Tanger, forme sur chantier puis en centre de qualification professionnelle.',
    "J'interviens sur les reseaux d'eau sanitaire, les evacuations et les appareils de production d'eau chaude, aussi bien en renovation d'appartement qu'en depannage d'urgence.",
    'Je travaille proprement : protection des sols, reprise des saignees et nettoyage du poste avant de partir. Chaque intervention se termine par un test devant le client.',
  ].join('\n\n'),
  skills: ['Plomberie sanitaire', 'Detection de fuite', 'Chauffe-eau', 'Debouchage canalisation', 'Robinetterie', 'Reseau PER et cuivre'],
  intervention_areas: ['Tanger Centre', 'Malabata', 'Iberia', 'Branes', 'Tetouan'],
};

async function pickProfile(explicitId) {
  const [rows] = await pool.query(
    `SELECT mp.id, mp.contact_id, mp.category_id, mp.status, mp.is_public, mp.professional_data, c.nom_complet
     FROM maalem_profiles mp
     INNER JOIN contacts c ON c.id = mp.contact_id
     WHERE mp.deleted_at IS NULL AND mp.status = 'approved' AND mp.category_id IS NOT NULL
       ${explicitId ? 'AND mp.id = ?' : ''}
     ORDER BY mp.is_public DESC, mp.id ASC LIMIT 1`,
    explicitId ? [explicitId] : []
  );
  return rows[0] || null;
}

async function pickService(categoryId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.nom FROM services s
     INNER JOIN service_maalem_categories smc ON smc.service_id = s.id
     WHERE smc.category_id = ? AND s.is_active = 1 AND s.deleted_at IS NULL
     ORDER BY s.is_published DESC, s.id ASC LIMIT 1`,
    [categoryId]
  );
  return rows[0] || null;
}

async function pickEmployee() {
  const [rows] = await pool.query(
    `SELECT id, nom_complet FROM employees WHERE nom_complet IS NOT NULL ORDER BY (role = 'PDG') DESC, id ASC LIMIT 1`
  );
  return rows[0] || null;
}

/** Un client distinct du Maalem : une demande a soi-meme n'aurait aucun sens. */
async function pickRequester(excludeContactId) {
  const [rows] = await pool.query(
    `SELECT id, nom_complet, telephone FROM contacts
     WHERE deleted_at IS NULL AND is_active = 1 AND COALESCE(is_blocked,0) = 0 AND id <> ?
     ORDER BY id ASC LIMIT 1`,
    [excludeContactId]
  );
  return rows[0] || null;
}

async function nextRequestNumber(conn) {
  await conn.query(
    `UPDATE service_request_sequences SET current_value = current_value + 1 WHERE sequence_name = 'service_request'`
  );
  const [[row]] = await conn.query(
    `SELECT current_value FROM service_request_sequences WHERE sequence_name = 'service_request'`
  );
  return formatServiceRequestNumber(row.current_value);
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const sql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

async function revert() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Ordre inverse des dependances (toutes les FK sont en RESTRICT).
    const [requests] = await conn.query(
      `SELECT id FROM service_requests WHERE problem_description LIKE ?`,
      [`%${SEED_TAG}%`]
    );
    if (requests.length === 0) {
      console.log('Rien a supprimer : aucune donnee de ce seeder trouvee.');
      await conn.rollback();
      return;
    }
    const ids = requests.map((r) => r.id);
    const [interventions] = await conn.query(
      `SELECT id FROM service_interventions WHERE service_request_id IN (?)`, [ids]
    );
    const interventionIds = interventions.map((r) => r.id);

    // chk_service_requests_current_assignment interdit de detacher l'affectation tant que
    // le statut la requiert : on repasse d'abord la demande a 'confirmed'.
    await conn.query(
      `UPDATE service_requests SET status = 'confirmed', current_assignment_id = NULL WHERE id IN (?)`, [ids]
    );
    if (interventionIds.length) {
      // Meme logique cote intervention : chk_service_interventions_closure exige
      // executing_assignment_id tant que le statut est 'closed'.
      await conn.query(
        `UPDATE service_interventions
         SET status = 'assigned', executing_assignment_id = NULL, closed_at = NULL, closed_by_employee_id = NULL
         WHERE id IN (?)`,
        [interventionIds]
      );
      await conn.query(`DELETE FROM service_intervention_history WHERE intervention_id IN (?)`, [interventionIds]);
      await conn.query(`DELETE FROM service_intervention_photos WHERE intervention_id IN (?)`, [interventionIds]);
      await conn.query(`DELETE FROM service_interventions WHERE id IN (?)`, [interventionIds]);
    }
    await conn.query(`DELETE FROM service_request_assignments WHERE service_request_id IN (?)`, [ids]);
    await conn.query(`DELETE FROM service_request_history WHERE request_id IN (?)`, [ids]);
    await conn.query(`DELETE FROM service_request_notes WHERE request_id IN (?)`, [ids]);
    await conn.query(`DELETE FROM service_request_contacts WHERE request_id IN (?)`, [ids]);
    await conn.query(`DELETE FROM service_requests WHERE id IN (?)`, [ids]);
    await conn.commit();
    console.log(`Supprime : ${ids.length} demandes et ${interventionIds.length} interventions.`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function seed({ apply, profileId, count }) {
  const profile = await pickProfile(profileId);
  if (!profile) throw new Error("Aucun profil Maalem approuve avec categorie. Approuvez un profil d'abord.");

  const [service, employee, requester] = await Promise.all([
    pickService(profile.category_id),
    pickEmployee(),
    pickRequester(profile.contact_id),
  ]);
  if (!service) throw new Error(`Aucun service rattache a la categorie ${profile.category_id}.`);
  if (!employee) throw new Error('Aucun employe disponible pour jouer le role du back-office.');
  if (!requester) throw new Error('Aucun contact client disponible comme demandeur.');

  const missions = MISSIONS.slice(0, count);
  console.log(`Maalem      : #${profile.id} ${profile.nom_complet} (categorie ${profile.category_id})`);
  console.log(`Service     : #${service.id} ${service.nom}`);
  console.log(`Back-office : #${employee.id} ${employee.nom_complet}`);
  console.log(`Client      : #${requester.id} ${requester.nom_complet}`);
  console.log(`Missions    : ${missions.length} (toutes cloturees -> statistiques verifiees)`);

  if (!apply) {
    console.log('\n--- DRY RUN : aucune ecriture. Relancez avec --apply pour appliquer. ---');
    missions.forEach((m, i) => console.log(`  ${i + 1}. ${m.title} - ${m.city} (${m.days} j)`));
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Profil professionnel enrichi : la page publique lit ces champs.
    const current = typeof profile.professional_data === 'string'
      ? JSON.parse(profile.professional_data || '{}')
      : (profile.professional_data || {});
    const merged = {
      ...current,
      ...PROFESSIONAL_ENRICHMENT,
      experience_years: current.experience_years ?? 12,
      city: current.city || 'Tanger',
    };
    await conn.query(
      `UPDATE maalem_profiles SET professional_data = ?, is_public = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [JSON.stringify(merged), profile.id]
    );

    let created = 0;
    for (const mission of missions) {
      const createdAt = daysAgo(mission.days);
      const confirmedAt = daysAgo(mission.days - 1);
      const closedAt = daysAgo(Math.max(1, mission.days - 3));
      const number = await nextRequestNumber(conn);

      // 2. Demande confirmee (chk_service_requests_resolution impose confirmed_by + confirmed_at).
      //    On insere en 'confirmed' et non en 'closed' : chk_service_requests_current_assignment
      //    exige une affectation des le statut 'assigned', or elle n'existe pas encore ici.
      //    Le passage a 'closed' se fait apres creation de l'affectation (etape 3 bis).
      const [req] = await conn.query(
        `INSERT INTO service_requests
          (request_number, requester_contact_id, request_source, service_id, requested_maalem_profile_id,
           qualified_category_id, qualified_service_id, title, problem_description, requester_name, requester_phone,
           city, intervention_address, desired_date, status, priority, handled_by_employee_id,
           confirmed_by_employee_id, confirmed_at, request_channel, created_at, updated_at)
         VALUES (?, ?, 'selected_maalem', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'normal', ?, ?, ?, 'ECOMMERCE', ?, ?)`,
        [number, requester.id, service.id, profile.id, profile.category_id, service.id, mission.title,
          `${mission.problem} [${SEED_TAG}]`, requester.nom_complet, requester.telephone || '0600000000',
          mission.city, `${mission.area}, ${mission.city}`, sql(createdAt).slice(0, 10),
          employee.id, employee.id, sql(confirmedAt), sql(createdAt), sql(closedAt)]
      );
      const requestId = req.insertId;

      // 3. Affectation au Maalem.
      const [assignment] = await conn.query(
        `INSERT INTO service_request_assignments
          (service_request_id, maalem_profile_id, assigned_by_employee_id, assigned_at, assignment_reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [requestId, profile.id, employee.id, sql(confirmedAt),
          'Maalem demande par le client et compatible avec la categorie qualifiee.', sql(confirmedAt), sql(confirmedAt)]
      );
      const assignmentId = assignment.insertId;
      // 3 bis. L'affectation existe : la demande peut passer a 'closed' sans violer
      //        chk_service_requests_current_assignment.
      await conn.query(
        `UPDATE service_requests SET current_assignment_id = ?, status = 'closed' WHERE id = ?`,
        [assignmentId, requestId]
      );

      // 4. Intervention cloturee : seule source des statistiques verifiees (KAN-22).
      await conn.query(
        `INSERT INTO service_interventions
          (service_request_id, executing_assignment_id, status, planned_date, planned_time_slot, mission_address,
           mission_city, planned_service_id, planned_category_id, mission_contact_name, mission_contact_phone,
           progress_percent, work_summary, work_finished, additional_intervention_required,
           scheduled_by_employee_id, scheduled_at, completed_at, completed_by_contact_id,
           closed_at, closed_by_employee_id, created_at, updated_at)
         VALUES (?, ?, 'closed', ?, 'Matin (9h-12h)', ?, ?, ?, ?, ?, ?, 100, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [requestId, assignmentId, sql(closedAt).slice(0, 10), `${mission.area}, ${mission.city}`, mission.city,
          service.id, profile.category_id, requester.nom_complet, requester.telephone || '0600000000',
          mission.summary, employee.id, sql(confirmedAt), sql(closedAt), profile.contact_id,
          sql(closedAt), employee.id, sql(createdAt), sql(closedAt)]
      );
      created += 1;
    }

    await conn.commit();
    console.log(`\nOK : ${created} missions cloturees creees, profil enrichi et publie.`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

const args = parseArgs(process.argv);
try {
  if (args.revert) await revert();
  else await seed(args);
  process.exit(0);
} catch (error) {
  console.error('Echec :', error.message);
  process.exit(1);
}
