import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.findIndex((a) => a === name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
};
const hasFlag = (name) => args.includes(name);

// Load backend/.env relative to this script
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Allow overriding DB connection via CLI args (useful when backend/.env is wrong)
// Example:
//   node backend/scripts/seed-ecommerce-test-order.js --dbUser root --dbPassword "" --dbPort 3307
const dbHost = getArg('--dbHost');
const dbPort = getArg('--dbPort');
const dbUser = getArg('--dbUser');
const dbPassword = getArg('--dbPassword');
const dbName = getArg('--dbName');
if (dbHost != null) process.env.DB_HOST = String(dbHost);
if (dbPort != null) process.env.DB_PORT = String(dbPort);
if (dbUser != null) process.env.DB_USER = String(dbUser);
if (dbPassword != null) process.env.DB_PASSWORD = String(dbPassword);
if (dbName != null) process.env.DB_NAME = String(dbName);

const { default: pool } = await import('../db/pool.js');
const {
  ensureProductRemiseColumns,
  ensureContactsRemiseBalance,
  ensureEcommerceOrdersRemiseColumns,
  ensureEcommerceOrderItemsRemiseColumns,
} = await import('../utils/ensureRemiseSchema.js');

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

function generateOrderNumber(prefix = 'ORD-TEST') {
  const stamp = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${stamp}-${rnd}`;
}

async function getExistingColumns(connection, table) {
  const [dbRows] = await connection.query('SELECT DATABASE() AS db');
  const dbName = dbRows?.[0]?.db;
  if (!dbName) throw new Error('DATABASE() returned NULL; check connection');

  const [cols] = await connection.query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    `,
    [dbName, table]
  );

  return new Set((cols || []).map((r) => String(r.COLUMN_NAME)));
}

function buildInsert(table, columnsSet, data) {
  const cols = Object.keys(data).filter((k) => columnsSet.has(k) && data[k] !== undefined);
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
  const values = cols.map((c) => data[c]);
  return { sql, values, cols };
}

async function main() {
  const connection = await pool.getConnection();
  try {
    // Ensure schema (safe to call)
    await ensureProductRemiseColumns(connection);
    await ensureContactsRemiseBalance(connection);
    await ensureEcommerceOrdersRemiseColumns(connection);
    await ensureEcommerceOrderItemsRemiseColumns(connection);

    const userIdArg = getArg('--userId');
    const productIdArg = getArg('--productId');
    const remisePercentArg = getArg('--remisePercent');

    const requestedUserId = userIdArg != null ? Number(userIdArg) : null;
    const requestedProductId = productIdArg != null ? Number(productIdArg) : null;
    const remisePercentDefault = remisePercentArg != null ? Number(remisePercentArg) : 2.5;

    if (remisePercentArg != null && !Number.isFinite(remisePercentDefault)) {
      throw new Error('--remisePercent invalide');
    }

    const statuses = hasFlag('--allStatuses')
      ? ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']
      : ['pending'];

    await connection.beginTransaction();

    const ordersCols = await getExistingColumns(connection, 'ecommerce_orders');
    const itemsCols = await getExistingColumns(connection, 'ecommerce_order_items');

    // Choose a contact + product to satisfy FKs
    let userId = null;
    if (requestedUserId != null && Number.isFinite(requestedUserId)) {
      userId = requestedUserId;
    } else {
      const [cRows] = await connection.query(
        `SELECT id FROM contacts WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`
      );
      userId = cRows?.[0]?.id != null ? Number(cRows[0].id) : null;
    }

    if (userId == null) {
      throw new Error('Aucun contact trouvé (contacts). Passez --userId <id> ou créez un contact.');
    }

    let productId = null;
    if (requestedProductId != null && Number.isFinite(requestedProductId)) {
      productId = requestedProductId;
    } else {
      const [pRows] = await connection.query(`SELECT id, designation FROM products ORDER BY id ASC LIMIT 1`);
      productId = pRows?.[0]?.id != null ? Number(pRows[0].id) : null;
    }

    if (productId == null) {
      throw new Error('Aucun produit trouvé (products). Passez --productId <id> ou créez un produit.');
    }

    // Build base items (3 lines)
    const baseItems = [
      { name: 'Produit Test Remise A', unit_price: 120, quantity: 2 },
      { name: 'Produit Test Remise B', unit_price: 75, quantity: 1 },
      { name: 'Produit Test Remise C', unit_price: 50, quantity: 3 },
    ].map((it) => {
      const subtotal = round2(it.unit_price * it.quantity);
      const remise_amount = round2((subtotal * remisePercentDefault) / 100);
      return {
        ...it,
        subtotal,
        remise_percent_applied: round2(remisePercentDefault),
        remise_amount,
      };
    });

    const subtotal = round2(baseItems.reduce((acc, it) => acc + it.subtotal, 0));
    const totalEarned = round2(baseItems.reduce((acc, it) => acc + it.remise_amount, 0));

    const created = [];

    for (const status of statuses) {
      const order_number = generateOrderNumber('ORD-TEST-SOLDE');

      const orderData = {
        order_number,
        user_id: userId,
        customer_email: `test.solde.${String(userId)}@example.local`,
        customer_phone: '+212600000999',
        customer_name: 'Test Solde Pending',
        shipping_address_line1: 'Adresse test',
        shipping_address_line2: null,
        shipping_city: 'Casablanca',
        shipping_state: null,
        shipping_postal_code: null,
        shipping_country: 'Morocco',
        subtotal,
        tax_amount: 0,
        shipping_cost: 0,
        discount_amount: 0,
        promo_code: null,
        promo_discount_amount: 0,
        total_amount: subtotal,
        remise_used_amount: 0,
        remise_earned_amount: totalEarned,
        status,
        payment_status: 'pending',
        payment_method: 'solde',
        delivery_method: 'delivery',
        pickup_location_id: null,
        is_solde: 1,
        solde_amount: subtotal,
        customer_notes: `Commande test solde (${status}) - seed`,
        admin_notes: 'seed-ecommerce-test-order.js',
      };

      const orderInsert = buildInsert('ecommerce_orders', ordersCols, orderData);
      const [orderRes] = await connection.query(orderInsert.sql, orderInsert.values);
      const orderId = Number(orderRes.insertId);

      for (const it of baseItems) {
        const itemData = {
          order_id: orderId,
          product_id: productId,
          variant_id: null,
          unit_id: null,
          product_name: it.name,
          product_name_ar: null,
          variant_name: null,
          variant_type: null,
          unit_name: null,
          unit_price: round2(it.unit_price),
          quantity: it.quantity,
          subtotal: it.subtotal,
          discount_percentage: 0,
          discount_amount: 0,
          remise_percent_applied: it.remise_percent_applied,
          remise_amount: it.remise_amount,
        };

        const itemInsert = buildInsert('ecommerce_order_items', itemsCols, itemData);
        await connection.query(itemInsert.sql, itemInsert.values);
      }

      created.push({ orderId, order_number, status });
    }

    await connection.commit();

    console.log('✅ Seed ecommerce test orders created');
    console.table(created);
    console.log('Notes:');
    console.log('- user_id:', userId);
    console.log('- product_id:', productId);
    console.log('- remisePercent:', remisePercentDefault);
    console.log('- is_solde=1, payment_method=solde, payment_status=pending');
  } catch (err) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    console.error('❌ Seed failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    connection.release();
  }
}

await main();
