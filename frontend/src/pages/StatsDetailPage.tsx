import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Filter, Users } from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';
import { useGetStatsDetailsQuery } from '../store/api/statsApi';
import type { RootState } from '../store';

const toNumber = (value: any): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const money = (value: any) => `${toNumber(value).toFixed(2)} DH`;

const getBonRowBg = (bonType: string): string => {
  switch (bonType) {
    case 'Sortie':
    case 'Comptant':
    case 'Ecommerce':
      return 'bg-green-50';
    case 'Commande':
      return 'bg-amber-50';
    case 'Avoir':
    case 'AvoirComptant':
    case 'AvoirEcommerce':
      return 'bg-red-50';
    case 'AvoirFournisseur':
      return 'bg-blue-50';
    default:
      return '';
  }
};

const StatsDetailPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordError, setShowPasswordError] = useState(false);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [mode, setMode] = useState<'produits' | 'clients'>('produits');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [includeVentes, setIncludeVentes] = useState(true);
  const [includeCommandes, setIncludeCommandes] = useState(true);
  const [includeAvoirs, setIncludeAvoirs] = useState(true);
  const [useClientCondition, setUseClientCondition] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setPage(1);
    setExpanded({});
  }, [dateFrom, dateTo, mode, selectedProductId, selectedClientId, includeVentes, includeCommandes, includeAvoirs, useClientCondition, pageSize]);

  useEffect(() => {
    setSelectedProductId('');
    setSelectedClientId('');
  }, [mode]);

  const { data, isFetching, error } = useGetStatsDetailsQuery(
    {
      mode,
      page,
      pageSize,
      dateFrom,
      dateTo,
      includeVentes,
      includeCommandes,
      includeAvoirs,
      useClientCondition,
      selectedProductId,
      selectedClientId,
    },
    { skip: !isPasswordVerified }
  );

  const handlePasswordVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifyingPassword) return;

    try {
      setIsVerifyingPassword(true);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cin: user?.cin, password: passwordInput }),
      });

      if (response.ok) {
        setIsPasswordVerified(true);
        setShowPasswordError(false);
        setPasswordInput('');
      } else {
        setShowPasswordError(true);
      }
    } catch (err) {
      console.error('Erreur de vérification:', err);
      setShowPasswordError(true);
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const toggleType = (setter: React.Dispatch<React.SetStateAction<boolean>>, current: boolean) => {
    const next = !current;
    if (!next && [includeVentes, includeCommandes, includeAvoirs].filter(Boolean).length <= 1) return;
    setter(next);
  };

  if (!isPasswordVerified) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center mb-4">
            <Users size={48} className="text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-center mb-2">Page Stats Détaillées</h2>
          <p className="text-gray-600 text-center mb-6">Veuillez entrer le mot de passe pour accéder à cette page</p>
          <form onSubmit={handlePasswordVerification}>
            <label htmlFor="password-verify" className="block text-sm font-medium text-gray-700 mb-2">Mot de passe</label>
            <input
              type="password"
              id="password-verify"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setShowPasswordError(false);
              }}
              className={`w-full px-4 py-2 border ${showPasswordError ? 'border-red-500' : 'border-gray-300'} rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
              placeholder="Entrez le mot de passe"
              autoFocus
            />
            {showPasswordError && <p className="mt-2 text-sm text-red-600">Mot de passe incorrect. Veuillez réessayer.</p>}
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => navigate('/dashboard')} className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 font-medium flex items-center justify-center gap-2">
                <ArrowLeft size={18} />
                Retour
              </button>
              <button type="submit" disabled={isVerifyingPassword || !passwordInput.trim()} className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium disabled:opacity-60 disabled:cursor-not-allowed">
                {isVerifyingPassword ? 'Vérification...' : 'Accéder'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const pagination = data?.pagination || { page, pageSize, total: 0, totalPages: 0 };
  const totals = data?.totals || { totalVentes: 0, totalQuantite: 0, totalMontant: 0, totalProfit: 0 };
  const counts = data?.counts;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistiques détaillées</h1>
          <p className="text-gray-600 mt-1">Calculs faits côté backend, affichage côté frontend</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-600 font-medium mr-1">Clés de couleur :</span>
        <span className="inline-flex items-center px-2 py-1 rounded border border-green-200 bg-green-50 text-green-800">Sortie / Comptant / Ecommerce</span>
        <span className="inline-flex items-center px-2 py-1 rounded border border-amber-200 bg-amber-50 text-amber-800">Commande</span>
        <span className="inline-flex items-center px-2 py-1 rounded border border-red-200 bg-red-50 text-red-800">Avoir</span>
        <span className="inline-flex items-center px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-800">Avoir fournisseur</span>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Filtres</h2>
        </div>

        {counts && (
          <div className="mb-4 inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">
            <Filter className="w-3 h-3 mr-2" />
            Ventes {counts.ventes.filtered}/{counts.ventes.total} - Commandes {counts.commandes.filtered}/{counts.commandes.total} - Avoirs {counts.avoirs.filtered}/{counts.avoirs.total}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label htmlFor="dateFrom" className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
            <input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
          </div>
          <div>
            <label htmlFor="dateTo" className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
            <input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
          </div>
          <div>
            <label htmlFor="detailMode" className="block text-sm font-medium text-gray-700 mb-1">Vue</label>
            <select id="detailMode" value={mode} onChange={(e) => setMode(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-md">
              <option value="produits">Par produit</option>
              <option value="clients">Par client</option>
            </select>
          </div>
          <div>
            <label htmlFor="pageSize" className="block text-sm font-medium text-gray-700 mb-1">Par page</label>
            <select id="pageSize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-md">
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div>
            {mode === 'produits' ? (
              <>
                <label htmlFor="detailProductSearch" className="block text-sm font-medium text-gray-700 mb-1">Produit</label>
                <SearchableSelect id="detailProductSearch" options={data?.options?.products || [{ value: '', label: 'Tous' }]} value={selectedProductId} onChange={setSelectedProductId} placeholder="Rechercher produit" className="w-full" autoOpenOnFocus />
              </>
            ) : (
              <>
                <label htmlFor="detailClientSearch" className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                <SearchableSelect id="detailClientSearch" options={data?.options?.clients || [{ value: '', label: 'Tous' }]} value={selectedClientId} onChange={setSelectedClientId} placeholder="Rechercher client" className="w-full" autoOpenOnFocus />
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-6 items-center">
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={includeVentes} onChange={() => toggleType(setIncludeVentes, includeVentes)} /> Inclure Ventes</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={includeCommandes} onChange={() => toggleType(setIncludeCommandes, includeCommandes)} /> Inclure Commandes</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={includeAvoirs} onChange={() => toggleType(setIncludeAvoirs, includeAvoirs)} /> Inclure Avoirs</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={useClientCondition} onChange={() => setUseClientCondition((v) => !v)} /> Condition client</label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">Ventes</p><p className="text-xl font-semibold">{totals.totalVentes}</p></div>
        <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">Quantité</p><p className="text-xl font-semibold">{toNumber(totals.totalQuantite)}</p></div>
        <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">Montant</p><p className="text-xl font-semibold">{money(totals.totalMontant)}</p></div>
        <div className="bg-white rounded-lg shadow p-4"><p className="text-sm text-gray-500">Profit</p><p className={`text-xl font-semibold ${toNumber(totals.totalProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{money(totals.totalProfit)}</p></div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        {isFetching ? (
          <div className="py-10 text-center text-gray-500">Chargement des statistiques...</div>
        ) : error ? (
          <div className="py-10 text-center text-red-600">Erreur lors du chargement des statistiques.</div>
        ) : !data?.rows?.length ? (
          <div className="py-10 text-center text-gray-500">Aucune donnée à afficher.</div>
        ) : mode === 'produits' ? (
          <div className="space-y-6">
            {data.rows.map((row: any) => (
              <div key={row.productId} className="border rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="text-indigo-600" size={18} />
                    <div>
                      <h3 className="font-semibold text-gray-900">{row.title}</h3>
                      <p className="text-xs text-gray-500">ID: {row.productId}</p>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p>Qté: <span className="font-semibold">{toNumber(row.totalQuantite)}</span></p>
                    <p>{money(row.totalMontant)}</p>
                    <p className={toNumber(row.totalProfit) >= 0 ? 'text-green-600' : 'text-red-600'}>Profit: {money(row.totalProfit)}</p>
                  </div>
                </div>
                <StatsProductClientsTable row={row} expanded={expanded} setExpanded={setExpanded} />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {data.rows.map((row: any) => (
              <div key={row.clientId} className="border rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{row.clientName}</h3>
                    <p className="text-xs text-gray-500">ID: {row.clientId}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p>Qté: <span className="font-semibold">{toNumber(row.totalQuantite)}</span></p>
                    <p>{money(row.totalMontant)}</p>
                    <p className={toNumber(row.totalProfit) >= 0 ? 'text-green-600' : 'text-red-600'}>Profit: {money(row.totalProfit)}</p>
                  </div>
                </div>
                <StatsClientProductsTable row={row} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-gray-600">Page {pagination.totalPages ? pagination.page : 0} / {pagination.totalPages} - {pagination.total} lignes</span>
          <div className="flex gap-2">
            <button disabled={page <= 1 || isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-2 border border-gray-300 rounded-md disabled:opacity-50">Précédent</button>
            <button disabled={page >= pagination.totalPages || isFetching} onClick={() => setPage((p) => p + 1)} className="px-3 py-2 border border-gray-300 rounded-md disabled:opacity-50">Suivant</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatsProductClientsTable: React.FC<{ row: any; expanded: Record<string, boolean>; setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>> }> = ({ row, expanded, setExpanded }) => (
  <div className="overflow-x-auto">
    <table className="w-full divide-y divide-gray-200">
      <thead className="bg-white">
        <tr>
          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ventes</th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Quantité</th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {(row.clients || []).map((client: any) => {
          const key = `${row.productId}:${client.clientId}`;
          const isOpen = !!expanded[key];
          return (
            <React.Fragment key={key}>
              <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}>
                <td className="px-4 py-2 text-sm text-gray-900">{isOpen ? '▾' : '▸'} {client.clientName}</td>
                <td className="px-4 py-2 text-sm text-right">{client.ventes}</td>
                <td className="px-4 py-2 text-sm text-right">{toNumber(client.quantite)}</td>
                <td className="px-4 py-2 text-sm text-right font-semibold">{money(client.montant)}</td>
                <td className={`px-4 py-2 text-sm text-right font-semibold ${toNumber(client.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{money(client.profit)}</td>
              </tr>
              {isOpen && <StatsDetailsRows details={client.details || []} />}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
);

const StatsDetailsRows: React.FC<{ details: any[] }> = ({ details }) => (
  <tr className="bg-gray-50/60">
    <td colSpan={5} className="px-4 pb-4 pt-0">
      <div className="mt-2 border border-gray-200 rounded-md bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-2 py-1 text-left">Bon</th>
              <th className="px-2 py-1 text-left">Type</th>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Variante</th>
              <th className="px-2 py-1 text-left">Unité</th>
              <th className="px-2 py-1 text-right">Qté</th>
              <th className="px-2 py-1 text-right">P.Unit</th>
              <th className="px-2 py-1 text-right">Coût</th>
              <th className="px-2 py-1 text-right">Total</th>
              <th className="px-2 py-1 text-right">Profit</th>
              <th className="px-2 py-1 text-left">Statut</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d, idx) => (
              <tr key={`${d.bonId}-${idx}`} className={`border-t ${getBonRowBg(String(d.type || ''))}`}>
                <td className="px-2 py-1">{d.bonNumero}</td>
                <td className="px-2 py-1">{d.type}</td>
                <td className="px-2 py-1">{d.date}</td>
                <td className="px-2 py-1">{d.variantName || '-'}</td>
                <td className="px-2 py-1">{d.unitName || '-'}</td>
                <td className="px-2 py-1 text-right">{toNumber(d.quantite)}</td>
                <td className="px-2 py-1 text-right">{money(d.prix_unitaire)}</td>
                <td className="px-2 py-1 text-right">{money(d.costUnit)}</td>
                <td className="px-2 py-1 text-right font-medium">{money(d.total)}</td>
                <td className={`px-2 py-1 text-right font-medium ${toNumber(d.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{money(d.profit)}</td>
                <td className="px-2 py-1">{d.statut}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </td>
  </tr>
);

const StatsClientProductsTable: React.FC<{ row: any }> = ({ row }) => (
  <div className="overflow-x-auto">
    <table className="w-full divide-y divide-gray-200">
      <thead className="bg-white">
        <tr>
          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produit</th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ventes</th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Quantité</th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {(row.products || []).map((product: any) => (
          <tr key={product.productId} className="hover:bg-gray-50">
            <td className="px-4 py-2 text-sm text-gray-900">{product.productName}</td>
            <td className="px-4 py-2 text-sm text-right">{product.ventes}</td>
            <td className="px-4 py-2 text-sm text-right">{toNumber(product.quantite)}</td>
            <td className="px-4 py-2 text-sm text-right font-semibold">{money(product.montant)}</td>
            <td className={`px-4 py-2 text-sm text-right font-semibold ${toNumber(product.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{money(product.profit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default StatsDetailPage;
