import React, { useState } from 'react';
import type { Contact } from '../types';
import CompanyHeader from './CompanyHeader';

interface BonPrintTemplateProps {
  bon: any;
  client?: Contact;
  fournisseur?: Contact;
  size?: 'A4' | 'A5';
  companyType?: 'DIAMOND' | 'MPC';
}

const BonPrintTemplate: React.FC<BonPrintTemplateProps> = ({ 
  bon, 
  client, 
  fournisseur, 
  size = 'A4',
  companyType = 'DIAMOND'
}) => {
  const [selectedCompany, setSelectedCompany] = useState<'DIAMOND' | 'MPC'>(companyType);
  const [printMode, setPrintMode] = useState<'WITH_PRICES' | 'WITHOUT_PRICES' | 'PRODUCTS_ONLY'>('WITH_PRICES');
  // Formater la date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR');
  };

  // Déterminer le titre selon le type
  const getTitreBon = (type: string) => {
    switch (type) {
      case 'Commande': return 'BCM ';
      case 'Bon Commande': return 'BCM ';
      case 'Bon Comptant': return 'BCO ';
      case 'Comptant': return 'BCO ';
      case 'Bon Sortie': return 'BS ';
      case 'Devis': return 'BD ';
      case 'Sortie': return 'BS ';
      default: return 'BON N';
    }
  };

  // Calculer les totaux
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

  const contact = client || fournisseur;
  const contactLabel = contact ? 'Contact' : '';
    // status styling handled via getStatusClasses in parent page; template keeps simple styling

  return (
    <div 
      className={`bg-white ${size === 'A5' ? 'w-[148mm] h-[210mm]' : 'w-[210mm] h-[297mm]'} mx-auto p-4 font-sans text-sm print:shadow-none`}
      style={{ fontFamily: ' sans-serif' }}
    >
  {/* Options d'impression et choix de la société */}
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

      {/* En-tête avec logo et informations entreprise */}
      <CompanyHeader companyType={selectedCompany} />

      {/* Informations du document */}
      <div className="flex justify-between items-start mb-6 mt-6">
        {/* Informations du contact */}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">{contactLabel} :</h3>
          {contact && (
            <div className="bg-gray-50 p-3 rounded border-l-4 border-orange-500">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="font-medium">Nom:</span> {contact.nom_complet}</div>
                <div><span className="font-medium">Téléphone:</span> {contact.telephone}</div>
                <div><span className="font-medium">Email:</span> {contact.email}</div>
                <div><span className="font-medium">Adresse:</span> {contact.adresse}</div>
              </div>
            </div>
          )}
        </div>

        {/* Informations du document */}
        <div className=" ml-6 text-right">
          <div className=" p-4 rounded border border-orange-200">
            <h2 className="text-lg font-bold text-orange-700 mb-3">
               BON DEVIS {getTitreBon(bon.type)}{bon.id}
            </h2>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Date:</span> {formatDate(bon.date_creation)}</div>
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

      {/* Table des articles */}
      <div className="mb-6">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-orange-500 text-white">
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Article</th>
              {printMode !== 'PRODUCTS_ONLY' && (
                <th className="border border-gray-300 px-3 py-2 text-center font-semibold w-20">Qté</th>
              )}
              {printMode === 'WITH_PRICES' && (
                <>
                  <th className="border border-gray-300 px-3 py-2 text-right font-semibold w-24">P.U. (DH)</th>
                  <th className="border border-gray-300 px-3 py-2 text-right font-semibold w-28">Total (DH)</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, index: number) => {
              const quantite = parseFloat(item.quantite || 0);
              const prixUnitaire = parseFloat(item.prix_unitaire || 0);
              const total = quantite * prixUnitaire;
              const rowKey = item.id ?? item.product_id ?? `${item.designation}-${index}`;

              return (
                <tr key={rowKey} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
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
        <div className="flex justify-end mb-6">
          <div className="w-80">
            <div className=" p-4 rounded">
              <div className="flex justify-between items-center text-md font-bold ">
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

      {/* Pied de page */}
      <div className="mt-8 pt-4 border-t border-gray-300">
        <div className="text-center text-xs text-gray-600">
          <p> Lot Riad Ahlan I N° 436 - TANGER - GSM: 0650812894 - Tél: 0539317269</p>
        </div>
      </div>
    </div>
  );
};

export default BonPrintTemplate;
