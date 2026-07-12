
// routes/import.js
import express from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import pool from "../db/pool.js";
import { requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.use(requireRoles('PDG', 'Manager', 'ManagerPlus'));

// on garde le fichier en mémoire pour préserver l'encodage (arabe)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20 },
  // Taille illimitée pour tous les fichiers
});

/**
 * POST /api/import/contacts-excel
 * Form-Data: file=<.xlsx|.xls|.csv>
 * Colonnes attendues (entêtes, casse exacte) :
 *  nom_complet, type, solde (optionnel)
 */
// ====== CONTACTS: upload Excel/CSV -> contacts (nom_complet, type) ======
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "file is required" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });

    // helpers
    const s = (v) =>
      v === undefined || v === null ? null : String(v).trim() || null;
    const num = (v) =>
      v === undefined || v === null || v === "" || Number.isNaN(Number(v))
        ? null
        : Number(v);

    // Mappe les en-têtes possibles vers nos 2 colonnes
    // (fr/eng/ar tolérés)
    const getNomComplet = (r) =>
      s(
        r.nom_complet ??
        r["nom complet"] ??
        r.name ??
        r.fullname ??
        r["full name"] ??
        r["الاسم الكامل"] ??
        r["اسم كامل"]
      );

    const getType = (r) =>
      s(
        r.type ??
        r.Type ??
        r["نوع"] ??
        r["categorie"] ??
        r["catégorie"]
      );

    const getSolde = (r) =>
      num(
        r.solde ??
          r["Solde"] ??
          r.balance ??
          r["Balance"] ??
          r["solde initial"] ??
          r["Solde initial"] ??
          r["رصيد"]
      );

    const values = raw.map((r) => [getNomComplet(r), getType(r), getSolde(r)]);

    // retire les lignes sans nom
    const cleaned = values.filter((v) => v[0]);
    if (cleaned.length === 0) {
      return res.status(400).json({ message: "No valid rows to import" });
    }

    const conn = await pool.getConnection();
    try {
      await conn.query("SET NAMES utf8mb4;");
      await conn.beginTransaction();

      // INSERT simple
      const sql = `
        INSERT INTO contacts (nom_complet, type, solde)
        VALUES ?
      `;
      await conn.query(sql, [cleaned]);

      /*  👉 Si tu as un index UNIQUE(nom_complet) et tu préfères faire un UPSERT, remplace le bloc précédent par :
      const sql = `
        INSERT INTO contacts (nom_complet, type, solde)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          type = VALUES(type),
          solde = COALESCE(VALUES(solde), solde)
      `;
      await conn.query(sql, [cleaned]);
      */

      await conn.commit();
      res.json({ ok: true, inserted: cleaned.length });
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
