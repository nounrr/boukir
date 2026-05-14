import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { getUiSettings, saveUiSettings } from '../utils/uiSettings.js';

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const settings = await getUiSettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.put('/', requireRole('PDG'), async (req, res, next) => {
  try {
    const settings = await saveUiSettings(req.body || {});
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

export default router;
