-- Migration: Create talons table
-- Date: 2025-08-23
-- Description: Create table for managing talons with nom and phone columns

CREATE TABLE  talons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add index for better search performance
CREATE INDEX idx_talons_nom ON talons(nom);
CREATE INDEX idx_talons_phone ON talons(phone);