import React from 'react';
import type { Contact } from '../types';
import CompanyHeader from './CompanyHeader';

export type CompanyType = 'DIAMOND' | 'MPC';
export type ContactPrintMode = 'transactions' | 'products';
export type PriceMode = 'WITH_PRICES' | 'WITHOUT_PRICES';

interface ContactPrintTemplateProps {
  contact: Contact;
  mode: ContactPrintMode;
  transactions: any[];
  productHistory: any[];
  dateFrom?: string;
  dateTo?: string;
  companyType: CompanyType;
  priceMode: PriceMode;
  size?: 'A4' | 'A5';
  // When true, do not prepend a synthetic initial balance row
  skipInitialRow?: boolean;
}

const fmt = (n: any) => Number(n || 0).toFixed(2);
const fmtDate = (d?: string) => {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return dt.toLocaleDateString('fr-FR');
  } catch {}
  // fallback for dd-mm-yyyy input
  const parts = d.includes('-') ? d.split('-') : [];
  if (parts.length === 3) return `${parts[0]}/${parts[1]}/${parts[2]}`;
  return d;
};

// Date + heure (HH:MM) si possible
const fmtDateTime = (d?: string) => {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('fr-FR') + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
  } catch {}
  // fallback utilise fmtDate (sans heure)
  return fmtDate(d);
};

const ContactPrintTemplate: React.FC<ContactPrintTemplateProps> = ({
  contact,
  mode,
  transactions,
  productHistory,
  dateFrom,
  dateTo,
  companyType,
  priceMode,
  size = 'A4',
  skipInitialRow = false,
}) => {
  const showPrices = priceMode === 'WITH_PRICES';
  const initialSolde = Number((contact as any)?.solde ?? 0);
  const contactDisplayName = (
    (typeof contact?.societe === 'string' && contact.societe.trim())
      ? contact.societe
      : (contact?.nom_complet || '-')
  );
  // Détection fournisseur
  const isFournisseur = (() => {
    const t = String((contact as any)?.type || (contact as any)?.categorie || '').toLowerCase();
    if (t.includes('fournisseur')) return true;
    if ((contact as any)?.is_fournisseur === true) return true;
    return false;
  })();

  // Synthetic first rows with initial balance
  const txInitialRow: any = {
    id: 'initial-solde-transaction',
    date: '',
    dateISO: '',
    numero: '—',
    type: 'Solde initial',
    montant: 0,
    statut: '-',
    soldeCumulatif: initialSolde,
    syntheticInitial: true,
  };
  const prInitialRow: any = {
    id: 'initial-solde-produit',
    bon_date: '',
    bon_numero: '—',
    product_reference: '—',
    product_designation: 'Solde initial',
    quantite: 0,
    prix_unitaire: 0,
    total: 0,
    bon_statut: '-',
    soldeCumulatif: initialSolde,
    type: 'solde',
    syntheticInitial: true,
  };

  // Use incoming lists; optionally prepend synthetic initial row unless skipping
  let txList: any[] = Array.isArray(transactions) ? transactions : [];
  if (!(txList[0]?.syntheticInitial) && !skipInitialRow) {
    txList = [txInitialRow, ...txList];
  }
  let prList: any[] = Array.isArray(productHistory) ? productHistory : [];
  if (!(prList[0]?.syntheticInitial) && !skipInitialRow) {
    prList = [prInitialRow, ...prList];
  }

  // ================= Dynamic column presence (products mode) =================
  const hasAnyAddress = prList.some(r => !r.syntheticInitial && r.adresse_livraison && String(r.adresse_livraison).trim() !== '');
  const hasAnyReference = prList.some(r => !r.syntheticInitial && r.product_reference && String(r.product_reference).trim() !== '');

  // Base width units (will be normalized to %). We use units instead of direct % so we can redistribute.
  const baseUnits = {
    date: 8,
    bon: 8,
    reference: hasAnyReference ? 9 : 4, // shrink if empty
    designation: 24,
    address: hasAnyAddress ? 18 : 4,    // shrink if empty
    qty: 5,
    unit: 9,
    total: 9,
    solde: 10,
  };
  const colUnits: typeof baseUnits = { ...baseUnits };
  // If a column is shrunk (empty), reallocate freed units to designation for readability
  if (!hasAnyAddress) colUnits.designation += 14; // 18 - 4 = 14 freed
  if (!hasAnyReference) colUnits.designation += 5; // 9 - 4 = 5 freed

  // When prices hidden, remove the price/total/solde columns from unit distribution
  const unitSum = Object.entries(colUnits)
    .filter(([k]) => {
      if (mode !== 'products') return false; // only relevant in products mode
      if (!showPrices && (k === 'unit' || k === 'total' || k === 'solde')) return false;
      return true;
    })
    .reduce((s, [, v]) => s + v, 0) || 1;

  const toPct = (k: keyof typeof colUnits) => {
    if (mode !== 'products') return undefined;
    if (!showPrices && (k === 'unit' || k === 'total' || k === 'solde')) return undefined;
    const pct = (colUnits[k] / unitSum) * 100;
    return pct.toFixed(2) + '%';
  };

  // Totals for products print (respect current filtered list)
  const prDataRows: any[] = Array.isArray(prList) ? prList.filter((r: any) => !r?.syntheticInitial) : [];
  // Total quantity: products add, avoir subtract
  const totalQtyProducts: number = prDataRows.reduce((sum: number, r: any) => {
    const t = String(r.type || '').toLowerCase();
    const q = Number(r.quantite) || 0;
    if (t === 'produit') return sum + q;
    if (t === 'avoir') return sum - q;
    return sum;
  }, 0);
  const totalAmountProducts: number = prDataRows
    .filter((r: any) => String(r.type || '').toLowerCase() === 'produit')
    .reduce((sum: number, r: any) => sum + (Number(r.total) || 0), 0);
  const finalSoldeProducts: number = (prList && prList.length > 0)
    ? Number(prList[prList.length - 1]?.soldeCumulatif || initialSolde)
    : initialSolde;

  return (
    <div
      className={`bg-white ${size === 'A5' ? 'w-[148mm] min-h-[210mm]' : 'w-[210mm] min-h-[297mm]'} mx-auto p-4 font-sans text-sm`}
      style={{ position: 'relative' }}
    >
      {/* Compact print styles to prevent table cutting */}
      <style>{`
        ${size === 'A5' ? `.print-compact { font-size:11px; } .print-compact h2 { font-size:12px; } @media print { .print-compact { font-size:9px; } }` : `.print-compact { font-size:12px; } .print-compact h2 { font-size:14px; } @media print { .print-compact { font-size:10px; } }`}
        .print-compact table { width:100%; border-collapse:collapse; table-layout:fixed; }
        /* default: normal weight for table cells */
        .print-compact th, .print-compact td { border:1px solid #d1d5db; padding:3px 4px; font-size:10px; line-height:1.15; vertical-align:top; font-weight:normal; }
        @media print { .print-compact th, .print-compact td { font-size:${size === 'A5' ? '7.5px' : '8.5px'}; padding:2px 3px; } }
  .print-compact .cell-num { font-family:"Courier New",monospace; text-align:right; white-space:nowrap; font-weight:700; }
        .print-compact .col-bon { font-weight:normal; }
        .print-compact .cell-wrap { white-space:normal; word-break:break-word; hyphens:auto; }
        .print-compact .row-alt:nth-child(odd) { background:#f9fafb; }
        @media print { .print-compact .row-alt:nth-child(odd) { background:#f3f4f6 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
        /* headers remain bold */
        .print-compact .header-row th, .print-compact .header-row td { background:#f97316; color:#fff; font-weight:700; }
        @media print { .print-compact .header-row { background:#f97316 !important; color:#fff !important; } }
        .print-compact .col-empty { opacity:0.6; }
        .print-compact .truncate-if-empty { max-width:38px; overflow:hidden; text-overflow:ellipsis; }
  /* Désignation normal weight (only numeric columns are bold) */
  .print-compact .fit-designation { width:fit-content !important; max-width:320px; min-width:60px; font-weight:normal; }
      `}</style>
      {/* Header */}
      <CompanyHeader companyType={companyType} />

      {/* Contact block */}
      <div className="mt-4 mb-6 grid grid-cols-2 gap-4">
        <div className="bg-gray-50 p-3 rounded border-l-4 border-orange-500">
          <div className="text-sm"><span className="font-semibold">Nom:</span> {contactDisplayName}</div>
          <div className="text-sm"><span className="font-semibold">Téléphone:</span> {contact?.telephone || '-'}</div>
          <div className="text-sm"><span className="font-semibold">Email:</span> {contact?.email || '-'}</div>
          <div className="text-sm"><span className="font-semibold">Adresse:</span> {contact?.adresse || '-'}</div>
        </div>
        {(dateFrom || dateTo) && (
          <div className="text-right text-sm self-start">
            <div className="inline-block bg-orange-100 text-orange-800 px-3 py-1 rounded-full">
              Période: {dateFrom || '...'} → {dateTo || '...'}
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      {mode === 'transactions' ? (
        <div className="print-compact">
          <h2 className="font-semibold mb-2">Historique des Transactions</h2>
          <table>
            <thead>
              <tr className="header-row">
                <th>Date</th>
                <th>Numéro</th>
                <th>Type</th>
                {showPrices ? <th className="cell-num">Montant (DH)</th> : <th>Statut/Mode</th>}
                {showPrices && <th className="cell-num">Solde Cumulé</th>}
              </tr>
            </thead>
            <tbody>
              {txList.length === 0 ? (
                <tr><td colSpan={showPrices ? 5 : 4} className="text-center text-gray-500 py-3">Aucune donnée</td></tr>
              ) : txList.map(t => {
                const isPayment = String(t.statut || '').toLowerCase() === 'paiement' || String(t.type || '').toLowerCase() === 'paiement';
                const isAvoir = String(t.type || '').toLowerCase().includes('avoir');
                const reduceBalance = isPayment || isAvoir;
                return (
                  <tr key={t.id} className="row-alt">
                    <td>{t.syntheticInitial ? '-' : fmtDateTime(t.dateISO || t.date)}</td>
                    <td>{t.numero}</td>
                    <td>{t.type}</td>
                    {showPrices ? (
                      <>
                        <td className={`cell-num ${t.syntheticInitial ? 'text-gray-500' : reduceBalance ? 'text-green-700' : 'text-blue-700'}`}>{t.syntheticInitial ? '—' : (reduceBalance ? '-' : '+')}{t.syntheticInitial ? '' : fmt(t.montant)}</td>
                        <td className="cell-num">{fmt(t.soldeCumulatif)}</td>
                      </>
                    ) : <td>{t.syntheticInitial ? '-' : (t.statut || (isPayment ? 'Paiement' : '-'))}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="print-compact">
          <h2 className="font-semibold mb-2">Historique Détaillé des Produits</h2>
          <table>
            <thead>
              <tr className="header-row">
                <th style={{width: toPct('date')}}>Date</th>
                <th style={{width: toPct('bon')}} className="col-bon">Bon N°</th>
                <th style={{width: toPct('reference')}} className={!hasAnyReference ? 'col-empty' : ''}>{hasAnyReference ? 'Référence' : 'Réf.'}</th>
                <th style={{width:'fit-content', maxWidth:'320px', minWidth:'60px'}} className="fit-designation">Désignation</th>
                <th style={{width: toPct('address')}} className={!hasAnyAddress ? 'col-empty' : ''}>{hasAnyAddress ? 'Adresse Livraison' : 'Adr.'}</th>
                <th style={{width: toPct('qty')}} className="cell-num">Qté</th>
                {showPrices ? <th style={{width: toPct('unit')}} className="cell-num">{isFournisseur ? 'Prix Achat' : 'Prix Unit.'}</th> : <th style={{width: toPct('unit')}}>Statut</th>}
                {showPrices && <th style={{width: toPct('total')}} className="cell-num">Total</th>}
                {showPrices && <th style={{width: toPct('solde')}} className="cell-num">Solde Cumulé</th>}
              </tr>
            </thead>
            <tbody>
              {prList.length === 0 ? (
                <tr><td colSpan={showPrices ? 9 : 7} className="text-center text-gray-500 py-3">Aucune donnée</td></tr>
              ) : prList.map(it => {
                const type = String(it.type || '').toLowerCase();
                const isPaymentOrAvoir = type === 'paiement' || type === 'avoir';
                const totalVal = Number(it.total) || 0;
                const reduceBalance = isPaymentOrAvoir;
                const displayTotal = it.syntheticInitial ? '' : (reduceBalance ? -totalVal : totalVal);
                return (
                  <tr key={it.id} className="row-alt">
                    <td>{it.syntheticInitial ? '-' : fmtDateTime(it.bon_date_iso || it.date || it.bon_date)}</td>
                    <td className="col-bon">{it.bon_numero}</td>
                    <td className={`cell-wrap ${!hasAnyReference ? 'truncate-if-empty' : ''}`}>{it.syntheticInitial ? '—' : (it.product_reference || (!hasAnyReference ? '' : '—'))}</td>
                    <td className="cell-wrap fit-designation">{it.syntheticInitial ? 'Solde initial' : it.product_designation}</td>
                    <td className={`cell-wrap ${!hasAnyAddress ? 'truncate-if-empty' : ''}`}>{it.syntheticInitial ? '-' : (it.adresse_livraison || (!hasAnyAddress ? '' : '-'))}</td>
                    <td className="cell-num">{it.syntheticInitial ? '—' : it.quantite}</td>
                    {showPrices ? (
                      <>
                        <td className="cell-num">{it.syntheticInitial ? '—' : fmt(isFournisseur ? (it.prix_achat ?? it.prix_unitaire) : it.prix_unitaire)}</td>
                        <td className={`cell-num ${it.syntheticInitial ? 'text-gray-500' : reduceBalance ? 'text-green-700' : ''}`}>{it.syntheticInitial ? '—' : fmt(displayTotal)}</td>
                        <td className="cell-num">{fmt(it.soldeCumulatif)}</td>
                      </>
                    ) : <td>{it.syntheticInitial ? '-' : (it.bon_statut || '-')}</td>}
                  </tr>
                );
              })}
            </tbody>
            {showPrices && (
              <tfoot>
                <tr>
                  <td>—</td>
                  <td>—</td>
                  <td>{hasAnyReference ? '—' : ''}</td>
                  <td className="cell-wrap">TOTAL</td>
                  <td>{hasAnyAddress ? '—' : ''}</td>
                  <td className="cell-num">{totalQtyProducts}</td>
                  <td className="cell-num">—</td>
                  <td className="cell-num">{fmt(totalAmountProducts)}</td>
                  <td className="cell-num">{fmt(finalSoldeProducts)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

export default ContactPrintTemplate;
