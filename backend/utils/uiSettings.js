import pool from '../db/pool.js';

const ensureState = {
  table: { done: false, inFlight: null },
};

export const DEFAULT_UI_SETTINGS = {
  lineStyles: {
    bon_sortie: {
      label: 'Bon Sortie',
      bgColor: '#dbeafe',
      textColor: '#1d4ed8',
      borderColor: '#93c5fd',
      badgeBgColor: '#dbeafe',
      badgeTextColor: '#1d4ed8',
    },
    bon_comptant: {
      label: 'Bon Comptant',
      bgColor: '#e0f2fe',
      textColor: '#0369a1',
      borderColor: '#38bdf8',
      badgeBgColor: '#e0f2fe',
      badgeTextColor: '#0369a1',
    },
    bon_commande: {
      label: 'Bon Commande',
      bgColor: '#ede9fe',
      textColor: '#6d28d9',
      borderColor: '#c4b5fd',
      badgeBgColor: '#ede9fe',
      badgeTextColor: '#6d28d9',
    },
    bon_charge: {
      label: 'Bon Charge',
      bgColor: '#ccfbf1',
      textColor: '#0f766e',
      borderColor: '#5eead4',
      badgeBgColor: '#ccfbf1',
      badgeTextColor: '#0f766e',
    },
    bon_sortie_vendre_fournisseur: {
      label: 'Vendre Fournisseur',
      bgColor: '#fee2e2',
      textColor: '#b91c1c',
      borderColor: '#fca5a5',
      badgeBgColor: '#fee2e2',
      badgeTextColor: '#b91c1c',
    },
    bon_avoir_client: {
      label: 'Avoir Client',
      bgColor: '#ffedd5',
      textColor: '#c2410c',
      borderColor: '#fdba74',
      badgeBgColor: '#ffedd5',
      badgeTextColor: '#c2410c',
    },
    bon_avoir_fournisseur: {
      label: 'Avoir Fournisseur',
      bgColor: '#ffedd5',
      textColor: '#c2410c',
      borderColor: '#fdba74',
      badgeBgColor: '#ffedd5',
      badgeTextColor: '#c2410c',
    },
    bon_avoir_vendre: {
      label: 'Avoir Vendre',
      bgColor: '#f3e8ff',
      textColor: '#7e22ce',
      borderColor: '#d8b4fe',
      badgeBgColor: '#f3e8ff',
      badgeTextColor: '#7e22ce',
    },
    payment_standard: {
      label: 'Paiement',
      bgColor: '#dcfce7',
      textColor: '#15803d',
      borderColor: '#86efac',
      badgeBgColor: '#dcfce7',
      badgeTextColor: '#15803d',
    },
    payment_supplier_fo: {
      label: 'Paiement FO',
      bgColor: '#f3e8ff',
      textColor: '#7e22ce',
      borderColor: '#d8b4fe',
      badgeBgColor: '#f3e8ff',
      badgeTextColor: '#7e22ce',
    },
  },
  toggles: {
    showEcommerceBons: true,
  },
};

function normalizeHexColor(value, fallback) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

export function sanitizeUiSettings(input = {}) {
  const output = {
    lineStyles: {},
    toggles: {
      showEcommerceBons: Boolean(input?.toggles?.showEcommerceBons ?? DEFAULT_UI_SETTINGS.toggles.showEcommerceBons),
    },
  };

  for (const [key, defaults] of Object.entries(DEFAULT_UI_SETTINGS.lineStyles)) {
    const src = input?.lineStyles?.[key] || {};
    output.lineStyles[key] = {
      label: defaults.label,
      bgColor: normalizeHexColor(src.bgColor, defaults.bgColor),
      textColor: normalizeHexColor(src.textColor, defaults.textColor),
      borderColor: normalizeHexColor(src.borderColor, defaults.borderColor),
      badgeBgColor: normalizeHexColor(src.badgeBgColor, defaults.badgeBgColor),
      badgeTextColor: normalizeHexColor(src.badgeTextColor, defaults.badgeTextColor),
    };
  }

  return output;
}

export async function ensureUiSettingsTable(db = pool) {
  if (ensureState.table.done) return;
  if (ensureState.table.inFlight) {
    await ensureState.table.inFlight;
    return;
  }

  ensureState.table.inFlight = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
        setting_value LONGTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    const [rows] = await db.query(
      'SELECT setting_key FROM app_settings WHERE setting_key = ? LIMIT 1',
      ['ui_preferences']
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      await db.query(
        'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)',
        ['ui_preferences', JSON.stringify(DEFAULT_UI_SETTINGS)]
      );
    }

    ensureState.table.done = true;
  })();

  try {
    await ensureState.table.inFlight;
  } finally {
    ensureState.table.inFlight = null;
  }
}

export async function getUiSettings(db = pool) {
  await ensureUiSettingsTable(db);
  const [rows] = await db.query(
    'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
    ['ui_preferences']
  );
  const raw = Array.isArray(rows) && rows[0]?.setting_value ? rows[0].setting_value : '{}';
  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  return sanitizeUiSettings(parsed);
}

export async function saveUiSettings(input, db = pool) {
  const sanitized = sanitizeUiSettings(input);
  await ensureUiSettingsTable(db);
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
    ['ui_preferences', JSON.stringify(sanitized)]
  );
  return sanitized;
}
