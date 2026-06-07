CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL,
  setting_value LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO app_settings (setting_key, setting_value)
VALUES (
  'ui_preferences',
  '{"lineStyles":{"bon_sortie":{"label":"Bon Sortie","bgColor":"#dbeafe","textColor":"#1d4ed8","borderColor":"#93c5fd","badgeBgColor":"#dbeafe","badgeTextColor":"#1d4ed8"},"bon_comptant":{"label":"Bon Comptant","bgColor":"#e0f2fe","textColor":"#0369a1","borderColor":"#38bdf8","badgeBgColor":"#e0f2fe","badgeTextColor":"#0369a1"},"bon_commande":{"label":"Bon Commande","bgColor":"#ede9fe","textColor":"#6d28d9","borderColor":"#c4b5fd","badgeBgColor":"#ede9fe","badgeTextColor":"#6d28d9"},"bon_charge":{"label":"Bon Charge","bgColor":"#ccfbf1","textColor":"#0f766e","borderColor":"#5eead4","badgeBgColor":"#ccfbf1","badgeTextColor":"#0f766e"},"bon_sortie_vendre_fournisseur":{"label":"Vendre Fournisseur","bgColor":"#fee2e2","textColor":"#b91c1c","borderColor":"#fca5a5","badgeBgColor":"#fee2e2","badgeTextColor":"#b91c1c"},"bon_avoir_client":{"label":"Avoir Client","bgColor":"#ffedd5","textColor":"#c2410c","borderColor":"#fdba74","badgeBgColor":"#ffedd5","badgeTextColor":"#c2410c"},"bon_avoir_fournisseur":{"label":"Avoir Fournisseur","bgColor":"#ffedd5","textColor":"#c2410c","borderColor":"#fdba74","badgeBgColor":"#ffedd5","badgeTextColor":"#c2410c"},"bon_avoir_vendre":{"label":"Avoir Vendre","bgColor":"#f3e8ff","textColor":"#7e22ce","borderColor":"#d8b4fe","badgeBgColor":"#f3e8ff","badgeTextColor":"#7e22ce"},"payment_standard":{"label":"Paiement","bgColor":"#dcfce7","textColor":"#15803d","borderColor":"#86efac","badgeBgColor":"#dcfce7","badgeTextColor":"#15803d"},"payment_supplier_fo":{"label":"Paiement FO","bgColor":"#f3e8ff","textColor":"#7e22ce","borderColor":"#d8b4fe","badgeBgColor":"#f3e8ff","badgeTextColor":"#7e22ce"}},"toggles":{"showEcommerceBons":true}}'
)
ON DUPLICATE KEY UPDATE
  setting_value = setting_value,
  updated_at = updated_at;
