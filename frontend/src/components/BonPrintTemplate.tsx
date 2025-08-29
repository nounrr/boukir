import React, { useState } from 'react';
import type { Contact } from '../types';
import CompanyHeader from './CompanyHeader';
import { getBonNumeroDisplay } from '../utils/numero';

interface BonPrintTemplateProps {
  bon: any;
  client?: Contact;
  fournisseur?: Contact;
  size?: 'A4' | 'A5';
  companyType?: 'DIAMOND' | 'MPC';
}

// Pied de page toujours positionné en bas de la DERNIÈRE page si l'espace existe.
// Technique: on insère un "spacer" (réservé) dans le flux avant le footer absolu.
// Si le spacer tient sur la page courante, le footer s'y affiche; sinon le spacer passe à la page suivante et le footer aussi, sans créer une page supplémentaire vide.
const CompanyFooter: React.FC<{ data: { address: string; phones: string; email: string; extra?: string } }>
 = ({ data }) => (
  <div
    className="company-footer"
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: '10mm',
      padding: '0 16px'
    }}
  >
    <div className="w-full mb-3 flex justify-center">
      <div style={{ border: '2px solid #000', width: '42mm', height: '22mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-xs font-bold">CACHET / SIGNATURE CLIENT</span>
      </div>
    </div>
    <div className="border-t border-gray-300 text-center text-[10px] text-gray-600 pt-2 leading-snug">
      <p>{data.address}</p>
      <p>{data.phones} | {data.email}</p>
      {data.extra && <p>{data.extra}</p>}
    </div>
  </div>
);

const BonPrintTemplate: React.FC<BonPrintTemplateProps> = ({ 
  bon, 
  client, 
  fournisseur, 
  size = 'A4',
  companyType = 'DIAMOND'
}) => {
  const [selectedCompany, setSelectedCompany] = useState<'DIAMOND' | 'MPC'>(companyType);
  const [printMode, setPrintMode] = useState<'WITH_PRICES' | 'WITHOUT_PRICES' | 'PRODUCTS_ONLY'>('WITH_PRICES');

  // Date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR');
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
  
  // (Titre helper supprimé, non utilisé)
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

// Utilisation

  // Items & totaux
  const parseItemsArray = (items: any): any[] => {
    if (Array.isArray(items)) return items;
    if (typeof items === 'string') {
      try {
        const parsed = JSON.parse(items || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const items = parseItemsArray(bon.items);
  const sousTotal = items.reduce((sum: number, item: any) => 
    sum + (parseFloat(item.quantite || 0) * parseFloat(item.prix_unitaire || 0)), 0);

  const contact = client || fournisseur || ((bon?.type === 'Comptant' && bon?.client_nom) ? { nom_complet: bon.client_nom } as any : undefined);
  const contactLabel = contact ? 'Contact' : '';
  const contactDisplayName = (
    (typeof contact?.societe === 'string' && contact.societe.trim())
      ? contact.societe
      : (contact?.nom_complet || '-')
  );

  return (
    <div 
      className={`print-root bg-white ${size === 'A5' ? 'w-[148mm] min-h-[210mm]' : 'w-[210mm] min-h-[297mm]'} mx-auto p-4 font-sans text-sm print:shadow-none`}
      style={{ fontFamily: 'sans-serif', position: 'relative' }}
    >
    {/* Styles spécifiques impression pour assurer largeur totale du tableau */}
      <style>
        {`@media print {
      .print-root { position: relative; }
      .print-footer-spacer { height: 48mm; }
      /* Le spacer disparaît à l'écran mais réserve la place à l'impression */
      .company-footer { page-break-inside: avoid; break-inside: avoid; }
      .print-table-full { width:100% !important; border-collapse: collapse !important; }
      .print-table-full th, .print-table-full td { word-break: break-word; }
      .totals-section, .client-stamp { page-break-inside: avoid; break-inside: avoid; }
      /* Empêcher un saut de page juste avant le spacer si il reste assez d'espace */
      .print-footer-spacer { page-break-inside: avoid; break-inside: avoid; }
      body { margin:0; padding:0; }
        }`}
      </style>
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

        <div className="flex items-center">
          <label htmlFor="print-mode" className="mr-2 text-sm font-medium">Mode impression :</label>
          <select
            id="print-mode"
            value={printMode}
            onChange={(e) => setPrintMode(e.target.value as 'WITH_PRICES' | 'WITHOUT_PRICES' | 'PRODUCTS_ONLY')}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="WITH_PRICES">Avec prix</option>
            <option value="WITHOUT_PRICES">Sans prix</option>
            <option value="PRODUCTS_ONLY">Produits seulement</option>
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
              BON DEVIS {getBonNumeroDisplay(bon)}
            </h2>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Date:</span> {formatHeure(bon.date_creation)}</div>
              {bon.adresse_livraison && (
                <div><span className="font-medium">Livraison:</span> {bon.adresse_livraison}</div>
              )}
              {bon.date_echeance && (
                <div><span className="font-medium">Échéance:</span> {formatDate(bon.date_echeance)}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table articles */}
      <div className="mb-6">
        <table style={{width:'100%'}} className="no-mobile-scroll print-table-full w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-orange-500 text-white">
              <th className="border border-gray-300 px-2 py-2 text-left font-semibold w-16">CODE</th>
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Article</th>
              {printMode !== 'PRODUCTS_ONLY' && (
                <th className="border border-gray-300 px-3 py-2 text-center font-semibold">Qté</th>
              )}
              {printMode === 'WITH_PRICES' && (
                <>
                  <th className="border border-gray-300 px-3 py-2 text-right font-semibold">{bon?.type === 'Commande' ? 'P.A (DH)' : 'P.U. (DH)'}</th>
                  <th className="border border-gray-300 px-3 py-2 text-right font-semibold">Total (DH)</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, index: number) => {
              const quantite = parseFloat(item.quantite || 0);
              const prixUnitaire = parseFloat(item.prix_unitaire || 0);
              const total = quantite * prixUnitaire;
              const productId = item.product_id ?? item.produit_id ?? item.id ?? '';
              const rowKey = productId || `${item.designation}-${index}`;
              return (
                <tr key={rowKey} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  <td className="border border-gray-300 px-2 py-2 text-xs text-gray-700">{productId}</td>
                  <td className="border border-gray-300 px-3 py-2">
                    <div className="font-medium">{item.designation}</div>
                    {item.description && (
                      <div className="text-xs text-gray-600 italic">{item.description}</div>
                    )}
                  </td>
                  {printMode !== 'PRODUCTS_ONLY' && (
                    <td className="border border-gray-300 px-3 py-2 text-center">{quantite}</td>
                  )}
                  {printMode === 'WITH_PRICES' && (
                    <>
                      <td className="border border-gray-300 px-3 py-2 text-right">{prixUnitaire.toFixed(2)}</td>
                      <td className="border border-gray-300 px-3 py-2 text-right font-medium">{total.toFixed(2)}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totaux */}
      {printMode === 'WITH_PRICES' && (
        <div className="flex justify-end mb-6 totals-section">
          <div className="w-80">
            <div className="p-4 rounded">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>TOTAL GÉNÉRAL:</span>
                <span>{sousTotal.toFixed(2)} DH</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Observations */}
      {bon.notes && (
        <div className="mb-4">
          <h4 className="font-semibold text-gray-800 mb-2">Observations:</h4>
          <div className="bg-gray-50 p-3 rounded border-l-4 border-orange-500">
            <p className="text-sm text-gray-700">{bon.notes}</p>
          </div>
        </div>
      )}

      {/* Vehicle info section */}
      {(
        bon?.vehicule_nom || bon?.vehicule?.nom || bon?.vehicule_designation || bon?.vehicule_label ||
        bon?.vehicule_immatriculation || bon?.vehicule?.immatriculation || bon?.immatriculation
      ) && (
        <div className="mb-4">
          <div className="flex justify-end">
            <div className="text-right text-sm">
              {(
                bon?.vehicule_nom || bon?.vehicule?.nom || bon?.vehicule_designation || bon?.vehicule_label
              ) && (
                <div className="mb-1">
                  <div className="font-medium">Véhicule: {bon?.vehicule_nom}</div>
                </div>
              )}
              {(
                bon?.vehicule_immatriculation || bon?.vehicule?.immatriculation || bon?.immatriculation
              ) && (
                <div>
                  <div className="font-medium">Immatriculation:</div>
                  <div>{bon?.vehicule_immatriculation || bon?.vehicule?.immatriculation || bon?.immatriculation}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

  {/* Spacer qui réserve la place du footer (impression) */}
  <div className="print-footer-spacer" />
  {/* Pied de page (toujours essaie de rester dans la dernière page si place) */}
  <CompanyFooter data={companyFooters[selectedCompany]} />
    </div>
  );
};

export default BonPrintTemplate;
