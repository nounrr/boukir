import express from 'express';
import pool from '../db/pool.js';
import { verifyToken, requireRole, requireRoles } from '../middleware/auth.js';

const router = express.Router();

// date helpers
const isYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isYMDTime = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s);

const toYMD = (val) => {
  if (val == null || val === '') return null;
  if (isYMD(val)) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toYMDTime = (val, withCurrentTime = true) => {
  if (val == null || val === '') return null;
  
  // Si c'est déjà au format DATETIME
  if (isYMDTime(val)) return val;
  
  // Si c'est au format datetime-local (YYYY-MM-DDTHH:MM)
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) {
    const [datePart, timePart] = val.split('T');
    return `${datePart} ${timePart}:00`; // Ajouter les secondes
  }
  
  // Si c'est au format DATE (YYYY-MM-DD), ajouter l'heure
  if (isYMD(val)) {
    if (withCurrentTime) {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const sec = String(now.getSeconds()).padStart(2, '0');
      return `${val} ${h}:${min}:${sec}`;
    } else {
      return `${val} 00:00:00`;
    }
  }
  
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  
  return `${y}-${m}-${day} ${h}:${min}:${sec}`;
};

const dbDateToYMDOrNull = (d) => {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  if (s === '0000-00-00') return null;
  if (isYMD(s)) return s;
  const parsed = toYMD(d);
  return parsed;
};

const dbDateTimeToYMDOrNull = (d) => {
  if (!d) return null;
  // Pour les DATETIME, on retourne juste la partie date pour le frontend
  const s = String(d).slice(0, 10);
  if (s === '0000-00-00') return null;
  if (isYMD(s)) return s;
  const parsed = toYMD(d);
  return parsed;
};

// Nouvelle fonction pour retourner le DATETIME complet
const dbDateTimeToFullOrNull = (d) => {
  if (!d) return null;
  const s = String(d);
  
  // Vérifier si c'est un DATETIME valide (YYYY-MM-DD HH:MM:SS)
  if (s.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
    return s;
  }
  
  // Si c'est une DATE simple (YYYY-MM-DD), ajouter l'heure par défaut (08:00:00)
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return `${s} 08:00:00`;
  }
  
  // Si c'est '0000-00-00 00:00:00' ou format invalide
  if (s.startsWith('0000-00-00')) return null;
  
  return s;
};

// helper mapping
const toPayment = (r) => ({
  id: r.id,
  numero: String(r.numero ?? r.id),
  type_paiement: r.type_paiement,
  contact_id: r.contact_id,
  bon_id: r.bon_id,
  bon_type: r.bon_type ?? null,
  montant_total: Number(r.montant_total ?? 0),
  montant: Number(r.montant_total ?? 0),
  mode_paiement: r.mode_paiement,
  date_paiement: dbDateTimeToFullOrNull(r.date_paiement), // DATETIME complet pour affichage
  designation: r.designation || '',
  notes: r.designation || '',
  date_echeance: dbDateToYMDOrNull(r.date_echeance), // DATE -> DATE
  banque: r.banque || null,
  personnel: r.personnel || null,
  code_reglement: r.code_reglement || null,
  image_url: r.image_url || null,
  talon_id: r.talon_id || null,
  statut: r.statut || null,
  created_by: r.created_by ?? null,
  updated_by: r.updated_by ?? null,
  created_at: r.created_at,
  updated_at: r.updated_at,
  date_ajout_reelle: r.date_ajout_reelle || null,
});

// normalize statut to canonical French labels
function mapToCanonical(s) {
  if (s == null || s === '') return 'En attente';
  const low = String(s).toLowerCase();
  switch (low) {
    case 'attente':
    case 'en attente':
    case 'en_attente':
      return 'En attente';
    case 'valide':
    case 'validé':
    case 'valid':
      return 'Validé';
    case 'refuse':
    case 'refusé':
    case 'refusee':
      return 'Refusé';
    case 'annule':
    case 'annulé':
    case 'annulee':
      return 'Annulé';
    default:
      return String(s);
  }
}

// List payments
router.get('/', verifyToken, async (req, res) => {
  try {
    const { bon_id, bon_type, contact_id, mode_paiement, type_paiement, date_from, date_to, search } = req.query;
    const where = [];
    const params = [];
    if (bon_id) { where.push('bon_id = ?'); params.push(Number(bon_id)); }
    if (bon_type) { where.push('bon_type = ?'); params.push(String(bon_type)); }
    if (contact_id) { where.push('contact_id = ?'); params.push(Number(contact_id)); }
    if (mode_paiement) { where.push('mode_paiement = ?'); params.push(String(mode_paiement)); }
    if (type_paiement) { where.push('type_paiement = ?'); params.push(String(type_paiement)); }
    if (date_from) { where.push('date_paiement >= ?'); params.push(String(date_from)); }
    if (date_to) { where.push('date_paiement <= ?'); params.push(String(date_to)); }
    if (search) {
      where.push('(numero LIKE ? OR designation LIKE ? OR reference LIKE ? OR reference_virement LIKE ?)');
      const s = `%${String(search)}%`;
      params.push(s, s, s, s);
    }
    const sql = `SELECT * FROM payments ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC`;
  const [rows] = await pool.query(sql, params);
  res.json(rows.map(toPayment));
  } catch (err) {
    console.error('GET /payments error:', err);
    res.status(500).json({ message: 'Internal error', detail: String(err?.sqlMessage || err?.message || err) });
  }
});

// GET /api/payments/personnel - distinct names used on cheques/traites
router.get('/personnel', verifyToken, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT personnel FROM payments WHERE personnel IS NOT NULL AND personnel <> '' ORDER BY personnel ASC"
    );
    const list = rows.map((r) => r.personnel).filter(Boolean);
    res.json(list);
  } catch (err) {
    console.error('GET /payments/personnel error:', err);
    res.status(500).json({ message: 'Internal error', detail: String(err?.sqlMessage || err?.message || err) });
  }
});
router.get('/:id', verifyToken, async (req, res) => {
	try {
    const { id } = req.params;
		const [rows] = await pool.query('SELECT * FROM payments WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Paiement introuvable' });
  res.json(toPayment(rows[0]));
  } catch (err) {
    console.error('GET /payments/:id error:', err);
    res.status(500).json({ message: 'Internal error', detail: String(err?.sqlMessage || err?.message || err) });
  }
});

router.post('/', verifyToken, async (req, res) => {
	try {
    const {
      type_paiement = 'Client',
			contact_id,
      bon_id = null,
			bon_type = null,
			montant_total,
			mode_paiement,
			date_paiement,
      designation = null,
      date_echeance = null,
      banque = null,
      personnel = null,
      code_reglement = null,
      image_url = null,
      talon_id = null,
      created_by = null,
  } = req.body;

    // Récupérer la vraie date d'ajout (maintenant)
    const dateAjoutReelle = new Date();
    const dateAjoutReelleStr = dateAjoutReelle.toISOString().slice(0, 19).replace('T', ' ');

    // normalize statut to canonical French labels and default to 'En attente'
    const rawStatut = req.body && Object.hasOwn(req.body, 'statut') ? req.body.statut : undefined;
    const mapToCanonical = (s) => {
      if (!s && s !== '') return 'En attente';
      const low = String(s).toLowerCase();
      switch (low) {
        case 'attente':
        case 'en attente':
        case 'en_attente':
          return 'En attente';
        case 'valide':
        case 'validé':
        case 'valid':
          return 'Validé';
        case 'refuse':
        case 'refusé':
        case 'refusee':
          return 'Refusé';
        case 'annule':
        case 'annulé':
        case 'annulee':
          return 'Annulé';
        default:
          return String(s);
      }
    };
    const statut = mapToCanonical(rawStatut);

    // Nettoyer les valeurs pour éviter les erreurs "Out of range"
    const cleanContactId = contact_id ? Number(contact_id) : null;
    const cleanBonId = bon_id ? Number(bon_id) : null;
    const cleanBonType = bon_type != null && String(bon_type).trim() !== '' ? String(bon_type).trim() : null;
    const cleanTalonId = talon_id ? Number(talon_id) : null;
    const cleanDatePaiement = toYMDTime(date_paiement, true); // DATETIME avec heure actuelle
    const cleanDateEcheance = toYMD(date_echeance); // DATE simple

    if (!cleanDatePaiement) {
      return res.status(400).json({ message: 'Date de paiement invalide', detail: String(date_paiement) });
    }

    // Validate statut according to user role
    const allowedAll = ['En attente','Validé','Refusé','Annulé'];
    const allowedEmployee = ['En attente','Annulé'];
    const userRole = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : '';
    const allowed = (userRole === 'employe' || userRole === 'user') ? allowedEmployee : allowedAll;
    if (!allowed.includes(statut)) {
      return res.status(403).json({ message: 'Statut non autorisé pour votre rôle' });
    }

    // Si un bon est associé, récupérer sa date pour l'ordre chronologique
    let createdAtValue = dateAjoutReelleStr; // Par défaut, la date actuelle
    if (cleanBonId) {
      try {
        console.log('🔍 Recherche bon ID:', cleanBonId, '| BonType:', cleanBonType, '| TypePaiement:', type_paiement, '| Contact:', cleanContactId);
        
        // Déterminer les tables à rechercher en fonction du type de paiement
        let bonTables = [];
        const bonTypeToTable = {
          Sortie: { table: 'bons_sortie', dateField: 'date_creation' },
          Comptant: { table: 'bons_comptant', dateField: 'date_creation' },
          Avoir: { table: 'avoirs_client', dateField: 'date_creation' },
          Commande: { table: 'bons_commande', dateField: 'date_creation' },
          AvoirFournisseur: { table: 'avoirs_fournisseur', dateField: 'date_creation' },
        };

        if (cleanBonType && bonTypeToTable[cleanBonType]) {
          // Si le type du bon est fourni, ne chercher que dans la table correspondante
          bonTables = [bonTypeToTable[cleanBonType]];
        } else if (type_paiement === 'Client') {
          // Pour les clients: chercher d'abord dans bons sortie/comptant, puis avoirs client
          bonTables = [
            { table: 'bons_sortie', dateField: 'date_creation' },
            { table: 'bons_comptant', dateField: 'date_creation' },
            { table: 'avoirs_client', dateField: 'date_creation' }
          ];
        } else if (type_paiement === 'Fournisseur') {
          // Pour les fournisseurs: chercher dans bons commande puis avoirs fournisseur
          bonTables = [
            { table: 'bons_commande', dateField: 'date_creation' },
            { table: 'avoirs_fournisseur', dateField: 'date_creation' }
          ];
        }
        
        let bonDate = null;
        
        for (const { table, dateField } of bonTables) {
          try {
            const [bonRows] = await pool.query(`SELECT ${dateField} as date_doc, created_at FROM ${table} WHERE id = ?`, [cleanBonId]);
            if (bonRows.length > 0) {
              // Prendre la date la plus récente entre date_creation et created_at
              const dateDoc = new Date(bonRows[0].date_doc);
              const dateCreated = new Date(bonRows[0].created_at);
              bonDate = dateDoc > dateCreated ? dateDoc : dateCreated;
              console.log(`✅ Bon trouvé dans ${table} - Date doc: ${bonRows[0].date_doc} | Created: ${bonRows[0].created_at}`);
              console.log(`   Date retenue (la plus récente): ${bonDate.toISOString()}`);
              break;
            }
          } catch (e) {
            console.log(`⚠️ Erreur recherche dans ${table}:`, e.message);
            // Continue avec la table suivante
          }
        }
        
        if (bonDate) {
          // Ajouter 1 heure à la date du bon pour garantir que le paiement apparaît toujours après
          const paymentDate = new Date(bonDate.getTime() + (60 * 60 * 1000)); // +1 heure en millisecondes
          createdAtValue = paymentDate.toISOString().slice(0, 19).replace('T', ' ');
          console.log('📅 Date bon:', bonDate.toISOString());
          console.log('📅 Date paiement (+1h):', paymentDate.toISOString());
          console.log('📅 created_at MySQL:', createdAtValue);
        }
      } catch (err) {
        console.log('Erreur lors de la récupération de la date du bon:', err);
        // Continuer avec la date actuelle en cas d'erreur
      }
    }

    console.log('💾 Insertion paiement - created_at:', createdAtValue, '| date_ajout_reelle:', dateAjoutReelleStr);
    console.log('💾 Bon associé ID:', cleanBonId);

    const [result] = await pool.query(
      `INSERT INTO payments
        (numero, type_paiement, contact_id, bon_id, bon_type, montant_total, mode_paiement, date_paiement, designation,
         date_echeance, banque, personnel, code_reglement, image_url, talon_id, statut, created_by, created_at, date_ajout_reelle)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['', type_paiement, cleanContactId, cleanBonId, cleanBonType, montant_total, mode_paiement, cleanDatePaiement, designation,
        cleanDateEcheance, banque, personnel, code_reglement, image_url, cleanTalonId, statut, created_by, createdAtValue, dateAjoutReelleStr]
    );
    await pool.query('UPDATE payments SET numero = CAST(id AS CHAR) WHERE id = ?', [result.insertId]);
    const [rows] = await pool.query('SELECT * FROM payments WHERE id = ?', [result.insertId]);
    
    // DEBUG: Afficher ce qui a été vraiment enregistré
    console.log('✅ Paiement créé ID:', result.insertId);
    console.log('📊 created_at enregistré:', rows[0].created_at);
    console.log('📊 date_ajout_reelle enregistré:', rows[0].date_ajout_reelle);
    
  res.status(201).json(toPayment(rows[0]));
  } catch (err) {
    console.error('POST /payments error:', err);
    res.status(500).json({ message: 'Internal error', detail: String(err?.sqlMessage || err?.message || err) });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
	try {
    const { id } = req.params;
    const data = req.body || {};
    // Normalize possible date fields upfront
    if (Object.hasOwn(data, 'date_paiement')) {
      data.date_paiement = toYMDTime(data.date_paiement, true); // DATETIME avec heure actuelle
      if (!data.date_paiement) {
        return res.status(400).json({ message: 'Date de paiement invalide', detail: String(req.body?.date_paiement) });
      }
    }
    if (Object.hasOwn(data, 'date_echeance')) {
      const de = toYMD(data.date_echeance); // DATE simple
      data.date_echeance = de; // null allowed
    }
    // Validate statut if provided according to user role and normalize to canonical label
    const allowedAllPut = ['En attente','Validé','Refusé','Annulé'];
    const allowedEmployeePut = ['En attente','Annulé'];
    const userRole = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : '';
    if (Object.hasOwn(data, 'statut')) {
      const canonical = mapToCanonical(data.statut);
      const allowedPut = (userRole === 'employe' || userRole === 'user') ? allowedEmployeePut : allowedAllPut;
      if (!allowedPut.includes(canonical)) {
        return res.status(403).json({ message: 'Statut non autorisé pour votre rôle' });
      }
      data.statut = canonical;
    }

    const fields = [
  'type_paiement','contact_id','bon_id','bon_type','montant_total','mode_paiement','date_paiement','designation',
  'date_echeance','banque','personnel','code_reglement','image_url','talon_id','statut','updated_by'
    ];
    const setParts = [];
		const values = [];
    for (const f of fields) {
      if (Object.hasOwn(data, f)) {
        setParts.push(`${f} = ?`);
        values.push(data[f]);
      }
    }
    if (!setParts.length) return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
		values.push(id);
    await pool.query(`UPDATE payments SET ${setParts.join(', ')} WHERE id = ?`, values);
		const [rows] = await pool.query('SELECT * FROM payments WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Paiement introuvable' });
  res.json(toPayment(rows[0]));
  } catch (err) {
    console.error('PUT /payments/:id error:', err);
    res.status(500).json({ message: 'Internal error', detail: String(err?.sqlMessage || err?.message || err) });
  }
});

// PATCH /payments/:id/statut - change only the statut (role-validated)
router.patch('/:id/statut', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;
    if (!Object.hasOwn(req.body, 'statut')) return res.status(400).json({ message: 'Statut requis' });
    const canonical = mapToCanonical(statut);

    const allowedAll = ['En attente','Validé','Refusé','Annulé'];
    const allowedEmployee = ['En attente','Annulé'];
    const userRole = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : '';
    const allowed = (userRole === 'employe' || userRole === 'user') ? allowedEmployee : allowedAll;
    if (!allowed.includes(canonical)) {
      return res.status(403).json({ message: 'Statut non autorisé pour votre rôle' });
    }

    const [result] = await pool.query('UPDATE payments SET statut = ?, updated_at = NOW() WHERE id = ?', [canonical, id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Paiement introuvable' });
    const [rows] = await pool.query('SELECT * FROM payments WHERE id = ?', [id]);
    res.json({ success: true, message: `Statut mis à jour: ${canonical}`, data: toPayment(rows[0]) });
  } catch (err) {
    console.error('PATCH /payments/:id/statut error:', err);
    res.status(500).json({ message: 'Internal error', detail: String(err?.sqlMessage || err?.message || err) });
  }
});


// Delete payment (PDG only)
router.delete('/:id', verifyToken, requireRole('PDG'), async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query('SELECT id FROM payments WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ message: 'Paiement introuvable' });
		await pool.query('DELETE FROM payments WHERE id = ?', [id]);
  res.json({ success: true, id: Number(id) });
});

export default router;
