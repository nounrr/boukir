-- Create ecommerce_hero_slides (Home Hero carousel managed by backoffice)

CREATE TABLE IF NOT EXISTS ecommerce_hero_slides (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,

  type ENUM('category','brand','campaign','product') NOT NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  priority INT NOT NULL DEFAULT 0,

  locale VARCHAR(5) NOT NULL,

  starts_at DATETIME NULL,
  ends_at DATETIME NULL,

  image_url VARCHAR(1024) NOT NULL,
  image_alt VARCHAR(255) NULL,

  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255) NULL,

  category_id INT NULL,
  brand_id INT NULL,
  product_id INT NULL,
  variant_id INT NULL,
  campaign_id INT NULL,

  ctas JSON NULL,

  created_by_employee_id BIGINT UNSIGNED NULL,
  updated_by_employee_id BIGINT UNSIGNED NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_locale_status_priority (locale, status, priority),
  KEY idx_type_locale (type, locale),
  KEY idx_schedule (starts_at, ends_at)
);
