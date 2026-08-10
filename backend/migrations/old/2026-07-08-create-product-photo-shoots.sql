-- Studio Photos Produits : sessions de prise de photos en magasin
-- (capture multi-images par produit/variante, traitement IA fond blanc studio,
--  puis attachement aux galeries product_images / variant_images)

CREATE TABLE IF NOT EXISTS product_photo_shoots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  variant_id INT NULL,
  status ENUM('pending','processing','processed','attached','error') NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_photo_shoots_product (product_id),
  KEY idx_photo_shoots_variant (variant_id),
  KEY idx_photo_shoots_status (status),
  CONSTRAINT fk_photo_shoots_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_photo_shoots_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_photo_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shoot_id INT NOT NULL,
  kind ENUM('original','processed') NOT NULL DEFAULT 'original',
  source_image_id INT NULL,
  image_url VARCHAR(255) NOT NULL,
  position INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_photo_images_shoot (shoot_id),
  KEY idx_photo_images_source (source_image_id),
  CONSTRAINT fk_photo_images_shoot FOREIGN KEY (shoot_id) REFERENCES product_photo_shoots(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
