import pool from '../db/pool.js';

async function hasFifoTables(connection) {
  try {
    const [[row]] = await connection.execute(
      `SELECT COUNT(*) AS cnt
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN ('stock_layers', 'stock_layer_allocations')`
    );
    return Number(row?.cnt || 0) === 2;
  } catch {
    return false;
  }
}

export async function isFifoEnabled(connection) {
  const conn = connection || (await pool.getConnection());
  try {
    return await hasFifoTables(conn);
  } finally {
    if (!connection) conn.release();
  }
}

function toDateOnly(value) {
  if (!value) return null;
  // Accept YYYY-MM-DD or any Date-like string; MySQL DATE expects YYYY-MM-DD.
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function createStockLayer(connection, layer) {
  const {
    product_id,
    variant_id = null,
    bon_commande_id = null,
    source_table,
    source_id = null,
    source_item_id = null,
    layer_date,
    unit_cost,
    unit_sale_price,
    qty,
  } = layer || {};

  if (!connection) throw new Error('createStockLayer: connection required');
  if (!source_table) throw new Error('createStockLayer: source_table required');
  const pid = Number(product_id);
  const vid = variant_id != null && variant_id !== '' ? Number(variant_id) : null;
  const cost = Number(unit_cost);
  const salePrice = unit_sale_price != null ? Number(unit_sale_price) : null;
  const q = Number(qty);
  const ld = toDateOnly(layer_date) || toDateOnly(new Date());
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('createStockLayer: invalid product_id');
  if (vid != null && (!Number.isFinite(vid) || vid <= 0)) throw new Error('createStockLayer: invalid variant_id');
  if (!Number.isFinite(cost) || cost <= 0) throw new Error('createStockLayer: invalid unit_cost');
  if (!Number.isFinite(q) || q <= 0) throw new Error('createStockLayer: invalid qty');

  await connection.execute(
    `INSERT INTO stock_layers (
       product_id, variant_id, bon_commande_id,
       source_table, source_id, source_item_id,
       layer_date, unit_cost, unit_sale_price,
       original_qty, remaining_qty
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    , [pid, vid, bon_commande_id ?? null, String(source_table), source_id ?? null, source_item_id ?? null, ld, cost, salePrice, q, q]
  );
}

export async function ensureNoConsumptionForBonCommande(connection, bonCommandeId) {
  if (!connection) throw new Error('ensureNoConsumptionForBonCommande: connection required');
  const id = Number(bonCommandeId);
  if (!Number.isFinite(id) || id <= 0) return;

  const [[row]] = await connection.execute(
    `SELECT COUNT(*) AS cnt
       FROM stock_layer_allocations a
       JOIN stock_layers l ON l.id = a.layer_id
      WHERE l.bon_commande_id = ?
        AND a.quantity > 0`,
    [id]
  );
  if (Number(row?.cnt || 0) > 0) {
    const err = new Error("Impossible: ce bon de commande est déjà consommé (FIFO)");
    err.statusCode = 409;
    throw err;
  }
}

export async function ensureNoConsumptionForSource(connection, sourceTable, sourceId) {
  if (!connection) throw new Error('ensureNoConsumptionForSource: connection required');
  if (!sourceTable) return;
  const sid = Number(sourceId);
  if (!Number.isFinite(sid) || sid <= 0) return;

  const [[row]] = await connection.execute(
    `SELECT COUNT(*) AS cnt
       FROM stock_layer_allocations a
       JOIN stock_layers l ON l.id = a.layer_id
      WHERE l.source_table = ?
        AND l.source_id = ?
        AND a.quantity > 0`,
    [String(sourceTable), sid]
  );
  if (Number(row?.cnt || 0) > 0) {
    const err = new Error('Impossible: stock déjà consommé (FIFO)');
    err.statusCode = 409;
    throw err;
  }
}

export async function deleteLayersForSource(connection, sourceTable, sourceId) {
  if (!connection) throw new Error('deleteLayersForSource: connection required');
  if (!sourceTable) return;
  const sid = Number(sourceId);
  if (!Number.isFinite(sid) || sid <= 0) return;
  await connection.execute(
    'DELETE FROM stock_layers WHERE source_table = ? AND source_id = ?',
    [String(sourceTable), sid]
  );
}

export async function setLayersCancelledForSource(connection, sourceTable, sourceId, cancelled) {
  if (!connection) throw new Error('setLayersCancelledForSource: connection required');
  if (!sourceTable) return;
  const sid = Number(sourceId);
  if (!Number.isFinite(sid) || sid <= 0) return;

  await ensureNoConsumptionForSource(connection, sourceTable, sid);
  if (cancelled) {
    await connection.execute(
      `UPDATE stock_layers
          SET remaining_qty = 0
        WHERE source_table = ? AND source_id = ?`,
      [String(sourceTable), sid]
    );
  } else {
    await connection.execute(
      `UPDATE stock_layers
          SET remaining_qty = original_qty
        WHERE source_table = ? AND source_id = ?`,
      [String(sourceTable), sid]
    );
  }
}

export async function setBonCommandeLayersCancelled(connection, bonCommandeId, cancelled) {
  if (!connection) throw new Error('setBonCommandeLayersCancelled: connection required');
  const id = Number(bonCommandeId);
  if (!Number.isFinite(id) || id <= 0) return;

  await ensureNoConsumptionForBonCommande(connection, id);

  if (cancelled) {
    await connection.execute(
      `UPDATE stock_layers
          SET remaining_qty = 0
        WHERE bon_commande_id = ?`,
      [id]
    );
  } else {
    await connection.execute(
      `UPDATE stock_layers
          SET remaining_qty = original_qty
        WHERE bon_commande_id = ?`,
      [id]
    );
  }
}

export async function replaceBonCommandeLayers(connection, bonCommandeId, layers, layerDate) {
  if (!connection) throw new Error('replaceBonCommandeLayers: connection required');
  const id = Number(bonCommandeId);
  if (!Number.isFinite(id) || id <= 0) return;

  await ensureNoConsumptionForBonCommande(connection, id);
  await connection.execute('DELETE FROM stock_layers WHERE bon_commande_id = ?', [id]);

  const ld = toDateOnly(layerDate) || toDateOnly(new Date());
  const normalized = Array.isArray(layers) ? layers : [];
  for (const it of normalized) {
    const pid = Number(it?.product_id);
    const vid = it?.variant_id != null && it?.variant_id !== '' ? Number(it.variant_id) : null;
    const cost = Number(it?.prix_unitaire ?? it?.unit_cost);
    const sale = it?.selling_price != null ? Number(it.selling_price) : null;
    const qty = Number(it?.quantite ?? it?.qty);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (vid != null && (!Number.isFinite(vid) || vid <= 0)) continue;
    if (!Number.isFinite(cost) || cost <= 0) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;

    await createStockLayer(connection, {
      product_id: pid,
      variant_id: vid,
      bon_commande_id: id,
      source_table: 'bons_commande',
      source_id: id,
      source_item_id: null,
      layer_date: ld,
      unit_cost: cost,
      unit_sale_price: sale,
      qty,
    });
  }
}

export async function consumeFifo(connection, opts) {
  if (!connection) throw new Error('consumeFifo: connection required');
  const {
    product_id,
    variant_id = null,
    quantity,
    forced_bon_commande_id = null,
    target_table,
    target_item_id,
  } = opts || {};

  const pid = Number(product_id);
  const vid = variant_id != null && variant_id !== '' ? Number(variant_id) : null;
  const qtyNeeded = Number(quantity);
  if (!target_table) throw new Error('consumeFifo: target_table required');
  const tid = Number(target_item_id);

  if (!Number.isFinite(pid) || pid <= 0) throw new Error('consumeFifo: invalid product_id');
  if (vid != null && (!Number.isFinite(vid) || vid <= 0)) throw new Error('consumeFifo: invalid variant_id');
  if (!Number.isFinite(qtyNeeded) || qtyNeeded <= 0) throw new Error('consumeFifo: invalid quantity');
  if (!Number.isFinite(tid) || tid <= 0) throw new Error('consumeFifo: invalid target_item_id');

  const fifoEnabled = await hasFifoTables(connection);
  if (!fifoEnabled) {
    // Caller can fallback to legacy pricing.
    return { ok: false, reason: 'fifo_disabled' };
  }

  // Fetch FIFO layers and lock them.
  const whereBon = forced_bon_commande_id != null ? 'AND bon_commande_id = ?' : '';
  const params = forced_bon_commande_id != null
    ? [pid, vid, forced_bon_commande_id]
    : [pid, vid];

  const [layers] = await connection.execute(
    `SELECT id, bon_commande_id, unit_cost, remaining_qty
       FROM stock_layers
      WHERE product_id = ?
        AND (variant_id <=> ?)
        AND remaining_qty > 0
        ${whereBon}
      ORDER BY layer_date ASC, id ASC
      FOR UPDATE`,
    params
  );

  let remaining = qtyNeeded;
  let totalCost = 0;
  let totalQty = 0;
  const used = [];

  for (const l of layers || []) {
    if (remaining <= 0) break;
    const avail = Number(l.remaining_qty || 0);
    if (!Number.isFinite(avail) || avail <= 0) continue;
    const take = Math.min(avail, remaining);
    const unitCost = Number(l.unit_cost || 0);
    if (!Number.isFinite(unitCost) || unitCost <= 0) continue;

    used.push({ layer_id: Number(l.id), bon_commande_id: l.bon_commande_id ?? null, qty: take, unit_cost: unitCost });
    remaining -= take;
    totalQty += take;
    totalCost += take * unitCost;
  }

  if (remaining > 0) {
    const err = new Error('Stock insuffisant (FIFO)');
    err.statusCode = 409;
    throw err;
  }

  // Apply allocations and update layer remaining.
  for (const u of used) {
    await connection.execute(
      `INSERT INTO stock_layer_allocations (layer_id, target_table, target_item_id, quantity)
       VALUES (?, ?, ?, ?)`,
      [u.layer_id, String(target_table), tid, u.qty]
    );
    await connection.execute(
      `UPDATE stock_layers SET remaining_qty = remaining_qty - ? WHERE id = ?`,
      [u.qty, u.layer_id]
    );
  }

  const avgCost = totalQty > 0 ? (totalCost / totalQty) : null;
  const singleLayer = used.length === 1 ? used[0] : null;
  const singleBonCommandeId = singleLayer?.bon_commande_id ?? null;
  return {
    ok: true,
    avg_cost: avgCost != null ? Math.round(avgCost * 100) / 100 : null,
    single_bon_commande_id: singleBonCommandeId,
    layers_used: used.length,
  };
}

export async function restoreAllocationsForTarget(connection, targetTable, targetItemId) {
  if (!connection) throw new Error('restoreAllocationsForTarget: connection required');
  const tid = Number(targetItemId);
  if (!targetTable || !Number.isFinite(tid) || tid <= 0) return { restored: 0 };

  const fifoEnabled = await hasFifoTables(connection);
  if (!fifoEnabled) return { restored: 0 };

  const [allocs] = await connection.execute(
    `SELECT id, layer_id, quantity
       FROM stock_layer_allocations
      WHERE target_table = ? AND target_item_id = ? AND quantity > 0
      FOR UPDATE`,
    [String(targetTable), tid]
  );

  let restored = 0;
  for (const a of allocs || []) {
    const q = Number(a.quantity || 0);
    if (!Number.isFinite(q) || q <= 0) continue;
    // Reverse: add back to layer and delete allocation row.
    await connection.execute(
      `UPDATE stock_layers SET remaining_qty = remaining_qty + ? WHERE id = ?`,
      [q, Number(a.layer_id)]
    );
    await connection.execute('DELETE FROM stock_layer_allocations WHERE id = ?', [Number(a.id)]);
    restored += q;
  }
  return { restored };
}
