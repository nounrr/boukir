import React from 'react';
import type { Vehicule } from '../types';
import CompanyHeader from './CompanyHeader';
import type { CompanyType, PriceMode } from './ContactPrintTemplate';

interface VehiculePrintTemplateProps {
  vehicule: Vehicule;
  bons: any[];
  dateFrom?: string;
  dateTo?: string;
  companyType: CompanyType;
  priceMode: PriceMode; // keep parity with contact design (WITH_PRICES | WITHOUT_PRICES)
  size?: 'A4' | 'A5';
}

const fmt = (n: any) => Number(n || 0).toFixed(2);
const fmtDate = (d?: string) => {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return dt.toLocaleDateString('fr-FR');
  } catch {}
  return d as string;
};

const VehiculePrintTemplate: React.FC<VehiculePrintTemplateProps> = ({ vehicule, bons, dateFrom, dateTo, companyType, priceMode, size = 'A4' }) => {
  const showPrices = priceMode === 'WITH_PRICES';
  const totalAmount = (Array.isArray(bons) ? bons : []).reduce((sum, b: any) => sum + (Number(b.montant_total) || 0), 0);

  return (
    <div className={`${size === 'A5' ? 'w-[148mm] min-h-[210mm]' : 'w-[210mm] min-h-[297mm]'} bg-white mx-auto p-4 font-sans text-sm`}>
      {/* Header */}
      <CompanyHeader companyType={companyType} />

      {/* Vehicule block */}
      <div className="mt-4 mb-6 grid grid-cols-2 gap-4">
        <div className="bg-gray-50 p-3 rounded border-l-4 border-orange-500">
          <div className="text-sm"><span className="font-semibold">Véhicule:</span> {vehicule?.nom}</div>
          <div className="text-sm"><span className="font-semibold">Immatriculation:</span> {vehicule?.immatriculation}</div>
          <div className="text-sm"><span className="font-semibold">Marque/Modèle:</span> {vehicule?.marque || '-'} {vehicule?.modele || ''}</div>
          <div className="text-sm"><span className="font-semibold">Type/Capacité:</span> {vehicule?.type_vehicule || '-'} {vehicule?.capacite_charge ? `• ${vehicule.capacite_charge} kg` : ''}</div>
          <div className="text-sm"><span className="font-semibold">Statut:</span> {vehicule?.statut || '-'}</div>
        </div>
        {(dateFrom || dateTo) && (
          <div className="text-right text-sm self-start">
            <div className="inline-block bg-orange-100 text-orange-800 px-3 py-1 rounded-full">
              Période: {dateFrom || '...'} → {dateTo || '...'}
            </div>
          </div>
        )}
      </div>

      {/* Bons table */}
      <div>
        <h2 className="text-lg font-bold mb-3">Situation des Bons Véhicule</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-orange-500 text-white">
                <th className="border border-gray-300 px-3 py-2 text-left">Date</th>
                <th className="border border-gray-300 px-3 py-2 text-left">Numéro</th>
                <th className="border border-gray-300 px-3 py-2 text-left">Lieu de chargement</th>
                {showPrices && <th className="border border-gray-300 px-3 py-2 text-right">Montant (DH)</th>}
                <th className="border border-gray-300 px-3 py-2 text-left">Statut</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(bons) && bons.length > 0) ? (
                bons.map((b: any) => (
                  <tr key={b.id} className="odd:bg-gray-50">
                    <td className="border border-gray-300 px-3 py-2">{fmtDate(b.date_creation)}</td>
                    <td className="border border-gray-300 px-3 py-2">{b.numero || `VEH${String(b.id).padStart(2, '0')}`}</td>
                    <td className="border border-gray-300 px-3 py-2">{b.lieu_chargement || '-'}</td>
                    {showPrices && <td className="border border-gray-300 px-3 py-2 text-right">{fmt(b.montant_total)}</td>}
                    <td className="border border-gray-300 px-3 py-2">{b.statut}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-4 text-center text-gray-500" colSpan={showPrices ? 5 : 4}>Aucune donnée</td>
                </tr>
              )}
            </tbody>
            {showPrices && (
              <tfoot>
                <tr className="bg-gray-100 font-semibold">
                  <td className="border border-gray-300 px-3 py-2">—</td>
                  <td className="border border-gray-300 px-3 py-2">TOTAL</td>
                  <td className="border border-gray-300 px-3 py-2">{Array.isArray(bons) ? bons.length : 0} bons</td>
                  <td className="border border-gray-300 px-3 py-2 text-right">{fmt(totalAmount)}</td>
                  <td className="border border-gray-300 px-3 py-2">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default VehiculePrintTemplate;
