import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, nom, description, parent_id, created_by, updated_by, created_at, updated_at FROM categories ORDER BY id DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const [rows] = await pool.query('SELECT id, nom, description, parent_id, created_by, updated_by, created_at, updated_at FROM categories WHERE id = ?', [id]);
    const cat = rows[0];
    if (!cat) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.json(cat);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { nom, description, parent_id, created_by } = req.body;
    if (!nom || !nom.trim()) return res.status(400).json({ message: 'Nom requis' });
    
    // Prevent circular references
    if (parent_id) {
      const [parentCheck] = await pool.query('SELECT id FROM categories WHERE id = ?', [parent_id]);
      if (parentCheck.length === 0) {
        return res.status(400).json({ message: 'Catégorie parente introuvable' });
      }
    }
    
    const now = new Date();
    const [result] = await pool.query(
      'INSERT INTO categories (nom, description, parent_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [nom.trim(), description?.trim() || null, parent_id || null, created_by ?? null, now, now]
    );
    const id = result.insertId;
    const [rows] = await pool.query('SELECT id, nom, description, parent_id, created_by, updated_by, created_at, updated_at FROM categories WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { nom, description, parent_id, updated_by } = req.body;
    const [exists] = await pool.query('SELECT id, parent_id FROM categories WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    
    const currentCategory = exists[0];
    
    // Prevent circular references and self-parenting
    if (parent_id !== undefined && parent_id !== null) {
      if (parent_id === id) {
        return res.status(400).json({ message: 'Une catégorie ne peut pas être son propre parent' });
      }
      
      // Check if parent exists
      const [parentCheck] = await pool.query('SELECT id FROM categories WHERE id = ?', [parent_id]);
      if (parentCheck.length === 0) {
        return res.status(400).json({ message: 'Catégorie parente introuvable' });
      }
      
      // Prevent circular reference: check if parent_id is a descendant of id
      async function isDescendant(ancestorId, potentialDescendantId) {
        if (ancestorId === potentialDescendantId) return true;
        const [children] = await pool.query('SELECT id FROM categories WHERE parent_id = ?', [ancestorId]);
        for (const child of children) {
          if (await isDescendant(child.id, potentialDescendantId)) return true;
        }
        return false;
      }
      
      if (await isDescendant(id, parent_id)) {
        return res.status(400).json({ message: 'Impossible: cela créerait une référence circulaire' });
      }
    }
    
    const now = new Date();
    const fields = [];
    const values = [];
    if (nom !== undefined) { fields.push('nom = ?'); values.push(nom ? nom.trim() : null); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description ? description.trim() : null); }
    if (parent_id !== undefined) { fields.push('parent_id = ?'); values.push(parent_id || null); }
    if (updated_by !== undefined) { fields.push('updated_by = ?'); values.push(updated_by); }
    fields.push('updated_at = ?'); values.push(now);
    const sql = `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    await pool.query(sql, values);
    const [rows] = await pool.query('SELECT id, nom, description, parent_id, created_by, updated_by, created_at, updated_at FROM categories WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Check if category is used by products
router.get('/:id/usage', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const [products] = await pool.query('SELECT COUNT(*) as count FROM products WHERE categorie_id = ?', [id]);
    const [children] = await pool.query('SELECT COUNT(*) as count FROM categories WHERE parent_id = ?', [id]);
    res.json({ 
      productCount: products[0].count,
      subcategoryCount: children[0].count,
      canDelete: products[0].count === 0 && children[0].count === 0
    });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    if (id === 1) {
      return res.status(400).json({ message: "Impossible de supprimer la catégorie par défaut (UNCATEGORIZED)" });
    }
    
    // Check if category has products
    const [products] = await pool.query('SELECT COUNT(*) as count FROM products WHERE categorie_id = ?', [id]);
    if (products[0].count > 0) {
      return res.status(400).json({ 
        message: `Impossible de supprimer cette catégorie car elle est utilisée par ${products[0].count} produit(s)`,
        productCount: products[0].count
      });
    }
    
    // Check if category has subcategories
    const [children] = await pool.query('SELECT COUNT(*) as count FROM categories WHERE parent_id = ?', [id]);
    if (children[0].count > 0) {
      return res.status(400).json({ 
        message: `Impossible de supprimer cette catégorie car elle contient ${children[0].count} sous-catégorie(s)`,
        subcategoryCount: children[0].count
      });
    }
    
    // Delete the category
    await pool.query('DELETE FROM categories WHERE id = ?', [id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
