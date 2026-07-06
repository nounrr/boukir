import React, { useState } from 'react';
import type { Contact } from '../types';
import CompanyHeader from './CompanyHeader';
import { useGetPaymentPrintBalanceQuery } from '../store/api/paymentsApi';

interface PaymentPrintTemplateProps {
  payment: any;
  client?: Contact;
  fournisseur?: Contact;
  size?: 'A4' | 'A5';
  companyType?: 'DIAMOND' | 'MPC';
  allPayments?: any[]; // Tous les paiements pour calculer le solde cumulÃ©
  // Bons (passÃ©s depuis le modal) pour reproduire la logique ContactsPage
  bonsSorties?: any[];
  bonsComptants?: any[];
  bonsCommandes?: any[];
  bonsAvoirsClient?: any[];
  bonsAvoirsFournisseur?: any[];
}

// Petit composant rÃ©utilisable pour le pied de page
const CompanyFooter: React.FC<{
  data: { address: string; phones: string; email: string; extra?: string };
  compact?: boolean;
}> = ({ data, compact = false }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: compact ? '4mm' : '12mm',
      padding: compact ? '0 8px' : '0 16px',
    }}
    className={`${compact ? 'mt-4 pt-2' : 'mt-8 pt-4'} space-y-1`}
    data-payment-footer="true"
  >
    {/* Cachet client rectangle */}
    <div className={compact ? 'w-full mb-2' : 'w-full mb-4'} style={{ textAlign: 'center' }}>
      <div className='text-center'  style={{border: '2px solid #000',  width: compact ? '38mm' : '40mm', height: compact ? '18mm' : '20mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className={`${compact ? 'text-[10px]' : 'text-sm'} font-bold`}>CACHET CLIENT</span>
      </div>
    </div>
    <div className={`border-t border-gray-300 text-center ${compact ? 'text-[8.5px]' : 'text-xs'} text-gray-600 ${compact ? 'space-y-0' : 'space-y-1'}`}>
      <p>{data.address}</p>
      <p>{data.phones} | {data.email}</p>
    </div>
  </div>
);

const PaymentPrintTemplate: React.FC<PaymentPrintTemplateProps> = ({ 
  payment, 
  client, 
  fournisseur, 
  size = 'A4',
  companyType = 'DIAMOND',
  allPayments = [],
  bonsSorties = [],
  bonsComptants = [],
  bonsCommandes = [],
  bonsAvoirsClient = [],
  bonsAvoirsFournisseur = [],
}) => {
  const [selectedCompany, setSelectedCompany] = useState<'DIAMOND' | 'MPC'>(companyType);

  const contactIdRaw = payment?.contact_id ?? payment?.client_id ?? payment?.fournisseur_id ?? null;
  const contactIdNum = contactIdRaw != null ? Number(contactIdRaw) : null;
  const { data: printBalance } = useGetPaymentPrintBalanceQuery(Number(payment?.id), { skip: !payment?.id });

  const formatHeure = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return (
      date.toLocaleDateString("fr-FR") +
      " " +
      date.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  };

  // Infos variables par sociÃ©tÃ©
  const companyFooters: Record<'DIAMOND' | 'MPC', {
    address: string;
    phones: string;
    email: string;
    extra?: string;
  }> = {
    DIAMOND: {
      address: "IKAMAT REDOUAN 1 AZIB HAJ KADDOUR LOCAL 1 ET N2 - TANGER",
      phones: "GSM: 0650812894 - Tél: 0666216657",
      email: "EMAIL: boukir.diamond23@gmail.com",
    },
    MPC: {
      address: "ALot Awatif N°179 - TANGER",
      phones: "GSM: 0650812894 - Tél: 0666216657",
      email: "EMAIL: boukir.diamond23@gmail.com",
    }
  };

  // Helpers robustes pour parser les dates MySQL ("YYYY-MM-DD HH:MM:SS") ou ISO
  const parseDateTime = (val: any): Date | null => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    let s = String(val).trim();
    if (!s) return null;
    // Normaliser : remplacer l'espace par 'T'
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
      s = s.replace(' ', 'T');
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) {
      s = s.replace(' ', 'T') + ':00';
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
      s = s + ':00';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  const grossAmountOf = (p: any) => {
    const raw = p?.montant ?? p?.montant_total ?? 0;
    if (raw == null || raw === '') return 0;
    const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, '.'));
    return isNaN(num) ? 0 : num;
  };
  const ignoredAmountOf = (p: any) => {
    const raw = p?.montant_ignorer ?? 0;
    if (raw == null || raw === '') return 0;
    const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, '.'));
    return isNaN(num) ? 0 : num;
  };
  const amountOf = (p: any) => Math.max(grossAmountOf(p), 0);
  const balanceAmountOf = (p: any) => Math.max(amountOf(p) - ignoredAmountOf(p), 0);

  // Calcul du solde cumulÃ©: API historique du paiement, fallback local si indisponible.
  const calculateCumulativeSaldo = () => {
    const contactEntity = client || fournisseur;
    const startingSolde = Number(contactEntity?.solde ?? 0); // fallback
    const contactId = contactIdNum;
    const isClient = payment.type_paiement === 'Client' || printBalance?.contactType === 'Client' || (!!client && !fournisseur);

    // Source principale: solde avant/aprÃ¨s calculÃ© cÃ´tÃ© API Ã  la date du paiement.
    if (printBalance) {
      const montantPaiement = amountOf(payment);
      const soldoApres = Number(printBalance.soldeApres ?? 0) || 0;
      const soldoAvant = Number(printBalance.soldeAvant ?? 0) || 0;
      const soldoAvantLabel = isClient ? 'Solde à recevoir avant paiement' : 'Solde à payer avant paiement';
      const soldoApresLabel = isClient ? 'Solde à recevoir après paiement' : 'Solde à payer après paiement';
      const nouveauSoldeLabel = isClient ? 'NOUVEAU SOLDE À RECEVOIR' : 'NOUVEAU SOLDE À PAYER';
      return { soldoAvant, montantPaiement, soldoApres, soldoAvantLabel, soldoApresLabel, nouveauSoldeLabel, isClient };
    }
    if (contactId == null) {
      // Fallback: seulement paiements cumulÃ©s si aucun contact
      const scoped = (allPayments || []).filter(p => (p.contact_id ?? p.client_id ?? p.fournisseur_id ?? null) === null);
      const sorted = scoped.slice().sort((a, b) => (parseDateTime(a.date_paiement)?.getTime() || 0) - (parseDateTime(b.date_paiement)?.getTime() || 0));
      const idx = sorted.findIndex(p => p.id === payment.id);
      const soldoAvant = idx > 0 ? sorted.slice(0, idx).reduce((s, p) => s + balanceAmountOf(p), startingSolde) : startingSolde;
      const montantPaiement = amountOf(payment);
      const soldoApres = soldoAvant - balanceAmountOf(payment); // paiement rÃ©duit le solde dÃ»
      const soldoAvantLabel = isClient ? 'Solde à recevoir avant paiement' : 'Solde à payer avant paiement';
      const soldoApresLabel = isClient ? 'Solde à recevoir après paiement' : 'Solde à payer après paiement';
      const nouveauSoldeLabel = isClient ? 'NOUVEAU SOLDE À RECEVOIR' : 'NOUVEAU SOLDE À PAYER';
      return { soldoAvant, montantPaiement, soldoApres, soldoAvantLabel, soldoApresLabel, nouveauSoldeLabel, isClient };
    }

    // Construire la liste des transactions pertinentes avant ce paiement
    interface Tx { kind: 'bon' | 'avoir' | 'paiement'; id: any; date: Date; montant: number; }
    const txs: Tx[] = [];

    if (isClient) {
      // Bons de vente (Sortie, Comptant) augmentent le solde Ã  recevoir
      for (const b of [...bonsSorties, ...bonsComptants]) {
        if (String(b.client_id) === String(contactId)) {
          const d = parseDateTime(b.date_creation) || parseDateTime(b.created_at) || new Date();
          const isComptant = bonsComptants.includes(b);
          const montant = (Number(b.montant_total || 0) || 0) + (isComptant ? (Number(b.montant_ignorer || 0) || 0) : 0);
          txs.push({ kind: 'bon', id: b.id, date: d, montant });
        }
      }
      // Avoir client rÃ©duit le solde
      for (const b of bonsAvoirsClient) {
        if (String(b.client_id) === String(contactId)) {
          const d = parseDateTime(b.date_creation) || parseDateTime(b.created_at) || new Date();
          txs.push({ kind: 'avoir', id: b.id, date: d, montant: -Math.abs(+Number(b.montant_total || 0)) });
        }
      }
    } else {
      // Fournisseur: Commandes augmentent solde Ã  payer
      for (const b of bonsCommandes) {
        if (String(b.fournisseur_id) === String(contactId)) {
          const d = parseDateTime(b.date_creation) || parseDateTime(b.created_at) || new Date();
          txs.push({ kind: 'bon', id: b.id, date: d, montant: +Number(b.montant_total || 0) });
        }
      }
      // Avoir fournisseur rÃ©duit
      for (const b of bonsAvoirsFournisseur) {
        if (String(b.fournisseur_id) === String(contactId)) {
          const d = parseDateTime(b.date_creation) || parseDateTime(b.created_at) || new Date();
          txs.push({ kind: 'avoir', id: b.id, date: d, montant: -Math.abs(+Number(b.montant_total || 0)) });
        }
      }
    }

    // Paiements (rÃ©duisent le solde dans les deux cas)
    for (const p of allPayments) {
      const cId = p.contact_id ?? p.client_id ?? p.fournisseur_id;
      if (String(cId) === String(contactId)) {
        const d = parseDateTime(p.date_paiement) || parseDateTime(p.created_at) || new Date();
        txs.push({ kind: 'paiement', id: p.id, date: d, montant: -Math.abs(balanceAmountOf(p)) });
      }
    }

    // Trier par date puis par type pour stabilitÃ©
    txs.sort((a, b) => {
      if (a.date.getTime() !== b.date.getTime()) return a.date.getTime() - b.date.getTime();
      // Assurer que bons/avoirs avant paiements pour mÃªme timestamp
      const order = { bon: 0, avoir: 1, paiement: 2 } as any;
      if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
      return (a.id || 0) - (b.id || 0);
    });

    const currentPaymentDate = parseDateTime(payment.date_paiement) || new Date();
    // Calculer le solde avant ce paiement en appliquant toutes transactions strictement avant ce paiement (ou mÃªme date mais id plus petit)
    let solde = startingSolde;
    for (const t of txs) {
      if (t.kind === 'paiement' && t.id === payment.id) break; // atteint le paiement courant
      if (t.date.getTime() < currentPaymentDate.getTime() || (t.date.getTime() === currentPaymentDate.getTime() && (t.kind !== 'paiement' || t.id !== payment.id))) {
        // Ne pas appliquer ce paiement courant
        if (t.kind === 'paiement' && t.id === payment.id) break;
        solde += t.montant;
      }
    }
  const soldoAvant = solde;
  const montantPaiement = amountOf(payment);
  const soldoApres = soldoAvant - balanceAmountOf(payment); // paiement rÃ©duit le solde

    const soldoAvantLabel = isClient ? 'Solde à recevoir avant paiement' : 'Solde à payer avant paiement';
    const soldoApresLabel = isClient ? 'Solde à recevoir après paiement' : 'Solde à payer après paiement';
    const nouveauSoldeLabel = isClient ? 'NOUVEAU SOLDE À RECEVOIR' : 'NOUVEAU SOLDE À PAYER';
    return { soldoAvant, montantPaiement, soldoApres, soldoAvantLabel, soldoApresLabel, nouveauSoldeLabel, isClient };
  };

  const { soldoAvant, montantPaiement, soldoApres, soldoAvantLabel, soldoApresLabel, nouveauSoldeLabel, isClient } = calculateCumulativeSaldo();
  const montantIgnorer = ignoredAmountOf(payment);
  const montantTotal = montantPaiement + montantIgnorer;
  const showIgnored = montantIgnorer > 0;

  const contact = client || fournisseur || ((payment?.type === 'Comptant' && payment?.client_nom) ? { nom_complet: payment.client_nom } as any : undefined);
  const contactLabel = contact ? 'Contact' : '';
  const contactDisplayName = (
    (typeof contact?.societe === 'string' && contact.societe.trim())
      ? contact.societe
      : (contact?.nom_complet || '-')
  );
  const contactRef = (() => {
    const directRef = (contact as any)?.reference ?? payment?.contact_reference;
    if (directRef != null && String(directRef).trim()) return String(directRef).trim();
    if (contactIdRaw != null && Number(contactIdRaw) > 0) return String(contactIdRaw);
    return '';
  })();
  const contactRefLabel = isClient ? 'Ref client' : 'Ref fournisseur';
  const isA5 = size === 'A5';

  return (
    <div 
      className={`payment-print-page bg-white ${isA5 ? 'w-[148mm] h-[198mm] p-2 text-[10.5px] overflow-hidden' : 'w-[210mm] min-h-[297mm] p-4 text-sm'} mx-auto font-sans print:shadow-none`}
      style={{ fontFamily: 'sans-serif', position: 'relative' }}
    >
      {isA5 && (
        <style>{`
          .payment-print-page th,
          .payment-print-page td { padding: 4px 6px !important; line-height: 1.2; }
          .payment-print-page .logo-large { max-height: 42px !important; }
          .payment-print-page .titles h1 { font-size: 15px !important; margin-bottom: 1px !important; }
          .payment-print-page .titles h2 { font-size: 12px !important; margin-bottom: 1px !important; }
          .payment-print-page .titles p { font-size: 10px !important; line-height: 1.15 !important; }
          .payment-print-page > .flex.justify-center.items-center { margin-bottom: 6px !important; padding-bottom: 6px !important; }
          .payment-print-page [data-payment-footer="true"] {
            position: absolute !important;
            left: 8px !important;
            right: 8px !important;
            bottom: 4mm !important;
          }
        `}</style>
      )}
      {/* Options */}
      <div className="flex justify-end items-center gap-4 mb-2 print-hidden">
        <div className="flex items-center">
          <label htmlFor="company-select" className="mr-2 text-sm font-medium">Société :</label>
          <select
            id="company-select"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value as 'DIAMOND' | 'MPC')}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="DIAMOND">BOUKIR DIAMOND</option>
            <option value="MPC">BOUKIR MPC</option>
          </select>
        </div>
      </div>

      {/* En-tÃªte */}
      <CompanyHeader companyType={selectedCompany} />

      {/* Infos document */}
      <div className={`flex justify-between items-start ${isA5 ? 'mb-2 mt-2 gap-2' : 'mb-6 mt-6'}`}>
        {/* Contact */}
        <div className="flex-1">
          <h3 className={`${isA5 ? 'text-sm mb-1' : 'text-lg mb-3'} font-semibold text-gray-800`}>{contactLabel} :</h3>
          {contact && (
            <div className={`bg-gray-50 ${isA5 ? 'p-2' : 'p-3'} rounded border-l-4 border-orange-500`}>
              <div className={`grid grid-cols-2 ${isA5 ? 'gap-1 text-[10px]' : 'gap-2 text-sm'}`}>
                <div><span className="font-medium">Nom:</span> {contactDisplayName}</div>
                {contactRef && (
                  <div><span className="font-medium">{contactRefLabel}:</span> {contactRef}</div>
                )}
                <div><span className="font-medium">Service de charge:</span> <strong>06.66.21.66.57</strong></div>
              </div>
            </div>
          )}
        </div>

        {/* Cartouche */}
        <div className={`${isA5 ? 'ml-2' : 'ml-6'} text-right`}>
          <div className={`${isA5 ? 'p-2' : 'p-4'} rounded border border-orange-200`}>
            <h2 className={`${isA5 ? 'text-sm mb-1' : 'text-lg mb-3'} font-bold text-orange-700`}>
              REÇU DE PAIEMENT N° {payment.numero || `PAY${String(payment.id).padStart(2, '0')}`}
            </h2>
            <div className={`${isA5 ? 'space-y-1 text-[10px]' : 'space-y-2 text-sm'}`}>
              <div><span className="font-medium">Date:</span> {formatHeure(payment.date_paiement)}</div>
              <div><span className="font-medium">Mode:</span> {payment.mode_paiement}</div>
              <div><span className="font-medium">Statut:</span> {payment.statut}</div>
              {payment.code_reglement && (
                <div><span className="font-medium">Référence:</span> {payment.code_reglement}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table paiements */}
      <div className={isA5 ? 'mb-3' : 'mb-6'}>
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-orange-500 text-white">
              <th className={`${isA5 ? 'px-1.5 py-1' : 'px-3 py-2'} border border-gray-300 text-left font-semibold`}>Description</th>
              <th className={`${isA5 ? 'px-1.5 py-1 w-24' : 'px-3 py-2 w-40'} border border-gray-300 text-center font-semibold`}>Date / Heure</th>
              <th className={`${isA5 ? 'px-1.5 py-1 w-20' : 'px-3 py-2 w-28'} border border-gray-300 text-right font-semibold`}>Payé (DH)</th>
              {showIgnored && <th className={`${isA5 ? 'px-1.5 py-1 w-20' : 'px-3 py-2 w-28'} border border-gray-300 text-right font-semibold`}>Ignoré (DH)</th>}
              <th className={`${isA5 ? 'px-1.5 py-1 w-20' : 'px-3 py-2 w-28'} border border-gray-300 text-right font-semibold`}>Total (DH)</th>
              <th className="border border-gray-300 px-3 py-2 text-right font-semibold w-28">{isClient ? 'Solde à recevoir (DH)' : 'Solde à payer (DH)'}</th>
            </tr>
          </thead>
          <tbody>
            {/* Ligne solde avant paiement */}
            <tr className="bg-gray-50">
              <td className="border border-gray-300 px-3 py-2">
                <div className="font-medium text-gray-600">{soldoAvantLabel}</div>
              </td>
              <td className="border border-gray-300 px-3 py-2 text-center text-gray-600">
                {formatHeure(payment.date_paiement)}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-right">-</td>
              {showIgnored && <td className="border border-gray-300 px-3 py-2 text-right">-</td>}
              <td className="border border-gray-300 px-3 py-2 text-right">-</td>
              <td className="border border-gray-300 px-3 py-2 text-right font-medium text-gray-700">
                {soldoAvant.toFixed(2)}
              </td>
            </tr>

            {/* Ligne du paiement */}
            <tr className="bg-white">
              <td className="border border-gray-300 px-3 py-2">
                <div className="font-medium">Paiement {payment.mode_paiement} {isClient ? 'reçu de' : 'versé à'}</div>
                {payment.notes && (
                  <div className="text-xs text-gray-600 italic">{payment.notes}</div>
                )}
                {payment.banque && (
                  <div className="text-xs text-gray-600">Banque: {payment.banque}</div>
                )}
                {payment.personnel && (
                  <div className="text-xs text-gray-600">Personne: {payment.personnel}</div>
                )}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-center">
                {formatHeure(payment.date_paiement)}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-right font-medium text-green-700">
                +{montantPaiement.toFixed(2)}
              </td>
              {showIgnored && (
                <td className="border border-gray-300 px-3 py-2 text-right font-medium text-orange-700">
                  {montantIgnorer.toFixed(2)}
                </td>
              )}
              <td className="border border-gray-300 px-3 py-2 text-right font-medium text-gray-700">
                {montantTotal.toFixed(2)}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-right">-</td>
            </tr>

            {/* Ligne solde aprÃ¨s paiement */}
            <tr className="bg-orange-50">
              <td className="border border-gray-300 px-3 py-2">
                <div className="font-medium text-orange-700">{soldoApresLabel}</div>
              </td>
              <td className="border border-gray-300 px-3 py-2 text-center text-orange-700">
                {formatHeure(payment.date_paiement)}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-right">-</td>
              {showIgnored && <td className="border border-gray-300 px-3 py-2 text-right">-</td>}
              <td className="border border-gray-300 px-3 py-2 text-right">-</td>
              <td className="border border-gray-300 px-3 py-2 text-right font-bold text-orange-700">
                {soldoApres.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Totaux */}
      <div className={`flex justify-end ${isA5 ? 'mb-3' : 'mb-6'}`}>
        <div className={isA5 ? 'w-64' : 'w-80'}>
          <div className={`${isA5 ? 'p-2' : 'p-4'} rounded`}>
            <div className={`flex justify-between items-center ${isA5 ? 'text-sm' : 'text-lg'} font-bold`}>
              <span>MONTANT PAYÉ:</span>
              <span>{montantPaiement.toFixed(2)} DH</span>
            </div>
            {showIgnored && <div className={`flex justify-between items-center ${isA5 ? 'text-xs pt-1 mt-1' : 'text-base pt-2 mt-2'} font-semibold text-orange-700 border-t`}>
              <span>MONTANT IGNORÉ:</span>
              <span>{montantIgnorer.toFixed(2)} DH</span>
            </div>}
            <div className={`flex justify-between items-center ${isA5 ? 'text-xs pt-1 mt-1' : 'text-base pt-2 mt-2'} font-semibold text-gray-700 border-t`}>
              <span>TOTAL:</span>
              <span>{montantTotal.toFixed(2)} DH</span>
            </div>
            <div className={`flex justify-between items-center ${isA5 ? 'text-sm pt-1 mt-1' : 'text-lg pt-2 mt-2'} font-bold text-orange-700 border-t`}>
              <span>{nouveauSoldeLabel}:</span>
              <span>{soldoApres.toFixed(2)} DH</span>
            </div>
          </div>
        </div>
      </div>

      {/* Observations */}
      {payment.notes && (
        <div className={isA5 ? 'mb-2' : 'mb-4'}>
          <h4 className="font-semibold text-gray-800 mb-2">Observations:</h4>
          <div className={`bg-gray-50 ${isA5 ? 'p-2' : 'p-3'} rounded border-l-4 border-orange-500`}>
            <p className={`${isA5 ? 'text-[10px]' : 'text-sm'} text-gray-700`}>{payment.notes}</p>
          </div>
        </div>
      )}

      {/* Pied de page (dÃ©pend de selectedCompany) */}
      <CompanyFooter data={companyFooters[selectedCompany]} compact={isA5} />
    </div>
  );
};

export default PaymentPrintTemplate;
