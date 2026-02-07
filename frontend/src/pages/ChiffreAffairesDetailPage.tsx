import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, TrendingUp, DollarSign, Package, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { useGetChiffreAffairesDetailQuery } from '../store/api/statsApi';

// Types
interface BonDetail {
  id: number;
  numero: string;
  type: string;
  statut: string;
  montant_total: number;
  items: any[];
  date_creation: string;
  contact_nom?: string;
}

interface ChiffreDetail {
  type: 'CA_NET' | 'BENEFICIAIRE' | 'ACHATS';
  title: string;
  icon: React.ReactNode;
  color: string;
  total: number;
  bons: BonDetail[];
  calculs: Array<{
  bonId: number;
  bonNumero: string;
  bonType: string;
  items: Array<{
  designation: string;
  quantite: number;
  prix_unitaire: number;
  cout_revient?: number;
  prix_achat?: number;
  montant_ligne: number;
    profit?: number;
    // Ajouts pour vérification des remises et profits
    remise_unitaire?: number;
      remise_total?: number;
      profitBrut?: number; // Profit avant remise
    }>;
    totalBon: number;
    profitBon?: number;
    // Totaux supplémentaires pour contrôle des remises
    totalRemiseBon?: number;
    netTotalBon?: number; // totalBon - totalRemiseBon
  }>;
}

const ChiffreAffairesDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { date } = useParams<{ date: string }>();
  const [searchParams] = useSearchParams();
  const selectedDate = date || searchParams.get('date') || '';

  // État pour les accordéons (fermés par défaut)
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set());
  const [openSubAccordions, setOpenSubAccordions] = useState<Set<string>>(new Set());

  const toggleAccordion = (chiffreType: string) => {
    setOpenAccordions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chiffreType)) {
        newSet.delete(chiffreType);
      } else {
        newSet.add(chiffreType);
      }
      return newSet;
    });
  };

  const toggleSubAccordion = (key: string) => {
    setOpenSubAccordions(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  type CalculDetail = ChiffreDetail['calculs'][number];

  const renderItemsTable = (calcul: CalculDetail, isBeneficiaire: boolean) => (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Produit
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
              Qté
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
              Prix Unit.
            </th>
            {isBeneficiaire && (
              <>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Coût
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Remise
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Profit
                </th>
              </>
            )}
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {calcul.items.map((item, itemIndex) => (
            <tr key={`${calcul.bonId}-${itemIndex}`}>
              <td className="px-4 py-2 text-sm text-gray-900">
                {item.designation}
              </td>
              <td className="px-4 py-2 text-sm text-gray-900 text-right">
                {item.quantite}
              </td>
              <td className="px-4 py-2 text-sm text-gray-900 text-right">
                {formatAmount(item.prix_unitaire)} DH
              </td>
              {isBeneficiaire && (
                <>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right">
                    {formatAmount(item.cout_revient || item.prix_achat || 0)} DH
                  </td>
                  <td className="px-4 py-2 text-sm text-amber-600 text-right">
                    {formatAmount(item.remise_total || 0)} DH
                  </td>
                  <td className="px-4 py-2 text-sm text-emerald-600 text-right">
                    {formatAmount(item.profit || 0)} DH
                  </td>
                </>
              )}
              <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">
                {formatAmount(item.montant_ligne)} DH
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {isBeneficiaire && (
        <div className="flex flex-wrap gap-6 mt-3 text-xs sm:text-sm text-gray-700 border-t pt-3">
          <span>
            Total Remises Bon: <span className="font-semibold text-amber-600">{formatAmount(calcul.totalRemiseBon || 0)} DH</span>
          </span>
          <span>
            Profit Net Bon: <span className="font-semibold text-emerald-600">{formatAmount(calcul.profitBon || 0)} DH</span>
          </span>
          {typeof calcul.netTotalBon === 'number' && (
            <span>
              Total Net (Vente - Remise): <span className="font-semibold text-blue-600">{formatAmount(calcul.netTotalBon || 0)} DH</span>
            </span>
          )}
        </div>
      )}
    </div>
  );

  const renderCalculCard = (calcul: CalculDetail, isBeneficiaire: boolean) => (
    <div key={calcul.bonId} className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <FileText size={16} className="text-gray-400 mr-2" />
          <span className="font-medium text-gray-900">
            {calcul.bonType} {calcul.bonNumero}
          </span>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-gray-900">
            {formatAmount(calcul.totalBon)} DH
          </div>
          {isBeneficiaire && (
            <div className="text-sm text-emerald-600">
              Profit: {formatAmount(calcul.profitBon || 0)} DH
            </div>
          )}
        </div>
      </div>
      {renderItemsTable(calcul, isBeneficiaire)}
    </div>
  );

  const {
    data: chiffresDetailResp = [],
    isLoading,
    isFetching,
    error,
  } = useGetChiffreAffairesDetailQuery({ date: selectedDate }, { skip: !selectedDate });

  const errorMessage = useMemo(() => {
    const anyErr = error as any;
    if (!anyErr) return null;
    if (anyErr?.status === 401) return 'Non autorisé. Veuillez vous reconnecter.';
    return anyErr?.data?.message || anyErr?.error || 'Erreur lors du chargement du détail.';
  }, [error]);

  // Utility functions
  const formatDate = (dateStr: string): string => {
    // Avoid UTC parsing shift for 'YYYY-MM-DD'
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatAmount = (amount: number): string => {
    // Préserver les décimales exactes, sans arrondi forcé
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 10, // Permet jusqu'à 10 décimales si nécessaire
    }).format(amount);
  };

  const chiffresDetail = useMemo(() => {
    return chiffresDetailResp.map((section) => {
      const icon =
        section.type === 'CA_NET' ? <DollarSign size={20} /> : section.type === 'BENEFICIAIRE' ? <TrendingUp size={20} /> : <Package size={20} />;
      const color = section.type === 'CA_NET' ? 'text-yellow-600' : section.type === 'BENEFICIAIRE' ? 'text-emerald-600' : 'text-indigo-600';
      return {
        ...section,
        icon,
        color,
      } as any;
    });
  }, [chiffresDetailResp]);

  if (!selectedDate) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Date non spécifiée</h1>
          <button
            onClick={() => navigate('/chiffre-affaires')}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft size={16} className="mr-2" />
            Retour aux chiffres d'affaires
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/chiffre-affaires')}
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Retour aux chiffres d'affaires
        </button>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Détail des Chiffres d'Affaires
        </h1>
        <p className="text-gray-600">
          Analyse détaillée pour le {formatDate(selectedDate)}
        </p>
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
          {errorMessage}
        </div>
      )}

      {(isLoading || isFetching) && (
        <div className="bg-white border rounded-lg p-4 text-sm text-gray-600 mb-6">
          Chargement du détail...
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {chiffresDetail.map((chiffre) => (
          <div key={chiffre.type} className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className={`${chiffre.color} mr-3`}>
                  {chiffre.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {chiffre.title}
                </h3>
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-2">
              {formatAmount(chiffre.total)} DH
            </div>
            <div className="text-sm text-gray-500">
              {chiffre.bons.length} document(s) traité(s)
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Calculations - Accordions */}
      {chiffresDetail.map((chiffre) => {
        const accordionKey = chiffre.type;
        const isOpen = openAccordions.has(accordionKey);
        // Group calculs by bonType for nested accordions
        const groups: Record<string, { calculs: CalculDetail[]; total: number }> = {};
        for (const c of chiffre.calculs) {
          const key = c.bonType || 'Autre';
          const amount = chiffre.type === 'BENEFICIAIRE' ? (c.profitBon || 0) : c.totalBon;
          if (!groups[key]) groups[key] = { calculs: [], total: 0 };
          groups[key].calculs.push(c);
          groups[key].total += amount;
        }
        const order = ['Comptant', 'Sortie', 'Commande', 'Avoir', 'Bon Véhicule'];
        const groupKeys = Object.keys(groups).sort((a, b) => {
          const ia = order.indexOf(a);
          const ib = order.indexOf(b);
          if (ia === -1 && ib === -1) return a.localeCompare(b);
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });
        
        return (
          <div key={accordionKey} className="bg-white rounded-lg shadow-lg mb-8">
            <button
              type="button"
              aria-expanded={isOpen}
              className="w-full text-left px-6 py-4 border-b border-gray-200 hover:bg-gray-50 transition-colors"
              onClick={() => toggleAccordion(accordionKey)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`${chiffre.color} mr-3`}>
                    {chiffre.icon}
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Détail de calcul - {chiffre.title}
                  </h2>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-lg font-semibold text-gray-900">
                    {formatAmount(chiffre.total)} DH
                  </span>
                  {isOpen ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="p-6">
                {chiffre.calculs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    Aucune activité pour ce type de chiffre ce jour
                  </p>
                ) : (
                  <div className="space-y-6">
                    {groupKeys.map((gk) => {
                      const g = groups[gk];
                      const subKey = `${chiffre.type}:${gk}`;
                      const subOpen = openSubAccordions.has(subKey);
                      return (
                        <div key={gk} className="border border-gray-200 rounded-lg">
                          <button
                            type="button"
                            aria-expanded={subOpen}
                            className="w-full text-left px-4 py-3 border-b border-gray-100 bg-gray-50 hover:bg-gray-100 flex items-center justify-between"
                            onClick={() => toggleSubAccordion(subKey)}
                          >
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-semibold text-gray-900">{gk}</span>
                              <span className="text-xs text-gray-500">({g.calculs.length} doc)</span>
                            </div>
                            <div className="flex items-center space-x-3">
                              <span className="text-sm font-semibold text-gray-900">{formatAmount(g.total)} DH</span>
                              {subOpen ? (
                                <ChevronUp className="h-4 w-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-gray-500" />
                              )}
                            </div>
                          </button>

                          {subOpen && (
                            <div className="p-4 space-y-6">
                              {g.calculs.map((calcul: CalculDetail) => (
                                renderCalculCard(calcul, chiffre.type === 'BENEFICIAIRE')
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Total summary */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Calculator size={16} className="text-gray-400 mr-2" />
                          <span className="font-medium text-gray-900">
                            Total {chiffre.title}
                          </span>
                        </div>
                        <div className="text-xl font-bold text-gray-900">
                          {formatAmount(chiffre.total)} DH
                        </div>
                      </div>
                      {chiffre.type === 'CA_NET' && chiffre.calculs.some((c: CalculDetail) => c.bonType === 'Avoir') && (
                        <div className="text-sm text-gray-500 mt-2">
                          * Les avoirs client sont soustraits du total
                        </div>
                      )}
                      {chiffre.type === 'BENEFICIAIRE' && (
                        <div className="text-sm text-gray-500 mt-2">
                          * Calcul: Profits (Ventes) - Profits (Avoirs Client) - Profits (Avoirs Comptant) - Montant Total (Bons Véhicule)
                          <br />
                          * Profit ligne = ((PV - Coût) × Qté)
                          <br />
                          * Les remises n'affectent pas le profit, elles n'affectent que le total net d'un bon.
                          <br />
                          * Les bons véhicule sont déduits en montant total (pas en profit)
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ChiffreAffairesDetailPage;
