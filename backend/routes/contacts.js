import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// GET /api/contacts - Get all contacts with optional type filter (avec solde_cumule calculé)
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    let query = `
      SELECT 
        c.*,
        CASE 
          WHEN c.type = 'Client' THEN
            COALESCE(c.solde, 0)
            + COALESCE(ventes_client.total_ventes, 0)
            - COALESCE(paiements_client.total_paiements, 0)
            - COALESCE(avoirs_client.total_avoirs, 0)
          WHEN c.type = 'Fournisseur' THEN
            COALESCE(c.solde, 0)
            + COALESCE(achats_fournisseur.total_achats, 0)
            - COALESCE(paiements_fournisseur.total_paiements, 0)
            - COALESCE(avoirs_fournisseur.total_avoirs, 0)
          ELSE c.solde
        END AS solde_cumule
      FROM contacts c

      -- Ventes client = bons_sortie + bons_comptant
      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_ventes
        FROM (
          SELECT client_id, montant_total, statut FROM bons_sortie
          UNION ALL
          SELECT client_id, montant_total, statut FROM bons_comptant
        ) vc
        WHERE vc.client_id IS NOT NULL
        AND vc.statut IN ('Validé','En attente')
        GROUP BY client_id
      ) ventes_client ON ventes_client.client_id = c.id AND c.type = 'Client'

      -- Achats fournisseur = bons_commande
      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_achats
        FROM bons_commande
        WHERE fournisseur_id IS NOT NULL
          AND statut IN ('Validé','En attente')
        GROUP BY fournisseur_id
      ) achats_fournisseur ON achats_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'

      -- Paiements client
      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Client'
          AND statut IN ('Validé','En attente')
        GROUP BY contact_id
      ) paiements_client ON paiements_client.contact_id = c.id AND c.type = 'Client'

      -- Paiements fournisseur
      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Fournisseur'
          AND statut IN ('Validé','En attente')
        GROUP BY contact_id
      ) paiements_fournisseur ON paiements_fournisseur.contact_id = c.id AND c.type = 'Fournisseur'

      -- Avoirs client (avoirs_client table)
      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_client
        WHERE statut IN ('Validé','En attente')
        GROUP BY client_id
      ) avoirs_client ON avoirs_client.client_id = c.id AND c.type = 'Client'

      -- Avoirs fournisseur (avoirs_fournisseur table)
      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_fournisseur
        WHERE statut IN ('Validé','En attente')
        GROUP BY fournisseur_id
      ) avoirs_fournisseur ON avoirs_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'

      WHERE 1=1`;
    
    const params = [];

    if (type && (type === 'Client' || type === 'Fournisseur')) {
      query += ' AND c.type = ?';
      params.push(type);
    }

    query += ' ORDER BY c.created_at DESC ';

    const [rows] = await pool.execute(query, params);
    
    console.log(`=== CONTACTS RÉCUPÉRÉS ===`);
    console.log(`Total: ${rows.length} contacts`);
    console.log(`Type filter: ${type || 'Tous'}`);
    
    // Convertir solde_cumule en nombre pour éviter les problèmes de type
    const processedRows = rows.map(row => ({
      ...row,
      solde_cumule: Number(row.solde_cumule || 0)
    }));
    
    processedRows.forEach((contact, index) => {
      if (index < 20) { // Afficher les 20 premiers pour debug
        console.log(`${index + 1}. ID: ${contact.id}, Nom: ${contact.nom_complet}, Type: ${contact.type}, Solde initial: ${contact.solde}, Solde cumulé: ${contact.solde_cumule}`);
      }
    });
    
    if (processedRows.length > 20) {
      console.log(`... et ${processedRows.length - 20} autres contacts`);
    }
    
    res.json(processedRows);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// GET /api/contacts/:id - Get contact by ID with calculated solde_cumule
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT 
        c.*,
        CASE 
          WHEN c.type = 'Client' THEN
            COALESCE(c.solde, 0)
            + COALESCE(ventes_client.total_ventes, 0)
            - COALESCE(paiements_client.total_paiements, 0)
            - COALESCE(avoirs_client.total_avoirs, 0)
          WHEN c.type = 'Fournisseur' THEN
            COALESCE(c.solde, 0)
            + COALESCE(achats_fournisseur.total_achats, 0)
            - COALESCE(paiements_fournisseur.total_paiements, 0)
            - COALESCE(avoirs_fournisseur.total_avoirs, 0)
          ELSE c.solde
        END AS solde_cumule
      FROM contacts c

      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_ventes
        FROM (
          SELECT client_id, montant_total, statut FROM bons_sortie
          UNION ALL
          SELECT client_id, montant_total, statut FROM bons_comptant
        ) vc
        WHERE vc.client_id IS NOT NULL
          AND vc.statut IN ('Validé','En attente')
        GROUP BY client_id
      ) ventes_client ON ventes_client.client_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_achats
        FROM bons_commande
        WHERE fournisseur_id IS NOT NULL
          AND statut IN ('Validé','En attente')
        GROUP BY fournisseur_id
      ) achats_fournisseur ON achats_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'

      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Client'
          AND statut IN ('Validé','En attente')
        GROUP BY contact_id
      ) paiements_client ON paiements_client.contact_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Fournisseur'
          AND statut IN ('Validé','En attente')
        GROUP BY contact_id
      ) paiements_fournisseur ON paiements_fournisseur.contact_id = c.id AND c.type = 'Fournisseur'

      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_client
        WHERE statut IN ('Validé','En attente')
        GROUP BY client_id
      ) avoirs_client ON avoirs_client.client_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_fournisseur
        WHERE statut IN ('Validé','En attente')
        GROUP BY fournisseur_id
      ) avoirs_fournisseur ON avoirs_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'

      WHERE c.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Convertir solde_cumule en nombre
    const contact = {
      ...rows[0],
      solde_cumule: Number(rows[0].solde_cumule || 0)
    };

    res.json(contact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// POST /api/contacts - Create new contact
router.post('/', async (req, res) => {
  try {
    const {
      nom_complet,
      societe,
      type,
      telephone,
      email,
      adresse,
      rib,
      ice,
      solde = 0,
      plafond,
      created_by
    } = req.body;

    // Validation
    if (!type) {
      return res.status(400).json({ error: 'type is required' });
    }

    // Pour les Clients, le nom complet est requis. Pour les Fournisseurs, il est optionnel.
    if (type === 'Client' && (!nom_complet || String(nom_complet).trim() === '')) {
      return res.status(400).json({ error: 'nom_complet is required for Client' });
    }

    if (!['Client', 'Fournisseur'].includes(type)) {
      return res.status(400).json({ error: 'type must be either Client or Fournisseur' });
    }

    const [result] = await pool.execute(
      `INSERT INTO contacts 
       (nom_complet, societe, type, telephone, email, adresse, rib, ice, solde, plafond, created_by, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'backoffice', NOW(), NOW())`,
  [(nom_complet ?? ''), (societe ?? null), type, telephone || null, email || null, adresse || null, rib || null, ice || null, solde ?? 0, plafond || null, created_by || null]
    );

    // Fetch the created contact
    const [rows] = await pool.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/contacts/:id - Update contact
router.put('/:id', async (req, res) => {
  try {
    const {
      nom_complet,
      societe,
      type,
      telephone,
      email,
      adresse,
      rib,
      ice,
      solde,
      plafond,
      updated_by
    } = req.body;

    // Check if contact exists
    const [existing] = await pool.execute(
      'SELECT id FROM contacts WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Build update query dynamically based on provided fields
    const updates = [];
    const params = [];

  if (nom_complet !== undefined) { updates.push('nom_complet = ?'); params.push(nom_complet); }
  if (societe !== undefined) { updates.push('societe = ?'); params.push(societe); }
    if (type !== undefined) { 
      if (!['Client', 'Fournisseur'].includes(type)) {
        return res.status(400).json({ error: 'type must be either Client or Fournisseur' });
      }
      updates.push('type = ?'); 
      params.push(type); 
    }
    if (telephone !== undefined) { updates.push('telephone = ?'); params.push(telephone); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (adresse !== undefined) { updates.push('adresse = ?'); params.push(adresse); }
    if (rib !== undefined) { updates.push('rib = ?'); params.push(rib); }
    if (ice !== undefined) { updates.push('ice = ?'); params.push(ice); }
    if (solde !== undefined) { updates.push('solde = ?'); params.push(Number(solde)); }
    if (plafond !== undefined) { updates.push('plafond = ?'); params.push(plafond ? Number(plafond) : null); }
    if (updated_by !== undefined) { updates.push('updated_by = ?'); params.push(updated_by); }

    updates.push('updated_at = NOW()');
    params.push(req.params.id);

    if (updates.length > 1) { // More than just updated_at
      await pool.execute(
        `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // Fetch updated contact
    const [rows] = await pool.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [req.params.id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE /api/contacts/:id - Delete contact
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute(
      'SELECT id FROM contacts WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await pool.execute('DELETE FROM contacts WHERE id = ?', [req.params.id]);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;
