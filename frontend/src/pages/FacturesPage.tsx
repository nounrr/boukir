import React, { useEffect, useState } from 'react';
import { Download, FileText, Pencil, Plus, Search, X } from 'lucide-react';
import { useGetFacturesAccessQuery, useGetFacturesQuery, useGetFactureClientsQuery, useSaveFactureMutation, useDownloadFactureMutation, type Facture } from '../store/api/facturesApi';

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const money = (n: number) => Number(n).toLocaleString('fr-MA', { style: 'currency', currency: 'MAD' });
const day = (s: string) => String(s || '').slice(0, 10);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const message = (error: any) => error?.data?.message || 'Une erreur est survenue. Réessayez.';
function useDebounced(value: string) {
  const [result, setResult] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setResult(value), 300); return () => clearTimeout(timer); }, [value]);
  return result;
}

function FactureForm({ facture, close }: { facture?: Facture; close: () => void }) {
  const [clientSearch, setClientSearch] = useState('');
  const { data: clients = [], isFetching, isError } = useGetFactureClientsQuery(useDebounced(clientSearch));
  const [client, setClient] = useState(String(facture?.client_id || ''));
  const [error, setError] = useState('');
  const [save, saving] = useSaveFactureMutation();
  const [busy, setBusy] = useState(false);
  const lock = React.useRef(false);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lock.current) close(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [close]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const body = new FormData(event.currentTarget);
      body.set('client_id', client);
      const file = body.get('fichier') as File;
      if (!file?.size) body.delete('fichier');
      if (file?.size > 10 * 1024 * 1024) throw { data: { message: 'Fichier trop volumineux : maximum 10 Mo.' } };
      await save({ id: facture?.id, body }).unwrap(); close();
    } catch (e) { setError(message(e)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
    <section role="dialog" aria-modal="true" aria-labelledby="facture-title" className="max-h-[95vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-xl">
      <div className="flex items-center justify-between border-b p-4"><h2 id="facture-title" className="text-lg font-semibold">{facture ? 'Modifier la facture' : 'Nouvelle facture'}</h2><button aria-label="Fermer" disabled={busy} onClick={close}><X /></button></div>
      <form onSubmit={submit} className="space-y-4 p-4">
        <fieldset disabled={busy || saving.isLoading} className="space-y-4 disabled:opacity-60">
          <label className="block text-sm font-medium">Rechercher un client<input autoFocus className={`${input} mt-1`} value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Nom ou société" /></label>
          <label className="block text-sm font-medium">Client *<select className={`${input} mt-1`} required value={client} onChange={e => setClient(e.target.value)}><option value="">Choisir un client</option>
            {facture && !clients.some(c => c.id === facture.client_id) && <option value={facture.client_id}>{facture.client_societe || facture.client_nom}</option>}
            {clients.map(c => <option key={c.id} value={c.id}>{c.nom_complet}{c.societe ? ` · ${c.societe}` : ''}</option>)}
          </select></label>
          {isFetching && <p className="text-xs text-gray-500">Recherche des clients…</p>}{isError && <p className="text-sm text-red-700">Impossible de charger les clients.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Numéro de facture *<input name="numero" required maxLength={100} defaultValue={facture?.numero} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Mois concerné *<input type="month" name="mois" required defaultValue={facture?.mois || today().slice(0, 7)} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Date de facture *<input type="date" name="date_facture" required defaultValue={facture ? day(facture.date_facture) : today()} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Date d’échéance *<input type="date" name="date_echeance" required defaultValue={facture ? day(facture.date_echeance) : ''} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Montant (DH) *<input type="number" min="0.01" max="999999999999.99" step="0.01" name="montant" required defaultValue={facture?.montant} className={`${input} mt-1`} /></label>
          </div>
          <label className="block text-sm font-medium">Fichier de la facture {facture ? '(facultatif pour remplacer le fichier)' : '*'}<input name="fichier" type="file" required={!facture} accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" className={`${input} mt-1`} /><span className="mt-1 block text-xs text-gray-500">PDF, JPG ou PNG · maximum 10 Mo{facture ? ` · Actuel : ${facture.nom_fichier}` : ''}</span></label>
          <label className="block text-sm font-medium">Notes<textarea name="notes" rows={3} maxLength={5000} defaultValue={facture?.notes || ''} className={`${input} mt-1`} /></label>
        </fieldset>
        {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={close} className="rounded-lg border px-4 py-2">Annuler</button><button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>
      </form>
    </section>
  </div>;
}

export default function FacturesPage() {
  const access = useGetFacturesAccessQuery(undefined, { refetchOnMountOrArgChange: true, refetchOnFocus: true });
  const [q, setQ] = useState(''), [mois, setMois] = useState(''), [page, setPage] = useState(1);
  const [form, setForm] = useState<Facture | 'new' | null>(null);
  const [error, setError] = useState('');
  const search = useDebounced(q);
  const list = useGetFacturesQuery({ q: search, mois, page }, { skip: !access.data?.allowed, refetchOnMountOrArgChange: true, refetchOnFocus: true });
  const [download, downloading] = useDownloadFactureMutation();
  const openFile = async (row: Facture) => {
    setError('');
    try { const result = await download(row.id).unwrap(); const link = document.createElement('a'); link.href = result.url; link.download = row.nom_fichier; link.click(); setTimeout(() => URL.revokeObjectURL(result.url), 30000); }
    catch (e) { setError(message(e)); }
  };
  if (access.isLoading) return <p className="p-6">Chargement…</p>;
  if (access.isError) return <div className="p-6 text-red-700">Impossible de vérifier votre accès. <button onClick={() => access.refetch()} className="underline">Réessayer</button></div>;
  if (!access.data?.allowed) return <p role="alert" className="p-6">Accès non autorisé. Le PDG peut accorder l’accès à « Factures » dans « Autorisations par page ».</p>;
  return <div className="space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><FileText /> Factures</h1><p className="mt-1 text-sm text-gray-500">Factures clients, fichiers et échéances.</p></div><button onClick={() => setForm('new')} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white"><Plus size={18} /> Nouvelle facture</button></header>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4"><label className="flex min-w-48 flex-1 items-center gap-2"><Search size={18} /><input aria-label="Rechercher une facture ou un client" className={input} value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Numéro, client ou société…" /></label><label className="flex items-center gap-2 text-sm">Mois<input aria-label="Filtrer par mois" type="month" className={input} value={mois} onChange={e => { setMois(e.target.value); setPage(1); }} /></label>{(q || mois) && <button onClick={() => { setQ(''); setMois(''); setPage(1); }} className="text-sm text-blue-700">Réinitialiser</button>}</div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {list.isError ? <p role="alert">Impossible de charger les factures. <button onClick={() => list.refetch()} className="text-blue-700 underline">Réessayer</button></p> : <>
      <p className="text-sm text-gray-600">{list.data?.total ?? 0} facture(s) · Montant total : <strong>{money(list.data?.montant ?? 0)}</strong>{list.isFetching && ' · Chargement…'}</p>
      <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-gray-50 text-left"><tr>{['Facture', 'Client', 'Mois', 'Date', 'Échéance', 'Montant', 'Actions'].map(h => <th key={h} className="whitespace-nowrap p-3 font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y">{list.data?.rows.map(row => <tr key={row.id}><td className="p-3 font-medium">{row.numero}</td><td className="p-3">{row.client_nom}{row.client_societe && <div className="text-xs text-gray-500">{row.client_societe}</div>}</td><td className="p-3">{row.mois}</td><td className="whitespace-nowrap p-3">{day(row.date_facture)}</td><td className="whitespace-nowrap p-3">{day(row.date_echeance)}</td><td className="whitespace-nowrap p-3 font-semibold">{money(row.montant)}</td><td className="p-3"><div className="flex gap-2"><button disabled={downloading.isLoading} title="Télécharger la facture" aria-label={`Télécharger ${row.numero}`} onClick={() => openFile(row)} className="rounded p-2 text-blue-700 hover:bg-blue-50"><Download size={18} /></button><button title="Modifier" aria-label={`Modifier ${row.numero}`} onClick={() => setForm(row)} className="rounded p-2 text-gray-600 hover:bg-gray-100"><Pencil size={18} /></button></div></td></tr>)}</tbody></table>{!list.isFetching && !list.data?.rows.length && <p className="p-8 text-center text-gray-500">Aucune facture pour ces filtres.</p>}</div>
      <div className="flex items-center justify-end gap-3 text-sm"><button disabled={page <= 1 || list.isFetching} onClick={() => setPage(p => p - 1)} className="rounded border px-3 py-2 disabled:opacity-40">Précédent</button><span>Page {page} / {Math.max(1, Math.ceil((list.data?.total || 0) / 30))}</span><button disabled={page * 30 >= (list.data?.total || 0) || list.isFetching} onClick={() => setPage(p => p + 1)} className="rounded border px-3 py-2 disabled:opacity-40">Suivant</button></div>
    </>}
    {form && <FactureForm facture={form === 'new' ? undefined : form} close={() => setForm(null)} />}
  </div>;
}
