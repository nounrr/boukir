import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { getThemePreference, setThemePreference, subscribeTheme, type ThemePreference } from '../utils/theme';

const NEXT: Record<ThemePreference, ThemePreference> = { light: 'dark', dark: 'system', system: 'light' };
const LABEL: Record<ThemePreference, string> = { light: 'Mode clair', dark: 'Mode sombre', system: 'Thème du système' };

/** Bouton du haut : Clair → Sombre → Système. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [pref, setPref] = useState<ThemePreference>(getThemePreference);
  useEffect(() => subscribeTheme(setPref), []);

  const Icon = pref === 'dark' ? Moon : pref === 'system' ? Monitor : Sun;
  const next = NEXT[pref];
  return (
    <button
      type="button"
      onClick={() => setThemePreference(next)}
      className={`p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors ${className}`}
      title={`${LABEL[pref]} — cliquer pour : ${LABEL[next].toLowerCase()}`}
      aria-label={`${LABEL[pref]}. Passer en ${LABEL[next].toLowerCase()}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
