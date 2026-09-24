import React, { useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';

export const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-700 focus:ring-2 focus:ring-sky-100 disabled:opacity-60';
export const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';
export const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60';
export const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60';
export const iconButton = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40';

const moneyFormatter = new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatMoney = (value: number | null | undefined) => `${moneyFormatter.format(Number(value) || 0)} DH`;
export const formatQty = (value: number) => new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 3 }).format(Number(value) || 0);

export function formatDay(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export const todayInput = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export function errorMessage(error: unknown): string {
  const data = error as { data?: { message?: string; error?: string }; error?: string };
  return data?.data?.message || data?.data?.error || data?.error || 'Une erreur est survenue. Réessayez.';
}

export const isLockedError = (error: unknown) => (error as { status?: number })?.status === 423;

export const MODE_LABELS: Record<string, string> = { Espece: 'Espèce', Virement: 'Virement', Cheque: 'Chèque' };

export const Modal: React.FC<{
  title: string;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ title, onClose, busy, wide, children, footer }) => {
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prior;
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[94vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-5xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" className={iconButton} onClick={onClose} disabled={busy} aria-label="Fermer"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
};

export const Spinner: React.FC<{ label?: string }> = ({ label = 'Chargement…' }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
    <Loader2 className="h-4 w-4 animate-spin" /> {label}
  </div>
);

export const EmptyState: React.FC<{ icon: React.ElementType; title: string; hint?: string; action?: React.ReactNode }> = ({ icon: Icon, title, hint, action }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
    <Icon className="mb-3 h-8 w-8 text-slate-400" />
    <p className="text-sm font-semibold text-slate-700">{title}</p>
    {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  message ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div> : null
);
