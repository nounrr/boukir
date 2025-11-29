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

// Pied de page adaptatif selon le nombre d'articles et le format A4/A5
// Technique: on insère un "spacer" (réservé) dans le flux avant le footer absolu.
// Le spacer s'adapte dynamiquement selon le nombre d'articles pour éviter le chevauchement.
const CompanyFooter: React.FC<{ 
  data: { address: string; phones: string; email: string; extra?: string; cachetImage?: string };
  size: 'A4' | 'A5';
}>
 = ({ data, size }) => {
  // Ajuster la taille du cachet selon le format
  const isA5 = size === 'A5';
  const cachetWidth = isA5 ? '60mm' : '82mm';
  const cachetHeight = isA5 ? '24mm' : '32mm';
  const fontSize = isA5 ? 'text-[8px]' : 'text-xs';
  const bottomPosition = isA5 ? '8mm' : '10mm';
  const padding = isA5 ? '0 12px' : '0 16px';
  
  return (
    <div
      className="company-footer"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: bottomPosition,
        padding: padding
      }}
    >
      <div className="w-full mb-3 flex justify-center">
        <div style={{ 
          border: '1px solid #000', 
          width: cachetWidth, 
          height: cachetHeight, 
          display: 'flex', 
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden'
        }}>
          {data.cachetImage ? (
            <img 
              src={data.cachetImage} 
              alt="Cachet" 
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain' 
              }} 
            />
          ) : (
            <h6 className={`${fontSize} mt-1 font-bold text-center`}>
              CACHET / SIGNATURE CLIENT
            </h6>
          )}
        </div>
      </div>
      <div className={`border-t border-gray-300 text-center ${isA5 ? 'text-[8px]' : 'text-[10px]'} text-gray-600 pt-2 leading-snug`}>
        <p>{data.address}</p>
        <p><strong className="text-[12px]">{data.phones}</strong> | {data.email}</p>
        {data.extra && <p><strong className="text-[12px]">{data.extra}</strong></p>}
      </div>
    </div>
  );
};

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
    cachetImage?: string;
  }> = {
    DIAMOND: {
      address: "IKAMAT REDOUAN 1 AZIB HAJ KADDOUR LOCAL 1 ET N2 - TANGER",
      phones: "GSM: 0650812894 - Tél: 0666216657",
      email: "EMAIL: boukir.diamond23@gmail.com",
      extra: "Service de charge: 06.66.21.66.57",
      cachetImage: "/boukir_cachet.webp",
    },
    MPC: {
      address: "ALot Awatif N°179 - TANGER",
      phones: "GSM: 0650812894 - Tél: 0666216657",
      email: "EMAIL: boukir.diamond23@gmail.com",
      extra: "Service de charge: 06.66.21.66.57",
      cachetImage: "/mpc_boukir.webp",
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

  // Calculer la hauteur dynamique du spacer selon le nombre d'articles et le format
  // Base différente selon format: A5 (40mm) vs A4 (48mm) + ajustement par article
  // Maximum: 160mm pour A5, 180mm pour A4 pour éviter des spacers trop grands
  const itemsCount = items.length;
  const baseHeight = size === 'A5' ? 40 : 48;
  const increment = size === 'A5' ? 4 : 6; // Espacement plus serré en A5
  const maxHeight = size === 'A5' ? 160 : 180;
  const dynamicSpacerHeight = Math.min(maxHeight, Math.max(baseHeight, baseHeight + Math.max(0, itemsCount - 5) * increment));

  const contact = client || fournisseur || ((bon?.type === 'Comptant' && bon?.client_nom) ? { nom_complet: bon.client_nom } as any : undefined);
  const contactDisplayName = (
    (typeof contact?.societe === 'string' && contact.societe.trim())
      ? contact.societe
      : (contact?.nom_complet || '-')
  );
  // — Toujours exposer téléphone / adresse livraison si présents, même sans contact —
  const tel = (bon?.phone ?? bon?.tel ?? bon?.telephone ?? (contact as any)?.telephone ?? (contact as any)?.tel ?? '') as string | undefined;
  const adrLiv = (bon?.adresse_livraison || bon?.adresseLivraison || '') as string | undefined;
  const hasContactOrInfo = Boolean(contact || (tel && String(tel).trim()) || (adrLiv && String(adrLiv).trim()));

  // Variables de taille adaptées au format
  const isA5 = size === 'A5';
  const textSizes = {
    header: isA5 ? 'text-base' : 'text-lg',
    subheader: isA5 ? 'text-sm' : 'text-base', 
    normal: isA5 ? 'text-xs' : 'text-sm',
    small: isA5 ? 'text-[10px]' : 'text-xs',
    tableHeader: isA5 ? 'text-[10px]' : 'text-xs',
    tableCell: isA5 ? 'text-[9px]' : 'text-xs'
  };
  const spacing = {
    padding: isA5 ? 'p-3' : 'p-4',
    margin: isA5 ? 'mb-2' : 'mb-3',
    gap: isA5 ? 'gap-1' : 'gap-2'
  };

  return (
    <div 
      className={`print-root bg-white ${size === 'A5' ? 'w-[148mm] min-h-[210mm]' : 'w-[210mm] min-h-[297mm]'} mx-auto ${spacing.padding} font-sans ${textSizes.normal} print:shadow-none`}
      style={{ fontFamily: 'sans-serif', position: 'relative' }}
    >
    {/* Styles spécifiques impression pour assurer largeur totale du tableau */}
      <style>
        {`@media print {
      .print-root { position: relative; }
      .print-footer-spacer { height: ${dynamicSpacerHeight}mm; }
      /* Le spacer adapte sa hauteur selon le nombre d'articles pour éviter le chevauchement avec le cachet */
      /* Pour les très gros bons, forcer une nouvelle page pour le cachet (seuil adapté au format) */
      ${itemsCount > (size === 'A5' ? 20 : 25) ? `.print-footer-spacer { page-break-before: always; height: ${size === 'A5' ? '50mm' : '60mm'}; }` : ''}
      .company-footer { page-break-inside: avoid; break-inside: avoid; }
      .print-table-full { width:100% !important; border-collapse: collapse !important; }
      .print-table-full th, .print-table-full td { word-break: break-word; }
      .totals-section, .client-stamp { page-break-inside: avoid; break-inside: avoid; }
      /* Empêcher un saut de page juste avant le spacer si il reste assez d'espace */
      .print-footer-spacer { page-break-inside: avoid; break-inside: avoid; }
      body { margin:0; padding:0; }
      }
      /* Indicateur visuel à l'écran pour voir l'espace réservé */
      @media screen {
        .print-footer-spacer { 
          height: ${Math.max(20, Math.min(dynamicSpacerHeight, 60))}px; 
          background: linear-gradient(to bottom, transparent 0%, rgba(59, 130, 246, 0.1) 50%, rgba(59, 130, 246, 0.2) 100%);
          border: 1px dashed #3b82f6;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: #3b82f6;
        }
        .print-footer-spacer::after {
          content: "${itemsCount} articles - Format ${size} - Spacer: ${dynamicSpacerHeight}mm ${itemsCount > (size === 'A5' ? 20 : 25) ? '(Nouvelle page)' : ''}";
        }
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
        {/* Contact / Infos (affiche aussi si seulement numéro ou adresse livraison) */}
        <div className="flex-1">
          {hasContactOrInfo && (
            <>
              <h3 className={`${textSizes.header} font-semibold text-gray-800 ${spacing.margin}`}>
                {contact ? 'Contact :' : 'Informations :'}
              </h3>
              <div className={`bg-gray-50 ${spacing.padding} rounded border-l-4 border-orange-500`}>
                <div className={`grid grid-cols-2 ${spacing.gap} ${textSizes.normal}`}>
                  {contactDisplayName && contactDisplayName !== '-' && (
                    <div><span className="font-medium">Nom:</span> {contactDisplayName}</div>
                  )}
                  {tel && String(tel).trim() && (
                    <div><span className="font-medium">Téléphone:</span> <strong>{String(tel).trim()}</strong></div>
                  )}
                  <div><span className="font-medium">Service de charge:</span> <strong>06.66.21.66.57</strong></div>
                  {contact?.email && (
                    <div><span className="font-medium">Email:</span> {contact.email}</div>
                  )}
                  {contact?.adresse && (
                    <div><span className="font-medium">Adresse:</span> {contact.adresse}</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Cartouche */}
        <div className={`ml-6 text-right ${isA5 ? 'ml-3' : 'ml-6'}`}>
          <div className={`${spacing.padding} rounded border border-orange-200`}>
            <h2 className={`${textSizes.header} font-bold text-orange-700 ${spacing.margin}`}>
              BON DEVIS {getBonNumeroDisplay(bon)}
            </h2>
            <div className={`space-y-2 ${textSizes.normal}`}>
              <div><span className="font-medium">Date:</span> {formatHeure(bon.date_creation)}</div>
              {(adrLiv && String(adrLiv).trim()) && (
                <div><span className="font-medium">Livraison:</span> {String(adrLiv).trim()}</div>
              )}
              {bon.date_echeance && (
                <div><span className="font-medium">Échéance:</span> {formatDate(bon.date_echeance)}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table articles */}
      <div className={spacing.margin}>
        <table style={{width:'100%'}} className="no-mobile-scroll print-table-full w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-orange-500 text-white">
              <th className={`border border-gray-300 ${isA5 ? 'px-1 py-1' : 'px-2 py-2'} text-left font-semibold ${isA5 ? 'w-12' : 'w-16'} ${textSizes.tableHeader}`}>CODE</th>
              <th className={`border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-left font-semibold ${textSizes.tableHeader}`}>Article</th>
              {printMode !== 'PRODUCTS_ONLY' && (
                <th className={`border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-center font-semibold ${textSizes.tableHeader}`}>Qté</th>
              )}
              {printMode === 'WITH_PRICES' && (
                <>
                  <th className={`border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right font-semibold ${textSizes.tableHeader}`}>{bon?.type === 'Commande' ? 'P.A (DH)' : 'P.U. (DH)'}</th>
                  <th className={`border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right font-semibold ${textSizes.tableHeader}`}>Total (DH)</th>
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
                  <td className={`border border-gray-300 ${isA5 ? 'px-1 py-1' : 'px-2 py-2'} ${textSizes.tableCell} text-gray-700`}>{productId}</td>
                  <td className={`border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'}`}>
                    <div className={`font-medium ${textSizes.tableCell}`}>{item.designation}</div>
                    {item.description && (
                      <div className={`${textSizes.small} text-gray-600 italic`}>{item.description}</div>
                    )}
                  </td>
                  {printMode !== 'PRODUCTS_ONLY' && (
                    <td className={`border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-center ${textSizes.tableCell}`}>{quantite}</td>
                  )}
                  {printMode === 'WITH_PRICES' && (
                    <>
                      <td className={`border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right ${textSizes.tableCell}`}>{prixUnitaire.toFixed(2)}</td>
                      <td className={`border border-gray-300 ${isA5 ? 'px-2 py-1' : 'px-3 py-2'} text-right font-medium ${textSizes.tableCell}`}>{total.toFixed(2)}</td>
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
        <div className={`flex justify-end ${spacing.margin} totals-section`}>
          <div className={isA5 ? 'w-60' : 'w-80'}>
            <div className={`${spacing.padding} rounded`}>
              <div className={`flex justify-between items-center ${textSizes.subheader} font-bold`}>
                <span>TOTAL GÉNÉRAL:</span>
                <span>{sousTotal.toFixed(2)} DH</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Observations */}
      {bon.notes && (
        <div className={spacing.margin}>
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
  <CompanyFooter data={companyFooters[selectedCompany]} size={size} />
    </div>
  );
};

export default BonPrintTemplate;
