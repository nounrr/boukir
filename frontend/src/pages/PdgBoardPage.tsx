import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ClipboardList, FileText, Loader2, Pencil, Plus, RefreshCw, Trash2, UserRound, X } from 'lucide-react';
import { useAuth } from '../hooks/redux';
import {
  type PdgBoardCard,
  type PdgBoardCardInput,
  type PdgBoardStatus,
  useCreatePdgBoardCardMutation,
  useDeletePdgBoardCardMutation,
  useGetPdgBoardQuery,
  useUpdatePdgBoardCardMutation,
} from '../store/api/pdgBoardApi';

const stages: { key: PdgBoardStatus; label: string; hint: string; tone: string; rail: string; dot: string }[] = [
  { key: 'todo', label: 'À faire', hint: 'À prendre en main', tone: 'bg-amber-50/60', rail: 'bg-amber-400', dot: 'bg-amber-500' },
  { key: 'doing', label: 'En cours', hint: 'En train d’avancer', tone: 'bg-sky-50/60', rail: 'bg-sky-500', dot: 'bg-sky-500' },
  { key: 'done', label: 'Terminé', hint: 'Traité et conservé', tone: 'bg-emerald-50/60', rail: 'bg-emerald-500', dot: 'bg-emerald-500' },
];

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-700 focus:ring-2 focus:ring-sky-100 disabled:opacity-60';
const initialForm = (assignedTo: number | null): PdgBoardCardInput => ({
  kind: 'task', title: '', description: '', assigned_to: assignedTo, status: 'todo',
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fr-MA', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function errorMessage(error: unknown): string {
  const data = error as { data?: { message?: string; error?: string }; error?: string };
  return data?.data?.message || data?.data?.error || data?.error || 'Une erreur est survenue. Réessayez.';
}

const PdgBoardPage: React.FC = () => {
  const { user } = useAuth();
  const { data, isLoading, isFetching, isError, error, refetch } = useGetPdgBoardQuery();
  const [createCard, { isLoading: creating }] = useCreatePdgBoardCardMutation();
  const [updateCard, { isLoading: updating }] = useUpdatePdgBoardCardMutation();
  const [deleteCard, { isLoading: deleting }] = useDeletePdgBoardCardMutation();
  const [editingCard, setEditingCard] = useState<PdgBoardCard | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PdgBoardCardInput>(initialForm(user?.id ?? null));
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [activeCardId, setActiveCardId] = useState<number | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const busy = creating || updating || deleting;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const members = data?.members ?? [];
  const cards = data?.cards ?? [];

  useEffect(() => {
    if (!modalOpen) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    titleRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) setModalOpen(false);
      if (event.key === 'Tab') {
        const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
        const focusable = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener('keydown', onKeyDown);
      openerRef.current?.focus();
    };
  }, [modalOpen]);

  const openCreate = (status: PdgBoardStatus = 'todo') => {
    openerRef.current = document.activeElement as HTMLElement;
    setEditingCard(null);
    setForm({ ...initialForm(user?.id ?? null), status });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (card: PdgBoardCard) => {
    openerRef.current = document.activeElement as HTMLElement;
    setEditingCard(card);
    setForm({ kind: card.kind, title: card.title, description: card.description ?? '', assigned_to: card.assigned_to, status: card.status });
    setFormError('');
    setModalOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) { setFormError('Saisissez un titre.'); titleRef.current?.focus(); return; }
    setFormError('');
    try {
      const payload = { ...form, title, description: form.description?.trim() || null };
      if (editingCard) await updateCard({ id: editingCard.id, changes: payload }).unwrap();
      else await createCard(payload).unwrap();
      setModalOpen(false);
    } catch (caught) { setFormError(errorMessage(caught)); }
  };

  const changeStatus = async (card: PdgBoardCard, status: PdgBoardStatus) => {
    if (card.status === status) return;
    setActionError('');
    setActiveCardId(card.id);
    try { await updateCard({ id: card.id, changes: { status } }).unwrap(); }
    catch (caught) { setActionError(errorMessage(caught)); }
    finally { setActiveCardId(null); }
  };

  const remove = async (card: PdgBoardCard) => {
    if (!window.confirm(`Supprimer « ${card.title} » ? Cette action est définitive.`)) return;
    setActionError('');
    setActiveCardId(card.id);
    try { await deleteCard(card.id).unwrap(); }
    catch (caught) { setActionError(errorMessage(caught)); }
    finally { setActiveCardId(null); }
  };

  return (
    <section className="-m-4 min-h-[calc(100vh-3.5rem)] bg-[#f7f8f6] px-4 pb-10 pt-6 text-slate-800 md:-m-6 md:px-8 md:pt-9">
      <div className="mx-auto max-w-[1560px]">
        <header className="mb-7 flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white"><ClipboardList size={16} /></span>
              Espace de direction
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[30px]">Notes & tâches PDG</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Un espace privé pour partager des notes, confier des tâches et suivre leur avancement entre comptes PDG.</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button type="button" onClick={() => refetch()} disabled={isFetching} aria-label="Actualiser le tableau" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-700 disabled:opacity-50">
              <RefreshCw size={17} className={isFetching ? 'animate-spin' : ''} />
            </button>
            <button type="button" onClick={() => openCreate()} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2">
              <Plus size={17} /> Nouvelle carte
            </button>
          </div>
        </header>

        {actionError && <div role="alert" className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle size={17} />{actionError}</div>}

        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center gap-3 text-sm text-slate-600"><Loader2 className="animate-spin" size={20} /> Chargement du tableau…</div>
        ) : isError ? (
          <div role="alert" className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-3 text-red-600" size={28} />
            <h2 className="font-semibold text-slate-900">Impossible de charger le tableau</h2>
            <p className="mt-2 text-sm text-slate-600">{errorMessage(error)}</p>
            <button type="button" onClick={() => refetch()} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Réessayer</button>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center gap-3 text-xs text-slate-500"><span className="font-semibold text-slate-700">{cards.length} carte{cards.length === 1 ? '' : 's'}</span><span aria-hidden="true" className="h-1 w-1 rounded-full bg-slate-400" />Partagé entre {members.length} compte{members.length === 1 ? '' : 's'} PDG</div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start">
              {stages.map((stage) => {
                const stageCards = cards.filter((card) => card.status === stage.key);
                return (
                  <section key={stage.key} aria-labelledby={`column-${stage.key}`} className={`overflow-hidden rounded-xl border border-slate-200 ${stage.tone}`}>
                    <div className={`h-1 ${stage.rail}`} />
                    <div className="flex items-start justify-between px-4 pb-4 pt-5">
                      <div className="flex items-start gap-3"><span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${stage.dot}`} /><div><h2 id={`column-${stage.key}`} className="text-sm font-bold text-slate-900">{stage.label}</h2><p className="mt-0.5 text-xs text-slate-500">{stage.hint}</p></div></div>
                      <span className="min-w-7 rounded-md bg-white px-2 py-1 text-center text-xs font-bold tabular-nums text-slate-700 shadow-sm">{stageCards.length}</span>
                    </div>
                    <div className="space-y-3 px-3 pb-3">
                      {stageCards.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center"><p className="text-sm font-medium text-slate-600">Aucune carte ici</p><button type="button" onClick={() => openCreate(stage.key)} className="mt-2 text-xs font-semibold text-sky-800 underline-offset-2 hover:underline focus:underline">Ajouter une carte</button></div>
                      ) : stageCards.map((card) => (
                        <article key={card.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
                          <div className="mb-2 flex items-start justify-between gap-2"><span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${card.kind === 'task' ? 'bg-sky-50 text-sky-800' : 'bg-stone-100 text-stone-700'}`}>{card.kind === 'task' ? <ClipboardList size={12} /> : <FileText size={12} />}{card.kind === 'task' ? 'Tâche' : 'Note'}</span><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => openEdit(card)} aria-label={`Modifier ${card.title}`} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700"><Pencil size={15} /></button><button type="button" onClick={() => remove(card)} disabled={activeCardId === card.id} aria-label={`Supprimer ${card.title}`} className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 disabled:opacity-50"><Trash2 size={15} /></button></div></div>
                          <h3 className="break-words text-[15px] font-semibold leading-snug text-slate-900">{card.title}</h3>
                          {card.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">{card.description}</p>}
                          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600"><UserRound size={14} className="shrink-0" /><span className="truncate">{card.assigned_to_name || 'Non attribuée'}</span></div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500"><span className="truncate">Par {card.created_by_name || 'PDG'}</span><time dateTime={card.updated_at}>{formatDate(card.updated_at)}</time></div>
                          <label className="mt-3 block"><span className="sr-only">Statut de {card.title}</span><select value={card.status} onChange={(event) => changeStatus(card, event.target.value as PdgBoardStatus)} disabled={activeCardId === card.id} className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100 disabled:opacity-50">{stages.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModalOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="pdg-card-dialog-title" className="my-auto w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Tableau PDG</p><h2 id="pdg-card-dialog-title" className="mt-1 text-lg font-semibold text-slate-950">{editingCard ? 'Modifier la carte' : 'Nouvelle carte'}</h2></div><button type="button" onClick={() => setModalOpen(false)} disabled={busy} aria-label="Fermer" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-700 disabled:opacity-50"><X size={19} /></button></div>
            <form onSubmit={submit} className="space-y-4 px-5 py-5">
              {formError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div>}
              <div><label htmlFor="pdg-kind" className="mb-1.5 block text-xs font-semibold text-slate-700">Type</label><select id="pdg-kind" value={form.kind} onChange={(event) => setForm((prev) => ({ ...prev, kind: event.target.value as PdgBoardCardInput['kind'] }))} className={inputClass}><option value="task">Tâche</option><option value="note">Note</option></select></div>
              <div><label htmlFor="pdg-title" className="mb-1.5 block text-xs font-semibold text-slate-700">Titre <span className="text-red-600">*</span></label><input ref={titleRef} id="pdg-title" required maxLength={180} value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Ex. Vérifier le dossier fournisseur" className={inputClass} /></div>
              <div><label htmlFor="pdg-description" className="mb-1.5 block text-xs font-semibold text-slate-700">Description</label><textarea id="pdg-description" rows={4} value={form.description ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Les détails utiles pour l’autre PDG…" className={`${inputClass} resize-y`} /></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label htmlFor="pdg-assignee" className="mb-1.5 block text-xs font-semibold text-slate-700">Responsable</label><select id="pdg-assignee" value={form.assigned_to ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, assigned_to: event.target.value ? Number(event.target.value) : null }))} className={inputClass}><option value="">Non attribuée</option>{members.map((member) => <option key={member.id} value={member.id}>{member.nom_complet}{member.id === user?.id ? ' (moi)' : ''}</option>)}</select></div><div><label htmlFor="pdg-status" className="mb-1.5 block text-xs font-semibold text-slate-700">Statut</label><select id="pdg-status" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as PdgBoardStatus }))} className={inputClass}>{stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></div></div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setModalOpen(false)} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Annuler</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{editingCard ? 'Enregistrer' : 'Créer la carte'}</button></div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default PdgBoardPage;
