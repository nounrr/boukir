
// routes/import.js
import express from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import pool from "../db/pool.js";

const router = express.Router();

// on garde le fichier en mémoire pour préserver l'encodage (arabe)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

/**
 * POST /api/import/products-excel
 * Form-Data: file=<.xlsx|.xls|.csv>
 * Colonnes attendues (entêtes, casse exacte) :
 *  designation, quantite, prix_achat,
 *  cout_revient_pourcentage, cout_revient,
 *  prix_gros_pourcentage, prix_gros,
 *  prix_vente_pourcentage, prix_vente
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

    const values = raw.map((r) => [getNomComplet(r), getType(r)]);

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
        INSERT INTO contacts (nom_complet, type)
        VALUES ?
      `;
      await conn.query(sql, [cleaned]);

      /*  👉 Si tu as un index UNIQUE(nom_complet) et tu préfères faire un UPSERT, remplace le bloc précédent par :
      const sql = `
        INSERT INTO contacts (nom_complet, type)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          type = VALUES(type)
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
