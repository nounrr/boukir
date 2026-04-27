import pool from '../db/pool.js';

const TARGET_TYPE = 'decimal(18,6)';

const moneyColumns = {
  commande_items: ['prix_unitaire', 'old_prix_achat', 'remise_montant', 'total'],
  sortie_items: ['prix_unitaire', 'remise_montant', 'total'],
  comptant_items: ['prix_unitaire', 'remise_montant', 'total'],
  avoir_client_items: ['prix_unitaire', 'remise_montant', 'total'],
  avoir_fournisseur_items: ['prix_unitaire', 'remise_montant', 'total'],
  avoir_comptant_items: ['prix_unitaire', 'remise_montant', 'total'],
  avoir_ecommerce_items: ['prix_unitaire', 'remise_montant', 'total'],
  devis_items: ['prix_unitaire', 'remise_montant', 'total'],
  vehicule_items: ['prix_unitaire', 'remise_montant', 'total'],
  ecommerce_order_items: ['unit_price', 'subtotal', 'discount_amount', 'remise_amount'],

  bons_commande: ['montant_total'],
  bons_sortie: ['montant_total'],
  bons_comptant: ['montant_total', 'reste'],
  bons_vehicule: ['montant_total'],
  bons_avoir_client: ['montant_total'],
  bons_avoir_fournisseur: ['montant_total'],
  avoirs_comptant: ['montant_total'],
  ecommerce_orders: ['subtotal', 'tax_amount', 'shipping_cost', 'discount_amount', 'total_amount', 'remise_earned_amount', 'remise_used_amount'],

  products: ['prix_achat', 'cout_revient', 'prix_gros', 'prix_vente'],
  product_variants: ['prix_achat', 'cout_revient', 'prix_gros', 'prix_vente'],
  product_units: ['prix_vente'],
  product_snapshot: ['prix_achat', 'cout_revient', 'prix_gros', 'prix_vente'],
};

const quote = (name) => `\`${String(name).replace(/`/g, '``')}\``;

async function tableExists(table) {
  const [rows] = await pool.query('SHOW TABLES LIKE ?', [table]);
  return Array.isArray(rows) && rows.length > 0;
}

function buildColumnDefinition(column) {
  const nullable = column.Null === 'YES' ? 'NULL' : 'NOT NULL';
  const defaultClause = column.Default == null ? '' : ` DEFAULT ${Number(column.Default)}`;
  return `${TARGET_TYPE} ${nullable}${defaultClause}`;
}

async function widenColumn(table, columnName) {
  if (!(await tableExists(table))) return;

  const [columns] = await pool.query(`SHOW COLUMNS FROM ${quote(table)} LIKE ?`, [columnName]);
  const column = Array.isArray(columns) ? columns[0] : null;
  if (!column) return;

  if (String(column.Type).toLowerCase() === TARGET_TYPE) return;
  await pool.query(`ALTER TABLE ${quote(table)} MODIFY COLUMN ${quote(columnName)} ${buildColumnDefinition(column)}`);
}

export async function ensurePricePrecisionColumns() {
  for (const [table, columns] of Object.entries(moneyColumns)) {
    for (const column of columns) {
      await widenColumn(table, column);
    }
  }
}
