import pool from './pool.js';

let schemaPromise;

export function ensureSalePriceWebResearchSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await pool.query(`
      CREATE TABLE IF NOT EXISTS sale_price_web_research (
        entity_key VARCHAR(64) NOT NULL PRIMARY KEY,
        product_id INT NOT NULL,
        variant_id INT NULL,
        model VARCHAR(64) NOT NULL,
        search_context_size VARCHAR(6) NOT NULL DEFAULT 'low',
        market_json JSON NOT NULL,
        ingco_json JSON NOT NULL,
        offers_count INT NOT NULL DEFAULT 0,
        error_text VARCHAR(500) NULL,
        usage_json JSON NULL,
        searched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sale_price_web_research_product (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      const [columns] = await pool.query("SHOW COLUMNS FROM sale_price_web_research LIKE 'usage_json'");
      if (!columns.length) {
        try {
          await pool.query('ALTER TABLE sale_price_web_research ADD COLUMN usage_json JSON NULL AFTER error_text');
        } catch (error) {
          if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
        }
      }
      const [contextColumns] = await pool.query("SHOW COLUMNS FROM sale_price_web_research LIKE 'search_context_size'");
      if (!contextColumns.length) {
        try {
          await pool.query("ALTER TABLE sale_price_web_research ADD COLUMN search_context_size VARCHAR(6) NOT NULL DEFAULT 'low' AFTER model");
        } catch (error) {
          if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
        }
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}
