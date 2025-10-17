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
  hideCumulative?: boolean;
  // Pre-calculated totals from the page (to avoid recalculation mismatch)
  totalQty?: number;
  totalAmount?: number;
  finalSolde?: number;
}

const fmt = (n: any) => Number(n || 0).toFixed(2);
const fmtDate = (d?: string) => {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return dt.toLocaleDateString('fr-FR');
  } catch {}
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
      return (
        dt.toLocaleDateString('fr-FR') +
        ' ' +
        dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      );
    }
  } catch {}
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
  hideCumulative = false,
  totalQty,
  totalAmount,
  finalSolde,
}) => {
  // hideCumulative: when true, don't render the 'Solde Cumulé' column (for selected/compact prints)
  const showPrices = priceMode === 'WITH_PRICES';
  const initialSolde = Number((contact as any)?.solde ?? 0);

  const contactDisplayName =
    typeof contact?.societe === 'string' && contact.societe.trim()
      ? contact.societe
      : contact?.nom_complet || '-';

  const isFournisseur = (() => {
    const t = String((contact as any)?.type || (contact as any)?.categorie || '').toLowerCase();
    if (t.includes('fournisseur')) return true;
    if ((contact as any)?.is_fournisseur === true) return true;
    return false;
  })();

  // Lignes synthétiques “Solde initial”
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

  // Listes avec éventuelle ligne initiale
  let txList: any[] = Array.isArray(transactions) ? transactions : [];
  if (!(txList[0]?.syntheticInitial) && !skipInitialRow) {
    txList = [txInitialRow, ...txList];
  }
  let prList: any[] = Array.isArray(productHistory) ? productHistory : [];
  if (!(prList[0]?.syntheticInitial) && !skipInitialRow) {
    prList = [prInitialRow, ...prList];
  }

  // Présence de colonnes (pour les libellés uniquement)
  const hasAnyAddress = prList.some(
    (r) => !r.syntheticInitial && r.adresse_livraison && String(r.adresse_livraison).trim() !== ''
  );
  const hasAnyReference = prList.some(
    (r) => !r.syntheticInitial && r.product_reference && String(r.product_reference).trim() !== ''
  );

  // Totaux (produits) - use pre-calculated values if provided, otherwise calculate
  const prDataRows: any[] = Array.isArray(prList) ? prList.filter((r: any) => !r?.syntheticInitial) : [];
  const totalQtyProducts: number = totalQty !== undefined ? totalQty : prDataRows.reduce((sum: number, r: any) => {
    const t = String(r.type || '').toLowerCase();
    const q = Number(r.quantite) || 0;
    if (t === 'produit') return sum + q;
    if (t === 'avoir') return sum - q;
    return sum;
  }, 0);
  const totalAmountProducts: number = totalAmount !== undefined ? totalAmount : prDataRows
    .filter((r: any) => String(r.type || '').toLowerCase() === 'produit')
    .reduce((sum: number, r: any) => sum + (Number(r.total) || 0), 0);
  const finalSoldeProducts: number = finalSolde !== undefined ? finalSolde :
    (prList && prList.length > 0 ? Number(prList[prList.length - 1]?.soldeCumulatif || initialSolde) : initialSolde);

  // Rendu “Bon N° + Date” (date intégrée dans la même colonne, en dessous)
  const renderBonWithDate = (num: any, dateLike?: string) => {
    const dateTxt = fmtDateTime(dateLike);
    return (
      <div className="flex flex-col leading-tight">
        <span className="font-medium">{num || '—'}</span>
        <span className="text-[10px] text-gray-600">{dateTxt || '—'}</span>
      </div>
    );
  };

  return (
    <div
      className={`bg-white ${
        size === 'A5' ? 'w-[148mm] min-h-[210mm]' : 'w-[210mm] min-h-[297mm]'
      } mx-auto p-4 font-sans text-sm`}
      style={{ position: 'relative' }}
    >
      {/* Styles impression compacts (sans width:100% ni table-layout:fixed) */}
      <style>{`
        ${size === 'A5'
          ? `.print-compact { font-size:11px; } .print-compact h2 { font-size:12px; } @media print { .print-compact { font-size:9px; } }`
          : `.print-compact { font-size:12px; } .print-compact h2 { font-size:14px; } @media print { .print-compact { font-size:15px; } }`
        }
        .print-compact table { border-collapse: collapse; /* pas de width:100% */ }
        .print-compact th, .print-compact td {
          border:1px solid #d1d5db; padding:4px 6px; line-height:1.2; font-weight:normal; vertical-align:top;
        }
        @media print {
          .print-compact th, .print-compact td { padding:${size === 'A5' ? '2px 3px' : '3px 4px'}; }
        }
        .print-compact .cell-num { font-family:"Courier New",monospace; text-align:right; white-space:nowrap; font-weight:700; }
        .print-compact .cell-wrap { white-space:normal; word-break:break-word; hyphens:auto; }
        .print-compact .row-alt:nth-child(odd) { background:#f9fafb; }
        @media print { .print-compact .row-alt:nth-child(odd) { background:#f3f4f6 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
        /* Color coding for product details - display only, not print */
        .print-compact .row-avoir { background:#fed7aa !important; }
        .print-compact .row-payment { background:#bbf7d0 !important; }
        @media print { 
          .print-compact .row-avoir { background:inherit !important; } 
          .print-compact .row-payment { background:inherit !important; } 
        }
        .print-compact .header-row th, .print-compact .header-row td { background:#f97316; color:#fff; font-weight:700; }
        @media print { .print-compact .header-row { background:#f97316 !important; color:#fff !important; } }
        /* Rendre la table naturellement compacte : les colonnes prennent l'espace de leur contenu */
        .print-compact table { max-width: 100%; }
        /* Autoriser le wrap sur Désignation et Adresse */
        .print-compact .col-designation, .print-compact .col-address { white-space: normal; }
        /* Légère contrainte pour éviter des colonnes infinies */
        .print-compact .col-designation { max-width: 320px; }
        .print-compact .col-address { max-width: 260px; }
      `}</style>

      {/* En-tête société */}
      <CompanyHeader companyType={companyType} />

      {/* Bloc contact + période */}
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

      {/* Corps */}
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
                {showPrices && !hideCumulative && <th className="cell-num">Solde Cumulé</th>}
              </tr>
            </thead>
            <tbody>
              {txList.length === 0 ? (
                <tr>
                  <td colSpan={showPrices ? 5 : 4} className="text-center text-gray-500 py-3">Aucune donnée</td>
                </tr>
              ) : (
                txList.map((t) => {
                  const isPayment =
                    String(t.statut || '').toLowerCase() === 'paiement' ||
                    String(t.type || '').toLowerCase() === 'paiement';
                  const isAvoir = String(t.type || '').toLowerCase().includes('avoir');
                  const reduceBalance = isPayment || isAvoir;
                  return (
                    <tr key={t.id} className="row-alt">
                      <td>{t.syntheticInitial ? '-' : fmtDateTime(t.dateISO || t.date)}</td>
                      <td>{t.numero}</td>
                      <td>{t.type}</td>
                      {showPrices ? (
                        <>
                          <td
                            className={`cell-num ${
                              t.syntheticInitial
                                ? 'text-gray-500'
                                : reduceBalance
                                ? 'text-green-700'
                                : 'text-blue-700'
                            }`}
                          >
                            {t.syntheticInitial ? '—' : reduceBalance ? '-' : '+'}
                            {t.syntheticInitial ? '' : fmt(t.montant)}
                          </td>
                          {!hideCumulative && <td className="cell-num">{fmt(t.soldeCumulatif)}</td>}
                        </>
                      ) : (
                        <td>{t.syntheticInitial ? '-' : t.statut || (isPayment ? 'Paiement' : '-')}</td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="print-compact">
          <h2 className="font-semibold mb-2">Historique Détaillé des Produits</h2>
          <table>
            <thead>
              <tr className="header-row">
                {/* Bon N° avec Date intégrée sous le numéro */}
                <th>Bon N° / Date</th>
                <th>{hasAnyReference ? 'Référence' : 'Réf.'}</th>
                <th className="col-designation">Désignation</th>
                <th className="col-address">{hasAnyAddress ? 'Adresse Livraison' : 'Adr.'}</th>
                <th className="cell-num">Qté</th>
                {showPrices ? (
                  <>
                    <th className="cell-num">{isFournisseur ? 'Prix Achat' : 'Prix Unit.'}</th>
                    <th className="cell-num">Total</th>
                    {!hideCumulative && <th className="cell-num">Solde Cumulé</th>}
                  </>
                ) : (
                  <th>Statut</th>
                )}
              </tr>
            </thead>
            <tbody>
              {prList.length === 0 ? (
                <tr>
                  <td colSpan={showPrices ? 8 : 6} className="text-center text-gray-500 py-3">
                    Aucune donnée
                  </td>
                </tr>
              ) : (
                prList.map((it) => {
                  const type = String(it.type || '').toLowerCase();
                  const isPaymentOrAvoir = type === 'paiement' || type === 'avoir';
                  const totalVal = Number(it.total) || 0;
                  const reduceBalance = isPaymentOrAvoir;
                  const displayTotal = it.syntheticInitial ? '' : reduceBalance ? -totalVal : totalVal;
                  const dateCandidate = it.bon_date_iso || it.date || it.bon_date;

                  // Get color class based on transaction type
                  const getRowColorClass = () => {
                    // Check for all avoir types: Avoir (client), AvoirFournisseur, AvoirComptant
                    if (type.includes('avoir')) {
                      return 'row-avoir';
                    }
                    if (type === 'paiement') {
                      return 'row-payment';
                    }
                    return '';
                  };

                  return (
                    <tr key={it.id} className={`row-alt ${getRowColorClass()}`}>
                      {/* Bon N° + Date (stack) */}
                      <td>
                        {it.syntheticInitial
                          ? renderBonWithDate('—', '')
                          : renderBonWithDate(it.bon_numero, dateCandidate)}
                      </td>

                      {/* Référence (wrap autorisé, libellé court si vide globalement) */}
                      <td className="cell-wrap">
                        {it.syntheticInitial
                          ? '—'
                          : it.product_reference || (!hasAnyReference ? '' : '—')}
                      </td>

                      {/* Désignation (wrap libre) */}
                      <td className="cell-wrap col-designation">
                        {it.syntheticInitial ? 'Solde initial' : it.product_designation}
                      </td>

                      {/* Adresse (wrap libre) */}
                      <td className="cell-wrap col-address">
                        {it.syntheticInitial ? '-' : it.adresse_livraison || (!hasAnyAddress ? '' : '-')}
                      </td>

                      {/* Quantité */}
                      <td className="cell-num">{it.syntheticInitial ? '—' : it.quantite}</td>

                      {/* Prix / Total / Solde ou Statut */}
                      {showPrices ? (
                        <>
                          <td className="cell-num">
                            {it.syntheticInitial
                              ? '—'
                              : fmt(isFournisseur ? (it.prix_achat ?? it.prix_unitaire) : it.prix_unitaire)}
                          </td>
                          <td className={`cell-num ${it.syntheticInitial ? 'text-gray-500' : reduceBalance ? 'text-green-700' : ''}`}>
                            {it.syntheticInitial ? '—' : fmt(displayTotal)}
                          </td>
                          {!hideCumulative && (
                            <td className="cell-num">{fmt(it.soldeCumulatif)}</td>
                          )}
                        </>
                      ) : (
                        <td>{it.syntheticInitial ? '-' : it.bon_statut || '-'}</td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>

            {showPrices && (
              <tfoot>
                <tr>
                  <td>—</td>
                  <td>{hasAnyReference ? '—' : ''}</td>
                  <td className="cell-wrap">TOTAL</td>
                  <td>{hasAnyAddress ? '—' : ''}</td>
                  <td className="cell-num">{totalQtyProducts}</td>
                  <td className="cell-num">—</td>
                  <td className="cell-num">{fmt(totalAmountProducts)}</td>
                  {!hideCumulative && <td className="cell-num">{fmt(finalSoldeProducts)}</td>}
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
