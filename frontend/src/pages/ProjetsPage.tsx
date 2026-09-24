import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, CalendarRange, ClipboardList, FolderKanban, History, KeyRound, Loader2, Lock, Pencil, Plus, Receipt, RefreshCw, Trash2, Truck, Wallet,
} from 'lucide-react';
import {
  type ProjetInput,
  type ProjetListItem,
  hasProjetsUnlockToken,
  setProjetsUnlockToken,
  useChangeProjetsPasswordMutation,
  useCreateProjetMutation,
  useDeleteProjetMutation,
  useGetProjetQuery,
  useGetProjetsQuery,
  useUpdateProjetMutation,
} from '../store/api/projetsApi';
import ProjetsLockScreen from '../components/projets/ProjetsLockScreen';
import DevisTab from '../components/projets/DevisTab';
import AvancesTab from '../components/projets/AvancesTab';
import BonsTab from '../components/projets/BonsTab';
import SituationTab from '../components/projets/SituationTab';
import StatsTab from '../components/projets/StatsTab';
import {
  EmptyState, ErrorBanner, Modal, Spinner, errorMessage, formatDay, formatMoney, iconButton, inputClass, isLockedError, labelClass, primaryButton, secondaryButton,
} from '../components/projets/shared';

type TabKey = 'situation' | 'charge' | 'devis' | 'products' | 'avances' | 'stats';
const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'situation', label: 'Situation complète', icon: History },
  { key: 'charge', label: 'Charges', icon: Receipt },
  { key: 'devis', label: 'Devis', icon: ClipboardList },
  { key: 'products', label: 'Produits', icon: Truck },
  { key: 'avances', label: 'Avances', icon: Wallet },
  { key: 'stats', label: 'Statistiques', icon: BarChart3 },
];

const emptyProjet: ProjetInput = { nom: '', description: '', date_debut: null, date_fin: null };

// --- Formulaire projet -------------------------------------------------------
const ProjetFormModal: React.FC<{ initial: (ProjetInput & { id?: number }) | null; onClose: () => void; onSaved: (id: number) => void; onLocked: () => void }> = ({ initial, onClose, onSaved, onLocked }) => {
  const [createProjet, { isLoading: creating }] = useCreateProjetMutation();
  const [updateProjet, { isLoading: updating }] = useUpdateProjetMutation();
  const [form, setForm] = useState<ProjetInput>(initial ?? emptyProjet);
  const [error, setError] = useState('');
  const busy = creating || updating;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const changes: ProjetInput = {
      nom: form.nom.trim(),
      description: form.description?.trim() || null,
      date_debut: form.date_debut || null,
      date_fin: form.date_fin || null,
    };
    if (!changes.nom) { setError('Le nom du projet est obligatoire.'); return; }
    try {
      const result = initial?.id
        ? await updateProjet({ id: initial.id, changes }).unwrap()
        : await createProjet(changes).unwrap();
      onSaved(result.projet.id);
    } catch (err) {
      if (isLockedError(err)) onLocked();
      else setError(errorMessage(err));
    }
  };

  return (
    <Modal
      title={initial?.id ? 'Modifier le projet' : 'Nouveau projet'}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className={secondaryButton} onClick={onClose} disabled={busy}>Annuler</button>
          <button type="submit" form="projet-form" className={primaryButton} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer</button>
        </>
      )}
    >
      <form id="projet-form" onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error} />
        <div>
          <label htmlFor="projet-nom" className={labelClass}>Nom du projet</label>
          <input id="projet-nom" className={inputClass} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} maxLength={180} required autoFocus />
        </div>
        <div>
          <label htmlFor="projet-desc" className={labelClass}>Description</label>
          <textarea id="projet-desc" rows={4} className={inputClass} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Client, adresse du chantier, nature des travaux…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="projet-debut" className={labelClass}>Date début</label>
            <input id="projet-debut" type="date" className={inputClass} value={form.date_debut ?? ''} onChange={(e) => setForm({ ...form, date_debut: e.target.value || null })} />
          </div>
          <div>
            <label htmlFor="projet-fin" className={labelClass}>Date fin</label>
            <input id="projet-fin" type="date" className={inputClass} value={form.date_fin ?? ''} min={form.date_debut ?? undefined} onChange={(e) => setForm({ ...form, date_fin: e.target.value || null })} />
          </div>
        </div>
      </form>
    </Modal>
  );
};

// --- Changement du mot de passe spécial ------------------------------------
const ChangePasswordModal: React.FC<{ onClose: () => void; onLocked: () => void }> = ({ onClose, onLocked }) => {
  const [change, { isLoading }] = useChangeProjetsPasswordMutation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (next.length < 6) { setError('Le nouveau mot de passe doit contenir au moins 6 caractères.'); return; }
    if (next !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    try {
      await change({ current_password: current, new_password: next }).unwrap();
      setDone(true);
    } catch (err) {
      if (isLockedError(err)) onLocked();
      else setError(errorMessage(err));
    }
  };

  return (
    <Modal
      title="Mot de passe de l’espace Projets"
      onClose={onClose}
      busy={isLoading}
      footer={done
        ? <button type="button" className={primaryButton} onClick={onClose}>Fermer</button>
        : (
          <>
            <button type="button" className={secondaryButton} onClick={onClose} disabled={isLoading}>Annuler</button>
            <button type="submit" form="pwd-form" className={primaryButton} disabled={isLoading}>{isLoading && <Loader2 className="h-4 w-4 animate-spin" />} Modifier</button>
          </>
        )}
    >
      {done ? (
        <p className="text-sm text-emerald-700">Mot de passe modifié. Il sera demandé à la prochaine ouverture.</p>
      ) : (
        <form id="pwd-form" onSubmit={submit} className="space-y-3">
          <ErrorBanner message={error} />
          <div><label htmlFor="pwd-cur" className={labelClass}>Mot de passe actuel</label><input id="pwd-cur" type="password" autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus /></div>
          <div><label htmlFor="pwd-new" className={labelClass}>Nouveau mot de passe</label><input id="pwd-new" type="password" autoComplete="new-password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} required /></div>
          <div><label htmlFor="pwd-conf" className={labelClass}>Confirmer</label><input id="pwd-conf" type="password" autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
        </form>
      )}
    </Modal>
  );
};

// --- Carte projet ------------------------------------------------------------
const ProjetCard: React.FC<{ projet: ProjetListItem; onOpen: () => void }> = ({ projet, onOpen }) => {
  const depenses = projet.total_products + projet.total_charges;
  const solde = projet.total_avances - depenses;
  const pct = projet.total_devis > 0 ? Math.min(100, Math.round((projet.total_avances / projet.total_devis) * 100)) : 0;
  return (
    <button type="button" onClick={onOpen} className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600">
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-base font-semibold text-slate-900 group-hover:text-sky-900">{projet.nom}</h3>
        <FolderKanban className="h-5 w-5 shrink-0 text-slate-300 group-hover:text-sky-600" />
      </div>
      <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">{projet.description || 'Aucune description.'}</p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
        <CalendarRange className="h-3.5 w-3.5" /> {formatDay(projet.date_debut)} → {formatDay(projet.date_fin)}
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
        <div><dt className="text-slate-500">Devis</dt><dd className="font-semibold tabular-nums text-slate-900">{formatMoney(projet.total_devis)}</dd></div>
        <div><dt className="text-slate-500">Avances</dt><dd className="font-semibold tabular-nums text-emerald-700">{formatMoney(projet.total_avances)}</dd></div>
        <div><dt className="text-slate-500">Solde</dt><dd className={`font-semibold tabular-nums ${solde < 0 ? 'text-rose-700' : 'text-sky-800'}`}>{formatMoney(solde)}</dd></div>
      </dl>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-label={`Encaissé ${pct}%`}>
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
};

// --- Liste des projets -------------------------------------------------------
const ProjetsList: React.FC<{ onOpen: (id: number) => void; onLocked: () => void }> = ({ onOpen, onLocked }) => {
  const { data, isLoading, isFetching, error, refetch } = useGetProjetsQuery(undefined, { refetchOnMountOrArgChange: true });
  const [creating, setCreating] = useState(false);
  const projets = data?.projets ?? [];

  useEffect(() => { if (isLockedError(error)) onLocked(); }, [error, onLocked]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Projets</h1>
          <p className="text-sm text-slate-500">Suivi séparé des projets : devis, avances, bons produits et charges. Aucun impact sur le stock ni les statistiques.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={iconButton} onClick={() => refetch()} aria-label="Actualiser"><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></button>
          <button type="button" className={primaryButton} onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nouveau projet</button>
        </div>
      </div>
      {isLoading ? <Spinner /> : error && !isLockedError(error) ? <ErrorBanner message={errorMessage(error)} /> : !projets.length ? (
        <EmptyState icon={FolderKanban} title="Aucun projet" hint="Créez votre premier projet pour suivre son devis, ses avances et ses dépenses." action={<button type="button" className={primaryButton} onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nouveau projet</button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projets.map((p) => <ProjetCard key={p.id} projet={p} onOpen={() => onOpen(p.id)} />)}
        </div>
      )}
      {creating && <ProjetFormModal initial={null} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); onOpen(id); }} onLocked={onLocked} />}
    </>
  );
};

// --- Détail d'un projet ------------------------------------------------------
const ProjetDetailView: React.FC<{ id: number; tab: TabKey; onTab: (t: TabKey) => void; onBack: () => void; onLocked: () => void }> = ({ id, tab, onTab, onBack, onLocked }) => {
  const { data, isLoading, isFetching, error, refetch } = useGetProjetQuery(id, { refetchOnMountOrArgChange: true });
  const [deleteProjet, { isLoading: deleting }] = useDeleteProjetMutation();
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => { if (isLockedError(error)) onLocked(); }, [error, onLocked]);

  if (isLoading) return <Spinner />;
  if (error || !data) {
    if (isLockedError(error)) return null;
    return (
      <div className="space-y-3">
        <button type="button" className={secondaryButton} onClick={onBack}><ArrowLeft className="h-4 w-4" /> Projets</button>
        <ErrorBanner message={errorMessage(error)} />
      </div>
    );
  }

  const { projet, stats } = data;
  const onDelete = async () => {
    if (!window.confirm(`Supprimer définitivement le projet « ${projet.nom} » avec son devis, ses avances et tous ses bons ?`)) return;
    setActionError('');
    try { await deleteProjet(projet.id).unwrap(); onBack(); } catch (err) { setActionError(errorMessage(err)); }
  };
  const counts: Partial<Record<TabKey, number>> = {
    situation: data.situation.length,
    charge: stats.nb_bons_charge,
    devis: data.devis.length,
    products: stats.nb_bons_products,
    avances: stats.nb_avances,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Tous les projets</button>
          <h1 className="text-xl font-semibold text-slate-900">{projet.nom}</h1>
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-slate-500"><CalendarRange className="h-4 w-4" /> {formatDay(projet.date_debut)} → {formatDay(projet.date_fin)}</p>
          {projet.description && <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-slate-600">{projet.description}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={iconButton} onClick={() => refetch()} aria-label="Actualiser"><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></button>
          <button type="button" className={secondaryButton} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Modifier</button>
          <button type="button" className={`${secondaryButton} text-rose-700 hover:bg-rose-50`} onClick={onDelete} disabled={deleting}><Trash2 className="h-4 w-4" /> Supprimer</button>
        </div>
      </div>
      <ErrorBanner message={actionError} />

      <div className="-mx-1 overflow-x-auto border-b border-slate-200">
        <div className="flex min-w-max gap-1 px-1" role="tablist" aria-label="Sections du projet">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => onTab(key)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${tab === key ? 'border-sky-700 text-sky-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <Icon className="h-4 w-4" /> {label}
              {counts[key] !== undefined && <span className={`rounded-full px-1.5 text-xs ${tab === key ? 'bg-sky-100 text-sky-900' : 'bg-slate-100 text-slate-500'}`}>{counts[key]}</span>}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel">
        {tab === 'situation' && <SituationTab situation={data.situation} stats={stats} />}
        {tab === 'charge' && <BonsTab projetId={projet.id} type="charge" bons={data.bons} />}
        {tab === 'devis' && <DevisTab projetId={projet.id} devis={data.devis} />}
        {tab === 'products' && <BonsTab projetId={projet.id} type="products" bons={data.bons} />}
        {tab === 'avances' && <AvancesTab projetId={projet.id} avances={data.avances} />}
        {tab === 'stats' && <StatsTab stats={stats} />}
      </div>

      {editing && (
        <ProjetFormModal
          initial={{ id: projet.id, nom: projet.nom, description: projet.description, date_debut: projet.date_debut, date_fin: projet.date_fin }}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
          onLocked={onLocked}
        />
      )}
    </div>
  );
};

// --- Page ------------------------------------------------------------------
const ProjetsPage: React.FC = () => {
  const [unlocked, setUnlocked] = useState(hasProjetsUnlockToken);
  const [notice, setNotice] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [params, setParams] = useSearchParams();
  const projetId = Number(params.get('projet')) || null;
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'situation') as TabKey;

  // Chaque entrée dans la page redemande le mot de passe.
  useEffect(() => () => setProjetsUnlockToken(null), []);

  const lock = useCallback((message = '') => {
    setProjetsUnlockToken(null);
    setUnlocked(false);
    setNotice(message);
  }, []);
  const onLocked = useCallback(() => lock('Session expirée : saisissez à nouveau le mot de passe.'), [lock]);

  if (!unlocked) {
    return (
      <ProjetsLockScreen
        notice={notice}
        onUnlocked={(token) => { setProjetsUnlockToken(token); setNotice(''); setUnlocked(true); }}
      />
    );
  }

  const openProjet = (id: number | null, nextTab: TabKey = 'situation') => {
    setParams(id ? { projet: String(id), tab: nextTab } : {});
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex justify-end gap-2">
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={() => setChangingPassword(true)}>
          <KeyRound className="h-3.5 w-3.5" /> Mot de passe
        </button>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={() => lock()}>
          <Lock className="h-3.5 w-3.5" /> Verrouiller
        </button>
      </div>
      {projetId
        ? <ProjetDetailView key={projetId} id={projetId} tab={tab} onTab={(t) => openProjet(projetId, t)} onBack={() => openProjet(null)} onLocked={onLocked} />
        : <ProjetsList onOpen={(id) => openProjet(id)} onLocked={onLocked} />}
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} onLocked={onLocked} />}
    </div>
  );
};

export default ProjetsPage;
