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
}) => {
  const showPrices = priceMode === 'WITH_PRICES';
  const initialSolde = Number((contact as any)?.solde ?? 0);
  const contactDisplayName = (
    (typeof contact?.societe === 'string' && contact.societe.trim())
      ? contact.societe
      : (contact?.nom_complet || '-')
  );

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

  // Use incoming lists if they already include the synthetic initial row
  const txList: any[] = (Array.isArray(transactions) && transactions[0]?.syntheticInitial)
    ? transactions
    : [txInitialRow, ...(transactions || [])];
  const prList: any[] = (Array.isArray(productHistory) && productHistory[0]?.syntheticInitial)
    ? productHistory
    : [prInitialRow, ...(productHistory || [])];

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
        <div>
          <h2 className="text-lg font-bold mb-3">Historique des Transactions</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-orange-500 text-white">
                  <th className="border border-gray-300 px-3 py-2 text-left">Date</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Numéro</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Type</th>
                  {showPrices && (
                    <>
                      <th className="border border-gray-300 px-3 py-2 text-right">Montant (DH)</th>
                      <th className="border border-gray-300 px-3 py-2 text-right">Solde Cumulé</th>
                    </>
                  )}
                  {!showPrices && (
                    <th className="border border-gray-300 px-3 py-2 text-left">Statut/Mode</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {txList.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-gray-500" colSpan={showPrices ? 5 : 4}>Aucune donnée</td>
                  </tr>
                ) : (
                  txList.map((t) => {
                    const isPayment = String(t.statut || '').toLowerCase() === 'paiement' || String(t.type || '').toLowerCase() === 'paiement';
                    const isAvoir = String(t.type || '').toLowerCase().includes('avoir');
                    // Unified: paiements/avoirs reduce balance, others increase
                    const reduceBalance = (isPayment || isAvoir);
                    return (
                      <tr key={t.id} className="odd:bg-gray-50">
                        <td className="border border-gray-300 px-3 py-2">{t.syntheticInitial ? '-' : (t.date || fmtDate(t.dateISO))}</td>
                        <td className="border border-gray-300 px-3 py-2">{t.numero}</td>
                        <td className="border border-gray-300 px-3 py-2">{t.type}</td>
                        {showPrices ? (
                          <>
                            <td className={`border border-gray-300 px-3 py-2 text-right ${t.syntheticInitial ? 'text-gray-600' : reduceBalance ? 'text-green-700' : 'text-blue-700'} font-medium`}>
                              {t.syntheticInitial ? '—' : (reduceBalance ? '-' : '+')}{t.syntheticInitial ? '' : fmt(t.montant)}
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-right text-gray-800 font-semibold">{fmt(t.soldeCumulatif)}</td>
                          </>
                        ) : (
                          <td className="border border-gray-300 px-3 py-2">{t.syntheticInitial ? '-' : (t.statut || (isPayment ? 'Paiement' : '-'))}</td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-bold mb-3">Historique Détaillé des Produits</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-orange-500 text-white">
                  <th className="border border-gray-300 px-3 py-2 text-left">Date</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Bon N°</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Référence</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Désignation</th>
                  <th className="border border-gray-300 px-3 py-2 text-right">Qté</th>
                  {showPrices && (
                    <>
                      <th className="border border-gray-300 px-3 py-2 text-right">Prix Unit.</th>
                      <th className="border border-gray-300 px-3 py-2 text-right">Total</th>
                      <th className="border border-gray-300 px-3 py-2 text-right">Solde Cumulé</th>
                    </>
                  )}
                  {!showPrices && (
                    <th className="border border-gray-300 px-3 py-2 text-left">Statut</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {prList.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-gray-500" colSpan={showPrices ? 8 : 6}>Aucune donnée</td>
                  </tr>
                ) : (
                  prList.map((it: any) => {
                    const type = String(it.type || '').toLowerCase();
                    const isPaymentOrAvoir = type === 'paiement' || type === 'avoir';
                    const totalVal = Number(it.total) || 0;
                    // Unified: paiements/avoirs -, produits +
                    const reduceBalance = isPaymentOrAvoir;
                    const displayTotal = it.syntheticInitial ? '' : (reduceBalance ? -totalVal : totalVal);
                    return (
                      <tr key={it.id} className="odd:bg-gray-50">
                        <td className="border border-gray-300 px-3 py-2">{it.syntheticInitial ? '-' : (it.bon_date || fmtDate(it.date))}</td>
                        <td className="border border-gray-300 px-3 py-2">{it.bon_numero}</td>
                        <td className="border border-gray-300 px-3 py-2">{it.syntheticInitial ? '—' : it.product_reference}</td>
                        <td className="border border-gray-300 px-3 py-2">{it.syntheticInitial ? 'Solde initial' : it.product_designation}</td>
                        <td className="border border-gray-300 px-3 py-2 text-right">{it.syntheticInitial ? '—' : it.quantite}</td>
                        {showPrices ? (
                          <>
                            <td className="border border-gray-300 px-3 py-2 text-right">{it.syntheticInitial ? '—' : fmt(it.prix_unitaire)}</td>
                            <td className={`border border-gray-300 px-3 py-2 text-right font-medium ${it.syntheticInitial ? 'text-gray-600' : reduceBalance ? 'text-green-700' : ''}`}>{it.syntheticInitial ? '—' : fmt(displayTotal)}</td>
                            <td className="border border-gray-300 px-3 py-2 text-right text-gray-800 font-semibold">{fmt(it.soldeCumulatif)}</td>
                          </>
                        ) : (
                          <td className="border border-gray-300 px-3 py-2">{it.syntheticInitial ? '-' : (it.bon_statut || '-')}</td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
              {showPrices && (
                <tfoot>
                  <tr className="bg-gray-100 font-semibold">
                    <td className="border border-gray-300 px-3 py-2">—</td>
                    <td className="border border-gray-300 px-3 py-2">—</td>
                    <td className="border border-gray-300 px-3 py-2">—</td>
                    <td className="border border-gray-300 px-3 py-2 text-left">TOTAL</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{totalQtyProducts}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">—</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{fmt(totalAmountProducts)}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{fmt(finalSoldeProducts)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactPrintTemplate;
