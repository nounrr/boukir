import pool from '../db/pool.js';
import {
  reviewInvitationConfig,
  runReviewInvitationWorkerOnce,
} from '../utils/reviewInvitation.js';
import { sanitizeNotificationError } from '../utils/notificationDelivery.js';

const pendingRequestIds = new Set();
let wakeWorker = null;

export function queueReviewInvitationScheduling(requestId) {
  const id = Number(requestId);
  if (Number.isSafeInteger(id) && id > 0) pendingRequestIds.add(id);
  if (wakeWorker) queueMicrotask(wakeWorker);
}

function drainPendingRequestIds() {
  const values = [...pendingRequestIds];
  pendingRequestIds.clear();
  return values;
}

export function startReviewInvitationWorker({ db = pool, env = process.env } = {}) {
  if (String(env.REVIEW_INVITATION_WORKER_ENABLED || 'true').toLowerCase() === 'false') {
    return { enabled: false, stop() {} };
  }
  const config = reviewInvitationConfig(env);
  let running = false;
  let stopped = false;

  const run = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await runReviewInvitationWorkerOnce({
        db,
        env,
        config,
        requestIds: drainPendingRequestIds(),
      });
    } catch (error) {
      console.error('[Review invitation worker] failed:', sanitizeNotificationError(error));
    } finally {
      running = false;
    }
  };

  wakeWorker = () => { void run(); };
  const timer = setInterval(() => { void run(); }, config.workerIntervalMs);
  timer.unref?.();
  void run();
  return {
    enabled: true,
    stop() {
      stopped = true;
      clearInterval(timer);
      if (wakeWorker) wakeWorker = null;
    },
  };
}
