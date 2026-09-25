import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Receipt, Trash2, Truck } from 'lucide-react';
import BonFormModal, { type ProjectBonSubmission } from '../BonFormModal';
import { type ProjetBon, type ProjetBonType, useDeleteProjetBonMutation, useSaveProjetBonMutation } from '../../store/api/projetsApi';
import { EmptyState, ErrorBanner, formatDay, formatMoney, formatQty, iconButton, primaryButton } from './shared';

const COPY: Record<ProjetBonType, { title: string; hint: string; single: string; prefix: string; icon: React.ElementType; empty: string; modalTab: 'Sortie' | 'Charge' }> = {
  products: {
    title: 'Bons produits',
    hint: 'Même saisie qu’un bon de sortie, sans client. Aucun impact sur le stock ni les statistiques.',
    single: 'bon produits',
    prefix: 'BP',
    icon: Truck,
    empty: 'Créez un bon pour tracer les produits utilisés sur le chantier.',
    modalTab: 'Sortie',
  },
  charge: {
    title: 'Bons charge',
    hint: 'Même saisie qu’un bon charge, sans client. Séparé de la caisse et des statistiques.',
    single: 'bon charge',
    prefix: 'BC',
    icon: Receipt,
    empty: 'Créez un bon pour suivre les dépenses du projet.',
    modalTab: 'Charge',
  },
};

const reference = (bon: ProjetBon) => `${COPY[bon.type].prefix}-${String(bon.id).padStart(4, '0')}`;

// Convertit un bon projet au format attendu par BonFormModal (sans `id` :
// le modal reste en mode projet et n'appelle jamais l'API des bons).
function toModalValues(bon: ProjetBon) {
  return {
    type: COPY[bon.type].modalTab,
    date_creation: `${bon.date_bon} 00:00:00`,
    observations: bon.observations ?? '',
    items: bon.items.map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      unit_id: item.unit_id,
      product_snapshot_id: item.product_snapshot_id ?? null,
      designation: item.designation,
      designation_custom: item.product_id ? '' : item.designation,
      quantite: item.quantite,
      prix_unitaire: item.prix_unitaire,
      prix_achat: item.prix_achat ?? 0,
      cout_revient: item.cout_revient ?? 0,
      total: item.total ?? 0,
    })),
  };
}

const BonsTab: React.FC<{ projetId: number; type: ProjetBonType; bons: ProjetBon[] }> = ({ projetId, type, bons }) => {
  const copy = COPY[type];
  const list = useMemo(() => bons.filter((b) => b.type === type), [bons, type]);
  const total = list.reduce((sum, b) => sum + b.montant_total, 0);
  const [save] = useSaveProjetBonMutation();
  const [remove, { isLoading: deleting }] = useDeleteProjetBonMutation();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [modal, setModal] = useState<{ bon: ProjetBon | null } | null>(null);
  const [actionError, setActionError] = useState('');

  const submit = async (data: ProjectBonSubmission) => {
    // Une erreur levée ici est affichée par le modal, qui reste ouvert.
    await save({ projetId, id: modal?.bon?.id, data: { type, ...data } }).unwrap();
  };

  const onDelete = async (bon: ProjetBon) => {
    if (!window.confirm(`Supprimer le ${copy.single} ${reference(bon)} (${formatMoney(bon.montant_total)}) ?`)) return;
    setActionError('');
    try { await remove({ projetId, id: bon.id }).unwrap(); } catch (err) {
      setActionError((err as { data?: { message?: string } })?.data?.message || 'Suppression impossible.');
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{copy.title}</h2>
          <p className="text-sm text-slate-500">{copy.hint}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{list.length} bon(s) · <span className="font-semibold text-slate-800">{formatMoney(total)}</span></span>
          <button type="button" className={primaryButton} onClick={() => setModal({ bon: null })}><Plus className="h-4 w-4" /> Nouveau {copy.single}</button>
        </div>
      </div>
      <ErrorBanner message={actionError} />

      {!list.length ? (
        <EmptyState icon={copy.icon} title={`Aucun ${copy.single}`} hint={copy.empty} />
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {list.map((bon) => {
            const isOpen = expanded === bon.id;
            return (
              <div key={bon.id}>
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setExpanded(isOpen ? null : bon.id)} aria-expanded={isOpen}>
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                    <span className="font-mono text-sm font-semibold text-slate-800">{reference(bon)}</span>
                    <span className="whitespace-nowrap text-sm text-slate-500">{formatDay(bon.date_bon)}</span>
                    <span className="hidden min-w-0 truncate text-sm text-slate-500 sm:inline">{bon.observations || `${bon.items.length} ligne(s)`}</span>
                  </button>
                  <span className="whitespace-nowrap font-semibold tabular-nums text-rose-700">{formatMoney(bon.montant_total)}</span>
                  <div className="flex shrink-0">
                    <button type="button" className={iconButton} onClick={() => setModal({ bon })} aria-label="Modifier"><Pencil className="h-4 w-4" /></button>
                    <button type="button" className={iconButton} onClick={() => onDelete(bon)} disabled={deleting} aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                {isOpen && (
                  <div className="overflow-x-auto bg-slate-50/70 px-4 pb-4 pt-1">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="py-2">Désignation</th>
                          <th className="py-2">Unité</th>
                          <th className="py-2 text-right">Qté</th>
                          <th className="py-2 text-right">PA</th>
                          <th className="py-2 text-right">CR</th>
                          <th className="py-2 text-right">PV</th>
                          <th className="py-2 text-right">PV2</th>
                          <th className="py-2 text-right">P.U. bon</th>
                          <th className="py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70">
                        {bon.items.map((item) => (
                          <tr key={item.id}>
                            <td className="py-2 pr-3 text-slate-800">{item.designation}{item.product_id && <span className="ml-1 text-xs text-slate-400">#{item.product_id}</span>}</td>
                            <td className="py-2 pr-3 text-slate-600">{item.unite || '—'}</td>
                            <td className="py-2 text-right tabular-nums">{formatQty(item.quantite)}</td>
                            <td className="py-2 text-right tabular-nums text-slate-600">{formatMoney(item.prix_achat)}</td>
                            <td className="py-2 text-right tabular-nums text-slate-600">{formatMoney(item.cout_revient)}</td>
                            <td className="py-2 text-right tabular-nums text-slate-600">{formatMoney(item.prix_vente)}</td>
                            <td className="py-2 text-right tabular-nums text-slate-600">{formatMoney(item.prix_vente_2)}</td>
                            <td className="py-2 text-right tabular-nums">{formatMoney(item.prix_unitaire)}</td>
                            <td className="py-2 text-right font-medium tabular-nums">{formatMoney(item.total ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <BonFormModal
          key={modal.bon?.id ?? 'new'}
          isOpen
          onClose={() => setModal(null)}
          currentTab={copy.modalTab}
          initialValues={modal.bon ? toModalValues(modal.bon) : undefined}
          projectMode={{
            title: modal.bon ? `Modifier ${reference(modal.bon)}` : `Nouveau ${copy.single} (projet)`,
            onSubmit: submit,
          }}
        />
      )}
    </section>
  );
};

export default BonsTab;
