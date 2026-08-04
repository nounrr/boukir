import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ImageOff,
  Layers3,
  Loader2,
  Package,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  useGetProductsWithSnapshotsQuery,
  useUpdateSalePriceCorrectionsMutation,
} from '../store/api/productsApi';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';
import { toBackendUrl } from '../utils/url';

type Provenance = 'active' | 'latest' | 'base';
type PriceField = 'prix_vente' | 'prix_vente_2';
type BulkMode = 'fixed' | 'percentage';
type PercentageTarget = 'prix_vente' | 'prix_vente_2' | 'both';

interface ProductSnapshotRow {
  id: number | string;
  reference_2?: string | null;
  designation?: string | null;
  variant_id?: number | string | null;
  variant_name?: string | null;
  snapshot_id?: number | string | null;
  snapshot_quantite?: number | string | null;
  snapshot_created_at?: string | null;
  bon_commande_date_creation?: string | null;
  bon_commande_id?: number | string | null;
  snapshot_prix_achat?: number | string | null;
  snapshot_prix_vente?: number | string | null;
  snapshot_prix_vente_2?: number | string | null;
  prix_achat?: number | string | null;
  prix_vente?: number | string | null;
  prix_vente_2?: number | string | null;
  quantite?: number | string | null;
  image_url?: string | null;
}

interface DisplayPriceRow {
  key: string;
  productId: number;
  variantId: number | null;
  variantName: string | null;
  snapshotIds: number[];
  snapshotLabels: number[];
  bonCommandeIds: number[];
  quantity: number;
  purchasePrices: number[];
  prix_vente: number;
  prix_vente_2: number;
  provenance: Provenance;
  mergedCount: number;
  latestDate: string | null;
}

interface ProductGroup {
  id: number;
  reference2: string | null;
  designation: string;
  imageUrl: string | null;
  rows: DisplayPriceRow[];
  totalQuantity: number;
  activeSnapshotCount: number;
  hasLatestFallback: boolean;
  hasBaseRow: boolean;
}

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const quantityFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 3,
});

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const optionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const rowSnapshotId = (row: ProductSnapshotRow) => optionalNumber(row.snapshot_id);
const rowVariantId = (row: ProductSnapshotRow) => optionalNumber(row.variant_id);

const resolvePrice = (row: ProductSnapshotRow, field: PriceField) => {
  const snapshotValue = field === 'prix_vente' ? row.snapshot_prix_vente : row.snapshot_prix_vente_2;
  return roundMoney(toFiniteNumber(snapshotValue ?? row[field], 0));
};

const resolvePurchasePrice = (row: ProductSnapshotRow) =>
  roundMoney(toFiniteNumber(row.snapshot_prix_achat ?? row.prix_achat, 0));

const rowRecencyDate = (row: ProductSnapshotRow) =>
  row.bon_commande_date_creation || row.snapshot_created_at || null;

const newestSnapshotFirst = (a: ProductSnapshotRow, b: ProductSnapshotRow) => {
  const rawDateA = new Date(rowRecencyDate(a) || 0).getTime();
  const rawDateB = new Date(rowRecencyDate(b) || 0).getTime();
  const dateA = Number.isFinite(rawDateA) ? rawDateA : 0;
  const dateB = Number.isFinite(rawDateB) ? rawDateB : 0;
  if (dateA !== dateB) return dateB - dateA;
  return (rowSnapshotId(b) || 0) - (rowSnapshotId(a) || 0);
};

const buildProductGroups = (source: ProductSnapshotRow[]): ProductGroup[] => {
  const grouped = new Map<number, ProductSnapshotRow[]>();

  for (const row of source) {
    const productId = Number(row.id);
    if (!Number.isFinite(productId)) continue;
    const existing = grouped.get(productId) || [];
    existing.push(row);
    grouped.set(productId, existing);
  }

  return [...grouped.entries()]
    .map(([productId, rawRows]) => {
      const first = rawRows[0];
      const snapshots = rawRows.filter((row) => rowSnapshotId(row) !== null);
      const activeSnapshots = snapshots.filter((row) => toFiniteNumber(row.snapshot_quantite, 0) > 0);
      const chosenRows = snapshots.length
        ? activeSnapshots.length
          ? activeSnapshots
          : [snapshots.slice().sort(newestSnapshotFirst)[0]]
        : [first];
      const provenance: Provenance = snapshots.length
        ? activeSnapshots.length
          ? 'active'
          : 'latest'
        : 'base';
      const merged = new Map<string, DisplayPriceRow>();

      for (const row of chosenRows) {
        if (!row) continue;
        const variantId = rowVariantId(row);
        const prixVente = resolvePrice(row, 'prix_vente');
        const prixVente2 = resolvePrice(row, 'prix_vente_2');
        const mergeKey = `${variantId ?? 'base'}|${prixVente.toFixed(2)}|${prixVente2.toFixed(2)}`;
        const snapshotId = rowSnapshotId(row);
        const bonId = optionalNumber(row.bon_commande_id);
        const purchasePrice = resolvePurchasePrice(row);
        const quantity = toFiniteNumber(row.snapshot_quantite ?? row.quantite, 0);
        const current = merged.get(mergeKey);

        if (current) {
          if (snapshotId !== null) {
            current.snapshotIds.push(snapshotId);
            current.snapshotLabels.push(snapshotId);
          }
          if (bonId !== null && !current.bonCommandeIds.includes(bonId)) current.bonCommandeIds.push(bonId);
          if (!current.purchasePrices.includes(purchasePrice)) current.purchasePrices.push(purchasePrice);
          current.quantity += quantity;
          current.mergedCount += 1;
          if (newestSnapshotFirst(row, { bon_commande_date_creation: current.latestDate, snapshot_id: Math.max(...current.snapshotIds, 0), id: productId }) < 0) {
            current.latestDate = rowRecencyDate(row) || current.latestDate;
          }
          continue;
        }

        merged.set(mergeKey, {
          key: '',
          productId,
          variantId,
          variantName: row.variant_name ? String(row.variant_name) : null,
          snapshotIds: snapshotId === null ? [] : [snapshotId],
          snapshotLabels: snapshotId === null ? [] : [snapshotId],
          bonCommandeIds: bonId === null ? [] : [bonId],
          quantity,
          purchasePrices: [purchasePrice],
          prix_vente: prixVente,
          prix_vente_2: prixVente2,
          provenance,
          mergedCount: 1,
          latestDate: rowRecencyDate(row),
        });
      }

      const rows = [...merged.values()].map((row) => ({
        ...row,
        snapshotIds: row.snapshotIds.sort((a, b) => a - b),
        snapshotLabels: row.snapshotLabels.sort((a, b) => a - b),
        purchasePrices: row.purchasePrices.sort((a, b) => a - b),
        key: `${productId}:${row.variantId ?? 'base'}:${row.snapshotIds.length ? row.snapshotIds.join('.') : 'product'}`,
      }));

      rows.sort((a, b) => {
        const variantCompare = String(a.variantName || '').localeCompare(String(b.variantName || ''), 'fr');
        if (variantCompare) return variantCompare;
        return a.prix_vente - b.prix_vente;
      });

      return {
        id: productId,
        reference2: first?.reference_2 ? String(first.reference_2) : null,
        designation: String(first?.designation || 'Produit sans désignation'),
        imageUrl: first?.image_url ? String(first.image_url) : null,
        rows,
        totalQuantity: rows.reduce((total, row) => total + row.quantity, 0),
        activeSnapshotCount: activeSnapshots.length,
        hasLatestFallback: provenance === 'latest',
        hasBaseRow: provenance === 'base',
      };
    })
    .sort((a, b) => b.id - a.id);
};

const getErrorMessage = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return 'Une erreur inattendue est survenue.';
  const candidate = error as { data?: { message?: string }; message?: string };
  return candidate.data?.message || candidate.message || 'Une erreur inattendue est survenue.';
};

const provenanceBadge: Record<Provenance, { label: string; className: string; dotClassName: string }> = {
  active: {
    label: 'Snapshot actif',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dotClassName: 'bg-emerald-500',
  },
  latest: {
    label: 'Dernier snapshot',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    dotClassName: 'bg-amber-500',
  },
  base: {
    label: 'Prix produit',
    className: 'border-gray-200 bg-gray-50 text-gray-700',
    dotClassName: 'bg-gray-400',
  },
};

const InlinePrice: React.FC<{
  value: number;
  label: string;
  disabled: boolean;
  saving: boolean;
  onSave: (value: number) => Promise<boolean>;
}> = ({ value, label, disabled, saving, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.toFixed(2));
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!editing) setDraft(value.toFixed(2));
  }, [editing, value]);

  const cancel = () => {
    if (saving) return;
    setDraft(value.toFixed(2));
    setValidationError('');
    setEditing(false);
  };

  const commit = async () => {
    const parsed = Number(String(draft).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setValidationError('Prix invalide');
      return;
    }
    const rounded = roundMoney(parsed);
    if (rounded === value) {
      cancel();
      return;
    }
    const saved = await onSave(rounded);
    if (saved) {
      setValidationError('');
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setDraft(value.toFixed(2));
            setEditing(true);
          }
        }}
        className="group inline-flex h-9 min-w-[124px] items-center justify-end gap-1.5 rounded-md border border-transparent px-2 text-right text-sm font-semibold tabular-nums text-gray-900 transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        title={`Cliquez pour modifier ${label}`}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-600" /> : null}
        <span>{moneyFormatter.format(value)}</span>
        <span className="text-xs font-normal text-gray-400">DH</span>
        <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-300 opacity-0 transition group-hover:text-emerald-600 group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="inline-block text-left">
      <div className="flex items-center overflow-hidden rounded-md border border-emerald-500 bg-white shadow-sm ring-2 ring-emerald-100">
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={saving}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setDraft(event.target.value);
            setValidationError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            } else if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            }
          }}
          className="h-9 w-24 border-0 bg-transparent px-2 text-right text-sm font-semibold tabular-nums text-gray-900 outline-none focus:ring-0"
          aria-label={label}
        />
        <button
          type="button"
          disabled={saving}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void commit()}
          className="flex h-9 w-9 shrink-0 items-center justify-center border-l border-emerald-100 text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 disabled:opacity-50"
          aria-label={`Confirmer ${label}`}
          title="Enregistrer (Entrée)"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          type="button"
          disabled={saving}
          onMouseDown={(event) => event.preventDefault()}
          onClick={cancel}
          className="flex h-9 w-9 shrink-0 items-center justify-center border-l border-gray-100 text-gray-400 transition hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400 disabled:opacity-50"
          aria-label={`Annuler ${label}`}
          title="Annuler (Échap)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {validationError ? (
        <p className="mt-1 text-right text-xs font-medium text-red-600">{validationError}</p>
      ) : null}
    </div>
  );
};

const SalePriceCorrectionsPage: React.FC = () => {
  const { data = [], isLoading, isFetching, isError, error, refetch } = useGetProductsWithSnapshotsQuery();
  const [updateSalePrices, { isLoading: isSaving }] = useUpdateSalePriceCorrectionsMutation();
  const [search, setSearch] = useState('');
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());
  const initializedProductIds = useRef(new Set<number>());
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState<BulkMode>('fixed');
  const [fixedPrice1, setFixedPrice1] = useState('');
  const [fixedPrice2, setFixedPrice2] = useState('');
  const [percentage, setPercentage] = useState('');
  const [percentageTarget, setPercentageTarget] = useState<PercentageTarget>('both');
  const selectAllRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(
    () => buildProductGroups(Array.isArray(data) ? (data as ProductSnapshotRow[]) : []),
    [data],
  );

  useEffect(() => {
    setExpandedProducts((previous) => {
      const next = new Set(previous);
      for (const group of groups) {
        if (!initializedProductIds.current.has(group.id)) {
          initializedProductIds.current.add(group.id);
          if (group.rows.length > 1) next.add(group.id);
        }
      }
      return next;
    });
  }, [groups]);

  const filteredGroups = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('fr');
    if (!normalized) return groups;

    return groups
      .map((group) => {
        const parentMatches = [group.id, group.reference2, group.designation]
          .some((value) => String(value ?? '').toLocaleLowerCase('fr').includes(normalized));
        if (parentMatches) return group;

        const rows = group.rows.filter((row) => [
          row.variantName,
          ...row.snapshotLabels,
          ...row.bonCommandeIds,
        ].some((value) => String(value ?? '').toLocaleLowerCase('fr').includes(normalized)));
        return rows.length ? { ...group, rows } : null;
      })
      .filter((group): group is ProductGroup => group !== null);
  }, [groups, search]);

  const allRowsByKey = useMemo(() => {
    const map = new Map<string, DisplayPriceRow>();
    for (const group of groups) {
      for (const row of group.rows) map.set(row.key, row);
    }
    return map;
  }, [groups]);

  const visibleRows = useMemo(
    () => filteredGroups.flatMap((group) => expandedProducts.has(group.id) ? group.rows : []),
    [expandedProducts, filteredGroups],
  );
  const selectedRows = useMemo(
    () => [...selectedRowKeys].map((key) => allRowsByKey.get(key)).filter((row): row is DisplayPriceRow => Boolean(row)),
    [allRowsByKey, selectedRowKeys],
  );
  const visibleSelectedCount = visibleRows.filter((row) => selectedRowKeys.has(row.key)).length;
  const allVisibleSelected = visibleRows.length > 0 && visibleSelectedCount === visibleRows.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected;
    }
  }, [allVisibleSelected, visibleSelectedCount]);

  const hasSelection = selectedRows.length > 0;

  const toggleGroup = (groupId: number) => {
    setExpandedProducts((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleRowSelection = (key: string) => {
    setSelectedRowKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedRowKeys((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) visibleRows.forEach((row) => next.delete(row.key));
      else visibleRows.forEach((row) => next.add(row.key));
      return next;
    });
  };

  const saveInline = async (row: DisplayPriceRow, field: PriceField, value: number) => {
    const operationKey = `${row.key}:${field}`;
    setSavingKey(operationKey);
    try {
      await updateSalePrices({
        corrections: [{
          product_id: row.productId,
          snapshot_ids: row.snapshotIds,
          prix_vente: field === 'prix_vente' ? value : row.prix_vente,
          prix_vente_2: field === 'prix_vente_2' ? value : row.prix_vente_2,
        }],
      }).unwrap();
      showSuccess('Prix de vente mis à jour');
      await refetch();
      return true;
    } catch (saveError) {
      showError(getErrorMessage(saveError), 'Échec de la mise à jour');
      return false;
    } finally {
      setSavingKey(null);
    }
  };

  const parsedFixedPrice1 = fixedPrice1.trim() === '' ? null : Number(fixedPrice1.replace(',', '.'));
  const parsedFixedPrice2 = fixedPrice2.trim() === '' ? null : Number(fixedPrice2.replace(',', '.'));
  const parsedPercentage = percentage.trim() === '' ? null : Number(percentage.replace(',', '.'));
  const fixedValuesAreValid =
    (parsedFixedPrice1 !== null || parsedFixedPrice2 !== null) &&
    (parsedFixedPrice1 === null || (Number.isFinite(parsedFixedPrice1) && parsedFixedPrice1 >= 0)) &&
    (parsedFixedPrice2 === null || (Number.isFinite(parsedFixedPrice2) && parsedFixedPrice2 >= 0));
  const percentageIsValid = parsedPercentage !== null && Number.isFinite(parsedPercentage) && parsedPercentage >= -100;
  const bulkOperationIsValid = selectedRows.length > 0 && (bulkMode === 'fixed' ? fixedValuesAreValid : percentageIsValid);

  const bulkSummary = useMemo(() => {
    if (!selectedRows.length) return 'Sélectionnez au moins une ligne de prix.';
    if (bulkMode === 'fixed') {
      const changes = [
        parsedFixedPrice1 !== null && Number.isFinite(parsedFixedPrice1) ? `Prix 1 → ${moneyFormatter.format(parsedFixedPrice1)} DH` : '',
        parsedFixedPrice2 !== null && Number.isFinite(parsedFixedPrice2) ? `Prix 2 → ${moneyFormatter.format(parsedFixedPrice2)} DH` : '',
      ].filter(Boolean).join(' · ');
      return changes ? `${selectedRows.length} ligne(s) · ${changes}` : 'Saisissez au moins un prix.';
    }

    const target = percentageTarget === 'both' ? 'les deux prix' : percentageTarget === 'prix_vente' ? 'Prix 1' : 'Prix 2';
    return parsedPercentage === null || !Number.isFinite(parsedPercentage)
      ? 'Saisissez un pourcentage signé.'
      : `${selectedRows.length} ligne(s) · ${parsedPercentage > 0 ? '+' : ''}${parsedPercentage}% sur ${target}`;
  }, [bulkMode, parsedFixedPrice1, parsedFixedPrice2, parsedPercentage, percentageTarget, selectedRows.length]);

  const applyBulkChange = async () => {
    if (!bulkOperationIsValid) return;
    const confirmation = await showConfirmation(
      `${bulkSummary}. Les prix seront arrondis à 2 décimales.`,
      'Confirmer la correction en masse',
      'Appliquer',
      'Annuler',
    );
    if (!confirmation.isConfirmed) return;

    const corrections = selectedRows.map((row) => {
      let prixVente = row.prix_vente;
      let prixVente2 = row.prix_vente_2;

      if (bulkMode === 'fixed') {
        if (parsedFixedPrice1 !== null) prixVente = roundMoney(parsedFixedPrice1);
        if (parsedFixedPrice2 !== null) prixVente2 = roundMoney(parsedFixedPrice2);
      } else if (parsedPercentage !== null) {
        const multiplier = 1 + parsedPercentage / 100;
        if (percentageTarget !== 'prix_vente_2') prixVente = roundMoney(prixVente * multiplier);
        if (percentageTarget !== 'prix_vente') prixVente2 = roundMoney(prixVente2 * multiplier);
      }

      return {
        product_id: row.productId,
        snapshot_ids: row.snapshotIds,
        prix_vente: prixVente,
        prix_vente_2: prixVente2,
      };
    });

    if (corrections.some((correction) => correction.prix_vente < 0 || correction.prix_vente_2 < 0)) {
      showError('La modification produirait un prix négatif.');
      return;
    }

    try {
      const result = await updateSalePrices({ corrections }).unwrap();
      const snapshotCount = Number(result.updatedSnapshots || 0);
      showSuccess(`${corrections.length} ligne(s) corrigée(s), ${snapshotCount} snapshot(s) mis à jour`);
      setSelectedRowKeys(new Set());
      setFixedPrice1('');
      setFixedPrice2('');
      setPercentage('');
      await refetch();
    } catch (saveError) {
      showError(getErrorMessage(saveError), 'Échec de la correction en masse');
    }
  };

  const totalDisplayedRows = filteredGroups.reduce((total, group) => total + group.rows.length, 0);
  const totalActiveSnapshots = groups.reduce((total, group) => total + group.activeSnapshotCount, 0);

  return (
    <div className="space-y-4 p-4 text-gray-900 sm:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 sm:inline-flex">
            <CircleDollarSign className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Correction des prix de vente</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              Contrôlez les prix actifs par snapshot et corrigez-les sans quitter le catalogue.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-md bg-white px-3 py-2 text-center ring-1 ring-gray-200">
            <span className="block text-lg font-bold leading-tight tabular-nums text-gray-900">{groups.length}</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Produits</span>
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-center ring-1 ring-gray-200">
            <span className="block text-lg font-bold leading-tight tabular-nums text-emerald-700">{totalActiveSnapshots}</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Snapshots actifs</span>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching || isSaving}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-300 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </header>

      <section className="rounded-md bg-white p-3 shadow-sm ring-1 ring-gray-200" aria-label="Recherche et légende">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ID, référence, désignation, variante ou snapshot…"
              className="h-10 w-full rounded-md border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
            {(['active', 'latest', 'base'] as Provenance[]).map((provenance) => (
              <span key={provenance} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${provenanceBadge[provenance].dotClassName}`} />
                <span className="font-medium text-gray-700">{provenanceBadge[provenance].label}</span>
                <span className="text-gray-400">
                  {provenance === 'active' ? 'Qté > 0' : provenance === 'latest' ? 'stock épuisé' : 'sans snapshot'}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Cliquez sur un prix pour le modifier · <kbd className="rounded border border-gray-300 bg-gray-50 px-1 font-sans">Entrée</kbd> pour valider
          </span>
          <span className="tabular-nums">{filteredGroups.length} produit(s) · {totalDisplayedRows} ligne(s) de prix</span>
        </div>
      </section>

      <section
        className={`sticky top-0 z-20 rounded-md shadow-sm ring-1 transition-colors ${
          hasSelection ? 'bg-emerald-50/80 ring-emerald-300 backdrop-blur' : 'bg-white ring-gray-200'
        }`}
        aria-label="Modification en masse"
      >
        {!hasSelection ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm text-gray-600">
            <CheckSquare className="h-4 w-4 shrink-0 text-gray-400" />
            <span>
              Cochez des lignes de prix pour activer la <strong className="font-semibold text-gray-800">modification en masse</strong>.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">
                <CheckSquare className="h-3.5 w-3.5" />
                {selectedRows.length} ligne(s) sélectionnée(s)
              </span>
              <button
                type="button"
                onClick={() => setSelectedRowKeys(new Set())}
                disabled={isSaving}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-white hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Vider la sélection
              </button>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
              <div
                className="inline-flex w-fit shrink-0 rounded-md bg-white p-0.5 ring-1 ring-gray-300"
                role="group"
                aria-label="Mode de modification"
              >
                {(['fixed', 'percentage'] as BulkMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setBulkMode(mode)}
                    className={`h-9 rounded px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      bulkMode === mode ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {mode === 'fixed' ? 'Valeur fixe' : 'Pourcentage'}
                  </button>
                ))}
              </div>

              {bulkMode === 'fixed' ? (
                <div className="flex flex-wrap gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Prix vente 1</span>
                    <div className="flex h-9 items-center overflow-hidden rounded-md border border-gray-300 bg-white focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fixedPrice1}
                        onChange={(event) => setFixedPrice1(event.target.value)}
                        placeholder="Inchangé"
                        className="w-28 border-0 px-2 text-right text-sm tabular-nums outline-none focus:ring-0"
                      />
                      <span className="border-l border-gray-200 px-2 text-xs font-medium text-gray-500">DH</span>
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Prix vente 2</span>
                    <div className="flex h-9 items-center overflow-hidden rounded-md border border-gray-300 bg-white focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fixedPrice2}
                        onChange={(event) => setFixedPrice2(event.target.value)}
                        placeholder="Inchangé"
                        className="w-28 border-0 px-2 text-right text-sm tabular-nums outline-none focus:ring-0"
                      />
                      <span className="border-l border-gray-200 px-2 text-xs font-medium text-gray-500">DH</span>
                    </div>
                  </label>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Variation signée</span>
                    <div className="flex h-9 items-center overflow-hidden rounded-md border border-gray-300 bg-white focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={percentage}
                        onChange={(event) => setPercentage(event.target.value)}
                        placeholder="ex. 10 ou -5"
                        className="w-28 border-0 px-2 text-right text-sm tabular-nums outline-none focus:ring-0"
                      />
                      <span className="border-l border-gray-200 px-2 text-xs font-medium text-gray-500">%</span>
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Appliquer à</span>
                    <select
                      value={percentageTarget}
                      onChange={(event) => setPercentageTarget(event.target.value as PercentageTarget)}
                      className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="both">Prix 1 et Prix 2</option>
                      <option value="prix_vente">Prix 1</option>
                      <option value="prix_vente_2">Prix 2</option>
                    </select>
                  </label>
                </div>
              )}

              <p className="min-w-0 flex-1 rounded-md bg-white px-3 py-2 text-xs leading-relaxed text-gray-600 ring-1 ring-gray-200">
                <span className="font-semibold text-gray-800">Résumé : </span>
                {bulkSummary}
              </p>

              <button
                type="button"
                onClick={() => void applyBulkChange()}
                disabled={!bulkOperationIsValid || isSaving}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Appliquer
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-gray-200" aria-label="Table des prix de vente">
        <div className="max-h-[calc(100vh-330px)] min-h-[320px] overflow-auto">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-gray-600 shadow-[inset_0_-1px_0_0_rgb(229,231,235)]">
              <tr>
                <th className="w-11 px-3 py-3 text-center">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    disabled={!visibleRows.length || isSaving}
                    onChange={toggleSelectAllVisible}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
                    aria-label="Sélectionner toutes les lignes visibles"
                    title="Sélectionner toutes les lignes visibles"
                  />
                </th>
                <th className="min-w-[330px] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide">Produit / snapshot</th>
                <th className="min-w-[180px] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide">Provenance</th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide">Quantité</th>
                <th className="min-w-[160px] px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide">Prix achat</th>
                <th className="min-w-[150px] px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide">Prix vente 1</th>
                <th className="min-w-[150px] px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide">Prix vente 2</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="h-72 text-center">
                    <div className="inline-flex flex-col items-center gap-3 text-gray-500">
                      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                      <span className="text-sm font-medium">Chargement des prix et snapshots…</span>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="h-72 text-center">
                    <div className="mx-auto max-w-md px-6">
                      <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                        <AlertCircle className="h-6 w-6" />
                      </span>
                      <p className="font-semibold text-gray-900">Impossible de charger les prix</p>
                      <p className="mt-1 text-sm text-gray-600">{getErrorMessage(error)}</p>
                      <button
                        type="button"
                        onClick={() => void refetch()}
                        className="mt-4 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-300 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Réessayer
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="h-72 text-center">
                    <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-400">
                      <Package className="h-6 w-6" />
                    </span>
                    <p className="font-semibold text-gray-900">Aucun produit trouvé</p>
                    <p className="mt-1 text-sm text-gray-500">Essayez un autre ID, nom, variante ou numéro de snapshot.</p>
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="mt-4 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-300 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <X className="h-4 w-4" />
                        Effacer la recherche
                      </button>
                    ) : null}
                  </td>
                </tr>
              ) : (
                filteredGroups.map((group) => {
                  const isExpanded = expandedProducts.has(group.id);
                  const variants = [...new Set(group.rows.map((row) => row.variantName).filter(Boolean))];
                  return (
                    <React.Fragment key={group.id}>
                      <tr
                        className={`cursor-pointer border-t border-gray-200 transition-colors ${
                          isExpanded ? 'bg-gray-100' : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                        onClick={() => toggleGroup(group.id)}
                      >
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500"
                            aria-hidden="true"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </span>
                        </td>
                        <td className="px-3 py-2.5" colSpan={2}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleGroup(group.id);
                            }}
                            className="flex w-full items-center gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? `Replier ${group.designation}` : `Déplier ${group.designation}`}
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white text-gray-300 ring-1 ring-gray-200">
                              {group.imageUrl ? (
                                <img
                                  src={toBackendUrl(group.imageUrl)}
                                  alt=""
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                  onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                />
                              ) : <ImageOff className="h-4 w-4" />}
                            </span>
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-semibold text-gray-900">{group.designation}</span>
                                <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-500 ring-1 ring-gray-200">#{group.id}</span>
                                {group.reference2 ? (
                                  <span className="font-mono text-[11px] text-gray-400">{group.reference2}</span>
                                ) : null}
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                {group.activeSnapshotCount ? (
                                  <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">{group.activeSnapshotCount} actif(s)</span>
                                ) : null}
                                {group.rows.length > 1 ? (
                                  <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">{group.rows.length} prix distincts</span>
                                ) : null}
                                {group.hasLatestFallback ? (
                                  <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">dernier épuisé</span>
                                ) : null}
                                {group.hasBaseRow ? (
                                  <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-semibold text-gray-500">sans snapshot</span>
                                ) : null}
                                {variants.map((variant) => (
                                  <span key={variant} className="text-gray-500">{variant}</span>
                                ))}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-700">
                          {quantityFormatter.format(group.totalQuantity)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-gray-400" colSpan={3}>
                          {isExpanded ? 'Replier' : `${group.rows.length} ligne(s) de prix`}
                        </td>
                      </tr>

                      {isExpanded ? group.rows.map((row) => {
                        const badge = provenanceBadge[row.provenance];
                        const selected = selectedRowKeys.has(row.key);
                        return (
                          <tr
                            key={row.key}
                            className={`border-t border-gray-100 transition-colors ${
                              selected ? 'bg-emerald-50/70' : 'bg-white hover:bg-gray-50/80'
                            }`}
                          >
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={isSaving}
                                onChange={() => toggleRowSelection(row.key)}
                                className="h-4 w-4 cursor-pointer rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
                                aria-label={`Sélectionner la ligne du produit ${group.id}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-start gap-2 border-l-2 border-gray-200 pl-3">
                                <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-800">
                                    {row.variantName ? (
                                      <span className="text-gray-900">{row.variantName} · </span>
                                    ) : null}
                                    {row.snapshotLabels.length
                                      ? row.snapshotLabels.map((id) => `#${id}`).join(', ')
                                      : 'Prix original du produit'}
                                  </p>
                                  <p className="mt-0.5 text-xs text-gray-500">
                                    {row.bonCommandeIds.length ? `Bon(s) ${row.bonCommandeIds.map((id) => `#${id}`).join(', ')}` : 'Table products'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClassName}`} />
                                  {badge.label}
                                </span>
                                {row.mergedCount > 1 ? (
                                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{row.mergedCount} fusionnés</span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-medium tabular-nums text-gray-700">
                              {quantityFormatter.format(row.quantity)}
                            </td>
                            <td className="px-3 py-2 text-right text-sm tabular-nums text-gray-600">
                              {row.purchasePrices.length === 1 ? (
                                <span>
                                  {moneyFormatter.format(row.purchasePrices[0])}
                                  <span className="ml-1 text-xs text-gray-400">DH</span>
                                </span>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5">
                                  {row.purchasePrices.map((price) => (
                                    <span key={price} className="text-xs font-medium text-amber-700">
                                      {moneyFormatter.format(price)}
                                      <span className="ml-1 text-gray-400">DH</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <InlinePrice
                                value={row.prix_vente}
                                label={`Prix vente 1 du produit ${group.id}`}
                                disabled={isSaving}
                                saving={savingKey === `${row.key}:prix_vente`}
                                onSave={(value) => saveInline(row, 'prix_vente', value)}
                              />
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <InlinePrice
                                value={row.prix_vente_2}
                                label={`Prix vente 2 du produit ${group.id}`}
                                disabled={isSaving}
                                saving={savingKey === `${row.key}:prix_vente_2`}
                                onSave={(value) => saveInline(row, 'prix_vente_2', value)}
                              />
                            </td>
                          </tr>
                        );
                      }) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default SalePriceCorrectionsPage;
