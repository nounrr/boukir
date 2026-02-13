-- ============================================================
-- FIFO stock layers + allocations
-- Date: 2026-02-13
-- Goal: Track stock by layers (lots) and consume via FIFO to keep
--       stock availability and purchase cost consistent over time.
--
-- Notes:
-- - Minimally invasive: existing stock columns remain authoritative.
-- - Backend uses these tables to allocate/restore quantities.
-- ============================================================

-- stock_layers: represents a remaining quantity at a given unit_cost.
CREATE TABLE IF NOT EXISTS stock_layers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  variant_id INT NULL,
  bon_commande_id INT NULL,
  source_table VARCHAR(64) NOT NULL,
  source_id INT NULL,
  source_item_id INT NULL,
  layer_date DATE NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  original_qty DECIMAL(12,3) NOT NULL,
  remaining_qty DECIMAL(12,3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_layers_product_variant_date (product_id, variant_id, layer_date, id),
  KEY idx_layers_bon_commande (bon_commande_id),
  CONSTRAINT fk_layers_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_layers_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  CONSTRAINT fk_layers_bon_commande FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL
);

-- stock_layer_allocations: signed allocations against layers.
-- quantity > 0 => consumption (layer.remaining_qty decreases)
-- quantity < 0 => restoration (layer.remaining_qty increases)
CREATE TABLE IF NOT EXISTS stock_layer_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  layer_id BIGINT UNSIGNED NOT NULL,
  target_table VARCHAR(64) NOT NULL,
  target_item_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alloc_target (target_table, target_item_id),
  KEY idx_alloc_layer (layer_id),
  CONSTRAINT fk_alloc_layer FOREIGN KEY (layer_id) REFERENCES stock_layers(id) ON DELETE CASCADE
);
