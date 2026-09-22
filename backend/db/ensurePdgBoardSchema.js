import pool from './pool.js';

export async function ensurePdgBoardSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pdg_board_cards (
      id INT NOT NULL AUTO_INCREMENT,
      kind ENUM('note', 'task') NOT NULL DEFAULT 'task',
      title VARCHAR(180) NOT NULL,
      description TEXT NULL,
      status ENUM('todo', 'doing', 'done') NOT NULL DEFAULT 'todo',
      assigned_to INT NULL,
      created_by INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_pdg_board_status (status),
      KEY idx_pdg_board_assigned_to (assigned_to),
      KEY idx_pdg_board_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
