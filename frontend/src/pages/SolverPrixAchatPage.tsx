import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Save, Search } from 'lucide-react';
import {
  useGetPricePurchaseAnomaliesQuery,
  useUpdateCommandeItemPrixAchatMutation,
} from '../store/api/pricePurchaseSolverApi';
import type { PriceSolverGroup, PriceSolverItem } from '../store/api/pricePurchaseSolverApi';
import { showError, showSuccess } from '../utils/notifications';

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const formatMoney = (value: unknown) => `${toNumber(value).toFixed(2)} DH`;

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR');
};

const keyForItem = (item: PriceSolverItem) => String(item.commande_item_id);

const SolverPrixAchatPage: React.FC = () => {
  const [thresholdInput, setThresholdInput] = useState('50');
  const [search, setSearch] = useState('');
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const threshold = Math.max(0, toNumber(thresholdInput) || 0);

  const { data, isFetching, refetch } = useGetPricePurchaseAnomaliesQuery({
    threshold,
    limit: 300,
  });
  const [updatePrixAchat, { isLoading: isSaving }] = useUpdateCommandeItemPrixAchatMutation();

  useEffect(() => {
    const next: Record<string, string> = {};
    const validIds = new Set<string>();
    for (const group of data?.data || []) {
      for (const item of group.items || []) {
        const key = keyForItem(item);
        validIds.add(key);
        next[key] = String(toNumber(item.prix_achat_affiche || item.prix_achat_bon).toFixed(2));
      }
    }
    setDraftPrices(next);
    setSelectedIds((prev) => new Set([...prev].filter((id) => validIds.has(id))));
  }, [data]);

  const allItems = useMemo(
    () => (data?.data || []).flatMap((group) => group.items || []),
    [data]
  );

  const allItemsById = useMemo(() => {
    const map = new Map<string, PriceSolverItem>();
    for (const item of allItems) map.set(keyForItem(item), item);
    return map;
  }, [allItems]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups = data?.data || [];
    if (!q) return groups;

    return groups
      .map((group) => {
        const productMatches =
          String(group.product_id).includes(q) ||
          String(group.designation || '').toLowerCase().includes(q) ||
          String(group.variant_name || '').toLowerCase().includes(q);

        if (productMatches) return group;

        const items = group.items.filter((item) =>
          String(item.bon_numero || '').toLowerCase().includes(q) ||
          String(item.product_snapshot_id || '').includes(q)
        );

        return items.length ? { ...group, items } : null;
      })
      .filter(Boolean) as PriceSolverGroup[];
  }, [data, search]);

  const toggleSelected = (key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handlePriceChange = (item: PriceSolverItem, value: string) => {
    const key = keyForItem(item);
    setDraftPrices((prev) => {
      const next = { ...prev };
      const targetKeys = selectedIds.has(key) ? [...selectedIds] : [key];
      for (const targetKey of targetKeys) {
        next[targetKey] = value;
      }
      return next;
    });
  };

  const saveItem = async (item: PriceSolverItem) => {
    const key = keyForItem(item);
    const isMultiSelectMode = selectedIds.size > 0;

    if (isMultiSelectMode && !selectedIds.has(key)) {
      showError("Selectionnez cette ligne avant d'enregistrer en multi selection");
      return;
    }

    const newPrice = toNumber(draftPrices[key]);
    const targets = isMultiSelectMode
      ? [...selectedIds].map((id) => allItemsById.get(id)).filter(Boolean) as PriceSolverItem[]
      : [item];

    if (!Number.isFinite(newPrice) || newPrice < 0) {
      showError("Prix d'achat invalide");
      setDraftPrices((prev) => {
        const next = { ...prev };
        for (const target of targets) {
          const targetKey = keyForItem(target);
          next[targetKey] = toNumber(target.prix_achat_affiche || target.prix_achat_bon).toFixed(2);
        }
        return next;
      });
      return;
    }

    const changedTargets = targets.filter((target) => {
      const oldPrice = toNumber(target.prix_achat_affiche || target.prix_achat_bon);
      return Math.abs(newPrice - oldPrice) >= 0.0001;
    });

    if (!changedTargets.length) return;

    try {
      for (const target of changedTargets) {
        await updatePrixAchat({
          commandeItemId: target.commande_item_id,
          prixAchat: newPrice,
          updateSnapshot: true,
        }).unwrap();
      }
      showSuccess(
        changedTargets.length > 1
          ? `${changedTargets.length} prix d'achat mis a jour`
          : "Prix d'achat mis a jour"
      );
    } catch (error: any) {
      const message = error?.data?.message || error?.message || "Erreur lors de la mise a jour";
      showError(message);
      setDraftPrices((prev) => {
        const next = { ...prev };
        for (const target of targets) {
          const targetKey = keyForItem(target);
          next[targetKey] = toNumber(target.prix_achat_affiche || target.prix_achat_bon).toFixed(2);
        }
        return next;
      });
    }
  };

  const renderItemRow = (item: PriceSolverItem) => {
    const key = keyForItem(item);
    const hasSnapshot = Boolean(item.product_snapshot_id);
    const selected = selectedIds.has(key);
    const bonNumero = item.bon_numero || `CMD${String(item.bon_commande_id).padStart(2, '0')}`;
    const snapshotDiff =
      item.prix_achat_snapshot != null
        ? Math.abs(toNumber(item.prix_achat_snapshot) - toNumber(item.prix_achat_bon))
        : 0;

    return (
      <tr key={item.commande_item_id} className="border-t border-gray-100 hover:bg-gray-50">
        <td className="min-w-[230px] px-4 py-2 text-sm text-gray-700" title={item.label || bonNumero}>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="font-semibold text-gray-900">{bonNumero}</span>
            <span className="text-gray-400">-</span>
            <span className={hasSnapshot ? 'text-gray-600' : 'text-amber-700'}>
              {hasSnapshot ? `snapshot #${item.product_snapshot_id}` : 'direct'}
            </span>
          </div>
        </td>
        <td className="px-4 py-2 text-sm text-gray-600">{formatDate(item.date_creation)}</td>
        <td className="px-4 py-2 text-sm text-right text-gray-700">{toNumber(item.quantite).toFixed(3)}</td>
        <td className="px-4 py-2 text-sm text-right text-gray-700">{formatMoney(item.prix_achat_bon)}</td>
        <td className="px-4 py-2 text-sm text-right text-gray-700">
          {item.prix_achat_snapshot == null ? '-' : formatMoney(item.prix_achat_snapshot)}
        </td>
        <td className="px-4 py-2 text-sm text-right text-gray-700">
          {item.cout_revient_snapshot == null ? '-' : formatMoney(item.cout_revient_snapshot)}
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center justify-end gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={selected}
              onChange={() => toggleSelected(key)}
              title="Selection multi modification"
            />
            <input
              className={`h-9 w-32 rounded-md border px-2 text-right text-sm outline-none focus:ring-2 ${
                hasSnapshot ? 'border-blue-200 focus:ring-blue-200' : 'border-amber-200 focus:ring-amber-200'
              }`}
              value={draftPrices[key] ?? ''}
              onChange={(event) => handlePriceChange(item, event.target.value)}
              onBlur={() => {
                if (selectedIds.size === 0) saveItem(item);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  if (selectedIds.size === 0) {
                    event.currentTarget.blur();
                  }
                }
              }}
              disabled={isSaving}
              inputMode="decimal"
            />
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => saveItem(item)}
              disabled={isSaving}
              title="Enregistrer"
            >
              <Save size={16} />
            </button>
          </div>
        </td>
        <td className="px-4 py-2 text-sm text-right">
          {snapshotDiff >= threshold && item.prix_achat_snapshot != null ? (
            <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
              <AlertTriangle size={13} />
              {formatMoney(snapshotDiff)}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solver prix achat</h1>
          <p className="mt-1 text-sm text-gray-500">
            Verification des ecarts entre prix d'achat des bons commande et snapshots.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
          disabled={isFetching}
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[220px_1fr]">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase text-gray-500">Difference minimum DH</span>
          <input
            className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-gray-300"
            value={thresholdInput}
            onChange={(event) => setThresholdInput(event.target.value)}
            inputMode="decimal"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase text-gray-500">Recherche</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              className="h-10 w-full rounded-md border border-gray-200 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-gray-300"
              placeholder="Produit, CMD, snapshot..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-sm text-gray-600">
        <span className="rounded bg-white px-3 py-1 shadow-sm">Produits: {filteredGroups.length}</span>
        <span className="rounded bg-white px-3 py-1 shadow-sm">
          Lignes: {filteredGroups.reduce((sum, group) => sum + group.items.length, 0)}
        </span>
        <span className="rounded bg-white px-3 py-1 shadow-sm">Selection: {selectedIds.size}</span>
        {selectedIds.size > 0 && (
          <button
            className="rounded border border-gray-200 bg-white px-3 py-1 text-gray-700 hover:bg-gray-50"
            onClick={() => setSelectedIds(new Set())}
          >
            Vider selection
          </button>
        )}
        <span className="rounded bg-white px-3 py-1 shadow-sm">Seuil: {threshold.toFixed(2)} DH</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          <table className="min-w-[1180px] w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Bon / snapshot</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Qte</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Prix bon</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Prix snapshot</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Cout snapshot</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Changer prix</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Ecart ligne</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && !data ? (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500" colSpan={8}>Chargement...</td>
                </tr>
              ) : filteredGroups.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500" colSpan={8}>
                    Aucun produit avec une difference superieure au seuil.
                  </td>
                </tr>
              ) : (
                filteredGroups.map((group) => (
                  <React.Fragment key={`${group.product_id}:${group.variant_id || 0}`}>
                    <tr className="border-t border-gray-200 bg-slate-100">
                      <td className="px-4 py-3" colSpan={8}>
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              #{group.product_id} - {group.designation}
                              {group.variant_name ? <span className="ml-2 text-gray-500">({group.variant_name})</span> : null}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {group.nb_bons_commande} bons commande, {group.nb_lignes_commande} lignes
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded bg-white px-2 py-1 text-gray-700">Min {formatMoney(group.min_prix_achat)}</span>
                            <span className="rounded bg-white px-2 py-1 text-gray-700">Max {formatMoney(group.max_prix_achat)}</span>
                            <span className="rounded bg-red-50 px-2 py-1 font-semibold text-red-700">
                              Difference {formatMoney(group.difference_prix)}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {group.items.map(renderItemRow)}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SolverPrixAchatPage;
