import React, { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, TrendingUp, DollarSign, Package, Calculator } from 'lucide-react';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { useGetProductsQuery } from '../store/api/productsApi';

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
    }>;
    totalBon: number;
    profitBon?: number;
  }>;
}

const ChiffreAffairesDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { date } = useParams<{ date: string }>();
  const [searchParams] = useSearchParams();
  const selectedDate = date || searchParams.get('date') || '';

  // Data
  const { data: sorties = [] } = useGetBonsByTypeQuery('Sortie');
  const { data: comptants = [] } = useGetBonsByTypeQuery('Comptant');
  const { data: commandes = [] } = useGetBonsByTypeQuery('Commande');
  const { data: avoirsClient = [] } = useGetBonsByTypeQuery('Avoir');
  const { data: products = [] } = useGetProductsQuery();

  // Utility functions
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
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

  const parseItemsSafe = (items: any): any[] => {
    if (Array.isArray(items)) return items;
    if (typeof items === 'string') {
      try {
        const parsed = JSON.parse(items);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const resolveCost = (item: any): number => {
    const product = products.find((p: any) => p.id === item.product_id);
    if (product?.cout_revient) return Number(product.cout_revient);
    if (product?.prix_achat) return Number(product.prix_achat);
    return 0;
  };

  const computeBonDetail = (bon: any) => {
    const items = parseItemsSafe(bon.items);
    const itemsDetail = [];
    let totalBon = 0;
    let profitBon = 0;

    for (const item of items) {
      const quantite = Number(item.quantite || 0);
      const prix_unitaire = Number(item.prix_unitaire || 0);
      
      let cost = 0;
      if (item.cout_revient !== undefined && item.cout_revient !== null) {
        cost = Number(item.cout_revient) || 0;
      } else if (item.prix_achat !== undefined && item.prix_achat !== null) {
        cost = Number(item.prix_achat) || 0;
      } else {
        cost = resolveCost(item);
      }

      const montant_ligne = prix_unitaire * quantite;
      const profit = (prix_unitaire - cost) * quantite;

      totalBon += montant_ligne;
      profitBon += profit;

      itemsDetail.push({
        designation: item.designation || 'Produit sans nom',
        quantite,
        prix_unitaire,
        cout_revient: item.cout_revient,
        prix_achat: item.prix_achat,
        montant_ligne,
        profit
      });
    }

    return {
      bonId: bon.id,
      bonNumero: bon.numero || `#${bon.id}`,
      bonType: bon.type,
      items: itemsDetail,
      totalBon,
      profitBon
    };
  };

  // Calculate detailed data for the specific date
  const chiffresDetail = useMemo(() => {
    const validStatuses = new Set(['En attente', 'Validé']);
    
    // Filter documents for the specific date
    const filterByDate = (docs: any[]) => docs.filter((doc: any) => {
      const docDate = doc.date_creation?.split('T')[0];
      return docDate === selectedDate && validStatuses.has(doc.statut);
    });

    const dayVentes = filterByDate([...sorties, ...comptants]);
    const dayAvoirs = filterByDate(avoirsClient);
    const dayCommandes = filterByDate(commandes);

    // CA Net calculation
    const caNetDetails: ChiffreDetail = {
      type: 'CA_NET',
      title: 'Chiffre d\'Affaires Net',
      icon: <DollarSign size={20} />,
      color: 'text-yellow-600',
      total: 0,
      bons: [],
      calculs: []
    };

    // Add ventes (positive)
    dayVentes.forEach(bon => {
      const detail = computeBonDetail(bon);
      caNetDetails.total += detail.totalBon;
      caNetDetails.bons.push(bon);
      caNetDetails.calculs.push(detail);
    });

    // Subtract avoirs (negative)
    dayAvoirs.forEach(avoir => {
      const detail = computeBonDetail(avoir);
      caNetDetails.total -= detail.totalBon;
      caNetDetails.bons.push(avoir);
      const avoirDetail = { ...detail, totalBon: -detail.totalBon };
      caNetDetails.calculs.push(avoirDetail);
    });

    // Chiffre Bénéficiaire calculation
    const beneficiaireDetails: ChiffreDetail = {
      type: 'BENEFICIAIRE',
      title: 'Chiffre Bénéficiaire (Profits)',
      icon: <TrendingUp size={20} />,
      color: 'text-emerald-600',
      total: 0,
      bons: [],
      calculs: []
    };

    // Add profits from ventes
    dayVentes.forEach(bon => {
      const detail = computeBonDetail(bon);
      beneficiaireDetails.total += detail.profitBon || 0;
      beneficiaireDetails.bons.push(bon);
      beneficiaireDetails.calculs.push(detail);
    });

    // Subtract profits from avoirs
    dayAvoirs.forEach(avoir => {
      const detail = computeBonDetail(avoir);
      beneficiaireDetails.total -= detail.profitBon || 0;
      beneficiaireDetails.bons.push(avoir);
      const avoirDetail = { ...detail, profitBon: -(detail.profitBon || 0) };
      beneficiaireDetails.calculs.push(avoirDetail);
    });

    // CA Achats calculation
    const achatsDetails: ChiffreDetail = {
      type: 'ACHATS',
      title: 'CA des Achats (Commandes)',
      icon: <Package size={20} />,
      color: 'text-indigo-600',
      total: 0,
      bons: [],
      calculs: []
    };

    dayCommandes.forEach(commande => {
      const detail = computeBonDetail(commande);
      achatsDetails.total += detail.totalBon;
      achatsDetails.bons.push(commande);
      achatsDetails.calculs.push(detail);
    });

    return [caNetDetails, beneficiaireDetails, achatsDetails];
  }, [selectedDate, sorties, comptants, avoirsClient, commandes, products]);

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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {chiffresDetail.map((chiffre, index) => (
          <div key={index} className="bg-white rounded-lg shadow-lg p-6">
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

      {/* Detailed Calculations */}
      {chiffresDetail.map((chiffre, chiffreIndex) => (
        <div key={chiffreIndex} className="bg-white rounded-lg shadow-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center">
              <div className={`${chiffre.color} mr-3`}>
                {chiffre.icon}
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                Détail de calcul - {chiffre.title}
              </h2>
            </div>
          </div>

          <div className="p-6">
            {chiffre.calculs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Aucune activité pour ce type de chiffre ce jour
              </p>
            ) : (
              <div className="space-y-6">
                {chiffre.calculs.map((calcul, calculIndex) => (
                  <div key={calculIndex} className="border border-gray-200 rounded-lg p-4">
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
                        {chiffre.type === 'BENEFICIAIRE' && (
                          <div className="text-sm text-emerald-600">
                            Profit: {formatAmount(calcul.profitBon || 0)} DH
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Items detail */}
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
                            {chiffre.type === 'BENEFICIAIRE' && (
                              <>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                  Coût
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
                            <tr key={itemIndex}>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                {item.designation}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900 text-right">
                                {item.quantite}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900 text-right">
                                {formatAmount(item.prix_unitaire)} DH
                              </td>
                              {chiffre.type === 'BENEFICIAIRE' && (
                                <>
                                  <td className="px-4 py-2 text-sm text-gray-900 text-right">
                                    {formatAmount(item.cout_revient || item.prix_achat || 0)} DH
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
                    </div>
                  </div>
                ))}

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
                  {chiffre.type === 'CA_NET' && chiffre.calculs.some(c => c.bonType === 'Avoir') && (
                    <div className="text-sm text-gray-500 mt-2">
                      * Les avoirs client sont soustraits du total
                    </div>
                  )}
                  {chiffre.type === 'BENEFICIAIRE' && (
                    <div className="text-sm text-gray-500 mt-2">
                      * Calcul: (Prix de vente - Coût) × Quantité par article
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ChiffreAffairesDetailPage;
