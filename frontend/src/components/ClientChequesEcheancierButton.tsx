import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, Loader2, X } from 'lucide-react';
import type { Contact } from '../types';
import { useGetClientChequesEcheanciersQuery } from '../store/api/contactsApi';

const money = (amount: number) => new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format(amount);
const date = (value: string) => {
  // A due date is a calendar date; preserve it independently of browser timezone.
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : day;
};

function ChequesModal({ client, onClose }: { client: Pick<Contact, 'id' | 'nom_complet' | 'societe'>; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { data, isFetching, isError, refetch } = useGetClientChequesEcheanciersQuery(Number(client.id), { refetchOnMountOrArgChange: true });
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-6" onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const first = buttons[0]; const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
        <div className="min-w-0"><h2 id={titleId} className="text-lg font-semibold text-gray-900">Chèques à venir</h2><p className="mt-1 break-words text-sm text-gray-600">{client.nom_complet || client.societe || `Client #${client.id}`}</p><p className="mt-1 text-xs text-gray-500">{data ? `Échéances à partir du ${date(data.from_date)}` : 'Échéances après aujourd’hui'}</p></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer les chèques à venir" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-indigo-500"><X size={20} /></button>
      </header>
      <div className="min-h-0 overflow-y-auto p-4" aria-busy={isFetching}>
        {isFetching ? <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin" />Chargement des chèques…</p>
          : isError ? <div role="alert" className="py-8 text-center"><p className="text-sm text-red-600">Impossible de charger les chèques.</p><button type="button" onClick={() => refetch()} className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm">Réessayer</button></div>
          : !data?.cheques.length ? <p className="py-10 text-center text-sm text-gray-500">Aucun chèque avec une échéance après aujourd’hui.</p>
          : <>
            <div className="hidden overflow-x-auto sm:block"><table className="w-full text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="p-3">Chèque / Référence</th><th className="p-3">Échéance</th><th className="p-3">Banque</th><th className="p-3">Statut</th><th className="p-3 text-right">Montant</th></tr></thead><tbody className="divide-y divide-gray-100">{data.cheques.map(cheque => <tr key={cheque.id}><td className="p-3"><p className="font-medium text-gray-900">{cheque.code_reglement || cheque.numero || `PAY${cheque.id}`}</p>{cheque.code_reglement && <p className="mt-1 text-xs text-gray-500">{cheque.numero || `PAY${cheque.id}`}</p>}</td><td className="whitespace-nowrap p-3 font-medium text-indigo-700">{date(cheque.date_echeance)}</td><td className="p-3">{cheque.banque || '—'}</td><td className="p-3">{cheque.statut || '—'}</td><td className="whitespace-nowrap p-3 text-right font-semibold">{money(cheque.montant_total)}</td></tr>)}</tbody></table></div>
            <div className="space-y-3 sm:hidden">{data.cheques.map(cheque => <article key={cheque.id} className="rounded-lg border border-gray-200 p-3"><div className="flex items-start justify-between gap-2"><p className="min-w-0 break-all text-sm font-semibold text-gray-900">{cheque.code_reglement || cheque.numero || `PAY${cheque.id}`}</p><strong className="shrink-0 text-sm">{money(cheque.montant_total)}</strong></div><p className="mt-2 text-sm font-medium text-indigo-700">Échéance : {date(cheque.date_echeance)}</p><p className="mt-1 text-xs text-gray-500">{cheque.banque || 'Banque non renseignée'} · {cheque.statut || '—'}</p></article>)}</div>
          </>}
      </div>
      {!isFetching && !isError && data && <footer className="flex items-center justify-between gap-3 border-t border-gray-200 bg-indigo-50 p-4 text-sm"><span>{data.cheques.length} chèque{data.cheques.length > 1 ? 's' : ''}</span><strong className="text-indigo-800">Total : {money(data.total)}</strong></footer>}
    </div>
  </div>, document.body);
}

export default function ClientChequesEcheancierButton({ client }: { client: Pick<Contact, 'id' | 'nom_complet' | 'societe'> }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={event => { event.stopPropagation(); setOpen(true); }} aria-label={`Voir les chèques à venir de ${client.nom_complet || client.societe || `client ${client.id}`}`} title="Voir les chèques à venir" className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg align-middle text-indigo-600 hover:bg-indigo-100 focus-visible:ring-2 focus-visible:ring-indigo-500"><CalendarClock size={18} /></button>
    {open && <ChequesModal client={client} onClose={() => setOpen(false)} />}
  </>;
}
