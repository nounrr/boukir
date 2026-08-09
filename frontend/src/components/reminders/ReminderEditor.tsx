import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import type { Contact } from '../../types';
import { useUpdateContactReminderMutation } from '../../store/api/contactsApi';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { useGetMyClientCollaborationPermissionsQuery } from '../../store/api/clientCollaborationPermissionsApi';

const PRESETS = [0, 1, 3, 7, 14, 30] as const;

export type ReminderTone = 'none' | 'overdue' | 'today' | 'soon' | 'later';

export function getReminderPresentation(daysRemaining: number | null | undefined): {
  tone: ReminderTone;
  label: string;
  classes: string;
} {
  if (!Number.isInteger(daysRemaining)) {
    return { tone: 'none', label: 'Aucun rappel', classes: 'border-gray-200 bg-gray-50 text-gray-500' };
  }
  const days = Number(daysRemaining);
  if (days < 0) {
    return { tone: 'overdue', label: `En retard de ${Math.abs(days)} j`, classes: 'border-red-200 bg-red-50 text-red-700' };
  }
  if (days === 0) return { tone: 'today', label: "Aujourd’hui", classes: 'border-rose-200 bg-rose-50 text-rose-700' };
  if (days <= 3) return { tone: 'soon', label: `${days} j restant${days === 1 ? '' : 's'}`, classes: 'border-amber-200 bg-amber-50 text-amber-700' };
  return { tone: 'later', label: `${days} j restants`, classes: 'border-blue-200 bg-blue-50 text-blue-700' };
}

export function formatReminderDate(value: string | null | undefined): string {
  if (!value) return '—';
  const dateOnly = String(value).slice(0, 10);
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) return dateOnly;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function previewDate(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function readApiError(error: unknown): string {
  const candidate = error as { data?: { error?: string; message?: string }; error?: string };
  return candidate?.data?.error || candidate?.data?.message || candidate?.error || 'Impossible d’enregistrer le rappel.';
}

export const ReminderBadge: React.FC<{
  daysRemaining: number | null | undefined;
  date?: string | null;
  showDate?: boolean;
}> = ({ daysRemaining, date, showDate = false }) => {
  const presentation = getReminderPresentation(daysRemaining);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold whitespace-nowrap ${presentation.classes}`}
      title={date ? `Échéance : ${formatReminderDate(date)}` : presentation.label}
    >
      <Bell className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{presentation.label}</span>
      {showDate && date && <span className="font-medium opacity-75">· {formatReminderDate(date)}</span>}
    </span>
  );
};

function getInitialReminderDays(contact: Contact): number {
  const storedDays = contact.rappel_jours_initial;
  return storedDays !== null && storedDays !== undefined && Number.isInteger(Number(storedDays))
    ? Number(storedDays)
    : 3;
}

export const ReminderEditor: React.FC<{
  contact: Contact;
  compact?: boolean;
  embedded?: boolean;
  autoFocusInput?: boolean;
}> = ({ contact, compact = false, embedded = false, autoFocusInput = false }) => {
  const { data: permissions, isLoading: permissionsLoading } = useGetMyClientCollaborationPermissionsQuery(undefined, {
    pollingInterval: 5000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const active = Boolean(contact.rappel_date);
  const initialDays = getInitialReminderDays(contact);
  const [days, setDays] = useState(String(initialDays));
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [updateReminder, { isLoading }] = useUpdateContactReminderMutation();

  useEffect(() => {
    setDays(String(getInitialReminderDays(contact)));
  }, [contact.id, contact.rappel_jours_initial]);

  const parsedDays = days.trim() === '' ? null : Number(days);
  const isValid = parsedDays !== null && Number.isInteger(parsedDays) && parsedDays >= 0 && parsedDays <= 3650;
  const duePreview = useMemo(() => (isValid ? previewDate(parsedDays) : null), [isValid, parsedDays]);
  const presentation = getReminderPresentation(contact.rappel_jours_restants);

  const save = async (nextDays: number | null) => {
    if (!permissions?.rappels_clients) return;
    setFeedback(null);
    try {
      await updateReminder({ id: contact.id, days: nextDays }).unwrap();
      setFeedback({ type: 'success', text: nextDays === null ? 'Rappel supprimé.' : 'Rappel enregistré.' });
    } catch (error) {
      setFeedback({ type: 'error', text: readApiError(error) });
    }
  };

  if (permissionsLoading || !permissions?.rappels_clients) return null;

  return (
    <section className={embedded ? 'bg-white' : `border border-amber-200 bg-white shadow-sm ${compact ? 'rounded-lg p-4' : 'rounded-xl p-4'}`} aria-label="Rappel client">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Rappel client</h2>
            <p className="mt-0.5 text-xs text-gray-500">Le délai commence aujourd’hui et se décompte par date calendaire.</p>
          </div>
        </div>
        {active && <ReminderBadge daysRemaining={contact.rappel_jours_restants} date={contact.rappel_date} />}
      </div>

      {active && (
        <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-xs ${presentation.classes}`}>
          <span className="font-semibold">Échéance : {formatReminderDate(contact.rappel_date)}</span>
          <span>Défini pour {contact.rappel_jours_initial} jour{contact.rappel_jours_initial === 1 ? '' : 's'}</span>
        </div>
      )}

      <div className="mt-4">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Choisir un délai</span>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Délais prédéfinis">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => { setDays(String(preset)); setFeedback(null); }}
              className={`min-w-10 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 ${
                days === String(preset)
                  ? 'border-amber-500 bg-amber-100 text-amber-800'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-amber-300 hover:bg-amber-50'
              }`}
            >
              {preset === 0 ? "Aujourd’hui" : `${preset} j`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="text-xs font-medium text-gray-700">Nombre de jours personnalisé</span>
          <div className="relative mt-1">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="number"
              min={0}
              max={3650}
              step={1}
              value={days}
              autoFocus={autoFocusInput}
              onChange={(event) => { setDays(event.target.value); setFeedback(null); }}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              aria-describedby={`reminder-help-${contact.id}`}
            />
          </div>
        </label>
        <button
          type="button"
          disabled={!isValid || isLoading}
          onClick={() => isValid && save(parsedDays)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
          Enregistrer
        </button>
      </div>

      <div id={`reminder-help-${contact.id}`} className="mt-2 flex flex-col items-stretch justify-between gap-3 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        <span className={isValid ? 'text-gray-500' : 'font-medium text-red-600'}>
          {isValid ? `Échéance prévue : ${formatReminderDate(duePreview)} · ${parsedDays} j restant${parsedDays === 1 ? '' : 's'}` : 'Saisissez un entier entre 0 et 3650.'}
        </span>
        {active && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center gap-1 border-t border-red-100 pt-3 font-semibold text-red-600 hover:text-red-700 focus:outline-none focus:underline disabled:opacity-50 sm:w-auto sm:border-0 sm:pt-0"
          >
            <Trash2 className="h-3.5 w-3.5" /> Supprimer le rappel
          </button>
        )}
      </div>

      <div className="mt-2 min-h-5 text-xs" aria-live="polite">
        {feedback?.type === 'success' && <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{feedback.text}</span>}
        {feedback?.type === 'error' && <span className="font-semibold text-red-700">{feedback.text}</span>}
      </div>
    </section>
  );
};

export const ReminderModal: React.FC<{ contact: Contact; onClose: () => void }> = ({ contact, onClose }) => {
  const { data: permissions, isLoading } = useGetMyClientCollaborationPermissionsQuery(undefined, {
    pollingInterval: 5000,
    refetchOnFocus: true,
  });
  if (isLoading || !permissions?.rappels_clients) return null;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-xl gap-0 overflow-y-auto border-amber-200 p-0 shadow-2xl sm:rounded-xl">
        <DialogHeader className="border-b border-amber-100 bg-amber-50/70 px-4 py-4 pr-12 text-left sm:px-5">
          <DialogTitle className="text-base font-bold text-gray-900">
            Rappel · {contact.nom_complet || contact.societe || `Client #${contact.id}`}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-600">
            Client #{contact.id} · Planifier le prochain contact sans quitter la liste.
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <ReminderEditor contact={contact} embedded autoFocusInput />
        </div>
      </DialogContent>
    </Dialog>
  );
};
