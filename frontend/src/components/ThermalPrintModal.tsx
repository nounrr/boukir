import React, { useRef } from 'react';
import { X, Printer } from 'lucide-react';

interface ThermalPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  bon: any;
  type: 'Commande' | 'Sortie' | 'Comptant' | 'Devis' | 'AvoirClient' | 'AvoirFournisseur' | 'Avoir';
  contact?: any;
  items?: any[];
}

const ThermalPrintModal: React.FC<ThermalPrintModalProps> = ({
  isOpen,
  onClose,
  bon,
  type,
  contact,
  items = [],
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (printRef.current) {
      const printContent = printRef.current.innerHTML;
      const originalContent = document.body.innerHTML;
      
      // Styles pour impression thermique 5cm
      const printStyles = `
        <style>
          @media print {
            @page {
              size: 50mm auto;
              margin: 2mm;
            }
            body {
              font-family: 'Courier New', monospace;
              font-size: 8px;
              line-height: 1.2;
              margin: 0;
              padding: 0;
              width: 46mm;
              color: black;
            }
            .thermal-container {
              width: 100%;
              padding: 0;
            }
            .thermal-header {
              text-align: center;
              border-bottom: 1px dashed #000;
              padding-bottom: 2mm;
              margin-bottom: 2mm;
            }
            .thermal-title {
              font-weight: bold;
              font-size: 10px;
              margin-bottom: 1mm;
            }
            .thermal-info {
              font-size: 7px;
              margin-bottom: 1mm;
            }
            .thermal-section {
              margin-bottom: 2mm;
              padding-bottom: 1mm;
              border-bottom: 1px dashed #000;
            }
            .thermal-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 0.5mm;
              font-size: 7px;
            }
            .thermal-item {
              margin-bottom: 1mm;
            }
            .thermal-total {
              font-weight: bold;
              font-size: 9px;
              text-align: center;
              margin-top: 2mm;
            }
            .thermal-footer {
              text-align: center;
              font-size: 6px;
              margin-top: 3mm;
              border-top: 1px dashed #000;
              padding-top: 2mm;
            }
          }
        </style>
      `;

      document.body.innerHTML = printStyles + '<div class="thermal-container">' + printContent + '</div>';
      window.print();
      document.body.innerHTML = originalContent;
      window.location.reload(); // Reload to restore React app
    }
  };

  const formatDate = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR');
  };

  const formatPrice = (price: number) => {
    return price?.toFixed(2) + ' DH' || '0.00 DH';
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'Commande': return 'COMMANDE';
      case 'Sortie': return 'BON DE SORTIE';
      case 'Comptant': return 'COMPTANT';
      case 'Devis': return 'DEVIS';
      case 'AvoirClient': 
      case 'Avoir': return 'AVOIR CLIENT';
      case 'AvoirFournisseur': return 'AVOIR FOURNISSEUR';
      default: return 'BON';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Impression Thermique</h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="bg-gray-100 p-4 rounded mb-4">
            <p className="text-sm text-gray-600 mb-2">
              Aperçu de l'impression (largeur 5cm pour imprimante thermique)
            </p>
          </div>

          {/* Aperçu thermal */}
          <div 
            ref={printRef}
            className="border border-gray-300 p-2 mx-auto bg-white"
            style={{ width: '200px', fontSize: '10px', fontFamily: 'Courier New, monospace' }}
          >
            <div className="thermal-header">
              <div className="thermal-title">{getTypeLabel(type)}</div>
              <div className="thermal-info">N°: {bon?.reference || bon?.numero || 'N/A'}</div>
              <div className="thermal-info">Date: {formatDate(bon?.date_bon || bon?.date_devis)}</div>
            </div>

            {contact && (
              <div className="thermal-section">
                <div className="thermal-info">
                  <strong>{contact.type === 'Client' ? 'CLIENT:' : 'FOURNISSEUR:'}</strong>
                </div>
                <div className="thermal-info">{contact.nom}</div>
                {contact.telephone && (
                  <div className="thermal-info">Tel: {contact.telephone}</div>
                )}
              </div>
            )}

            {items.length > 0 && (
              <div className="thermal-section">
                <div className="thermal-info"><strong>ARTICLES:</strong></div>
                {items.map((item: any, index: number) => (
                  <div key={item.id || `item-${index}`} className="thermal-item">
                    <div className="thermal-info">{item.produit_nom || item.designation}</div>
                    <div className="thermal-row">
                      <span>{item.quantite} x {formatPrice(item.prix_unitaire)}</span>
                      <span>{formatPrice(item.quantite * item.prix_unitaire)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {bon && (
              <div className="thermal-section">
                <div className="thermal-row">
                  <span>Sous-total:</span>
                  <span>{formatPrice(bon.montant_total || 0)}</span>
                </div>
                {bon.tva && (
                  <div className="thermal-row">
                    <span>TVA:</span>
                    <span>{formatPrice(bon.tva)}</span>
                  </div>
                )}
                <div className="thermal-total">
                  TOTAL: {formatPrice(bon.montant_total || 0)}
                </div>
              </div>
            )}

            <div className="thermal-footer">
              <div>Merci de votre confiance</div>
              <div>{formatDate(new Date().toISOString())}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThermalPrintModal;
