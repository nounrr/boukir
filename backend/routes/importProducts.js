
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
    const num = (v) =>
      v === undefined || v === null || v === "" || Number.isNaN(Number(v))
        ? null
        : Number(v);
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

  // Map + calculs si manquants (basés sur prix_achat + pourcentage)
    const values = rows.map((r) => {
      const id = intOrNull(r.id ?? r["ID"]);
      const designation = s(r.designation ?? r["Designation"] ?? r["désignation"]);
      const quantite = intOrNull(r.quantite);
      const prix_achat = decOrNull(r.prix_achat);

      const crp = decOrNull(r.cout_revient_pourcentage);
      const pgp = decOrNull(r.prix_gros_pourcentage);
      const pvp = decOrNull(r.prix_vente_pourcentage);

      const cout_revient =
        decOrNull(r.cout_revient) ??
        (prix_achat != null && crp != null ? +(prix_achat * (1 + crp / 100)).toFixed(2) : null);

      const prix_gros =
        decOrNull(r.prix_gros) ??
        (prix_achat != null && pgp != null ? +(prix_achat * (1 + pgp / 100)).toFixed(2) : null);

      const prix_vente =
        decOrNull(r.prix_vente) ??
        (prix_achat != null && pvp != null ? +(prix_achat * (1 + pvp / 100)).toFixed(2) : null);

      // optional kg column (accept different header names)
      const kg = decOrNull(r.kg ?? r["KG"] ?? r["Poids"] ?? r["poids"] ?? r["Poids (kg)"]);

      // Order of columns must match the INSERT column list below
      return [
        id, // may be null => insert new id (AUTO_INCREMENT)
        designation,
        quantite,
        prix_achat,
        crp,
        cout_revient,
        kg,
        pgp,
        prix_gros,
        pvp,
  prix_vente,
  1, // categorie_id par défaut
      ];
    });

    // Filtre les lignes vides (aucune désignation et aucun prix)
    const cleaned = values.filter((v) => {
      const hasId = v[0] !== null; // id
      const hasAnyField = v.slice(1).some((x) => x !== null);
      const hasInsertKey = v[1] !== null || v[3] !== null || v[10] !== null; // designation or prix_achat or prix_vente
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
  const sql = `
        INSERT INTO products
        (id, designation, quantite, prix_achat,
         cout_revient_pourcentage, cout_revient,
             kg,
         prix_gros_pourcentage, prix_gros,
     prix_vente_pourcentage, prix_vente,
     categorie_id)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          designation = COALESCE(VALUES(designation), designation),
          quantite = COALESCE(VALUES(quantite), quantite),
          prix_achat = COALESCE(VALUES(prix_achat), prix_achat),
          cout_revient_pourcentage = COALESCE(VALUES(cout_revient_pourcentage), cout_revient_pourcentage),
          cout_revient = COALESCE(VALUES(cout_revient), cout_revient),
          kg = COALESCE(VALUES(kg), kg),
          prix_gros_pourcentage = COALESCE(VALUES(prix_gros_pourcentage), prix_gros_pourcentage),
          prix_gros = COALESCE(VALUES(prix_gros), prix_gros),
          prix_vente_pourcentage = COALESCE(VALUES(prix_vente_pourcentage), prix_vente_pourcentage),
      prix_vente = COALESCE(VALUES(prix_vente), prix_vente)
      `;
      await conn.query(sql, [cleaned]);

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
