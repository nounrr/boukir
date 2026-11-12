import pool from '../db/pool.js';
import { normalizePermissionFlag } from './clientCollaborationPermissions.js';

export const canAccessFactures = user => Boolean(user?.role && user.type_compte == null && (user.role === 'PDG' || normalizePermissionFlag(user.acces_factures)));

let ensured;
export async function ensureFactureSchema(db = pool) {
  if (!ensured) ensured = createFactureSchema(db).catch(error => { ensured = undefined; throw error; });
  return ensured;
}

async function createFactureSchema(db) {
  const [columns] = await db.query("SHOW COLUMNS FROM employees LIKE 'acces_factures'");
  if (!columns.length) {
    try { await db.query('ALTER TABLE employees ADD COLUMN acces_factures TINYINT(1) NOT NULL DEFAULT 0'); }
    catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  await db.query(`CREATE TABLE IF NOT EXISTS factures_clients (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    numero VARCHAR(100) NOT NULL,
    mois CHAR(7) NOT NULL,
    date_facture DATE NOT NULL,
    date_echeance DATE NOT NULL,
    montant DECIMAL(14,2) NOT NULL,
    notes TEXT NULL,
    fichier VARCHAR(100) NOT NULL,
    nom_fichier VARCHAR(255) NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    created_by INT NOT NULL,
    updated_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_factures_mois (mois, id), INDEX idx_factures_client (client_id, id),
    INDEX idx_factures_echeance (date_echeance, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

export function parseFacture(body = {}) {
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const client_id = Number(body.client_id), montant = Number(body.montant);
  const numero = String(body.numero || '').trim();
  if (!Number.isSafeInteger(client_id) || client_id <= 0) throw Object.assign(new Error('Choisissez un client.'), { status: 400 });
  if (!numero || numero.length > 100) throw Object.assign(new Error('Numéro de facture requis (100 caractères maximum).'), { status: 400 });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.mois || '') || !date(body.date_facture) || !date(body.date_echeance)) throw Object.assign(new Error('Mois ou dates invalides.'), { status: 400 });
  if (body.date_echeance < body.date_facture) throw Object.assign(new Error('L’échéance doit suivre la date de facture.'), { status: 400 });
  if (!Number.isFinite(montant) || montant <= 0 || montant >= 1e12 || Math.abs(montant * 100 - Math.round(montant * 100)) > 0.0001) throw Object.assign(new Error('Montant positif requis, avec deux décimales maximum.'), { status: 400 });
  if (String(body.notes || '').length > 5000) throw Object.assign(new Error('Notes trop longues (5 000 caractères maximum).'), { status: 400 });
  return { client_id, numero, mois: body.mois, date_facture: body.date_facture, date_echeance: body.date_echeance, montant, notes: String(body.notes || '').trim() || null };
}

export function factureFileType(buffer) {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return { extension: '.pdf', mime: 'application/pdf' };
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { extension: '.png', mime: 'image/png' };
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { extension: '.jpg', mime: 'image/jpeg' };
  throw Object.assign(new Error('Joignez une facture PDF, JPG ou PNG.'), { status: 400 });
}
