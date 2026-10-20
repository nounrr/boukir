-- Paiement par carte Chaabi Payment (plateforme CMI).
-- Une ligne par tentative de paiement (oid unique côté CMI). La table est aussi créée
-- automatiquement au démarrage (routes/ecommerce/cmiPayments.js -> ensureCmiPaymentSchema).
CREATE TABLE IF NOT EXISTS ecommerce_payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'cmi',
  oid VARCHAR(64) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT '504',
  status ENUM('initiated','approved','declined','error') NOT NULL DEFAULT 'initiated',
  proc_return_code VARCHAR(10) NULL,
  response VARCHAR(20) NULL,
  err_code VARCHAR(50) NULL,
  err_msg VARCHAR(255) NULL,
  trans_id VARCHAR(64) NULL,
  auth_code VARCHAR(20) NULL,
  acq_stan VARCHAR(20) NULL,
  host_ref_num VARCHAR(32) NULL,
  md_status VARCHAR(4) NULL,
  tx_status VARCHAR(4) NULL,
  card_brand VARCHAR(30) NULL,
  card_issuer VARCHAR(100) NULL,
  masked_pan VARCHAR(25) NULL,
  trx_date VARCHAR(30) NULL,
  callback_received_at DATETIME NULL,
  callback_response VARCHAR(20) NULL,
  redirect_received_at DATETIME NULL,
  raw_response JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_payment_oid (provider, oid),
  KEY idx_payment_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
