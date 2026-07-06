import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Search, Users, Phone, Mail, MapPin, Building2,
  ChevronLeft, ChevronRight, ChevronsUpDown, ArrowUp, ArrowDown,
  FileText, CreditCard, RotateCcw, Calendar, Hash, ArrowLeft, Plus,
  Package, Printer, GripVertical, ChevronDown, ChevronUp, Edit, Trash2,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { useGetClientsQuery, useGetContactHistoryQuery, useGetContactQuery, useDeleteContactMutation, useUpdateContactMutation } from '../store/api/contactsApi';
import { useGetProductsQuery } from '../store/api/productsApi';
import type { ContactsSortBy, SortDirection } from '../store/api/contactsApi';
import type { Contact } from '../types';
import ContactPrintModal from '../components/ContactPrintModal';
import ContactFormModal from '../components/ContactFormModal';
import { useReorderPaymentsMutation } from '../store/api/paymentsApi';
import { useRemiseEditor, type RemiseEligibleItem } from '../hooks/useRemiseEditor';
import RemiseEditorBar from '../components/RemiseEditorBar';
import { useGetUiSettingsQuery } from '../store/api/uiSettingsApi';
import { getUiBadgeStyle, getUiDraggableRowStyle, getUiLineConfig, getUiRowStyle } from '../utils/uiSettings';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { printContactList } from '../utils/contactListPrint';

const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100, 0];

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(isNaN(v) ? 0 : v) + ' MAD';

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const parseFilterDateStart = (value: string) => new Date(`${value}T00:00:00`).getTime();
const parseFilterDateEnd = (value: string) => new Date(`${value}T23:59:59.999`).getTime();

const getSnapshotLabel = (item: any) => {
  const snapshotId = item?.product_snapshot_id;
  return snapshotId != null && snapshotId !== '' ? `SNAP-${snapshotId}` : '';
};

const getDisplayReference = (item: any) => {
  const baseRef = item?.reference ?? item?.product_reference ?? 'â€”';
  const snapshotLabel = getSnapshotLabel(item);
  return snapshotLabel ? `${baseRef} / ${snapshotLabel}` : baseRef;
};

const STATUT_COLORS: Record<string, string> = {
  Validé: 'bg-green-100 text-green-700',
  Livré: 'bg-blue-100 text-blue-700',
  Payé: 'bg-emerald-100 text-emerald-700',
  Annulé: 'bg-red-100 text-red-700',
  Avoir: 'bg-orange-100 text-orange-700',
  Appliqué: 'bg-purple-100 text-purple-700',
  'En attente': 'bg-yellow-100 text-yellow-700',
};
const statutColor = (s: string) => STATUT_COLORS[s] ?? 'bg-gray-100 text-gray-600';
const mouvementCellClass = (value: number) =>
  value > 0
    ? 'mouvement-cell mouvement-positive bg-green-50/60'
    : value < 0
      ? 'mouvement-cell mouvement-negative bg-red-50/60'
      : 'mouvement-cell mouvement-zero';

const MODE_COLORS: Record<string, string> = {
  Espèces: 'bg-green-100 text-green-700',
  Chèque: 'bg-blue-100 text-blue-700',
  Traite: 'bg-purple-100 text-purple-700',
  Virement: 'bg-indigo-100 text-indigo-700',
  Remise: 'bg-orange-100 text-orange-700',
};
const modeColor = (m: string) => MODE_COLORS[m] ?? 'bg-gray-100 text-gray-600';

const EXCLUDED = new Set(['Annulé', 'Annule', 'Supprimé', 'Supprime', 'Brouillon', 'Refusé', 'Refuse', 'Expiré', 'Expire']);
const isExcludedStatus = (value: any): boolean => {
  const status = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    status.startsWith('annul') ||
    status.startsWith('supprim') ||
    status === 'brouillon' ||
    status.startsWith('refus') ||
    status.startsWith('expir')
  );
};

// ─── Empty state ─────────────────────────────────────────────────────────────

const Empty: React.FC<{ icon: React.ReactElement<{ className?: string }>; label: string }> = ({ icon, label }) => (
  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
      {React.cloneElement<{ className?: string }>(icon, { className: 'w-6 h-6 text-gray-300' })}
    </div>
    <p className="text-sm">{label}</p>
  </div>
);

// ─── BonRows : lignes produits à plat en mode détail ──────────────────────────

interface BonTableProps {
  bons: any[];
  detail: boolean;
  products?: any[];
  prefix: string;       // SOR / COM / AVC
  accentClass: string;  // text-blue-700 / text-sky-700 / text-orange-700
  hoverClass: string;   // hover:bg-blue-50 / hover:bg-orange-50
  itemBorderClass?: string; // border-l-4 color for item rows
}

type GroupedDisplayItem = {
  item: any;
  sourceItems: any[];
  sourceIndices: number[];
};

const groupDisplayItems = (items: any[]): GroupedDisplayItem[] => {
  const groups = new Map<string, GroupedDisplayItem>();
  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx];
    const key = [
      item?.product_id ?? item?.produit_id ?? '',
      item?.reference ?? item?.product_reference ?? '',
      item?.designation ?? item?.product_designation ?? '',
      item?.variant_id ?? '',
      item?.unit_id ?? '',
      Number(item?.prix_unitaire ?? 0),
      Number(item?.remise_pourcentage ?? 0),
      Number(item?.remise_montant ?? 0),
    ].join('|');
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        item: { ...item },
        sourceItems: [item],
        sourceIndices: [idx],
      });
      continue;
    }
    existing.sourceItems.push(item);
    existing.sourceIndices.push(idx);
    existing.item.quantite = Number(existing.item.quantite ?? 0) + Number(item?.quantite ?? 0);
    existing.item.total = Number(existing.item.total ?? 0) + Number(item?.total ?? ((Number(item?.quantite ?? 0) || 0) * (Number(item?.prix_unitaire ?? 0) || 0)));
  }
  return Array.from(groups.values());
};

const BonTable: React.FC<BonTableProps> = ({ bons, detail, products = [], prefix, accentClass, hoverClass, itemBorderClass = 'border-blue-200' }) => {
  const { data: uiSettings } = useGetUiSettingsQuery();
  const styleKeyByPrefix: Record<string, string> = {
    SOR: 'bon_sortie',
    COM: 'bon_comptant',
    CPT: 'bon_comptant',
    AVC: 'bon_avoir_client',
  };
  const styleConfig = getUiLineConfig(uiSettings, styleKeyByPrefix[prefix] ?? '');
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
        <tr>
          <th className="text-left px-4 py-3 font-semibold text-gray-600">N°</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600">Référence</th>}
          {detail && <th className="text-left px-4 py-3 font-semibold text-gray-600">Désignation</th>}
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600">Variant</th>}
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600">Unité</th>}
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Adr. Livraison</th>}
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Code Règl.</th>}
          {detail && <th className="text-center px-3 py-3 font-semibold text-gray-600">Qté</th>}
          {detail && <th className="text-right px-3 py-3 font-semibold text-gray-600">Prix unit.</th>}
          <th className="text-right px-4 py-3 font-semibold text-gray-600">{detail ? 'Total ligne' : 'Montant'}</th>
          {detail && <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Mouvement</th>}
          <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {bons.map(b => {
          const items: any[] = Array.isArray(b.items) ? b.items.filter((i: any) => i && i.id) : [];
          const bonNum = b.numero ?? `${prefix}${String(b.id).padStart(2, '0')}`;

          if (!detail) {
            return (
              <tr key={b.id} className={`${hoverClass} transition-colors`} style={getUiRowStyle(styleConfig)}>
                <td className={`px-4 py-3 font-mono font-medium ${accentClass}`}>{bonNum}</td>
                <td className="px-4 py-3 text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />{fmtDate(b.date_creation)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(getBonTableTotal(prefix, b))}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                </td>
              </tr>
            );
          }

          // Mode détail : chaque item = une ligne plate (pas d'en-tête bon)
          if (items.length === 0) {
            return (
              <tr key={b.id} className={`${hoverClass} transition-colors`} style={getUiRowStyle(styleConfig)}>
                <td className={`px-4 py-2.5 font-mono font-medium ${accentClass}`}>{bonNum}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400" />{fmtDate(b.date_creation)}</span>
                </td>
                <td className="px-3 py-2.5 text-gray-400 text-xs italic" colSpan={8}>—</td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt(getBonTableTotal(prefix, b))}</td>
                {detail && <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>}
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                </td>
              </tr>
            );
          }

          return (
            <React.Fragment key={b.id}>
              {groupDisplayItems(items).map(({ item, sourceItems, sourceIndices }, groupIdx: number, groups) => {
                const qte = Number(item.quantite ?? 0);
                const pu = Number(item.prix_unitaire ?? 0);
                const total = Number(item.total ?? (qte * pu)) + (groupIdx === groups.length - 1 && (prefix === 'COM' || prefix === 'CPT') ? safeNum(b.montant_ignorer ?? 0) : 0);
                const benefice = sourceItems.reduce((sum, src) => sum + (computeHistoryItemBenefice(src, products) ?? 0), 0);
                const variantLabel = getHistoryVariantLabel(item, products);
                const unitLabel = getHistoryUnitLabel(item, products);
                
                return (
                  <tr key={`${b.id}-item-group-${sourceIndices.join('-')}`} className={`bg-gray-50/60 border-l-4 ${itemBorderClass} ${hoverClass}/40 hover:bg-opacity-40 transition-colors`} style={getUiRowStyle(styleConfig)}>
                    <td className={`px-4 py-2 font-mono text-xs font-semibold ${accentClass}`}>{bonNum}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{fmtDate(b.date_creation)}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 font-mono whitespace-nowrap">
                      {item.reference ?? item.product_reference ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-800 font-medium">
                          {item.designation ?? item.product_designation ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{variantLabel}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{unitLabel}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-[120px] truncate" title={b.adresse_livraison ?? ''}>
                      {b.adresse_livraison ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 font-mono whitespace-nowrap">
                      {groupIdx === 0 ? (b.code_reglement ?? <span className="text-gray-300">—</span>) : null}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-semibold text-gray-700">{qte}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600">{fmt(pu)}</td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-gray-900">{fmt(total)}</td>
                    <td className={`px-3 py-2 text-right text-xs ${mouvementCellClass(benefice)}`}>
                      {benefice != null
                        ? <span className="font-semibold">{fmt(benefice)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      {groupIdx === 0 ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                        : null}
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          );
        })}
      </tbody>
      {!detail && <tfoot className="bg-gray-50 border-t-2 border-gray-200">
        <tr className="divide-x divide-gray-200">
          <td colSpan={detail ? 8 : 2} className="px-4 py-2.5 text-right font-bold text-gray-600">Total</td>
          {detail && <td className="px-3 py-2.5 text-center font-bold text-blue-700 bg-blue-50/20">
            {bons.reduce((s, b) => s + (Array.isArray(b.items) ? b.items.reduce((is: number, i: any) => is + Number(i.quantite || 0), 0) : 0), 0)}
          </td>}
          {detail && <td className="bg-gray-100/10" />} {/* Prix unit */}
          <td className="px-4 py-2.5 text-right font-bold text-gray-900 bg-gray-100/30">
            {fmt(bons.reduce((s: number, b: any) => s + getBonTableTotal(prefix, b), 0))}
          </td>
          {detail && <td className="px-3 py-2.5 text-right font-bold text-emerald-700 bg-emerald-50/20">
             {fmt(bons.reduce((s, b) => s + (Array.isArray(b.items) ? b.items.reduce((is: number, i: any) => is + (computeHistoryItemBenefice(i, products) ?? 0), 0) : 0), 0))}
          </td>}
          <td className="bg-gray-100/10" />
        </tr>
      </tfoot>}
    </table>
  );
};

// ─── Solde cumulé client ──────────────────────────────────────────────────────
// Convention Client (miroir de calculateContactSoldeHistory / soldeCalculator.ts) :
//   solde initial  → base de départ
//   sortie/comptant → débit  (+)  le client nous doit plus
//   avoir           → crédit (-)  on lui restitue
//   paiement        → crédit (-)  il règle sa dette

type CompletRow =
  | { kind: 'sortie' | 'comptant' | 'avoir'; date: number; data: any }
  | { kind: 'paiement'; date: number; data: any };

type RemiseSplit = {
  abonne: number;
  client: number;
};

// Construit les completRows depuis un objet history — même logique que ClientDetailPage
function buildCompletRows(history: any): CompletRow[] {
  const rows: CompletRow[] = [
    ...(history?.sorties ?? [])
      .filter((b: any) => !isExcludedStatus(b.statut))
      .map((d: any) => ({ kind: 'sortie' as const, date: new Date(d.date_creation).getTime(), data: d })),
    ...(history?.comptants ?? [])
      .filter((b: any) => !isExcludedStatus(b.statut))
      .map((d: any) => ({ kind: 'comptant' as const, date: new Date(d.date_creation).getTime(), data: d })),
    ...(history?.avoirsClient ?? [])
      .filter((b: any) => !isExcludedStatus(b.statut))
      .map((d: any) => ({ kind: 'avoir' as const, date: new Date(d.date_creation).getTime(), data: d })),
    ...(history?.payments ?? [])
      .filter((p: any) => !isExcludedStatus(p.statut))
      .map((p: any) => ({ kind: 'paiement' as const, date: new Date(p.date_paiement || p.created_at).getTime(), data: p })),
  ];
  return rows.sort((a, b) => a.date - b.date);
}

// Retourne le solde final après toutes les opérations — même calcul que la dernière ligne du tab Complet detail=true
function computeFinalSoldeCumule(history: any, soldeInitial: number): number {
  const rows = buildCompletRows(history);
  if (rows.length === 0) return soldeInitial;
  const map = buildSoldeCumuleDetail(rows, soldeInitial);
  const last = rows[rows.length - 1];
  if (last.kind === 'paiement') {
    return map.get(`paiement-${last.data.id}`) ?? soldeInitial;
  }
  const items: any[] = Array.isArray(last.data.items) ? last.data.items.filter((i: any) => i && i.id) : [];
  const lastIdx = items.length > 0 ? items.length - 1 : 0;
  return map.get(`${last.kind}-${last.data.id}-item-${lastIdx}`) ?? soldeInitial;
}

function safeNum(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function getPaymentTotalWithIgnored(payment: any): number {
  return safeNum(payment?.montant_total ?? payment?.montant ?? 0) + safeNum(payment?.montant_ignorer ?? 0);
}

function getBonComptantTotalWithIgnored(bon: any): number {
  return safeNum(bon?.montant_total ?? bon?.montant ?? 0) + safeNum(bon?.montant_ignorer ?? 0);
}

function getBonTableTotal(prefix: string, bon: any): number {
  return prefix === 'COM' || prefix === 'CPT'
    ? getBonComptantTotalWithIgnored(bon)
    : safeNum(bon?.montant_total ?? bon?.montant ?? 0);
}

function getBonTotalForSolde(kind: string, bon: any): number {
  return kind === 'comptant'
    ? getBonComptantTotalWithIgnored(bon)
    : safeNum(bon?.montant_total ?? bon?.montant ?? 0);
}

function isAnnuleStatut(value: any): boolean {
  const status = String(value ?? '').trim().toLowerCase();
  return status.startsWith('annul');
}

function isLegacyRemiseBonItem(item: any): boolean {
  const legacyId = item?.legacy_remise_client_id ?? item?.legacyRemiseClientId;
  return legacyId != null && legacyId !== '';
}

function getDirectRemiseTotal(item: any): number {
  if (!item) return 0;
  if (isLegacyRemiseBonItem(item)) return 0;
  const quantite = safeNum(item.quantite ?? item.qte ?? 0);
  if (!quantite) return 0;
  const prixUnitaire = safeNum(item.prix_unitaire ?? item.prix ?? item.price ?? 0);
  const remiseMontant = safeNum(item.remise_montant ?? 0);
  const remisePourcentage = safeNum(item.remise_pourcentage ?? 0);
  const remiseUnitaire = remiseMontant !== 0
    ? remiseMontant
    : (remisePourcentage !== 0 ? (prixUnitaire * remisePourcentage) / 100 : 0);
  if (remiseUnitaire === 0) return 0;
  const total = quantite * remiseUnitaire;
  return Number(total.toFixed(3));
}

// Remise Abonné (affichage) = remise directe du bon (sortie_items.remise_montant / remise_pourcentage)
// MOINS la part déjà tracée dans item_remises (qui s'affiche en col Remise Client).
function getDisplayRemiseAbonneTotal(kind: CompletRow['kind'], item: any, remises: any[] = [], bonId?: number | string): number {
  if (kind !== 'sortie' && kind !== 'comptant') return 0;
  const direct = getDirectRemiseTotal(item);
  if (direct <= 0) return 0;
  if (!Array.isArray(remises) || remises.length === 0) return direct;
  const itemWithBon = bonId != null ? { ...item, bon_id: item.bon_id ?? bonId } : item;
  const split = getItemRemises(itemWithBon, remises);
  const tracked = split.abonne + split.client;
  const remaining = direct - tracked;
  return remaining > 0 ? Number(remaining.toFixed(3)) : 0;
}

// Remise Client (affichage) = entrées item_remises (table client_remises), tous types confondus.
function getDisplayRemiseClientTotal(item: any, remises: any[], bonId?: number | string): number {
  if (!item || !Array.isArray(remises) || remises.length === 0) return 0;
  const itemWithBon = bonId != null ? { ...item, bon_id: item.bon_id ?? bonId } : item;
  const split = getItemRemises(itemWithBon, remises);
  return Number((split.abonne + split.client).toFixed(3));
}

function isTruthyServiceFlag(value: any): boolean {
  return value === true || value === 1 || value === '1' || String(value ?? '').toLowerCase() === 'true';
}

function isHistoryServiceItem(item: any, product: any): boolean {
  return [
    item?.est_service,
    item?.is_service,
    item?.service,
    item?.product_est_service,
    item?.produit_est_service,
    item?.snapshot_est_service,
    item?.product_snapshot_est_service,
    item?.product?.est_service,
    item?.produit?.est_service,
    item?.snapshot?.est_service,
    item?.product_snapshot?.est_service,
    product?.est_service,
    product?.is_service,
  ].some(isTruthyServiceFlag);
}

function resolveHistoryItemCost(item: any, products: any[]): number {
  if (item == null) return 0;
  const product = findHistoryProduct(item, products);
  if (isHistoryServiceItem(item, product)) return 0;
  if (item.cout_revient !== undefined && item.cout_revient !== null) return Number(item.cout_revient) || 0;
  if (item.prix_achat !== undefined && item.prix_achat !== null) return Number(item.prix_achat) || 0;
  const pid = item.product_id || item.produit_id;
  if (pid) {
    if (product) {
      const variantId = item.variant_id ?? item.variantId;
      if (variantId) {
        const variant = ((product as any).variants || []).find((v: any) => String(v.id) === String(variantId));
        if (variant) {
          if (variant.cout_revient !== undefined && variant.cout_revient !== null) return Number(variant.cout_revient) || 0;
          if (variant.prix_achat !== undefined && variant.prix_achat !== null) return Number(variant.prix_achat) || 0;
        }
      }

      if (product.cout_revient !== undefined && product.cout_revient !== null) return Number(product.cout_revient) || 0;
      if (product.prix_achat !== undefined && product.prix_achat !== null) return Number(product.prix_achat) || 0;
    }
  }

  return 0;
}

function findHistoryProduct(item: any, products: any[]): any {
  const pid = item?.product_id || item?.produit_id;
  if (!pid) return null;
  return (products || []).find((p: any) => String(p.id) === String(pid)) ?? null;
}

function getHistoryVariantLabel(item: any, products: any[]): string {
  const product = findHistoryProduct(item, products);
  const variantId = item?.variant_id ?? item?.variantId;
  if (!product || !variantId) return '—';
  const variant = ((product as any).variants || []).find((v: any) => String(v.id) === String(variantId));
  return variant?.variant_name || '—';
}

function getHistoryUnitLabel(item: any, products: any[]): string {
  const product = findHistoryProduct(item, products);
  const unitId = item?.unit_id ?? item?.unitId;
  if (!product || !unitId) return '—';
  const unit = ((product as any).units || []).find((u: any) => String(u.id) === String(unitId));
  return unit?.unit_name || '—';
}

function historyItemMatchesSearch(item: any, products: any[], search: string): boolean {
  if (!search) return true;
  const variantLabel = getHistoryVariantLabel(item, products);
  const haystack = [
    item?.reference,
    item?.product_reference,
    item?.designation,
    item?.product_designation,
    variantLabel,
  ]
    .map((value) => String(value ?? '').toLowerCase().trim())
    .filter(Boolean);
  return haystack.some((value) => value.includes(search));
}

function filterHistoryBonsBySearch(bons: any[], products: any[], search: string): any[] {
  if (!search) return bons;
  return (bons ?? [])
    .map((bon: any) => {
      const items = Array.isArray(bon?.items) ? bon.items.filter((item: any) => historyItemMatchesSearch(item, products, search)) : [];
      return { ...bon, items };
    })
    .filter((bon: any) => Array.isArray(bon.items) && bon.items.length > 0);
}

function filterCompletRowsBySearch(rows: CompletRow[], products: any[], search: string): CompletRow[] {
  if (!search) return rows;
  return rows.flatMap((row) => {
    if (row.kind === 'paiement') return [];
    const items = Array.isArray(row.data?.items) ? row.data.items.filter((item: any) => historyItemMatchesSearch(item, products, search)) : [];
    if (items.length === 0) return [];
    return [{ ...row, data: { ...row.data, items } }];
  });
}

function computeHistoryItemBenefice(item: any, products: any[]): number | null {
  if (!item) return null;

  const qte = Number(item.quantite ?? 0) || 0;
  const prixUnit = Number(item.prix_unitaire ?? item.prix ?? 0) || 0;
  const product = findHistoryProduct(item, products);
  const mouvement = isHistoryServiceItem(item, product)
    ? prixUnit * qte
    : (prixUnit - resolveHistoryItemCost(item, products)) * qte;

  const remisePourcentage = parseFloat(String(item.remise_pourcentage ?? item.remise_pct ?? 0)) || 0;
  const remiseMontant = parseFloat(String(item.remise_montant ?? item.remise_valeur ?? 0)) || 0;
  const remiseUnitaire = remiseMontant > 0 ? remiseMontant : (remisePourcentage > 0 ? (prixUnit * remisePourcentage) / 100 : 0);
  const remiseTotale = remiseUnitaire * qte;

  return Number((mouvement - remiseTotale).toFixed(3));
}

function getItemRemises(item: any, remises: any[]): RemiseSplit {
  const result: RemiseSplit = { abonne: 0, client: 0 };
  if (!item || !Array.isArray(remises) || remises.length === 0) return result;

  const bonIdItem = Number(item.bon_id);
  const prodIdItem = item.product_id != null ? Number(item.product_id) : null;
  const refItem = String(item.product_reference ?? item.reference ?? '').trim();

  for (const remise of remises) {
    for (const remiseItem of remise?.items ?? []) {
      if (isAnnuleStatut(remiseItem?.statut)) continue;

      const bonIdRemise = Number(remiseItem?.bon_id);
      const prodIdRemise = remiseItem?.product_id != null ? Number(remiseItem.product_id) : null;
      const refRemise = String(remiseItem?.reference ?? remiseItem?.product_reference ?? '').trim();

      let match =
        bonIdItem === bonIdRemise &&
        prodIdItem != null &&
        prodIdRemise != null &&
        prodIdItem === prodIdRemise;

      if (!match && bonIdItem === bonIdRemise && refItem && refRemise && refItem === refRemise) {
        match = true;
      }

      if (!match && bonIdItem === bonIdRemise) {
        const itemProdKey = item.product_id != null ? String(item.product_id).trim() : '';
        const remiseProdKey = remiseItem?.reference != null
          ? String(remiseItem.reference).trim()
          : (remiseItem?.product_id != null ? String(remiseItem.product_id).trim() : '');
        if (itemProdKey && remiseProdKey && itemProdKey === remiseProdKey) {
          match = true;
        }
      }

      if (!match) continue;

      const totalRemise = safeNum(remiseItem?.qte) * safeNum(remiseItem?.prix_remise);
      if (remise?.type === 'client_abonne') {
        result.abonne += totalRemise;
      } else if (remise?.type === 'client-remise') {
        result.client += totalRemise;
      }
    }
  }

  result.abonne = Number(result.abonne.toFixed(3));
  result.client = Number(result.client.toFixed(3));
  return result;
}

function getItemClientRemiseTotal(item: any, remises: any[]): number {
  if (!item || !Array.isArray(remises) || remises.length === 0) return 0;
  return getItemRemises(item, remises).client;
}

function buildSoldeCumule(rows: CompletRow[], soldeInitial: number): Map<string, number> {
  const result = new Map<string, number>();
  let running = isNaN(soldeInitial) ? 0 : soldeInitial;
  for (const row of rows) {
    const montant = row.kind === 'paiement'
      ? getPaymentTotalWithIgnored(row.data)
      : getBonTotalForSolde(row.kind, row.data);
    if (row.kind === 'sortie' || row.kind === 'comptant') {
      running += montant;
    } else if (row.kind === 'avoir' || row.kind === 'paiement') {
      running -= montant;
    }
    const key = `${row.kind}-${row.data.id}`;
    result.set(key, running);
  }
  return result;
}

// Builds a per-item solde cumulé map in detail mode.
// Key = `${kind}-${bonId}-item-${iIdx}`, paiement keeps `paiement-${id}`.
// Each item contributes its own item.total (not the whole bon total).
function buildSoldeCumuleDetail(rows: CompletRow[], soldeInitial: number): Map<string, number> {
  const result = new Map<string, number>();
  let running = isNaN(soldeInitial) ? 0 : soldeInitial;
  for (const row of rows) {
    if (row.kind === 'paiement') {
      const montant = getPaymentTotalWithIgnored(row.data);
      running -= montant;
      result.set(`paiement-${row.data.id}`, running);
    } else {
      const items: any[] = Array.isArray(row.data.items) ? row.data.items.filter((i: any) => i && i.id) : [];
      if (items.length === 0) {
        const montant = getBonTotalForSolde(row.kind, row.data);
        if (row.kind === 'sortie' || row.kind === 'comptant') running += montant;
        else running -= montant;
        result.set(`${row.kind}-${row.data.id}-item-0`, running);
      } else {
        const bonMontant = getBonTotalForSolde(row.kind, row.data);
        const ignoredExtra = row.kind === 'comptant' ? safeNum(row.data.montant_ignorer ?? 0) : 0;
        const itemsSum = items.reduce((s: number, i: any) => {
          return s + safeNum(i.total ?? (safeNum(i.quantite) * safeNum(i.prix_unitaire)));
        }, 0);
        items.forEach((item: any, iIdx: number) => {
          const rawTotal = safeNum(item.total ?? (safeNum(item.quantite) * safeNum(item.prix_unitaire)));
          const total = itemsSum === 0
            ? (iIdx === items.length - 1 ? bonMontant : 0)
            : rawTotal + (iIdx === items.length - 1 ? ignoredExtra : 0);
          if (row.kind === 'sortie' || row.kind === 'comptant') running += total;
          else running -= total;
          result.set(`${row.kind}-${row.data.id}-item-${iIdx}`, running);
        });
      }
    }
  }
  return result;
}

// Le solde remise cumulé du détail client suit les colonnes visibles:
// remise du bon (colonne Remise Abonné) + remise client_remises.
function buildRemiseCumuleDetail(rows: CompletRow[], remises: any[] = []): Map<string, number> {
  const result = new Map<string, number>();
  let running = 0;

  for (const row of rows) {
    if (row.kind === 'paiement') {
      result.set(`paiement-${row.data.id}`, running);
      continue;
    }

    const items: any[] = Array.isArray(row.data.items) ? row.data.items.filter((i: any) => i && i.id) : [];
    if (items.length === 0) {
      result.set(`${row.kind}-${row.data.id}-item-0`, running);
      continue;
    }

    items.forEach((item: any, iIdx: number) => {
      const remiseAbonne = getDisplayRemiseAbonneTotal(row.kind, item, remises, row.data.id);
      const remiseClient = getDisplayRemiseClientTotal(item, remises, row.data.id);
      const totalRowRemise = remiseAbonne + remiseClient;
      if (totalRowRemise > 0) {
        running += totalRowRemise;
        result.set(`${row.kind}-${row.data.id}-item-${iIdx}`, Number(running.toFixed(3)));
      }
    });
  }

  return result;
}

interface CompletTableProps {
  rows: CompletRow[];
  detail: boolean;
  soldeInitial: number;
  products?: any[];
  remises?: any[];
  visibleIds?: Set<string>;
  showInitialRow?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
  selectedItemIds?: Set<string>;
  onToggleItem?: (key: string) => void;
  onToggleAllItems?: (keys: string[]) => void;
  onCompletDragEnd?: (result: DropResult) => void;
  remiseEditor?: import('../hooks/useRemiseEditor').UseRemiseEditorResult;
}

const BON_META: Record<string, { label: string; badgeClass: string; accentClass: string; hoverClass: string; itemBorderClass: string; prefix: string; bgClass?: string; styleKey: string }> = {
  sortie:   { label: 'Sortie',   badgeClass: 'bg-blue-100 text-blue-700',    accentClass: 'text-blue-700',   hoverClass: 'hover:bg-blue-100',   itemBorderClass: 'border-blue-200',   prefix: 'SOR', bgClass: 'colored-row bg-blue-100', styleKey: 'bon_sortie' },
  comptant: { label: 'Comptant', badgeClass: 'bg-sky-100 text-sky-700',      accentClass: 'text-black',    hoverClass: 'hover:bg-sky-100',    itemBorderClass: 'border-sky-700',    prefix: 'COM', bgClass: 'colored-row bg-sky-100', styleKey: 'bon_comptant' },
  avoir:    { label: 'Avoir',    badgeClass: 'bg-orange-100 text-orange-700', accentClass: 'text-black', hoverClass: 'hover:bg-orange-100', itemBorderClass: 'border-orange-700', prefix: 'AVC', bgClass: 'colored-row bg-orange-100', styleKey: 'bon_avoir_client' },
};

const CompletTable: React.FC<CompletTableProps> = ({ rows, detail, soldeInitial, products = [], remises = [], visibleIds, showInitialRow = true, selectedIds, onToggleSelect, onToggleAll, selectedItemIds, onToggleItem, onToggleAllItems, onCompletDragEnd, remiseEditor }) => {
  const showRemiseInputs = !!remiseEditor?.showRemiseMode;
  const selectionMode = !!onToggleSelect;
  const { data: uiSettings } = useGetUiSettingsQuery();
  const paymentStyleConfig = getUiLineConfig(uiSettings, 'payment_standard');
  const soldeCumuleMap = useMemo(
    () => detail ? buildSoldeCumuleDetail(rows, soldeInitial) : buildSoldeCumule(rows, soldeInitial),
    [rows, soldeInitial, detail]
  );
  const remiseCumuleMap = useMemo(
    () => detail ? buildRemiseCumuleDetail(rows, remises) : new Map<string, number>(),
    [rows, detail, remises]
  );

  const visibleRowIds = useMemo(() => {
    return rows
      .filter(r => !visibleIds || visibleIds.has(`${r.kind}-${r.data.id}`))
      .map(r => `${r.kind}-${r.data.id}`);
  }, [rows, visibleIds]);

  // all item keys visible in detail mode
  const visibleItemKeys = useMemo(() => {
    if (!detail) return [];
    const keys: string[] = [];
    for (const row of rows) {
      if (!visibleIds || visibleIds.has(`${row.kind}-${row.data.id}`)) {
        if (row.kind === 'paiement') continue;
        const bonKey = `${row.kind}-${row.data.id}`;
        const items: any[] = Array.isArray(row.data.items) ? row.data.items.filter((i: any) => i && i.id) : [];
        if (items.length === 0) keys.push(`${bonKey}-item-0`);
        else items.forEach((_, iIdx) => keys.push(`${bonKey}-item-${iIdx}`));
      }
    }
    return keys;
  }, [rows, visibleIds, detail]);

  const allVisibleSelected = selectionMode && visibleRowIds.length > 0 && visibleRowIds.every(id => selectedIds?.has(id));
  const allItemsSelected = detail && !!onToggleAllItems && visibleItemKeys.length > 0 && visibleItemKeys.every(k => selectedItemIds?.has(k));

  const fmtSolde = (v: number) => {
    const color = v < 0 ? 'text-green-600' : v > 0 ? 'text-red-600' : 'text-gray-500';
    return <span className={`font-bold text-xs ${color}`}>{fmt(v)}</span>;
  };

  const fmtRemise = (v: number) =>
    `${(Number.isFinite(v) ? v : 0).toFixed(3)} MAD`;

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
        <tr>
          {selectionMode && (
            <th className="px-2 py-3 w-8 text-center" title="Sélectionner bon complet">
              <div className="flex flex-col items-center gap-0.5">
                <FileText className="w-3.5 h-3.5 text-gray-400" />
                <input type="checkbox" checked={allVisibleSelected} onChange={() => onToggleAll?.(visibleRowIds)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer" />
              </div>
            </th>
          )}
          {selectionMode && detail && (
            <th className="px-2 py-3 w-8 text-center" title="Sélectionner ligne individuelle">
              <div className="flex flex-col items-center gap-0.5">
                <Package className="w-3.5 h-3.5 text-gray-400" />
                <input type="checkbox" checked={allItemsSelected} onChange={() => onToggleAllItems?.(visibleItemKeys)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 cursor-pointer" />
              </div>
            </th>
          )}
          <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Type</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">N°</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Date</th>
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Référence</th>}
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600">Désignation</th>}
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600">Variant</th>}
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600">Unité</th>}
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Adr. Livraison</th>}
          {detail && <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Code Règl.</th>}
          {detail && <th className="text-center px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Qté</th>}
          {detail && <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Prix unit.</th>}
          {detail && <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Remise Abonné</th>}
          {detail && showRemiseInputs && <th className="text-right px-3 py-3 font-semibold text-orange-700 whitespace-nowrap bg-orange-50">Prix Remise</th>}
          {detail && showRemiseInputs && <th className="text-right px-3 py-3 font-semibold text-orange-700 whitespace-nowrap bg-orange-50">Total Remise</th>}
          {detail && <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Remise Client</th>}
          {detail && <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Remise cumulée</th>}
          {!detail && <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">RIB / Réf</th>}
          <th className="text-right px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">{detail ? 'Total ligne' : 'Montant'}</th>
          <th className="text-right px-4 py-3 font-semibold text-orange-700 whitespace-nowrap">Montant ignoré</th>
          {detail && <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">Mouvement</th>}
          <th className="text-right px-4 py-3 font-semibold text-gray-600 bg-yellow-50 border-l border-yellow-200 whitespace-nowrap">Solde cumulé</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Statut / Mode</th>
        </tr>
      </thead>
      <DragDropContext onDragEnd={onCompletDragEnd ?? (() => undefined)}>
      <Droppable droppableId="client-complet-history">
        {(dropProvided) => (
      <tbody
        className="divide-y divide-gray-100"
        ref={dropProvided.innerRef}
        {...dropProvided.droppableProps}
      >
        {/* ── Ligne solde initial ── */}
        {showInitialRow && (
        <tr className="colored-row bg-yellow-100 border-l-4 border-yellow-500/70">
          {selectionMode && <td />}
          {selectionMode && detail && <td />}
          <td className="px-4 py-2.5">
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-white/90 text-yellow-800">Solde initial</span>
          </td>
          <td className="px-4 py-2.5 text-black font-mono text-xs font-medium">—</td>
          <td className="px-4 py-2.5 text-black/90 text-xs">—</td>
          {detail && <><td /><td /><td /><td /><td /><td /><td /><td /><td /><td /><td /></>}
          {!detail && <td className="px-4 py-2.5 text-white/80 text-xs">—</td>}
          <td className="px-4 py-2.5 text-right font-bold text-black">{fmt(soldeInitial)}</td>
          <td className="px-4 py-2.5 text-right font-semibold text-orange-700">-</td>
          {detail && <td />}
          <td className="solde-cumule-cell px-4 py-2.5 text-right bg-yellow-50 border-l border-yellow-200">{fmtSolde(soldeInitial)}</td>
          <td className="px-4 py-2.5 text-xs text-black/90">Solde de départ</td>
        </tr>
        )}

        {(() => {
          let dragIndex = 0;
          return rows.map((row, idx) => {
          const rowId = `${row.kind}-${row.data.id}`;
          if (visibleIds && !visibleIds.has(rowId)) return null;
          const isSelected = selectedIds?.has(rowId) ?? false;
          const rowBg = isSelected ? 'bg-blue-100' : '';

          if (row.kind === 'paiement') {
            const p = row.data;
            const rib = p.code_reglement || p.reference_virement || p.reference || null;
            const rowIndex = dragIndex++;
            return (
              <Draggable
                key={`pay-${p.id}-${idx}`}
                draggableId={`paiement-${p.id}`}
                index={rowIndex}
                isDragDisabled={!onCompletDragEnd}
              >
                {(dragProvided, snapshot) => (
              <tr
                ref={dragProvided.innerRef}
                {...dragProvided.draggableProps}
                className={`transition-colors colored-row ${snapshot.isDragging ? 'shadow-lg bg-blue-100' : `${rowBg || 'bg-green-100'} hover:bg-green-100`}`}
                style={getUiDraggableRowStyle(paymentStyleConfig, dragProvided.draggableProps.style)}
              >
                {selectionMode && (
                  <td className="px-2 py-2.5 text-center">
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect?.(rowId)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer" />
                  </td>
                )}
                {selectionMode && detail && <td />}
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span {...dragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-4 h-4 text-gray-300 hover:text-gray-500" />
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-white/90 text-green-700" style={getUiBadgeStyle(paymentStyleConfig)}>Paiement</span>
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-black font-medium text-xs">
                  {p.numero ?? `PAY${String(p.id).padStart(3, '0')}`}
                </td>
                <td className="px-4 py-2.5 text-black/90 text-xs">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-white/70" />{fmtDate(p.date_paiement)}</span>
                  {p.date_echeance && <span className="text-white/70 ml-4 block">Éch: {fmtDate(p.date_echeance)}</span>}
                </td>
                {/* detail: Référence(1) Désignation(2) Adr.Livraison(3) Code Règl.(4) Qté(5) Prix(6) */}
                {detail && <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>}
                {detail && (
                  <td className="px-3 py-2.5 text-xs text-gray-600">
                    {p.mode_paiement ?? '—'}
                  </td>
                )}
                {detail && <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>}
                {detail && <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>}
                {detail && <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>}
                {detail && (
                  <td className="px-3 py-2.5 text-xs">
                    {rib ? <span className="flex items-center gap-1 font-mono text-gray-700"><Hash className="w-3 h-3 text-gray-400" />{rib}</span>
                         : <span className="text-gray-300">—</span>}
                  </td>
                )}
                {detail && <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>}
                {detail && <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>}
                {/* Remise Abonné */}
                {detail && <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>}
                {detail && showRemiseInputs && <td className="px-3 py-2.5 text-gray-300 text-xs bg-orange-50/40">—</td>}
                {detail && showRemiseInputs && <td className="px-3 py-2.5 text-gray-300 text-xs bg-orange-50/40">—</td>}
                {/* Remise Client + Remise cumulée */}
                {detail && <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>}
                {detail && <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>}
                {!detail && (
                  <td className="px-4 py-2.5 text-xs">
                    {rib ? <span className="flex items-center gap-1 font-mono text-gray-700"><Hash className="w-3 h-3 text-gray-400" />{rib}</span>
                         : <span className="text-gray-300">—</span>}
                  </td>
                )}
                <td className="px-4 py-2.5 text-right font-semibold text-white">
                  {fmt(getPaymentTotalWithIgnored(p))}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-orange-700">
                  {fmt(Number(p.montant_ignorer ?? 0))}
                </td>
                {detail && <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>}
                <td className="solde-cumule-cell px-4 py-2.5 text-right bg-yellow-50 border-l border-yellow-200">
                  {fmtSolde(soldeCumuleMap.get(`paiement-${p.id}`) ?? 0)}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modeColor(p.mode_paiement ?? '')}`}>{p.mode_paiement ?? '—'}</span>
                </td>
              </tr>
                )}
              </Draggable>
            );
          }

          // bon (sortie / comptant / avoir)
          const b = row.data;
          const meta = BON_META[row.kind];
          const metaStyleConfig = getUiLineConfig(uiSettings, meta.styleKey);
          const bonKey = `${row.kind}-${b.id}`;
          const items: any[] = Array.isArray(b.items) ? b.items.filter((i: any) => i && i.id) : [];
          const bonNum = b.numero ?? `${meta.prefix}${String(b.id).padStart(2, '0')}`;

          if (!detail) {
            const rowIndex = dragIndex++;
            return (
              <Draggable key={`${bonKey}-${idx}`} draggableId={`${bonKey}-row`} index={rowIndex} isDragDisabled>
                {(dragProvided) => (
              <tr ref={dragProvided.innerRef} {...dragProvided.draggableProps} className={`${meta.hoverClass} transition-colors ${rowBg || meta.bgClass || ''}`} style={getUiDraggableRowStyle(metaStyleConfig, dragProvided.draggableProps.style)}>
                {selectionMode && (
                  <td className="px-2 py-2.5 text-center">
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect?.(rowId)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer" />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.badgeClass}`} style={getUiBadgeStyle(metaStyleConfig)}>{meta.label}</span>
                </td>
                <td className={`px-4 py-2.5 font-mono font-medium text-xs ${meta.accentClass}`}>{bonNum}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{fmtDate(b.date_creation)}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-300 text-xs">—</td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt(getBonTotalForSolde(row.kind, b))}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-orange-700">-</td>
                <td className="solde-cumule-cell px-4 py-2.5 text-right bg-yellow-50 border-l border-yellow-200">
                  {fmtSolde(soldeCumuleMap.get(bonKey) ?? 0)}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                </td>
              </tr>
                )}
              </Draggable>
            );
          }

          // Detail mode: flat item rows
          if (items.length === 0) {
            const itemKey0 = `${bonKey}-item-0`;
            const itemSelected0 = selectedItemIds?.has(itemKey0) ?? false;
            const rowIndex = dragIndex++;
            return (
              <Draggable key={`${bonKey}-${idx}`} draggableId={`${itemKey0}-empty`} index={rowIndex} isDragDisabled>
                {(dragProvided) => (
              <tr ref={dragProvided.innerRef} {...dragProvided.draggableProps} className={`${meta.hoverClass} transition-colors ${isSelected ? '!bg-blue-50' : itemSelected0 ? '!bg-purple-50' : (meta.bgClass || '')}`} style={getUiDraggableRowStyle(metaStyleConfig, dragProvided.draggableProps.style)}>
                {selectionMode && (
                  <td className="px-2 py-2.5 text-center">
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect?.(rowId)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer" />
                  </td>
                )}
                {selectionMode && (
                  <td className="px-2 py-2.5 text-center">
                    <input type="checkbox" checked={itemSelected0} onChange={() => onToggleItem?.(itemKey0)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 cursor-pointer" />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.badgeClass}`} style={getUiBadgeStyle(metaStyleConfig)}>{meta.label}</span>
                </td>
                <td className={`px-4 py-2.5 font-mono font-medium text-xs ${meta.accentClass}`}>{bonNum}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{fmtDate(b.date_creation)}</span>
                </td>
                {/* Référence, Désignation, Variant, Unité, Adr.Livraison, Code Règl., Qté, Prix, RemAbo, [PrixRem, TotRem], RemCli, RemCum */}
                <td className="px-3 py-2.5 text-gray-400 text-xs">—</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs italic">—</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">—</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">—</td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{b.adresse_livraison ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">—</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">—</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">—</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">—</td>
                {showRemiseInputs && <td className="px-3 py-2.5 text-gray-300 text-xs bg-orange-50/40">—</td>}
                {showRemiseInputs && <td className="px-3 py-2.5 text-gray-300 text-xs bg-orange-50/40">—</td>}
                <td className="px-3 py-2.5 text-gray-400 text-xs">—</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">—</td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt(getBonTotalForSolde(row.kind, b))}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-orange-700">-</td>
                <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>
                <td className="solde-cumule-cell px-4 py-2.5 text-right bg-yellow-50 border-l border-yellow-200">
                  {fmtSolde(soldeCumuleMap.get(itemKey0) ?? 0)}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                </td>
              </tr>
                )}
              </Draggable>
            );
          }

          return (
            <React.Fragment key={`${bonKey}-${idx}`}>
              {groupDisplayItems(items).map(({ item, sourceItems, sourceIndices }, groupIdx, groups) => {
                const qte = Number(item.quantite ?? 0);
                const pu = Number(item.prix_unitaire ?? 0);
                const total = Number(item.total ?? (qte * pu)) + (groupIdx === groups.length - 1 && row.kind === 'comptant' ? safeNum(b.montant_ignorer ?? 0) : 0);
                const benefice = sourceItems.reduce((sum, src) => sum + (computeHistoryItemBenefice(src, products) ?? 0), 0);
                const variantLabel = getHistoryVariantLabel(item, products);
                const unitLabel = getHistoryUnitLabel(item, products);
                const sourceKeys = sourceIndices.map((sourceIdx) => `${bonKey}-item-${sourceIdx}`);
                const lastItemSoldeKey =
                  row.kind === 'comptant' && groupIdx === groups.length - 1
                    ? `${bonKey}-item-${items.length - 1}`
                    : sourceKeys[sourceKeys.length - 1];
                const itemSelected = sourceKeys.every((key) => selectedItemIds?.has(key));
                const remiseAbonne = sourceItems.reduce((sum, src) => {
                  return sum + getDisplayRemiseAbonneTotal(row.kind, src, remises, b.id);
                }, 0);
                const remiseClient = sourceItems.reduce((sum, src) => {
                  return sum + getDisplayRemiseClientTotal(src, remises, b.id);
                }, 0);
                const soldeRemise = remiseCumuleMap.get(lastItemSoldeKey);
                const rowIndex = dragIndex++;
                return (
                  <Draggable key={lastItemSoldeKey} draggableId={lastItemSoldeKey} index={rowIndex} isDragDisabled>
                    {(dragProvided) => (
                  <tr ref={dragProvided.innerRef} {...dragProvided.draggableProps} className={`${meta.bgClass ? meta.bgClass : 'bg-gray-50/60'} border-l-4 ${meta.itemBorderClass} transition-colors ${isSelected ? '!bg-blue-50/60' : itemSelected ? '!bg-purple-50/60' : ''}`} style={getUiDraggableRowStyle(metaStyleConfig, dragProvided.draggableProps.style)}>
                    {selectionMode && (
                      <td className="px-2 py-2 text-center">
                        {groupIdx === 0 && (
                          <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect?.(rowId)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer" />
                        )}
                      </td>
                    )}
                    {selectionMode && (
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={itemSelected} onChange={() => sourceKeys.forEach((key) => onToggleItem?.(key))}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 cursor-pointer" />
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.badgeClass}`} style={getUiBadgeStyle(metaStyleConfig)}>{meta.label}</span>
                    </td>
                    <td className={`px-4 py-2 font-mono text-xs font-semibold ${meta.accentClass}`}>{bonNum}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{fmtDate(b.date_creation)}</span>
                    </td>
                    {/* Référence */}
                    <td className="px-3 py-2 text-xs text-gray-500 font-mono whitespace-nowrap">
                      {item.reference ?? item.product_reference ?? <span className="text-gray-300">—</span>}
                    </td>
                    {/* Désignation */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-800 font-medium">
                          {item.designation ?? item.product_designation ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{variantLabel}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{unitLabel}</td>
                    {/* Adresse Livraison */}
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-[120px] truncate" title={b.adresse_livraison ?? ''}>
                      {b.adresse_livraison ?? <span className="text-gray-300">—</span>}
                    </td>
                    {/* Code Règlement */}
                    <td className="px-3 py-2 text-xs text-gray-500 font-mono whitespace-nowrap">
                      {groupIdx === 0 ? (b.code_reglement ?? <span className="text-gray-300">—</span>) : null}
                    </td>
                    {/* Qté */}
                    <td className="px-3 py-2 text-center text-xs font-semibold text-gray-700">{qte}</td>
                    {/* Prix unit. */}
                    <td className="px-3 py-2 text-right text-xs text-gray-600">{fmt(pu)}</td>
                    {/* Remise Abonné */}
                    <td className="px-3 py-2 text-right text-xs">
                      {remiseAbonne > 0 ? <span className="text-blue-600 font-medium">{fmtRemise(remiseAbonne)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Prix Remise (input) + Total Remise (calculé) */}
                    {showRemiseInputs && (() => {
                      const head = sourceItems[0];
                      if (!head?.id || !remiseEditor) {
                        return (
                          <>
                            <td className="px-3 py-2 text-right text-xs bg-orange-50/40 text-gray-300">—</td>
                            <td className="px-3 py-2 text-right text-xs bg-orange-50/40 text-gray-300">—</td>
                          </>
                        );
                      }
                      const bonType: 'Sortie' | 'Comptant' = row.kind === 'sortie' ? 'Sortie' : 'Comptant';
                      if (bonType !== 'Sortie' && bonType !== 'Comptant') {
                        return (
                          <>
                            <td className="px-3 py-2 text-right text-xs bg-orange-50/40 text-gray-300">—</td>
                            <td className="px-3 py-2 text-right text-xs bg-orange-50/40 text-gray-300">—</td>
                          </>
                        );
                      }
                      const eligibleId = `${row.kind}-${b.id}-item-${head.id}`;
                      const totalQte = sourceItems.reduce((s, src) => s + (Number(src.quantite ?? 0) || 0), 0);
                      const price = remiseEditor.remisePrices[eligibleId] ?? '';
                      const totalRem = (Number(price) || 0) * totalQte;
                      return (
                        <>
                          <td className="px-3 py-2 text-right text-xs bg-orange-50/40">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              placeholder="0.000"
                              value={price === '' ? '' : String(price)}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                remiseEditor.setItemPrice(eligibleId, v);
                              }}
                              className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-xs bg-orange-50/40 font-medium text-green-700">
                            {totalRem > 0 ? `${totalRem.toFixed(3)} DH` : <span className="text-gray-300">—</span>}
                          </td>
                        </>
                      );
                    })()}
                    {/* Remise Client */}
                    <td className="px-3 py-2 text-right text-xs">
                      {remiseClient > 0 ? <span className="text-purple-600 font-medium">{fmtRemise(remiseClient)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Solde Remise */}
                    <td className="px-3 py-2 text-right text-xs font-medium text-blue-600">
                      {typeof soldeRemise === 'number' ? fmtRemise(soldeRemise) : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Total ligne */}
                    <td className="px-4 py-2 text-right text-xs font-bold text-gray-900">{fmt(total)}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-orange-700">-</td>
                    {/* Mouvement */}
                    <td className={`px-3 py-2 text-right text-xs ${mouvementCellClass(benefice)}`}>
                      {benefice != null
                        ? <span className="font-semibold">{fmt(benefice)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Solde cumulé */}
                    <td className="solde-cumule-cell px-4 py-2 text-right bg-yellow-50/70 border-l border-yellow-100">
                      {fmtSolde(soldeCumuleMap.get(lastItemSoldeKey) ?? 0)}
                    </td>
                    {/* Statut */}
                    <td className="px-4 py-2">
                      {groupIdx === 0 ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColor(b.statut ?? '')}`}>{b.statut ?? '—'}</span>
                        : null}
                    </td>
                  </tr>
                    )}
                  </Draggable>
                );
              })}
            </React.Fragment>
          );
          });
        })()}
        {dropProvided.placeholder}
      </tbody>
        )}
      </Droppable>
      </DragDropContext>
    </table>
  );
};

// ─── Client detail page ───────────────────────────────────────────────────────

type PageTab = 'complet' | 'sorties' | 'bons' | 'avoirs' | 'paiements';

const ClientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clientId = Number(id);

  const [tab, setTab] = useState<PageTab>('complet');
  const [detail, setDetail] = useState(true);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const { data: contact, isLoading: loadingContact } = useGetContactQuery(clientId);
  const { data: history, isLoading: loadingHistory, refetch: refetchHistory } = useGetContactHistoryQuery({ id: clientId, limit: 30000 });
  const { data: products = [] } = useGetProductsQuery();
  const isLoading = loadingContact || loadingHistory;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didAutoScrollRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(false);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };
  const scrollToTop = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      setIsAtBottom(atBottom);
    };
    el.addEventListener('scroll', onScroll);
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (didAutoScrollRef.current) return;
    if (isLoading || !history) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
      didAutoScrollRef.current = true;
      setIsAtBottom(true);
    });
  }, [isLoading, history]);

  const [reorderPayments] = useReorderPaymentsMutation();

  const toMySQLDateTime = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  const handlePayDragEnd = async (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const items = [...paiements];
    const srcIdx = result.source.index;
    const dstIdx = result.destination.index;
    const [moved] = items.splice(srcIdx, 1);
    items.splice(dstIdx, 0, moved);

    const prev = items[dstIdx - 1];
    const next = items[dstIdx + 1];
    const prevTs = prev ? new Date(prev.date_paiement || prev.created_at).getTime() : null;
    const nextTs = next ? new Date(next.date_paiement || next.created_at).getTime() : null;

    let newDate: string;
    if (prevTs && nextTs) {
      newDate = toMySQLDateTime(new Date((prevTs + nextTs) / 2));
    } else if (prevTs) {
      newDate = toMySQLDateTime(new Date(prevTs + 60000));
    } else if (nextTs) {
      newDate = toMySQLDateTime(new Date(nextTs - 60000));
    } else {
      return;
    }

    const paymentId = typeof moved.id === 'string' ? parseInt(String(moved.id).replace(/\D/g, '')) : moved.id;
    try {
      await reorderPayments({ contactId: clientId, paymentOrders: [{ id: paymentId, newDate }] }).unwrap();
    } catch (e) {
      console.error('Erreur reorder paiement', e);
    }
  };

  const getCompletDragItems = () => {
    const items: any[] = [];
    for (const row of completRows) {
      const rowId = `${row.kind}-${row.data.id}`;
      if (visibleIds && !visibleIds.has(rowId)) continue;

      if (row.kind === 'paiement') {
        items.push({
          id: `paiement-${row.data.id}`,
          paymentId: row.data.id,
          type: 'paiement',
          bon_id: null,
          bon_date_iso: row.data.date_paiement || row.data.created_at,
        });
        continue;
      }

      const bonId = row.data.id;
      const bonDate = row.data.date_creation;
      const rowItems: any[] = Array.isArray(row.data.items) ? row.data.items.filter((i: any) => i && i.id) : [];
      if (!detail || rowItems.length === 0) {
        items.push({
          id: `${row.kind}-${bonId}-row`,
          type: 'produit',
          bon_id: bonId,
          bon_date_iso: bonDate,
        });
        continue;
      }

      groupDisplayItems(rowItems).forEach(({ sourceIndices }) => {
        const lastSourceIdx = sourceIndices[sourceIndices.length - 1];
        items.push({
          id: `${row.kind}-${bonId}-item-${lastSourceIdx}`,
          type: 'produit',
          bon_id: bonId,
          bon_date_iso: bonDate,
          item_id: rowItems[lastSourceIdx]?.id,
        });
      });
    }
    return items;
  };

  const handleCompletDragEnd = async (result: DropResult) => {
    console.log('[CompletDragEnd:Client] result=', result);
    if (!result.destination) { console.log('[CompletDragEnd:Client] abort: no destination'); return; }
    if (result.source.index === result.destination.index) { console.log('[CompletDragEnd:Client] abort: same index'); return; }

    const items = getCompletDragItems();
    console.log('[CompletDragEnd:Client] items count=', items.length, 'srcIdx=', result.source.index, 'dstIdx=', result.destination.index);
    const movedItem = items[result.source.index];
    console.log('[CompletDragEnd:Client] movedItem=', movedItem);
    if (!movedItem || movedItem.type !== 'paiement') { console.log('[CompletDragEnd:Client] abort: not a paiement'); return; }

    const targetIndex = result.destination.index;
    const movingDown = targetIndex > result.source.index;
    let targetItem = items[targetIndex];

    if (movingDown && targetItem && targetItem.type === 'produit' && targetItem.bon_id) {
      const bonId = targetItem.bon_id;
      let lastIndexOfBon = targetIndex;
      for (let i = targetIndex + 1; i < items.length; i++) {
        if (items[i].bon_id === bonId && items[i].type === 'produit') lastIndexOfBon = i;
        else break;
      }
      targetItem = items[lastIndexOfBon];
    } else if (!movingDown && targetItem && targetItem.type === 'produit' && targetItem.bon_id) {
      const bonId = targetItem.bon_id;
      let firstIndexOfBon = targetIndex;
      for (let i = targetIndex - 1; i >= 0; i--) {
        if (items[i].bon_id === bonId && items[i].type === 'produit') firstIndexOfBon = i;
        else break;
      }
      targetItem = items[firstIndexOfBon];
    }

    const targetDateStr = targetItem?.bon_date_iso || targetItem?.bon_date;
    let newDate: string;
    if (targetDateStr) {
      const targetDate = new Date(targetDateStr);
      const delta = movingDown ? 60000 : -60000;
      newDate = toMySQLDateTime(new Date(targetDate.getTime() + delta));
    } else {
      newDate = toMySQLDateTime(new Date());
    }

    const paymentId = typeof movedItem.paymentId === 'string' ? parseInt(String(movedItem.paymentId).replace(/\D/g, '')) : movedItem.paymentId;
    console.log('[CompletDragEnd:Client] sending request paymentId=', paymentId, 'newDate=', newDate, 'movingDown=', movingDown);
    try {
      const res = await reorderPayments({ contactId: clientId, paymentOrders: [{ id: paymentId, newDate }] }).unwrap();
      console.log('[CompletDragEnd:Client] success', res);
    } catch (e) {
      console.error('[CompletDragEnd:Client] Erreur reorder paiement complet', e);
    }
  };

  const inDateRange = (dateStr: string | undefined | null): boolean => {
    if (!filterFrom && !filterTo) return true;
    if (!dateStr) return false;
    const d = new Date(dateStr).getTime();
    if (isNaN(d)) return false;
    if (filterFrom && d < parseFilterDateStart(filterFrom)) return false;
    if (filterTo && d > parseFilterDateEnd(filterTo)) return false;
    return true;
  };

  const getRowDate = (row: CompletRow): string | undefined | null =>
    row.kind === 'paiement'
      ? (row.data.date_paiement || row.data.created_at)
      : row.data.date_creation;
  const hasDateFilter = !!filterFrom || !!filterTo;

  // ── sort for paiements ──
  const [paySort, setPaySort] = useState<{ col: 'date' | 'montant' | 'montant_ignorer' | 'rib'; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'asc' });
  const togglePaySort = (col: typeof paySort.col) =>
    setPaySort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });

  const sorties = useMemo(() =>
    (history?.sorties ?? [])
      .filter((b: any) => !isExcludedStatus(b.statut) && inDateRange(b.date_creation))
      .sort((a: any, b: any) => new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime()),
    [history, filterFrom, filterTo]);

  const bons = useMemo(() =>
    (history?.comptants ?? [])
      .filter((b: any) => !isExcludedStatus(b.statut) && inDateRange(b.date_creation))
      .sort((a: any, b: any) => new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime()),
    [history, filterFrom, filterTo]);

  const avoirs = useMemo(() =>
    (history?.avoirsClient ?? [])
      .filter((b: any) => !isExcludedStatus(b.statut) && inDateRange(b.date_creation))
      .sort((a: any, b: any) => new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime()),
    [history, filterFrom, filterTo]);

  const paiements = useMemo(() => {
    const raw = (history?.payments ?? []).filter((p: any) => !isExcludedStatus(p.statut) && inDateRange(p.date_paiement || p.created_at));
    return raw.sort((a: any, b: any) => {
      let va: any, vb: any;
      if (paySort.col === 'date') {
        va = new Date(a.date_paiement || a.created_at).getTime();
        vb = new Date(b.date_paiement || b.created_at).getTime();
      } else if (paySort.col === 'montant') {
        va = getPaymentTotalWithIgnored(a);
        vb = getPaymentTotalWithIgnored(b);
      } else if (paySort.col === 'montant_ignorer') {
        va = Number(a.montant_ignorer ?? 0);
        vb = Number(b.montant_ignorer ?? 0);
      } else {
        va = (a.code_reglement || a.reference_virement || '').toLowerCase();
        vb = (b.code_reglement || b.reference_virement || '').toLowerCase();
      }
      return paySort.dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }, [history, paySort, filterFrom, filterTo]);

  const totalMontantIgnorerPaiements = useMemo(
    () => paiements.reduce((s: number, p: any) => s + Number(p.montant_ignorer ?? 0), 0),
    [paiements]
  );

  // completRows = TOUTES les rows (jamais filtrées) — le solde cumulé reste exact
  const normalizedProductSearch = useMemo(() => productSearch.trim().toLowerCase(), [productSearch]);
  const hasProductSearch = normalizedProductSearch.length > 0;

  const rawCompletRows = useMemo(() => buildCompletRows(history), [history]);
  const completRows = useMemo(
    () => filterCompletRowsBySearch(rawCompletRows, products, normalizedProductSearch),
    [rawCompletRows, products, normalizedProductSearch]
  );
  const totalBenefice = useMemo(() => {
    return rawCompletRows.reduce((sum: number, row: CompletRow) => {
      if (row.kind === 'paiement') return sum;
      const items: any[] = Array.isArray(row.data?.items) ? row.data.items.filter((item: any) => item && item.id) : [];
      return sum + items.reduce((itemSum: number, item: any) => itemSum + (computeHistoryItemBenefice(item, products) ?? 0), 0);
    }, 0);
  }, [rawCompletRows, products]);
  const filteredSorties = useMemo(
    () => filterHistoryBonsBySearch(sorties, products, normalizedProductSearch),
    [sorties, products, normalizedProductSearch]
  );
  const filteredBons = useMemo(
    () => filterHistoryBonsBySearch(bons, products, normalizedProductSearch),
    [bons, products, normalizedProductSearch]
  );
  const filteredAvoirs = useMemo(
    () => filterHistoryBonsBySearch(avoirs, products, normalizedProductSearch),
    [avoirs, products, normalizedProductSearch]
  );

  // visibleIds = set des ids visibles selon le filtre date (null = tout visible)
  const visibleIds = useMemo<Set<string> | undefined>(() => {
    if (!filterFrom && !filterTo) return undefined;
    const s = new Set<string>();
    const visibleRows = completRows
      .filter(row => inDateRange(getRowDate(row)));
    for (const row of visibleRows) {
      s.add(`${row.kind}-${row.data.id}`);
    }
    return s;
  }, [completRows, filterFrom, filterTo]);

  // ── Remise editor (Appliquer Remise — patch directement sortie_items.remise_montant) ──
  const remiseVisibleItems = useMemo<RemiseEligibleItem[]>(() => {
    const out: RemiseEligibleItem[] = [];
    for (const row of completRows) {
      if (row.kind === 'paiement') continue;
      if (row.kind === 'avoir') continue;
      if (visibleIds && !visibleIds.has(`${row.kind}-${row.data.id}`)) continue;
      const bonId = Number(row.data.id);
      const bonType: 'Sortie' | 'Comptant' = row.kind === 'sortie' ? 'Sortie' : 'Comptant';
      const items: any[] = Array.isArray(row.data.items) ? row.data.items.filter((i: any) => i && i.id) : [];
      const groups = groupDisplayItems(items);
      for (const { item: groupItem, sourceItems } of groups) {
        const head = sourceItems[0];
        if (!head?.product_id) continue;
        const totalQte = sourceItems.reduce((s, src) => s + (Number(src.quantite ?? 0) || 0), 0);
        out.push({
          id: `${row.kind}-${bonId}-item-${head.id}`,
          bon_id: bonId,
          bon_type: bonType,
          product_id: Number(head.product_id),
          product_reference: head.product_reference ?? head.reference ?? null,
          reference: head.reference ?? head.product_reference ?? null,
          quantite: totalQte,
          remise_montant: Number(groupItem.remise_montant ?? head.remise_montant ?? 0) || 0,
          sourceItemIds: sourceItems.map((s) => Number(s.id)).filter((n) => Number.isFinite(n)),
        });
      }
    }
    return out;
  }, [completRows, visibleIds]);

  const remiseEditor = useRemiseEditor({
    contact: contact ? { id: contact.id, nom_complet: contact.nom_complet, telephone: contact.telephone, rib: contact.rib } : null,
    enabled: tab === 'complet' && (detail || hasProductSearch),
    visibleItems: remiseVisibleItems,
    sorties: history?.sorties ?? [],
    comptants: history?.comptants ?? [],
    onSaved: async () => { await refetchHistory(); },
  });

  const PaySortIcon = ({ col }: { col: typeof paySort.col }) =>
    paySort.col !== col
      ? <ChevronsUpDown className="w-3.5 h-3.5 inline ml-1 text-gray-400" />
      : paySort.dir === 'asc'
        ? <ArrowUp className="w-3.5 h-3.5 inline ml-1 text-blue-600" />
        : <ArrowDown className="w-3.5 h-3.5 inline ml-1 text-blue-600" />;

  const nomDisplay = contact?.nom_complet || contact?.societe || `Client #${clientId}`;
  const initial = nomDisplay.charAt(0).toUpperCase();
  const solde: number = contact?.solde ?? 0;
  const totalCumule: number = history && contact
    ? computeFinalSoldeCumule(history, contact.solde ?? 0)
    : 0;

  const showDetail = tab !== 'paiements';
  const detailEnabled = detail || hasProductSearch;

  const tabs: { id: PageTab; label: string; count: number }[] = [
    { id: 'complet', label: 'Complet', count: visibleIds ? visibleIds.size : completRows.length },
    { id: 'sorties', label: 'Bons Sortie', count: filteredSorties.length },
    { id: 'bons', label: 'Bons Comptant', count: filteredBons.length },
    { id: 'avoirs', label: 'Avoirs Client', count: filteredAvoirs.length },
    { id: 'paiements', label: 'Paiements', count: paiements.length },
  ];

  const [printOpen, setPrintOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = (ids: string[]) => {
    const allSelected = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const toggleItem = (key: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAllItems = (keys: string[]) => {
    const allSelected = keys.every(k => selectedItemIds.has(k));
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (allSelected) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  };

  const hasSelectionScopedPrint = selectedIds.size > 0 || selectedItemIds.size > 0;
  const hasScopedPrint = hasDateFilter || hasSelectionScopedPrint;

  const printProductHistory = useMemo(() => {
    if (!history || !contact) return [];
    // soldeCumuleMap calculé sur TOUTES les données (solde cumulé pas recalculé)
    const allRows = buildCompletRows(history);
    const soldeCumuleMap = buildSoldeCumuleDetail(allRows, contact.solde ?? 0);
    const dateFilteredRows = allRows
      .filter(row => !hasDateFilter || inDateRange(getRowDate(row)));
    // rows affichés = filtrés par date ET par sélection (si sélection active)
    const rows = dateFilteredRows.filter(row => {
      const rowKey = `${row.kind}-${row.data.id}`;
      // item-level selection prend priorité sur bon-level
      if (selectedItemIds.size > 0) {
        if (row.kind === 'paiement') {
          return selectedIds.has(rowKey);
        }
        const itemPrefix = `${rowKey}-item-`;
        return Array.from(selectedItemIds).some((itemId) => itemId.startsWith(itemPrefix));
      }
      if (selectedIds.size > 0) {
        if (!selectedIds.has(rowKey)) return false;
      }
      return true;
    });
    const result: any[] = [];

    rows.forEach((row: CompletRow) => {
      const { kind, data } = row;
      const bonKey = `${kind}-${data.id}`;
      const typeLabel = kind === 'sortie' ? 'produit' : kind === 'comptant' ? 'produit' : kind === 'avoir' ? 'avoir' : 'paiement';
      const bonNum = data.numero ?? `${kind.substring(0,3).toUpperCase()}${String(data.id).padStart(2,'0')}`;
      const dateIso = data.date_creation ?? data.date_paiement ?? '';
      const adresseLivraison = data.adresse_livraison ?? '';

      if (kind === 'paiement') {
        result.push({
          id: `${bonKey}-item-0`,
          bon_numero: bonNum,
          bon_date: dateIso,
          bon_date_iso: dateIso,
          product_reference: '',
          product_designation: data.mode_paiement ?? 'Paiement',
          code_reglement: data.code_reglement || data.reference_virement || data.reference || null,
          quantite: 0,
          prix_unitaire: 0,
          total: getPaymentTotalWithIgnored(data),
          bon_statut: data.statut ?? '',
          soldeCumulatif: -(soldeCumuleMap.get(`paiement-${data.id}`) ?? 0),
          type: 'paiement',
        });
        return;
      }

      const items: any[] = Array.isArray(data.items) ? data.items.filter((i: any) => i?.id) : [];
      if (items.length === 0) {
        result.push({
          id: `${bonKey}-item-0`,
          bon_numero: bonNum,
          bon_date: dateIso,
          bon_date_iso: dateIso,
          product_reference: '',
          product_designation: '—',
          quantite: 0,
          prix_unitaire: 0,
          total: getBonTotalForSolde(kind, data),
          adresse_livraison: adresseLivraison,
          bon_statut: data.statut ?? '',
          soldeCumulatif: -(soldeCumuleMap.get(`${kind}-${data.id}-item-0`) ?? 0),
          type: typeLabel,
        });
        return;
      }

      items.forEach((item: any, iIdx: number) => {
        const itemKey = `${bonKey}-item-${iIdx}`;
        if (selectedItemIds.size > 0 && !selectedItemIds.has(itemKey)) return;
        const qte = Number(item.quantite ?? 0);
        const pu = Number(item.prix_unitaire ?? 0);
        const total = Number(item.total ?? (qte * pu)) + (kind === 'comptant' && iIdx === items.length - 1 ? safeNum(data.montant_ignorer ?? 0) : 0);
        result.push({
          id: itemKey,
          bon_numero: bonNum,
          bon_date: dateIso,
          bon_date_iso: dateIso,
          product_reference: item.reference ?? item.product_reference ?? '',
          product_designation: item.designation ?? item.product_designation ?? '—',
          quantite: qte,
          prix_unitaire: pu,
          total,
          adresse_livraison: adresseLivraison,
          bon_statut: data.statut ?? '',
          soldeCumulatif: -(soldeCumuleMap.get(itemKey) ?? 0),
          type: typeLabel,
        });
      });
    });

    // Le filtre date garde le vrai cumul historique.
    // Seule une impression par sélection recalcule un cumul local.
    if (!hasSelectionScopedPrint) return result;

    let scopedSolde = 0;
    return result.map((row: any) => {
      const type = String(row.type || '').toLowerCase();
      const amount = Number(row.total ?? 0);
      if (type === 'produit') scopedSolde -= amount;
      else if (type === 'paiement' || type === 'avoir') scopedSolde += amount;
      return { ...row, soldeCumulatif: scopedSolde };
    });
  }, [history, contact, filterFrom, filterTo, hasDateFilter, selectedIds, selectedItemIds, hasSelectionScopedPrint]);

  const printTotals = useMemo(() => {
    if (!history || !contact) return { totalQty: 0, totalAmount: 0, finalSolde: 0, totalDebit: 0, totalCredit: 0 };
    const includeInitialInDebit = !hasSelectionScopedPrint;
    const initialSoldeForDebit = Math.abs(Number(contact.solde ?? 0) || 0);
    const totalQty = printProductHistory
      .filter((r: any) => r.type === 'produit' && Number(r.quantite) > 0)
      .reduce((s: number, r: any) => s + Number(r.quantite ?? 0), 0);
    const totalVentes = printProductHistory
      .filter((r: any) => r.type === 'produit')
      .reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
    const totalPaiements = printProductHistory
      .filter((r: any) => r.type === 'paiement')
      .reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
    const totalAvoirs = printProductHistory
      .filter((r: any) => r.type === 'avoir')
      .reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
    const finalSolde = printProductHistory.length > 0
      ? Number(printProductHistory[printProductHistory.length - 1]?.soldeCumulatif ?? 0)
      : -computeFinalSoldeCumule(history, contact.solde ?? 0);
    return {
      totalQty,
      totalAmount: totalVentes,
      finalSolde,
      totalDebit: totalVentes + (includeInitialInDebit ? initialSoldeForDebit : 0),
      totalCredit: totalPaiements + totalAvoirs,
    };
  }, [history, contact, printProductHistory, hasScopedPrint, hasSelectionScopedPrint]);



  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/clients')}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-blue-600">{initial}</span>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{nomDisplay}</h1>
          {contact?.societe && contact?.nom_complet && (
            <p className="text-sm text-gray-500">{contact.societe}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Solde</p>
          <p className={`font-bold text-base ${solde < 0 ? 'text-red-600' : solde > 0 ? 'text-green-600' : 'text-gray-500'}`}>
            {fmt(solde)}
          </p>
        </div>
        <div className="text-right px-3 py-1.5 rounded-lg bg-yellow-50 border border-yellow-200">
          <p className="text-xs text-gray-400">Total cumulé</p>
          <p className={`font-bold text-base ${totalCumule > 0 ? 'text-red-600' : totalCumule < 0 ? 'text-green-600' : 'text-gray-500'}`}>
            {fmt(totalCumule)}
          </p>
        </div>
        <div className="text-right px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
          <p className="text-xs text-gray-400">Mouvement total</p>
          <p className={`font-bold text-base ${totalBenefice > 0 ? 'text-green-600' : totalBenefice < 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {fmt(totalBenefice)}
          </p>
        </div>
        <div className="text-right px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200">
          <p className="text-xs text-gray-400">Montant ignoré</p>
          <p className="font-bold text-base text-orange-700">
            {fmt(totalMontantIgnorerPaiements)}
          </p>
        </div>
        <button
          type="button"
          onClick={scrollToTop}
          title="Aller en haut"
          className="w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center justify-center transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={scrollToBottom}
          title="Aller en bas"
          className="w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center justify-center transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setPrintOpen(true)}
          disabled={isLoading || !history}
          className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
        >
          <Printer className="w-4 h-4" />
          {selectedItemIds.size > 0
            ? `Imprimer lignes (${selectedItemIds.size})`
            : selectedIds.size > 0
              ? `Imprimer bons (${selectedIds.size})`
              : 'Imprimer'}
        </button>
        {(selectedIds.size > 0 || selectedItemIds.size > 0) && (
          <button
            onClick={() => { setSelectedIds(new Set()); setSelectedItemIds(new Set()); }}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors px-1"
            title="Effacer la sélection"
          >✕</button>
        )}
      </div>

      {/* Tabs + checkbox détail */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden relative">
        <div className="flex items-center border-b border-gray-200 overflow-x-auto sticky top-0 z-20 bg-white">
          <div className="flex flex-1">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  tab === t.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Filtre date */}
          <div className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 border-l border-gray-100">
            <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-[120px]"
            />
            <span className="text-gray-400 text-xs">—</span>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-[120px]"
            />
            {(filterFrom || filterTo) && (
              <button
                  onClick={() => { setFilterFrom(''); setFilterTo(''); }}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors px-0.5"
              >✕</button>
            )}
          </div>

          {/* Checkbox détail — uniquement sur sortie / comptant / avoir */}
          {showDetail && (
            <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 border-l border-gray-100">
              <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Produit, variante, référence"
                className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-[220px]"
              />
              {productSearch && (
                <button
                  onClick={() => setProductSearch('')}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors px-0.5"
                >âœ•</button>
              )}
            </div>
          )}

          {showDetail && (
            <label className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none flex-shrink-0 border-l border-gray-100">
              <input
                type="checkbox"
                checked={detailEnabled}
                onChange={e => setDetail(e.target.checked)}
                disabled={hasProductSearch}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-600">Détail</span>
            </label>
          )}
        </div>

        {/* Remise Editor Bar (Appliquer / Modifier Remise) */}
        {tab === 'complet' && detailEnabled && (
          <div className="px-4 py-2 border-b border-gray-100 bg-white">
            <RemiseEditorBar editor={remiseEditor} />
          </div>
        )}

        {/* Content */}
        <div ref={scrollRef} className="overflow-auto max-h-[calc(100vh-220px)] relative">

          {/* ── Complet ── */}
          {tab === 'complet' && (
            completRows.length === 0
              ? <Empty icon={<FileText />} label={hasProductSearch ? "Aucun produit trouvé" : "Aucune opération"} />
              : <CompletTable
                  rows={completRows}
                  detail={detailEnabled}
                  soldeInitial={contact?.solde ?? 0}
                  products={products}
                  remises={history?.remises ?? []}
                  visibleIds={visibleIds}
                  showInitialRow={!hasDateFilter}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onToggleAll={toggleAll}
                  selectedItemIds={selectedItemIds}
                  onToggleItem={toggleItem}
                  onToggleAllItems={toggleAllItems}
                  onCompletDragEnd={handleCompletDragEnd}
                  remiseEditor={remiseEditor}
                />
          )}

          {/* ── Bons Sortie ── */}
          {tab === 'sorties' && (
            filteredSorties.length === 0
              ? <Empty icon={<FileText />} label={hasProductSearch ? "Aucun produit trouvé" : "Aucun bon sortie"} />
              : <BonTable bons={filteredSorties} detail={detailEnabled} products={products} prefix="SOR" accentClass="text-blue-700" hoverClass="hover:bg-blue-50" />
          )}

          {/* ── Bons Comptant ── */}
          {tab === 'bons' && (
            filteredBons.length === 0
              ? <Empty icon={<FileText />} label={hasProductSearch ? "Aucun produit trouvé" : "Aucun bon comptant"} />
              : <BonTable bons={filteredBons} detail={detailEnabled} products={products} prefix="COM" accentClass="text-sky-700" hoverClass="hover:bg-sky-50" />
          )}

          {/* ── Avoirs Client ── */}
          {tab === 'avoirs' && (
            filteredAvoirs.length === 0
              ? <Empty icon={<RotateCcw />} label={hasProductSearch ? "Aucun produit trouvé" : "Aucun avoir client"} />
              : <BonTable bons={filteredAvoirs} detail={detailEnabled} products={products} prefix="AVC" accentClass="text-orange-700" hoverClass="hover:bg-orange-50" />
          )}

          {/* ── Paiements ── */}
          {tab === 'paiements' && (
            paiements.length === 0
              ? <Empty icon={<CreditCard />} label="Aucun paiement" />
              : (
                <DragDropContext onDragEnd={handlePayDragEnd}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="w-8 px-2 py-3" />
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">N°</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-600" onClick={() => togglePaySort('date')}>
                        Date <PaySortIcon col="date" />
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Mode</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-600" onClick={() => togglePaySort('rib')}>
                        RIB / Réf <PaySortIcon col="rib" />
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-600" onClick={() => togglePaySort('montant')}>
                        Montant <PaySortIcon col="montant" />
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-600" onClick={() => togglePaySort('montant_ignorer')}>
                        Montant ignoré <PaySortIcon col="montant_ignorer" />
                      </th>
                    </tr>
                  </thead>
                  <Droppable droppableId="paiements-client">
                    {(provided) => (
                      <tbody
                        className="divide-y divide-gray-100"
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                      >
                        {paiements.map((p: any, index: number) => {
                          const rib = p.code_reglement || p.reference_virement || p.reference || null;
                          return (
                            <Draggable key={String(p.id)} draggableId={String(p.id)} index={index}>
                              {(prov, snap) => (
                                <tr
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  className={`transition-colors ${snap.isDragging ? 'shadow-lg bg-blue-50' : 'hover:bg-green-50'}`}
                                >
                                  <td className="px-2 py-3 text-center" {...prov.dragHandleProps}>
                                    <GripVertical className="w-4 h-4 text-gray-300 hover:text-gray-500 mx-auto cursor-grab active:cursor-grabbing" />
                                  </td>
                                  <td className="px-4 py-3 font-mono text-green-700 font-medium text-xs">{p.numero ?? `PAY${String(p.id).padStart(3, '0')}`}</td>
                                  <td className="px-4 py-3 text-gray-600">
                                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />{fmtDate(p.date_paiement)}</span>
                                    {p.date_echeance && <span className="text-xs text-gray-400 ml-5 block">Échéance: {fmtDate(p.date_echeance)}</span>}
                                  </td>
                                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modeColor(p.mode_paiement ?? '')}`}>{p.mode_paiement ?? '—'}</span></td>
                                  <td className="px-4 py-3">
                                    {rib ? <span className="flex items-center gap-1.5 text-gray-700 font-mono text-xs"><Hash className="w-3 h-3 text-gray-400" />{rib}</span>
                                         : <span className="text-gray-300 text-xs">—</span>}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(getPaymentTotalWithIgnored(p))}</td>
                                  <td className="px-4 py-3 text-right font-semibold text-orange-700">{fmt(Number(p.montant_ignorer ?? 0))}</td>
                                </tr>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </tbody>
                    )}
                  </Droppable>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-sm font-semibold text-gray-600">Total</td>
                      <td className="px-4 py-2 text-right font-bold text-green-700">
                        {fmt(paiements.reduce((s: number, p: any) => s + getPaymentTotalWithIgnored(p), 0))}
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-orange-700">
                        {fmt(totalMontantIgnorerPaiements)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                </DragDropContext>
              )
          )}

        </div>
      </div>

      {printOpen && contact && (
        <ContactPrintModal
          isOpen={printOpen}
          onClose={() => setPrintOpen(false)}
          contact={contact}
          mode="products"
          transactions={[]}
          productHistory={printProductHistory}
          dateFrom={filterFrom || undefined}
          dateTo={filterTo || undefined}
          skipInitialRow={hasDateFilter || hasSelectionScopedPrint}
          hideCumulative={false}
          totalQty={printTotals.totalQty}
          totalAmount={printTotals.totalAmount}
          finalSolde={printTotals.finalSolde}
          totalDebit={hasDateFilter ? undefined : printTotals.totalDebit}
          totalCredit={hasDateFilter ? undefined : printTotals.totalCredit}
          totalDebitSubtitle={hasSelectionScopedPrint ? '(Sorties + Comptant)' : '(Sorties + Comptant + Solde initial)'}
        />
      )}

    </div>
  );
};

// ─── Liste clients ─────────────────────────────────────────────────────────────

const CLIENTS_SCROLL_KEY = 'clientsListScrollY';
const CLIENTS_STATE_KEY = 'clientsListState';

type ClientsListSavedState = {
  search?: string;
  sortBy?: ContactsSortBy;
  sortDir?: SortDirection;
  dateFrom?: string;
  dateTo?: string;
  currentPage?: number;
  itemsPerPage?: number;
};

type ClientsAccordionRow =
  | { kind: 'client'; client: Contact }
  | { kind: 'group'; groupId: number; groupName: string; members: Contact[] };

const readSavedClientsState = (): ClientsListSavedState => {
  try {
    const raw = sessionStorage.getItem(CLIENTS_STATE_KEY);
    return raw ? (JSON.parse(raw) as ClientsListSavedState) : {};
  } catch {
    return {};
  }
};

const ClientsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleteContact] = useDeleteContactMutation();
  const [updateContact] = useUpdateContactMutation();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const savedState = React.useRef<ClientsListSavedState>(readSavedClientsState()).current;
  const [currentPage, setCurrentPage] = useState(savedState.currentPage ?? 1);
  const [itemsPerPage, setItemsPerPage] = useState(savedState.itemsPerPage ?? 0);
  const [search, setSearch] = useState(savedState.search ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(savedState.search ?? '');
  const [sortBy, setSortBy] = useState<ContactsSortBy>(savedState.sortBy ?? 'total_cumule');
  const [sortDir, setSortDir] = useState<SortDirection>(savedState.sortDir ?? 'desc');
  const [dateFrom, setDateFrom] = useState(savedState.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(savedState.dateTo ?? '');
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
  const [selectedListIds, setSelectedListIds] = useState<Set<number>>(new Set());

  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { setDebouncedSearch(val); setCurrentPage(1); }, 400);
  };

  const effectiveLimit = itemsPerPage === 0 ? 999999 : itemsPerPage;

  const { data, isLoading, isFetching } = useGetClientsQuery({
    page: itemsPerPage === 0 ? 1 : currentPage, limit: effectiveLimit,
    search: debouncedSearch || undefined,
    sortBy, sortDir,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    exclude_charge: true,
  });
  const { data: printData, isFetching: isPrintFetching } = useGetClientsQuery({
    page: 1,
    limit: 999999,
    search: debouncedSearch || undefined,
    sortBy,
    sortDir,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    exclude_charge: true,
  });

  const clients = data?.data ?? [];
  const printSourceRows = printData?.data ?? clients;
  const totalPages = data?.pagination?.totalPages ?? 0;
  const total = data?.pagination?.total ?? 0;

  React.useEffect(() => {
    if (isLoading || isFetching) return;
    const saved = sessionStorage.getItem(CLIENTS_SCROLL_KEY);
    if (saved !== null) {
      const y = Number(saved);
      if (!isNaN(y)) {
        requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
      }
      sessionStorage.removeItem(CLIENTS_SCROLL_KEY);
    }
    sessionStorage.removeItem(CLIENTS_STATE_KEY);
  }, [isLoading, isFetching]);

  const handleRowClick = (id: number) => {
    sessionStorage.setItem(CLIENTS_SCROLL_KEY, String(window.scrollY));
    const stateToSave: ClientsListSavedState = {
      search, sortBy, sortDir, dateFrom, dateTo, currentPage, itemsPerPage,
    };
    sessionStorage.setItem(CLIENTS_STATE_KEY, JSON.stringify(stateToSave));
    navigate(`/clients/${id}`);
  };

  const handleCreate = () => {
    setEditingContact(null);
    setIsContactModalOpen(true);
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setIsContactModalOpen(true);
  };

  const handleDelete = async (contact: Contact) => {
    const result = await showConfirmation(
      'Cette action est irréversible.',
      `Voulez-vous vraiment supprimer le client "${contact.nom_complet || contact.societe || `#${contact.id}`}" ?`,
      'Supprimer',
      'Annuler'
    );
    if (!result.isConfirmed) return;

    try {
      await deleteContact({ id: contact.id, updated_by: currentUser?.id ?? 0 }).unwrap();
      showSuccess('Client supprimé avec succès');
    } catch (error: any) {
      showError(error?.data?.error || error?.message || 'Erreur lors de la suppression du client');
    }
  };

  const handleToggleClientBloque = async (client: Contact) => {
    const nextBloque = !Boolean(Number(client.bloque ?? 0));
    try {
      await updateContact({
        id: client.id,
        bloque: nextBloque,
        updated_by: currentUser?.id ?? 0,
      }).unwrap();
    } catch (error: any) {
      showError(error?.data?.error || error?.message || 'Erreur lors de la mise a jour du blocage');
    }
  };

  const totalCumuleClients = clients.reduce(
    (acc: number, c: any) => acc + (Number(c?.total_cumule) || 0),
    0
  );

  const selectedListRows = useMemo(
    () => clients.filter((client: Contact) => selectedListIds.has(Number(client.id))),
    [clients, selectedListIds]
  );
  const rowsToPrint = selectedListRows.length > 0 ? selectedListRows : printSourceRows;
  const totalCumulePrint = rowsToPrint.reduce((acc: number, c: any) => acc + (Number(c?.total_cumule) || 0), 0);

  const toggleListRowSelection = (id: number) => {
    setSelectedListIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllListSelection = () => {
    setSelectedListIds(prev => {
      if (clients.length > 0 && clients.every((client: Contact) => prev.has(Number(client.id)))) return new Set();
      return new Set(clients.map((client: Contact) => Number(client.id)));
    });
  };

  const handlePrintList = () => {
    printContactList({
      title: 'Liste des clients',
      rows: rowsToPrint,
      totalRows: selectedListRows.length > 0 ? selectedListRows.length : (printData?.pagination?.total ?? total),
      totalCumule: totalCumulePrint,
      fmt,
      filters: [
        debouncedSearch ? `Recherche: ${debouncedSearch}` : '',
        dateFrom ? `Du: ${dateFrom}` : '',
        dateTo ? `Au: ${dateTo}` : '',
        selectedListRows.length > 0 ? `${selectedListRows.length} ligne(s) selectionnee(s)` : 'Toutes les lignes filtrees',
      ],
    });
  };

  const accordionRows: ClientsAccordionRow[] = useMemo(() => {
    const rows: ClientsAccordionRow[] = [];
    const groups = new Map<number, { groupId: number; groupName: string; members: Contact[] }>();

    for (const client of clients) {
      const groupIdRaw = (client as any)?.group_id;
      const groupId = groupIdRaw != null && groupIdRaw !== '' ? Number(groupIdRaw) : 0;

      if (groupId) {
        let group = groups.get(groupId);
        if (!group) {
          group = {
            groupId,
            groupName: String((client as any)?.group_name || ''),
            members: [],
          };
          groups.set(groupId, group);
          rows.push({ kind: 'group', groupId, groupName: group.groupName, members: group.members });
        }
        group.members.push(client);
      } else {
        rows.push({ kind: 'client', client });
      }
    }

    return rows;
  }, [clients]);

  const toggleGroupExpanded = React.useCallback((groupId: number) => {
    const key = `clients:${groupId}`;
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        for (const current of Array.from(next)) {
          if (current.startsWith('clients:')) next.delete(current);
        }
        next.add(key);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setExpandedGroupKeys((prev) => {
      const validKeys = new Set(
        accordionRows
          .filter((row): row is Extract<ClientsAccordionRow, { kind: 'group' }> => row.kind === 'group')
          .map((row) => `clients:${row.groupId}`)
      );
      const next = new Set(Array.from(prev).filter((key) => validKeys.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [accordionRows]);

  const expandedGroupId = useMemo(() => {
    for (const key of expandedGroupKeys) {
      if (!key.startsWith('clients:')) continue;
      const rawId = key.slice('clients:'.length);
      const groupId = Number(rawId);
      return Number.isFinite(groupId) ? groupId : null;
    }
    return null;
  }, [expandedGroupKeys]);

  const visibleAccordionRows = useMemo(() => {
    if (!expandedGroupId) return accordionRows;
    const expandedRow = accordionRows.find((row) => row.kind === 'group' && row.groupId === expandedGroupId);
    return expandedRow ? [expandedRow] : accordionRows;
  }, [accordionRows, expandedGroupId]);

  const handleSort = (col: ContactsSortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setCurrentPage(1);
  };

  const SortIcon = ({ col }: { col: ContactsSortBy }) =>
    sortBy !== col
      ? <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400 inline ml-1" />
      : sortDir === 'asc'
        ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 inline ml-1" />
        : <ArrowDown className="w-3.5 h-3.5 text-blue-600 inline ml-1" />;

  const pageNumbers = () => {
    const pages: number[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else if (currentPage <= 4) pages.push(1, 2, 3, 4, 5, -1, totalPages);
    else if (currentPage >= totalPages - 3) pages.push(1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    else pages.push(1, -1, currentPage - 1, currentPage, currentPage + 1, -2, totalPages);
    return pages;
  };

  const renderClientDataRow = (client: Contact, rowLabel: string | number, rowKey?: string) => {
    const isBloque = Boolean(Number(client.bloque ?? 0));
    return (
    <tr key={rowKey ?? client.id} className={`${isBloque ? 'bg-red-100 hover:bg-red-200' : 'hover:bg-blue-50'} transition-colors cursor-pointer`} onClick={() => handleRowClick(client.id)}>
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selectedListIds.has(Number(client.id))}
          onChange={() => toggleListRowSelection(Number(client.id))}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          title="Selectionner pour impression"
        />
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs">{rowLabel}</td>
      <td className="px-4 py-3 font-mono text-xs text-gray-500">{client.id}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-blue-600">
              {(client.nom_complet || client.societe || '?').charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-gray-900 leading-tight">{client.nom_complet}</p>
            {client.reference && <p className="text-xs text-gray-400">RÃ©f: {client.reference}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {client.societe
          ? <div className="flex items-center gap-1.5 text-gray-700"><Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />{client.societe}</div>
          : <span className="text-gray-300">â€”</span>}
      </td>
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          {client.telephone && <div className="flex items-center gap-1.5 text-gray-600 text-xs"><Phone className="w-3 h-3 text-gray-400" />{client.telephone}</div>}
          {client.email && <div className="flex items-center gap-1.5 text-gray-600 text-xs"><Mail className="w-3 h-3 text-gray-400" /><span className="truncate max-w-[160px]">{client.email}</span></div>}
          {!client.telephone && !client.email && <span className="text-gray-300 text-xs">â€”</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        {client.adresse
          ? <div className="flex items-center gap-1.5 text-gray-600 text-xs"><MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" /><span className="truncate max-w-[180px]">{client.adresse}</span></div>
          : <span className="text-gray-300 text-xs">â€”</span>}
      </td>
      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isBloque}
          onChange={() => handleToggleClientBloque(client)}
          className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
          title={isBloque ? 'Debloquer client' : 'Bloquer client'}
        />
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`font-semibold text-sm ${client.solde < 0 ? 'text-red-600' : client.solde > 0 ? 'text-green-600' : 'text-gray-500'}`}>
          {fmt(client.solde)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {client.plafond !== null && client.plafond !== undefined
          ? <span className="font-semibold text-sm text-gray-700">{fmt(client.plafond)}</span>
          : <span className="text-gray-300 text-xs">-</span>}
      </td>
      <td className="px-4 py-3 text-right">
        {client.montant_garantie !== null && client.montant_garantie !== undefined
          ? <span className="font-semibold text-sm text-emerald-700">{fmt(client.montant_garantie)}</span>
          : <span className="text-gray-300 text-xs">-</span>}
      </td>
      <td className="px-4 py-3 text-right bg-yellow-50/60 border-l border-yellow-100">
        {client.total_cumule !== null && client.total_cumule !== undefined
          ? <span className={`font-bold text-sm ${client.total_cumule > 0 ? 'text-red-600' : client.total_cumule < 0 ? 'text-green-600' : 'text-gray-500'}`}>
              {fmt(client.total_cumule)}
            </span>
          : <span className="text-gray-300 text-xs">â€”</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(client);
            }}
            className="p-2 rounded-md text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors"
            title="Modifier"
          >
            <Edit className="w-4 h-4" />
          </button>
          {currentUser?.role === 'PDG' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(client);
              }}
              className="p-2 rounded-md text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors"
              title="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
    );
  };

  const renderAccordionRow = (row: ClientsAccordionRow, idx: number) => {
    const rowLabel = (itemsPerPage === 0 ? 0 : (currentPage - 1) * itemsPerPage) + idx + 1;

    if (row.kind === 'client') {
      return renderClientDataRow(row.client, rowLabel);
    }

    const key = `clients:${row.groupId}`;
    const isOpen = expandedGroupKeys.has(key);
    const groupName = row.groupName.trim() || `Groupe #${row.groupId}`;
    const groupSolde = row.members.reduce((sum, member) => sum + Number(member.solde || 0), 0);
    const groupPlafond = row.members.reduce((sum, member) => sum + Number(member.plafond || 0), 0);
    const groupGarantie = row.members.reduce((sum, member) => sum + Number(member.montant_garantie || 0), 0);
    const groupTotalCumule = row.members.reduce((sum, member) => sum + Number(member.total_cumule || 0), 0);

    return (
      <React.Fragment key={`group-${row.groupId}`}>
        <tr className="bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer" onClick={() => toggleGroupExpanded(row.groupId)}>
          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={row.members.length > 0 && row.members.every(member => selectedListIds.has(Number(member.id)))}
              onChange={() => {
                setSelectedListIds(prev => {
                  const next = new Set(prev);
                  const allSelected = row.members.every(member => next.has(Number(member.id)));
                  row.members.forEach(member => {
                    const id = Number(member.id);
                    if (allSelected) next.delete(id);
                    else next.add(id);
                  });
                  return next;
                });
              }}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              title="Selectionner le groupe pour impression"
            />
          </td>
          <td className="px-4 py-3 text-gray-400 text-xs">{rowLabel}</td>
          <td className="px-4 py-3 font-mono text-xs text-gray-500">G{row.groupId}</td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="w-4 h-4 text-blue-600" /> : <ChevronRight className="w-4 h-4 text-blue-600" />}
              <div>
                <p className="font-semibold text-gray-900 leading-tight">{groupName}</p>
                <p className="text-xs text-gray-500">{row.members.length} client{row.members.length > 1 ? 's' : ''}</p>
              </div>
            </div>
          </td>
          <td className="px-4 py-3 text-gray-600">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Groupe</span>
          </td>
          <td className="px-4 py-3 text-gray-400 text-xs">â€”</td>
          <td className="px-4 py-3 text-gray-400 text-xs">â€”</td>
          <td className="px-4 py-3 text-gray-400 text-xs text-center">-</td>
          <td className="px-4 py-3 text-right">
            <span className={`font-semibold text-sm ${groupSolde < 0 ? 'text-red-600' : groupSolde > 0 ? 'text-green-600' : 'text-gray-500'}`}>
              {fmt(groupSolde)}
            </span>
          </td>
          <td className="px-4 py-3 text-right">
            <span className="font-semibold text-sm text-gray-700">{fmt(groupPlafond)}</span>
          </td>
          <td className="px-4 py-3 text-right">
            <span className="font-semibold text-sm text-emerald-700">{fmt(groupGarantie)}</span>
          </td>
          <td className="px-4 py-3 text-right bg-yellow-50/60 border-l border-yellow-100">
            <span className={`font-bold text-sm ${groupTotalCumule > 0 ? 'text-red-600' : groupTotalCumule < 0 ? 'text-green-600' : 'text-gray-500'}`}>
              {fmt(groupTotalCumule)}
            </span>
          </td>
          <td className="px-4 py-3" />
        </tr>
        {isOpen && row.members.map((client) => renderClientDataRow(client, 'â€¢', `group-${row.groupId}-client-${client.id}`))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><Users className="w-6 h-6 text-blue-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Clients</h1>
            <p className="text-sm text-gray-500">{total} client{total !== 1 ? 's' : ''} au total</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau Client
        </button>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-1 gap-3">
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Solde cumulé (tous les clients)</p>
          <p className={`font-bold text-sm ${totalCumuleClients > 0 ? 'text-red-600' : totalCumuleClients < 0 ? 'text-green-600' : 'text-gray-500'}`}>{fmt(totalCumuleClients)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => handleSearchChange(e.target.value)}
            placeholder="Rechercher par nom, société, tél..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-gray-400">—</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setCurrentPage(1); }}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors px-1">✕</button>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Par page :</span>
            <select value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {ITEMS_PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n === 0 ? 'Afficher tous' : n}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={handlePrintList}
            disabled={isLoading || isFetching || isPrintFetching}
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm transition-colors"
            title={selectedListRows.length > 0 ? 'Imprimer les lignes selectionnees' : 'Imprimer toute la liste filtree'}
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-10">
                  <input
                    type="checkbox"
                    checked={clients.length > 0 && clients.every((client: Contact) => selectedListIds.has(Number(client.id)))}
                    onChange={toggleAllListSelection}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    title="Selectionner toutes les lignes affichees"
                  />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-12">#</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-16">ID</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-600" onClick={() => handleSort('nom')}>
                  Nom complet <SortIcon col="nom" />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-600" onClick={() => handleSort('societe')}>
                  Société <SortIcon col="societe" />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Adresse</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Bloque</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-600" onClick={() => handleSort('solde')}>
                  Solde <SortIcon col="solde" />
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">
                  Plafond
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">
                  Garantie
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 bg-yellow-50 border-l border-yellow-200 cursor-pointer select-none hover:text-blue-600" onClick={() => handleSort('total_cumule')}>
                  Total cumulé <SortIcon col="total_cumule" />
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading || isFetching
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 13 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-3/4" /></td>
                      ))}
                    </tr>
                  ))
                : visibleAccordionRows.length === 0
                  ? <tr><td colSpan={13} className="px-4 py-14 text-center text-gray-400">
                      <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" /><p>Aucun client trouvé</p>
                    </td></tr>
                  : (visibleAccordionRows.map((row, idx: number) => renderAccordionRow(row, idx)) || clients.map((client: Contact, idx: number) => (
                      <tr key={client.id} className="hover:bg-blue-50 transition-colors cursor-pointer"
                        onClick={() => handleRowClick(client.id)}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{(itemsPerPage === 0 ? 0 : (currentPage - 1) * itemsPerPage) + idx + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{client.id}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-blue-600">
                                {(client.nom_complet || client.societe || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 leading-tight">{client.nom_complet}</p>
                              {client.reference && <p className="text-xs text-gray-400">Réf: {client.reference}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {client.societe
                            ? <div className="flex items-center gap-1.5 text-gray-700"><Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />{client.societe}</div>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            {client.telephone && <div className="flex items-center gap-1.5 text-gray-600 text-xs"><Phone className="w-3 h-3 text-gray-400" />{client.telephone}</div>}
                            {client.email && <div className="flex items-center gap-1.5 text-gray-600 text-xs"><Mail className="w-3 h-3 text-gray-400" /><span className="truncate max-w-[160px]">{client.email}</span></div>}
                            {!client.telephone && !client.email && <span className="text-gray-300 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {client.adresse
                            ? <div className="flex items-center gap-1.5 text-gray-600 text-xs"><MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" /><span className="truncate max-w-[180px]">{client.adresse}</span></div>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold text-sm ${client.solde < 0 ? 'text-red-600' : client.solde > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                            {fmt(client.solde)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {client.plafond !== null && client.plafond !== undefined
                            ? <span className="font-semibold text-sm text-gray-700">{fmt(client.plafond)}</span>
                            : <span className="text-gray-300 text-xs">-</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {client.montant_garantie !== null && client.montant_garantie !== undefined
                            ? <span className="font-semibold text-sm text-emerald-700">{fmt(client.montant_garantie)}</span>
                            : <span className="text-gray-300 text-xs">-</span>}
                        </td>
                        <td className="px-4 py-3 text-right bg-yellow-50/60 border-l border-yellow-100">
                          {client.total_cumule !== null && client.total_cumule !== undefined
                            ? <span className={`font-bold text-sm ${client.total_cumule > 0 ? 'text-red-600' : client.total_cumule < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                                {fmt(client.total_cumule)}
                              </span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                      </tr>
                    )))
              }
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && itemsPerPage !== 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-gray-500">
            Affichage {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, total)} sur {total}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {pageNumbers().map((p, i) =>
              p < 0
                ? <span key={`e${i}`} className="px-2 text-gray-400">…</span>
                : <button key={p} onClick={() => setCurrentPage(p)}
                    className={`min-w-[36px] h-9 px-2 rounded-md border text-sm font-medium transition-colors ${currentPage === p ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    {p}
                  </button>
            )}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <ContactFormModal
        isOpen={isContactModalOpen}
        onClose={() => {
          setIsContactModalOpen(false);
          setEditingContact(null);
        }}
        contactType="Client"
        initialValues={editingContact || undefined}
        defaultIsCharge={false}
        onContactAdded={() => {
          setIsContactModalOpen(false);
          setEditingContact(null);
        }}
      />
    </div>
  );
};

// ─── Router entry ─────────────────────────────────────────────────────────────
// App.tsx doit avoir deux routes :
//   /clients       → <ClientsListPage />
//   /clients/:id   → <ClientDetailPage />
// Ce fichier exporte les deux composants.

export { ClientDetailPage };
export default ClientsListPage;

