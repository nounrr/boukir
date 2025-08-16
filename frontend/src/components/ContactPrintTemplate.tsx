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
          <div className="text-sm"><span className="font-semibold">Nom:</span> {contact?.nom_complet || '-'}</div>
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
                {transactions.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-gray-500" colSpan={showPrices ? 5 : 4}>Aucune donnée</td>
                  </tr>
                ) : (
                  transactions.map((t) => {
                    const isPayment = String(t.statut || '').toLowerCase() === 'paiement' || String(t.type || '').toLowerCase() === 'payment';
                    return (
                      <tr key={t.id} className="odd:bg-gray-50">
                        <td className="border border-gray-300 px-3 py-2">{t.date || fmtDate(t.dateISO)}</td>
                        <td className="border border-gray-300 px-3 py-2">{t.numero}</td>
                        <td className="border border-gray-300 px-3 py-2">{t.type}</td>
                        {showPrices ? (
                          <>
                            <td className={`border border-gray-300 px-3 py-2 text-right ${isPayment ? 'text-green-700' : 'text-blue-700'} font-medium`}>
                              {isPayment ? '-' : '+'}{fmt(t.montant)}
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-right text-gray-800 font-semibold">{fmt(t.soldeCumulatif)}</td>
                          </>
                        ) : (
                          <td className="border border-gray-300 px-3 py-2">{t.statut || (isPayment ? 'Paiement' : '-')}</td>
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
                    </>
                  )}
                  {!showPrices && (
                    <th className="border border-gray-300 px-3 py-2 text-left">Statut</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {productHistory.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-gray-500" colSpan={showPrices ? 7 : 6}>Aucune donnée</td>
                  </tr>
                ) : (
                  productHistory.map((it: any) => (
                    <tr key={it.id} className="odd:bg-gray-50">
                      <td className="border border-gray-300 px-3 py-2">{it.bon_date || fmtDate(it.date)}</td>
                      <td className="border border-gray-300 px-3 py-2">{it.bon_numero}</td>
                      <td className="border border-gray-300 px-3 py-2">{it.product_reference}</td>
                      <td className="border border-gray-300 px-3 py-2">{it.product_designation}</td>
                      <td className="border border-gray-300 px-3 py-2 text-right">{it.quantite}</td>
                      {showPrices ? (
                        <>
                          <td className="border border-gray-300 px-3 py-2 text-right">{fmt(it.prix_unitaire)}</td>
                          <td className="border border-gray-300 px-3 py-2 text-right font-medium">{fmt(it.total)}</td>
                        </>
                      ) : (
                        <td className="border border-gray-300 px-3 py-2">{it.bon_statut || '-'}</td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactPrintTemplate;
