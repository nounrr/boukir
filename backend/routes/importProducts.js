
// routes/import.js
import express from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import pool from "../db/pool.js";

const router = express.Router();

// on garde le fichier en mémoire pour préserver l'encodage (arabe)
const upload = multer({
  storage: multer.memoryStorage(),
  // Taille illimitée pour tous les fichiers
});

/**
 * POST /api/import/products-excel
 * Form-Data: file=<.xlsx|.xls|.csv>
 * Colonnes attendues (entêtes, casse exacte) :
 *  id (optionnel), designation, quantite, prix_achat,
 *  cout_revient_pourcentage, cout_revient,
 *  prix_gros_pourcentage, prix_gros,
 *  prix_vente_pourcentage, prix_vente
 *
 * Règles:
 *  - Si "id" est fourni et correspond à un produit existant, on met à jour ce produit.
 *  - Si "id" est vide/absent, on insère un nouveau produit (id auto-incrémenté).
 */
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "file is required" });

    // Parse Excel/CSV depuis le buffer (UTF-8 respecté)
    const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "No rows found in file" });
    }

    // Helpers
    const normalizeKey = (k) =>
      String(k ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '');

    const pick = (row, keys) => {
      if (!row || typeof row !== 'object') return null;
      const map = new Map();
      for (const [k, v] of Object.entries(row)) map.set(normalizeKey(k), v);
      for (const key of keys) {
        const nk = normalizeKey(key);
        if (map.has(nk)) return map.get(nk);
      }
      return null;
    };

    const num = (v) => {
      if (v === undefined || v === null) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const str = String(v).trim();
      if (!str) return null;
      // Support decimals with comma: "12,50" -> 12.50
      const normalized = str.replace(/\s+/g, '').replace(',', '.');
      const n = Number(normalized);
      return Number.isFinite(n) ? n : null;
    };
    const intOrNull = (v) => {
      const n = num(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };
    const decOrNull = (v) => {
      const n = num(v);
      return Number.isFinite(n) ? n : null;
    };
    const s = (v) =>
      v === undefined || v === null ? null : String(v).trim() || null;

    // Map (support headers in French/Arabic/English)
    const values = rows.map((r) => {
      const id = intOrNull(pick(r, ['id', 'ID']));
      const designation = s(pick(r, ['designation', 'désignation', 'Designation', 'Désignation', 'des']));
      const quantite = intOrNull(pick(r, ['quantite', 'quantité', 'Quantite', 'Quantité', 'qte', 'qty', 'quantity']));
      const prix_achat = decOrNull(pick(r, ['prix_achat', 'prix achat', 'Prix Achat', 'prixachat', 'purchaseprice', 'buyprice']));

      // Minimal import: keep existing values if missing; new inserts default category to 1.
      return [
        id,
        designation,
        quantite,
        prix_achat,
        1, // categorie_id par défaut (insert only)
      ];
    });

    // Filtre les lignes vides
    const cleaned = values.filter((v) => {
      const hasId = v[0] !== null; // id
      const hasAnyField = v.slice(1).some((x) => x !== null);
      const hasInsertKey = v[1] !== null || v[2] !== null || v[3] !== null; // designation or quantite or prix_achat
      return (hasId && hasAnyField) || (!hasId && hasInsertKey);
    });
    if (cleaned.length === 0) {
      return res.status(400).json({ message: "No valid rows to import" });
    }

    const conn = await pool.getConnection();
    try {
      await conn.query("SET NAMES utf8mb4;");
      await conn.beginTransaction();

      // Upsert par clé primaire id: si id fourni => update, sinon => insert
      const idsProvided = cleaned.map((v) => v[0]).filter((id) => id !== null);
      const existingIds = new Set();
      for (let i = 0; i < idsProvided.length; i += 500) {
        const chunk = idsProvided.slice(i, i + 500);
        if (chunk.length === 0) continue;
        const placeholders = chunk.map(() => '?').join(',');
        const [found] = await conn.query(
          `SELECT id FROM products WHERE id IN (${placeholders})`,
          chunk
        );
        for (const row of found) existingIds.add(row.id);
      }

      const inserted = cleaned.filter((v) => v[0] === null || !existingIds.has(v[0])).length;
      const updated = cleaned.filter((v) => v[0] !== null && existingIds.has(v[0])).length;

      const sql = `
        INSERT INTO products
          (id, designation, quantite, prix_achat, categorie_id)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          designation = COALESCE(VALUES(designation), designation),
          quantite = COALESCE(VALUES(quantite), quantite),
          prix_achat = COALESCE(VALUES(prix_achat), prix_achat)
      `;
      await conn.query(sql, [cleaned]);

      await conn.commit();
      res.json({ ok: true, total: cleaned.length, inserted, updated });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: String(err?.message || err) });
  }
});

export default router;
