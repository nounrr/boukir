-- Created: 2026-01-27
-- Purpose: Add contact groups and link contacts to a group (many contacts -> one group)

CREATE TABLE contact_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_contact_groups_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE contacts
  ADD COLUMN group_id BIGINT UNSIGNED NULL AFTER source;

ALTER TABLE contacts
  ADD INDEX idx_contacts_group_id (group_id);

ALTER TABLE contacts
  ADD CONSTRAINT fk_contacts_group
  FOREIGN KEY (group_id) REFERENCES contact_groups(id)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
