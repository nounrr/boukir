import React from 'react';
import type { Contact } from '../types';
import type { ContactPrintMode, PriceMode } from './ContactPrintTemplate';
import { pickDesignationForLang, type DesignationLang } from '../utils/designationLang';
import { toBackendUrl } from '../utils/url';
import { useCanViewInternalPrices } from '../hooks/useCanViewInternalPrices';

interface Props {
  contact: Contact;
  mode: ContactPrintMode;
  productHistory: any[];
  transactions: any[];
  products: any[];
  designationLang: DesignationLang;
  includeProductImages: boolean;
  priceMode: PriceMode;
  totalQty?: number;
  totalAmount?: number;
  finalSolde?: number;
  totalDebit?: number;
  totalCredit?: number;
  dateFrom?: string;
  dateTo?: string;
}

const money = (value: any) => `${new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)} DH`;
const number = (value: any) => new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 2 }).format(Number(value) || 0);
const date = (value: any) => { if (!value) return ''; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('fr-FR'); };

const MobileContactReader: React.FC<Props> = ({ contact, mode, productHistory, transactions, products, designationLang, includeProductImages, priceMode, totalQty, totalAmount, finalSolde, totalDebit, totalCredit, dateFrom, dateTo }) => {
  const canViewInternalPrices = useCanViewInternalPrices();
  const rows = mode === 'products' ? productHistory : transactions;
  const showPrices = priceMode === 'WITH_PRICES' && (canViewInternalPrices || contact.type !== 'Fournisseur');
  return <section className="space-y-3" aria-label="Lecture du détail sur téléphone">
    <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-blue-700">{mode === 'products' ? 'Détail des produits' : 'Transactions'}</p><h3 className="mt-1 break-words text-xl font-bold text-slate-900">{contact.societe || contact.nom_complet}</h3>{(dateFrom || dateTo) && <p className="mt-2 text-sm text-slate-600">{date(dateFrom) || 'Début'} — {date(dateTo) || 'Aujourd’hui'}</p>}</div>
    {(totalQty !== undefined || (showPrices && totalAmount !== undefined) || finalSolde !== undefined) && <div className="grid grid-cols-2 gap-2">
      {totalQty !== undefined && <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Quantité totale</p><strong className="text-lg text-slate-900">{number(totalQty)}</strong></div>}
      {showPrices && totalAmount !== undefined && <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Montant total</p><strong className="text-lg text-slate-900">{money(totalAmount)}</strong></div>}
      {showPrices && finalSolde !== undefined && <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Solde final</p><strong className="text-lg text-slate-900">{money(finalSolde)}</strong></div>}
      {showPrices && totalDebit !== undefined && <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Débit</p><strong className="text-lg text-slate-900">{money(totalDebit)}</strong></div>}
      {showPrices && totalCredit !== undefined && <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Crédit</p><strong className="text-lg text-slate-900">{money(totalCredit)}</strong></div>}
    </div>}
    <p className="px-1 text-sm font-semibold text-slate-700">{rows.length} ligne{rows.length !== 1 ? 's' : ''}</p>
    {rows.map((row, index) => {
      const product = products.find(p => String(p?.id) === String(row.product_id));
      const fallback = row.product_designation || row.designation || row.type || 'Produit';
      const label = mode === 'products' ? pickDesignationForLang(designationLang, fallback, row, product) : (row.type || row.libelle || 'Transaction');
      const image = toBackendUrl(row.product_image_url || row.image_url || product?.image_url);
      const isPayment = String(row.type || '').toLowerCase() === 'paiement';
      return <article key={row.id ?? index} className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">{mode === 'products' && includeProductImages && !isPayment && image && <img src={image} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-slate-100 object-contain" />}<div className="min-w-0 flex-1"><p className="break-words font-semibold text-slate-900">{label}</p><p className="mt-1 text-xs text-slate-500">{row.bon_numero || row.numero || row.product_reference || ''}{(row.bon_date_iso || row.bon_date || row.date) && ` · ${date(row.bon_date_iso || row.bon_date || row.date)}`}</p></div></div>
        {row.adresse_livraison && <p className="mt-2 break-words text-xs text-slate-600">Livraison : {row.adresse_livraison}</p>}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-sm">
          {mode === 'products' && !isPayment && !row.syntheticInitial && <div><p className="text-xs text-slate-500">Quantité</p><p className="font-semibold">{number(row.quantite)}</p></div>}
          {showPrices && mode === 'products' && !isPayment && !row.syntheticInitial && <div><p className="text-xs text-slate-500">Prix unitaire</p><p className="font-semibold">{money(row.prix_achat ?? row.prix_unitaire)}</p></div>}
          {showPrices && <div><p className="text-xs text-slate-500">Montant</p><p className="font-bold text-blue-700">{money(mode === 'products' ? (row.total ?? row.montant ?? ((Number(row.quantite) || 0) * (Number(row.prix_unitaire) || 0))) : row.montant)}</p></div>}
        </div>
      </article>;
    })}
  </section>;
};

export default MobileContactReader;
