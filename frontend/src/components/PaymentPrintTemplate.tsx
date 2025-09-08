import React, { useState } from 'react';
import type { Contact } from '../types';
import CompanyHeader from './CompanyHeader';

interface PaymentPrintTemplateProps {
  payment: any;
  client?: Contact;
  fournisseur?: Contact;
  size?: 'A4' | 'A5';
  companyType?: 'DIAMOND' | 'MPC';
  allPayments?: any[]; // Tous les paiements pour calculer le solde cumulé
  // Bons (passés depuis le modal) pour reproduire la logique ContactsPage
  bonsSorties?: any[];
  bonsComptants?: any[];
  bonsCommandes?: any[];
  bonsAvoirsClient?: any[];
  bonsAvoirsFournisseur?: any[];
}

// Petit composant réutilisable pour le pied de page
const CompanyFooter: React.FC<{
  data: { address: string; phones: string; email: string; extra?: string };
}> = ({ data }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: '12mm', padding: '0 16px' }} className="mt-8 pt-4  space-y-1 ">
    {/* Cachet client rectangle */}
    <div className="w-full mb-4 " style={{ textAlign: 'center' }}>
      <div className='text-center'  style={{border: '2px solid #000',  width: '40mm', height: '20mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-sm font-bold">CACHET CLIENT</span>
      </div>
    </div>
    <div className="border-t border-gray-300 text-center text-xs text-gray-600 space-y-1">
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

  // Infos variables par société
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

  const amountOf = (p: any) => {
    const raw = p?.montant ?? p?.montant_total ?? 0;
    if (raw == null || raw === '') return 0;
    const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, '.'));
    return isNaN(num) ? 0 : num;
  };

  // Calcul du solde cumulé (privilégier le solde_cumule backend si dispo; sinon fallback logique locale)
  const calculateCumulativeSaldo = () => {
    const contactEntity = client || fournisseur;
    const soldeCumuleBackend = contactEntity && (contactEntity as any).solde_cumule;
    const startingSolde = Number(contactEntity?.solde ?? 0); // fallback
    const contactId = payment.contact_id ?? payment.client_id ?? payment.fournisseur_id ?? null;
    const isClient = payment.type_paiement === 'Client' || !!client;

    // Si le backend fournit solde_cumule, on l'utilise comme "solde après" (plus fiable, tient compte des règles backend)
    if (soldeCumuleBackend != null && soldeCumuleBackend !== '' && !isNaN(Number(soldeCumuleBackend))) {
      const montantPaiement = amountOf(payment);
      const soldoApres = Number(soldeCumuleBackend) as number;
      // Le paiement réduit le solde, donc le solde avant = après + montant payé
      const soldoAvant = soldoApres + montantPaiement;
      const soldoAvantLabel = isClient ? 'Solde à recevoir avant paiement' : 'Solde à payer avant paiement';
      const soldoApresLabel = isClient ? 'Solde à recevoir après paiement' : 'Solde à payer après paiement';
      const nouveauSoldeLabel = isClient ? 'NOUVEAU SOLDE À RECEVOIR' : 'NOUVEAU SOLDE À PAYER';
      return { soldoAvant, montantPaiement, soldoApres, soldoAvantLabel, soldoApresLabel, nouveauSoldeLabel, isClient };
    }
    if (contactId == null) {
      // Fallback: seulement paiements cumulés si aucun contact
      const scoped = (allPayments || []).filter(p => (p.contact_id ?? p.client_id ?? p.fournisseur_id ?? null) === null);
      const sorted = scoped.slice().sort((a, b) => (parseDateTime(a.date_paiement)?.getTime() || 0) - (parseDateTime(b.date_paiement)?.getTime() || 0));
      const idx = sorted.findIndex(p => p.id === payment.id);
      const soldoAvant = idx > 0 ? sorted.slice(0, idx).reduce((s, p) => s + amountOf(p), startingSolde) : startingSolde;
      const montantPaiement = amountOf(payment);
      const soldoApres = soldoAvant - montantPaiement; // paiement réduit le solde dû
      const soldoAvantLabel = isClient ? 'Solde à recevoir avant paiement' : 'Solde à payer avant paiement';
      const soldoApresLabel = isClient ? 'Solde à recevoir après paiement' : 'Solde à payer après paiement';
      const nouveauSoldeLabel = isClient ? 'NOUVEAU SOLDE À RECEVOIR' : 'NOUVEAU SOLDE À PAYER';
      return { soldoAvant, montantPaiement, soldoApres, soldoAvantLabel, soldoApresLabel, nouveauSoldeLabel, isClient };
    }

    // Construire la liste des transactions pertinentes avant ce paiement
    interface Tx { kind: 'bon' | 'avoir' | 'paiement'; id: any; date: Date; montant: number; }
    const txs: Tx[] = [];

    if (isClient) {
      // Bons de vente (Sortie, Comptant) augmentent le solde à recevoir
      for (const b of [...bonsSorties, ...bonsComptants]) {
        if (String(b.client_id) === String(contactId)) {
          const d = parseDateTime(b.date_creation) || parseDateTime(b.created_at) || new Date();
          txs.push({ kind: 'bon', id: b.id, date: d, montant: +Number(b.montant_total || 0) });
        }
      }
      // Avoir client réduit le solde
      for (const b of bonsAvoirsClient) {
        if (String(b.client_id) === String(contactId)) {
          const d = parseDateTime(b.date_creation) || parseDateTime(b.created_at) || new Date();
          txs.push({ kind: 'avoir', id: b.id, date: d, montant: -Math.abs(+Number(b.montant_total || 0)) });
        }
      }
    } else {
      // Fournisseur: Commandes augmentent solde à payer
      for (const b of bonsCommandes) {
        if (String(b.fournisseur_id) === String(contactId)) {
          const d = parseDateTime(b.date_creation) || parseDateTime(b.created_at) || new Date();
          txs.push({ kind: 'bon', id: b.id, date: d, montant: +Number(b.montant_total || 0) });
        }
      }
      // Avoir fournisseur réduit
      for (const b of bonsAvoirsFournisseur) {
        if (String(b.fournisseur_id) === String(contactId)) {
          const d = parseDateTime(b.date_creation) || parseDateTime(b.created_at) || new Date();
          txs.push({ kind: 'avoir', id: b.id, date: d, montant: -Math.abs(+Number(b.montant_total || 0)) });
        }
      }
    }

    // Paiements (réduisent le solde dans les deux cas)
    for (const p of allPayments) {
      const cId = p.contact_id ?? p.client_id ?? p.fournisseur_id;
      if (String(cId) === String(contactId)) {
        const d = parseDateTime(p.date_paiement) || parseDateTime(p.created_at) || new Date();
        txs.push({ kind: 'paiement', id: p.id, date: d, montant: -Math.abs(amountOf(p)) });
      }
    }

    // Trier par date puis par type pour stabilité
    txs.sort((a, b) => {
      if (a.date.getTime() !== b.date.getTime()) return a.date.getTime() - b.date.getTime();
      // Assurer que bons/avoirs avant paiements pour même timestamp
      const order = { bon: 0, avoir: 1, paiement: 2 } as any;
      if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
      return (a.id || 0) - (b.id || 0);
    });

    const currentPaymentDate = parseDateTime(payment.date_paiement) || new Date();
    // Calculer le solde avant ce paiement en appliquant toutes transactions strictement avant ce paiement (ou même date mais id plus petit)
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
  const montantPaiement = amountOf(payment); // montant brut du paiement
  const soldoApres = soldoAvant - montantPaiement; // paiement réduit le solde

    const soldoAvantLabel = isClient ? 'Solde à recevoir avant paiement' : 'Solde à payer avant paiement';
    const soldoApresLabel = isClient ? 'Solde à recevoir après paiement' : 'Solde à payer après paiement';
    const nouveauSoldeLabel = isClient ? 'NOUVEAU SOLDE À RECEVOIR' : 'NOUVEAU SOLDE À PAYER';
    return { soldoAvant, montantPaiement, soldoApres, soldoAvantLabel, soldoApresLabel, nouveauSoldeLabel, isClient };
  };

  const { soldoAvant, montantPaiement, soldoApres, soldoAvantLabel, soldoApresLabel, nouveauSoldeLabel, isClient } = calculateCumulativeSaldo();

  const contact = client || fournisseur || ((payment?.type === 'Comptant' && payment?.client_nom) ? { nom_complet: payment.client_nom } as any : undefined);
  const contactLabel = contact ? 'Contact' : '';
  const contactDisplayName = (
    (typeof contact?.societe === 'string' && contact.societe.trim())
      ? contact.societe
      : (contact?.nom_complet || '-')
  );

  return (
    <div 
      className={`bg-white ${size === 'A5' ? 'w-[148mm] h-[210mm]' : 'w-[210mm] h-[297mm]'} mx-auto p-4 font-sans text-sm print:shadow-none`}
      style={{ fontFamily: 'sans-serif', position: 'relative' }}
    >
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

      {/* En-tête */}
      <CompanyHeader companyType={selectedCompany} />

      {/* Infos document */}
      <div className="flex justify-between items-start mb-6 mt-6">
        {/* Contact */}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">{contactLabel} :</h3>
          {contact && (
            <div className="bg-gray-50 p-3 rounded border-l-4 border-orange-500">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="font-medium">Nom:</span> {contactDisplayName}</div>
                <div><span className="font-medium">Téléphone:</span> {contact.telephone}</div>
                <div><span className="font-medium">Email:</span> {contact.email}</div>
                <div><span className="font-medium">Adresse:</span> {contact.adresse}</div>
              </div>
            </div>
          )}
        </div>

        {/* Cartouche */}
        <div className="ml-6 text-right">
          <div className="p-4 rounded border border-orange-200">
            <h2 className="text-lg font-bold text-orange-700 mb-3">
              REÇU DE PAIEMENT N° {payment.numero || `PAY${String(payment.id).padStart(2, '0')}`}
            </h2>
            <div className="space-y-2 text-sm">
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
      <div className="mb-6">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-orange-500 text-white">
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Description</th>
              <th className="border border-gray-300 px-3 py-2 text-center font-semibold w-40">Date / Heure</th>
              <th className="border border-gray-300 px-3 py-2 text-right font-semibold w-28">Montant (DH)</th>
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
              <td className="border border-gray-300 px-3 py-2 text-right">-</td>
            </tr>

            {/* Ligne solde après paiement */}
            <tr className="bg-orange-50">
              <td className="border border-gray-300 px-3 py-2">
                <div className="font-medium text-orange-700">{soldoApresLabel}</div>
              </td>
              <td className="border border-gray-300 px-3 py-2 text-center text-orange-700">
                {formatHeure(payment.date_paiement)}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-right">-</td>
              <td className="border border-gray-300 px-3 py-2 text-right font-bold text-orange-700">
                {soldoApres.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Totaux */}
      <div className="flex justify-end mb-6">
        <div className="w-80">
          <div className="p-4 rounded">
            <div className="flex justify-between items-center text-lg font-bold">
              <span>MONTANT PAYÉ:</span>
              <span>{montantPaiement.toFixed(2)} DH</span>
            </div>
            <div className="flex justify-between items-center text-lg font-bold text-orange-700 border-t pt-2 mt-2">
              <span>{nouveauSoldeLabel}:</span>
              <span>{soldoApres.toFixed(2)} DH</span>
            </div>
          </div>
        </div>
      </div>

      {/* Observations */}
      {payment.notes && (
        <div className="mb-4">
          <h4 className="font-semibold text-gray-800 mb-2">Observations:</h4>
          <div className="bg-gray-50 p-3 rounded border-l-4 border-orange-500">
            <p className="text-sm text-gray-700">{payment.notes}</p>
          </div>
        </div>
      )}

      {/* Pied de page (dépend de selectedCompany) */}
      <CompanyFooter data={companyFooters[selectedCompany]} />
    </div>
  );
};

export default PaymentPrintTemplate;
