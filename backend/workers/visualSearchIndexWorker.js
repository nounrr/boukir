import pool from '../db/pool.js';
import { geminiKey, indexProductImages } from '../utils/visualSearch.js';

/**
 * Keeps the visual search index up to date: every few minutes, embeds the photos of new
 * products and of products whose photo changed (a limited number per run, to stay within the
 * Gemini quota). Does nothing while GEMINI_API_KEY is not set.
 * VISUAL_SEARCH_WORKER_ENABLED=false turns it off; VISUAL_SEARCH_INTERVAL_MINUTES and
 * VISUAL_SEARCH_BATCH tune the pace (default every 10 minutes, 120 products).
 */
export function startVisualSearchIndexWorker({ db = pool, env = process.env } = {}) {
  if (String(env.VISUAL_SEARCH_WORKER_ENABLED || 'true').toLowerCase() === 'false' || !geminiKey(env)) {
    return { enabled: false, stop() {} };
  }
  const minutes = Math.max(1, Number(env.VISUAL_SEARCH_INTERVAL_MINUTES) || 10);
  const limit = Math.max(6, Math.min(1000, Number(env.VISUAL_SEARCH_BATCH) || 120));
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await indexProductImages(db, { limit, log: (message) => console.log(`[Visual search] ${message}`) });
      if (result.indexed || result.skipped) console.log(`[Visual search] indexed ${result.indexed}, unreadable ${result.skipped}, remaining ${result.pending}`);
    } catch (error) {
      console.error('[Visual search] indexing failed:', error?.message || error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void run(); }, minutes * 60 * 1000);
  timer.unref?.();
  // First run shortly after start-up, once the server is serving requests.
  const first = setTimeout(() => { void run(); }, 30 * 1000);
  first.unref?.();
  return { enabled: true, stop() { clearInterval(timer); clearTimeout(first); } };
}
