import { Router } from 'express';
import {
  requireApprovedMaalem,
  resolveCurrentMaalemAccess,
} from '../middleware/maalemAccess.js';

const router = Router();

// Frontend policy state. This is informational and never grants access by
// itself; every operational endpoint must still use requireApprovedMaalem.
router.get('/me', async (req, res, next) => {
  try {
    return res.json(await resolveCurrentMaalemAccess(req));
  } catch (error) {
    return next(error);
  }
});

// Every route declared below this line is operational and automatically uses
// the live-DB KAN-8 guard. Future Maalem endpoints belong below this boundary.
router.use(requireApprovedMaalem);

// Contract probe only; no Maalem business feature is implemented here.
router.get('/protected-check', (req, res) => {
  return res.json({
    allowed: true,
    status: req.maalemAccess.status,
    capabilities: req.maalemAccess.capabilities,
  });
});

export default router;
