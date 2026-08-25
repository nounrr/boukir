import pool from '../db/pool.js';
import { runReviewInvitationWorkerOnce } from '../utils/reviewInvitation.js';

try {
  const result = await runReviewInvitationWorkerOnce({ db: pool });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} catch (error) {
  console.error('[Review invitation worker] fatal:', error?.message || error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
