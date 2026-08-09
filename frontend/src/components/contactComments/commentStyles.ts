import type { ContactCommentColor } from '../../store/api/contactCommentsApi';

export interface CommentColorTheme {
  key: ContactCommentColor;
  label: string;
  /** Pastille de sélection dans la palette */
  swatch: string;
  /** Carte du commentaire */
  card: string;
  /** Barre latérale d'accent */
  accent: string;
  /** Texte d'accent (auteur, icônes) */
  text: string;
}

export const COMMENT_COLORS: CommentColorTheme[] = [
  {
    key: 'default',
    label: 'Neutre',
    swatch: 'bg-gray-300',
    card: 'bg-white border-gray-200',
    accent: 'bg-gray-300',
    text: 'text-gray-500',
  },
  {
    key: 'blue',
    label: 'Info',
    swatch: 'bg-blue-500',
    card: 'bg-blue-50/70 border-blue-200',
    accent: 'bg-blue-500',
    text: 'text-blue-600',
  },
  {
    key: 'green',
    label: 'Positif',
    swatch: 'bg-emerald-500',
    card: 'bg-emerald-50/70 border-emerald-200',
    accent: 'bg-emerald-500',
    text: 'text-emerald-600',
  },
  {
    key: 'amber',
    label: 'Attention',
    swatch: 'bg-amber-500',
    card: 'bg-amber-50/70 border-amber-200',
    accent: 'bg-amber-500',
    text: 'text-amber-600',
  },
  {
    key: 'red',
    label: 'Urgent',
    swatch: 'bg-red-500',
    card: 'bg-red-50/70 border-red-200',
    accent: 'bg-red-500',
    text: 'text-red-600',
  },
  {
    key: 'purple',
    label: 'Suivi',
    swatch: 'bg-purple-500',
    card: 'bg-purple-50/70 border-purple-200',
    accent: 'bg-purple-500',
    text: 'text-purple-600',
  },
];

const FALLBACK = COMMENT_COLORS[0];

export const getCommentTheme = (color: string | null | undefined): CommentColorTheme =>
  COMMENT_COLORS.find((c) => c.key === color) ?? FALLBACK;

export const MAX_COMMENT_LENGTH = 2000;

/** Date relative courte, ex: « il y a 3 h », « hier », « 12/03/2026 » */
export const formatRelativeDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;

  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;

  const diffJ = Math.round(diffH / 24);
  if (diffJ === 1) return 'hier';
  if (diffJ < 7) return `il y a ${diffJ} j`;

  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatFullDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getAuthorInitials = (name: string | null | undefined): string => {
  const clean = String(name ?? '').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
};
