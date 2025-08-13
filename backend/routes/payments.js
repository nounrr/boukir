import express from 'express';
import pool from '../db/pool.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// date helpers
const isYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
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
const dbDateToYMDOrNull = (d) => {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  if (s === '0000-00-00') return null;
  if (isYMD(s)) return s;
  const parsed = toYMD(d);
  return parsed;
};

// helper mapping
const toPayment = (r) => ({
  id: r.id,
  numero: String(r.numero ?? r.id),
  type_paiement: r.type_paiement,
  contact_id: r.contact_id,
  bon_id: r.bon_id,
  montant_total: Number(r.montant_total ?? 0),
  montant: Number(r.montant_total ?? 0),
  mode_paiement: r.mode_paiement,
  date_paiement: dbDateToYMDOrNull(r.date_paiement),
  designation: r.designation || '',
  notes: r.designation || '',
  date_echeance: dbDateToYMDOrNull(r.date_echeance),
  banque: r.banque || null,
  personnel: r.personnel || null,
  code_reglement: r.code_reglement || null,
  image_url: r.image_url || null,
  created_by: r.created_by ?? null,
  updated_by: r.updated_by ?? null,
  created_at: r.created_at,
  updated_at: r.updated_at,
});

// List payments
router.get('/', verifyToken, async (req, res) => {
  try {
    const { bon_id, contact_id, mode_paiement, type_paiement, date_from, date_to, search } = req.query;
    const where = [];
    const params = [];
    if (bon_id) { where.push('bon_id = ?'); params.push(Number(bon_id)); }
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
			montant_total,
			mode_paiement,
			date_paiement,
      designation = null,
      date_echeance = null,
      banque = null,
      personnel = null,
      code_reglement = null,
      image_url = null,
      created_by = null,
		} = req.body;

    // Nettoyer les valeurs pour éviter les erreurs "Out of range"
    const cleanContactId = contact_id ? Number(contact_id) : null;
    const cleanBonId = bon_id ? Number(bon_id) : null;
    const cleanDatePaiement = toYMD(date_paiement);
    const cleanDateEcheance = toYMD(date_echeance);

    if (!cleanDatePaiement) {
      return res.status(400).json({ message: 'Date de paiement invalide', detail: String(date_paiement) });
    }

		const [result] = await pool.query(
			`INSERT INTO payments
        (numero, type_paiement, contact_id, bon_id, montant_total, mode_paiement, date_paiement, designation,
         date_echeance, banque, personnel, code_reglement, image_url, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['', type_paiement, cleanContactId, cleanBonId, montant_total, mode_paiement, cleanDatePaiement, designation,
        cleanDateEcheance, banque, personnel, code_reglement, image_url, created_by]
		);
    await pool.query('UPDATE payments SET numero = CAST(id AS CHAR) WHERE id = ?', [result.insertId]);
    const [rows] = await pool.query('SELECT * FROM payments WHERE id = ?', [result.insertId]);
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
      data.date_paiement = toYMD(data.date_paiement);
      if (!data.date_paiement) {
        return res.status(400).json({ message: 'Date de paiement invalide', detail: String(req.body?.date_paiement) });
      }
    }
    if (Object.hasOwn(data, 'date_echeance')) {
      const de = toYMD(data.date_echeance);
      data.date_echeance = de; // null allowed
    }
    const fields = [
      'type_paiement','contact_id','bon_id','montant_total','mode_paiement','date_paiement','designation',
      'date_echeance','banque','personnel','code_reglement','image_url','updated_by'
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


// Delete payment (PDG only)
router.delete('/:id', verifyToken, requireRole('PDG'), async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query('SELECT id FROM payments WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ message: 'Paiement introuvable' });
		await pool.query('DELETE FROM payments WHERE id = ?', [id]);
  res.json({ success: true, id: Number(id) });
});

export default router;
