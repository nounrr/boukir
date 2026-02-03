import React, { useMemo, useState } from 'react';
import { Search, Eye, Edit, Trash2, CheckCircle, XCircle, Clock, Plus, X, User, TrendingUp } from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';
import BonFormModal from '../components/BonFormModal';
import { getBonNumeroDisplay } from '../utils/numero';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { useGetClientRemisesQuery, useCreateClientRemiseMutation, useUpdateClientRemiseMutation, useDeleteClientRemiseMutation, useGetRemiseItemsQuery, useCreateRemiseItemMutation, useUpdateRemiseItemMutation, useDeleteRemiseItemMutation } from '../store/api/remisesApi';
import { useGetProductsQuery } from '../store/api/productsApi';
import { useGetAllClientsQuery } from '../store/api/contactsApi';
import { useAuth } from '../hooks/redux';

const parseItems = (items: any): any[] => {
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

const computeItemDiscount = (it: any): number => {
  const q = Number(it?.quantite ?? it?.qte ?? 0) || 0;
  if (!q) return 0;
  const unit = Number(it?.prix_unitaire ?? it?.prix ?? it?.price ?? 0) || 0;
  const montant = Number(it?.remise_montant ?? 0) || 0;
  const pct = Number(it?.remise_pourcentage ?? 0) || 0;
  // Rule: if remise_montant is set (can be negative), prefer it; otherwise use percentage.
  const perUnit = montant !== 0 ? montant : (pct !== 0 ? (unit * pct) / 100 : 0);
  return q * perUnit;
};

const computeBonDiscount = (bon: any): number => {
  const items = parseItems(bon?.items);
  return items.reduce((sum: number, it: any) => sum + computeItemDiscount(it), 0);
};

const computeEcommerceItemRemise = (it: any): number => {
  const q = Number(it?.quantite ?? it?.quantity ?? 0) || 0;
  if (!q) return 0;
  const unit = Number(it?.prix_unitaire ?? it?.unit_price ?? it?.price ?? 0) || 0;

  // E-commerce item remises are stored as either a percent applied or a fixed amount.
  // Prefer remise_amount when present.
  const amount = Number(it?.remise_amount ?? 0) || 0;
  if (amount !== 0) return amount * q;

  const pct = Number(it?.remise_percent_applied ?? 0) || 0;
  if (pct !== 0) return (unit * pct * q) / 100;

  return 0;
};

const computeEcommerceOrderRemise = (order: any): number => {
  const items = Array.isArray(order?.items)
    ? order.items
    : Array.isArray(order?.order_items)
      ? order.order_items
      : Array.isArray(order?.ecommerce_raw?.items)
        ? order.ecommerce_raw.items
        : [];

  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((sum: number, it: any) => sum + computeEcommerceItemRemise(it), 0);
};

const getBonRemiseTarget = (bon: any) => {
  const isClientRaw = bon?.remise_is_client ?? bon?.remiseIsClient ?? bon?.remise_isClient;
  const idRaw = bon?.remise_id ?? bon?.remiseId;
  const remise_is_client = Number(isClientRaw ?? 1) === 1 ? 1 : 0;
  const remise_id = idRaw == null || idRaw === '' ? null : Number(idRaw);
  return { remise_is_client, remise_id: Number.isFinite(remise_id as any) ? (remise_id as any) : null };
};

const getBonDirectClientId = (bon: any): number | null => {
  const { remise_is_client, remise_id } = getBonRemiseTarget(bon);
  if (remise_is_client !== 1) return null;
  const fallback = bon?.client_id ?? bon?.clientId;
  const id = remise_id ?? (fallback == null || fallback === '' ? null : Number(fallback));
  return id != null && Number.isFinite(Number(id)) ? Number(id) : null;
};

const RemisesPage: React.FC = () => {
  const { user } = useAuth();
  const { data: clients = [], refetch } = useGetClientRemisesQuery();
  const [createClient] = useCreateClientRemiseMutation();
  const [updateClient] = useUpdateClientRemiseMutation();
  const [deleteClient] = useDeleteClientRemiseMutation();

  // Direct clients (Contacts) for the “bons → client” remises view
  const { data: directClients = [] } = useGetAllClientsQuery();

  // New system: remises are stored per item on Sortie/Comptant, and beneficiary is stored on bon header
  const { data: sortiesAll = [] } = useGetBonsByTypeQuery('Sortie');
  const { data: comptantsAll = [] } = useGetBonsByTypeQuery('Comptant');
  const { data: ecommerceOrdersAll = [] } = useGetBonsByTypeQuery('Ecommerce');

  useGetProductsQuery();

  type ClientRemise = { id: number; nom?: string; phone?: string; cin?: string } | null;
  const [selected, setSelected] = useState<ClientRemise>(null);
  const [search, setSearch] = useState('');
  const [directSearch, setDirectSearch] = useState('');
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((c: any) =>
      String(c.nom || '').toLowerCase().includes(term) ||
      String(c.phone || '').toLowerCase().includes(term) ||
      String(c.cin || '').toLowerCase().includes(term)
    );
  }, [clients, search]);

  const directNewByClientId = useMemo(() => {
    const totalById = new Map<number, number>();
    const countById = new Map<number, number>();
    const all = [...(sortiesAll as any[]), ...(comptantsAll as any[])];

    for (const b of all) {
      const clientId = getBonDirectClientId(b);
      if (!clientId) continue;
      const disc = computeBonDiscount(b);
      if (!disc) continue;
      totalById.set(clientId, (totalById.get(clientId) || 0) + disc);
      countById.set(clientId, (countById.get(clientId) || 0) + 1);
    }

    // E-commerce orders: remises come from ecommerce_order_items
    for (const o of (ecommerceOrdersAll as any[])) {
      const clientIdRaw = (o as any)?.client_id ?? (o as any)?.user_id ?? (o as any)?.ecommerce_raw?.user_id;
      const clientId = clientIdRaw == null || clientIdRaw === '' ? null : Number(clientIdRaw);
      if (!clientId || !Number.isFinite(clientId)) continue;

      const disc = computeEcommerceOrderRemise(o);
      if (!disc) continue;

      totalById.set(clientId, (totalById.get(clientId) || 0) + disc);
      countById.set(clientId, (countById.get(clientId) || 0) + 1);
    }

    return { totalById, countById };
  }, [sortiesAll, comptantsAll, ecommerceOrdersAll]);

  const filteredDirectClients = useMemo(() => {
    const term = directSearch.trim().toLowerCase();
    const list = (directClients || []).filter((c: any) => {
      const id = Number(c?.id);
      if (!Number.isFinite(id)) return false;
      const total = directNewByClientId.totalById.get(id) || 0;
      if (!total) return false;

      if (!term) return true;
      return (
        String(c.nom_complet || '').toLowerCase().includes(term) ||
        String(c.societe || '').toLowerCase().includes(term) ||
        String(c.telephone || '').toLowerCase().includes(term)
      );
    });
    // biggest first
    list.sort((a: any, b: any) => {
      const ta = directNewByClientId.totalById.get(Number(a?.id)) || 0;
      const tb = directNewByClientId.totalById.get(Number(b?.id)) || 0;
      return tb - ta;
    });
    return list;
  }, [directClients, directSearch, directNewByClientId]);

  const [form, setForm] = useState({ nom: '', phone: '', cin: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'direct-clients' | 'client-remises'>('client-remises');

  const [selectedDirectClient, setSelectedDirectClient] = useState<any>(null);
  const [isDirectDetailsOpen, setIsDirectDetailsOpen] = useState(false);
  const [editingBon, setEditingBon] = useState<any>(null);
  const [isBonEditOpen, setIsBonEditOpen] = useState(false);

  const openEditBon = (bon: any) => {
    if (!bon) return;
    setEditingBon(bon);
    setIsBonEditOpen(true);
  };


  const oldTotalByClientId = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of clients as any[]) {
      const id = Number(c?.id);
      if (!Number.isFinite(id)) continue;
      const oldTotal = Array.isArray(c.items)
        ? c.items
            .filter((it: any) => it.statut !== 'Annulé')
            .reduce((itemSum: number, it: any) => itemSum + Number(it.qte || 0) * Number(it.prix_remise || 0), 0)
        : Number(c.total_remise ?? 0);
      map.set(id, Number(oldTotal || 0));
    }
    return map;
  }, [clients]);

  const newTotalByClientId = useMemo(() => {
    const map = new Map<number, number>();
    const all = [...(sortiesAll as any[]), ...(comptantsAll as any[])];
    for (const b of all) {
      const { remise_is_client, remise_id } = getBonRemiseTarget(b);
      if (remise_is_client !== 0 || !remise_id) continue; // only client_remises beneficiaries
      const disc = computeBonDiscount(b);
      map.set(remise_id, (map.get(remise_id) || 0) + disc);
    }
    return map;
  }, [sortiesAll, comptantsAll]);

  const totalRemisesOld = useMemo(() => {
    let sum = 0;
    for (const v of oldTotalByClientId.values()) sum += Number(v || 0);
    return sum;
  }, [oldTotalByClientId]);

  const totalRemisesNew = useMemo(() => {
    let sum = 0;
    for (const v of newTotalByClientId.values()) sum += Number(v || 0);
    return sum;
  }, [newTotalByClientId]);

  const totalRemisesNewDirectClients = useMemo(() => {
    let sum = 0;
    for (const v of directNewByClientId.totalById.values()) sum += Number(v || 0);
    return sum;
  }, [directNewByClientId]);

  const totalRemisesGlobal = totalRemisesOld + totalRemisesNew;

  // Calculer les statistiques
  const totalClients = clients.length;
  const clientsActifs = clients.filter((c: any) => 
    Array.isArray(c.items) ? c.items.some((it: any) => it.statut === 'Validé') : false
  ).length;
  const totalRemises = totalRemisesGlobal;

  const directClientBons = useMemo(() => {
    const id = Number(selectedDirectClient?.id);
    if (!Number.isFinite(id)) return [] as any[];
    const hasRemise = (n: any) => Math.abs(Number(n || 0)) > 0.000001;
    const list = [...(sortiesAll as any[]), ...(comptantsAll as any[])]
      .filter((b: any) => getBonDirectClientId(b) === id)
      .map((b: any) => {
        const items = parseItems(b?.items);
        const itemsWithRemise = items.filter((it: any) => {
          const d = computeItemDiscount(it);
          return Number(d || 0) !== 0;
        });
        const totalRemise = computeBonDiscount(b);
        return {
          ...b,
          _new_total_remise: totalRemise,
          _items_with_remise: itemsWithRemise,
        };
      })
      .filter((b: any) => hasRemise(b?._new_total_remise) && Array.isArray(b?._items_with_remise) && b._items_with_remise.length > 0)
      .sort((a: any, b: any) => {
        const ta = new Date(a?.date_creation || a?.date || 0).getTime() || 0;
        const tb = new Date(b?.date_creation || b?.date || 0).getTime() || 0;
        return tb - ta;
      });
    return list;
  }, [selectedDirectClient?.id, sortiesAll, comptantsAll]);

  const directClientEcommerceOrders = useMemo(() => {
    const id = Number(selectedDirectClient?.id);
    if (!Number.isFinite(id)) return [] as any[];
    const hasRemise = (n: any) => Math.abs(Number(n || 0)) > 0.000001;

    const list = (ecommerceOrdersAll as any[])
      .filter((o: any) => {
        const clientIdRaw = o?.client_id ?? o?.user_id ?? o?.ecommerce_raw?.user_id;
        const clientId = clientIdRaw == null || clientIdRaw === '' ? null : Number(clientIdRaw);
        return Number.isFinite(clientId) && Number(clientId) === id;
      })
      .map((o: any) => {
        const items = Array.isArray(o?.items) ? o.items : (Array.isArray(o?.ecommerce_raw?.items) ? o.ecommerce_raw.items : []);
        const itemsWithRemise = (items || []).filter((it: any) => {
          const d = computeEcommerceItemRemise(it);
          return Number(d || 0) !== 0;
        });
        const totalRemise = computeEcommerceOrderRemise(o);
        return {
          ...o,
          _ecom_total_remise: totalRemise,
          _ecom_items_with_remise: itemsWithRemise,
        };
      })
      .filter((o: any) => hasRemise(o?._ecom_total_remise) && Array.isArray(o?._ecom_items_with_remise) && o._ecom_items_with_remise.length > 0)
      .sort((a: any, b: any) => {
        const ta = new Date(a?.date_creation || a?.created_at || 0).getTime() || 0;
        const tb = new Date(b?.date_creation || b?.created_at || 0).getTime() || 0;
        return tb - ta;
      });

    return list;
  }, [selectedDirectClient?.id, ecommerceOrdersAll]);

  const directClientTotalRemise = useMemo(() => {
    const fromBons = (directClientBons || []).reduce((sum: number, b: any) => sum + Number(b?._new_total_remise || 0), 0);
    const fromEcom = (directClientEcommerceOrders || []).reduce((sum: number, o: any) => sum + Number(o?._ecom_total_remise || 0), 0);
    return fromBons + fromEcom;
  }, [directClientBons, directClientEcommerceOrders]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* En-tête */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des Remises</h1>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-2"
          onClick={() => {
            setEditingId(0);
            setForm({ nom: '', phone: '', cin: '' });
            setIsFormModalOpen(true);
          }}
          disabled={activeTab === 'direct-clients'}
          title={activeTab === 'direct-clients' ? 'Disponible dans l\'onglet client_remises' : 'Nouveau client remise'}
        >
          <Plus size={18} />
          Nouveau client remise
        </button>
      </div>

      {/* Cartes statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-xl p-6 shadow-lg border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Clients</p>
              <p className="text-3xl font-bold text-gray-900">{totalClients}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-full">
              <User className="h-8 w-8 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-lg border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Clients Actifs</p>
              <p className="text-3xl font-bold text-gray-900">{clientsActifs}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-full">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-lg border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Remises (Ancien)</p>
              <p className="text-3xl font-bold text-gray-900">{Number(totalRemisesOld).toFixed(2)} DH</p>
            </div>
            <div className="bg-purple-100 p-3 rounded-full">
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-lg border-l-4 border-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Remises (Nouveau)</p>
              <p className="text-3xl font-bold text-gray-900">{Number(totalRemisesNew).toFixed(2)} DH</p>
              <p className="text-xs text-gray-500 mt-1">Direct clients: {Number(totalRemisesNewDirectClients).toFixed(2)} DH</p>
              <p className="text-xs text-gray-500">Global: {Number(totalRemises).toFixed(2)} DH</p>
            </div>
            <div className="bg-amber-100 p-3 rounded-full">
              <TrendingUp className="h-8 w-8 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('direct-clients')}
            className={`py-2 px-1 font-medium border-b-2 transition-colors ${
              activeTab === 'direct-clients'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Clients (bons)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('client-remises')}
            className={`py-2 px-1 font-medium border-b-2 transition-colors ${
              activeTab === 'client-remises'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            client_remises
          </button>
        </nav>
      </div>

      {/* Barre de recherche */}
      <div className="bg-white rounded-xl p-6 mb-6 shadow-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" 
            placeholder={activeTab === 'direct-clients' ? 'Rechercher client (nom, société, téléphone)...' : 'Rechercher par nom, téléphone ou CIN...'}
            value={activeTab === 'direct-clients' ? directSearch : search}
            onChange={(e) => (activeTab === 'direct-clients' ? setDirectSearch(e.target.value) : setSearch(e.target.value))}
          />
        </div>
      </div>

      {/* Tableau des clients avec style amélioré */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            {activeTab === 'direct-clients'
              ? 'Remises directes (Clients des bons)'
              : 'Remises via table client_remises (Ancien + Nouveau)'}
          </h3>
          {activeTab === 'direct-clients' ? (
            <p className="text-xs text-gray-500 mt-1">Nouveau système: remises des items Sortie/Comptant attribuées au client du bon</p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">Ancien système + nouveau système (bons attribués à client_remises)</p>
          )}
        </div>
        <div className="overflow-x-auto">
          {activeTab === 'direct-clients' ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-blue-50 to-cyan-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-blue-700 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-blue-700 uppercase tracking-wider">Société</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-blue-700 uppercase tracking-wider">Téléphone</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-blue-700 uppercase tracking-wider">Bons</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-blue-700 uppercase tracking-wider">Remise (Nouveau)</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-blue-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredDirectClients.map((c: any) => {
                  const id = Number(c?.id);
                  const total = directNewByClientId.totalById.get(id) || 0;
                  const count = directNewByClientId.countById.get(id) || 0;
                  return (
                    <tr key={id} className="hover:bg-gradient-to-r hover:from-blue-25 hover:to-cyan-25 transition-all duration-200">
                      <td className="px-6 py-4 font-medium text-gray-900">{c.nom_complet || c.nom || `#${id}`}</td>
                      <td className="px-6 py-4 text-gray-600">{c.societe || '-'}</td>
                      <td className="px-6 py-4 text-gray-600">{c.telephone || '-'}</td>
                      <td className="px-6 py-4 text-center text-gray-700">{count}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-lg font-bold text-blue-600">{Number(total).toFixed(2)} DH</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                            title="Détails"
                            onClick={() => {
                              setSelectedDirectClient(c);
                              setIsDirectDetailsOpen(true);
                            }}
                          >
                            <Eye size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredDirectClients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">
                      Aucun client avec remise (nouveau système) trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-purple-50 to-blue-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-purple-700 uppercase tracking-wider">Nom</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-purple-700 uppercase tracking-wider">Téléphone</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-purple-700 uppercase tracking-wider">CIN</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-purple-700 uppercase tracking-wider">Créer le</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-purple-700 uppercase tracking-wider">Ancien</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-purple-700 uppercase tracking-wider">Nouveau</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-purple-700 uppercase tracking-wider">Global</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-purple-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gradient-to-r hover:from-purple-25 hover:to-blue-25 transition-all duration-200">
                    <td className="px-6 py-4 font-medium text-gray-900">{c.nom}</td>
                    <td className="px-6 py-4 text-gray-600">{c.phone || '-'}</td>
                    <td className="px-6 py-4 text-gray-600">{c.cin || '-'}</td>
                    <td className="px-6 py-4 text-gray-600">{c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '-'}</td>
                    {(() => {
                      const oldT = oldTotalByClientId.get(Number(c.id)) || 0;
                      const newT = newTotalByClientId.get(Number(c.id)) || 0;
                      const glob = oldT + newT;
                      return (
                        <>
                          <td className="px-6 py-4 text-right">
                            <span className="text-lg font-bold text-purple-600">{Number(oldT).toFixed(2)} DH</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-lg font-bold text-amber-600">{Number(newT).toFixed(2)} DH</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-lg font-bold text-gray-900">{Number(glob).toFixed(2)} DH</span>
                          </td>
                        </>
                      );
                    })()}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                          title="Détails"
                          onClick={() => { setSelected(c); setIsDetailsModalOpen(true); }}
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors duration-200"
                          title="Modifier"
                          onClick={() => {
                            setEditingId(c.id);
                            setForm({ nom: c.nom || '', phone: c.phone || '', cin: c.cin || '' });
                            setIsFormModalOpen(true);
                          }}
                        >
                          <Edit size={18} />
                        </button>
                        {user?.role === 'PDG' && (
                          <button
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                            title="Supprimer"
                            onClick={async () => {
                              if (confirm('Supprimer ce client de remise ?')) {
                                await deleteClient(c.id).unwrap();
                                refetch();
                              }
                            }}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Création/Édition Client Remise */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Fermer le modal"
            onClick={() => { setIsFormModalOpen(false); setEditingId(null); }}
          />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 transform transition-all duration-300 scale-100">
            {/* En-tête du modal avec gradient */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 rounded-t-xl">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">
                  {editingId === 0 ? 'Nouveau client remise' : 'Modifier client remise'}
                </h2>
                <button 
                  className="text-white hover:text-gray-200 transition-colors duration-200" 
                  aria-label="Fermer" 
                  onClick={() => { setIsFormModalOpen(false); setEditingId(null); }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Contenu du modal */}
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="client-remise-nom" className="block text-sm font-semibold text-gray-700 mb-2">
                    Nom du client
                  </label>
                  <input 
                    id="client-remise-nom" 
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" 
                    placeholder="Entrez le nom du client" 
                    value={form.nom} 
                    onChange={(e) => setForm({ ...form, nom: e.target.value })} 
                  />
                </div>
                <div>
                  <label htmlFor="client-remise-phone" className="block text-sm font-semibold text-gray-700 mb-2">
                    Téléphone
                  </label>
                  <input 
                    id="client-remise-phone" 
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" 
                    placeholder="Entrez le numéro de téléphone" 
                    value={form.phone} 
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} 
                  />
                </div>
                <div>
                  <label htmlFor="client-remise-cin" className="block text-sm font-semibold text-gray-700 mb-2">
                    CIN
                  </label>
                  <input 
                    id="client-remise-cin" 
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" 
                    placeholder="Entrez le numéro CIN" 
                    value={form.cin} 
                    onChange={(e) => setForm({ ...form, cin: e.target.value })} 
                  />
                </div>
              </div>
            </div>

            {/* Pied du modal */}
            <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button 
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors duration-200 inline-flex items-center gap-2" 
                onClick={() => { setIsFormModalOpen(false); setEditingId(null); }}
              >
                <XCircle size={16} />
                Annuler
              </button>
              <button
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg transition-all duration-200 inline-flex items-center gap-2 shadow-md"
                onClick={async () => {
                  if (editingId === 0) {
                    await createClient({ nom: form.nom, phone: form.phone, cin: form.cin }).unwrap();
                  } else if (editingId) {
                    await updateClient({ id: editingId, data: { nom: form.nom, phone: form.phone, cin: form.cin } }).unwrap();
                  }
                  setIsFormModalOpen(false);
                  setEditingId(null);
                  setForm({ nom: '', phone: '', cin: '' });
                  refetch();
                }}
              >
                <CheckCircle size={16} />
                {editingId === 0 ? 'Créer' : 'Modifier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Détails (style comme Contacts) */}
      {isDetailsModalOpen && selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Fermer le modal"
            onClick={() => { setIsDetailsModalOpen(false); setSelected(null); }}
          />
          <div className="relative bg-white rounded-lg w-full max-w-8xl max-h-[95vh] overflow-y-auto">
            <div className="bg-blue-600 px-6 py-4 rounded-t-lg">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Détails Remises - {selected?.nom || '-'}</h2>
                <button
                  onClick={() => { setIsDetailsModalOpen(false); setSelected(null); }}
                  className="text-white hover:text-gray-200"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="p-6 w-full">
              <RemiseDetail clientRemise={selected} onItemsChanged={refetch} />
            </div>
          </div>
        </div>
      )}

      {/* Modal Détails: Client direct (bons) */}
      {isDirectDetailsOpen && selectedDirectClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Fermer le modal"
            onClick={() => { setIsDirectDetailsOpen(false); setSelectedDirectClient(null); }}
          />
          <div className="relative bg-white rounded-lg w-full max-w-8xl max-h-[95vh] overflow-y-auto">
            <div className="bg-blue-600 px-6 py-4 rounded-t-lg">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Remises (bons) - {selectedDirectClient?.nom_complet || selectedDirectClient?.nom || '-'}</h2>
                <button
                  onClick={() => { setIsDirectDetailsOpen(false); setSelectedDirectClient(null); }}
                  className="text-white hover:text-gray-200"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 w-full space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-lg mb-2">Informations Client</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="font-semibold text-gray-600">Société:</p>
                    <p>{selectedDirectClient?.societe || '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-600">Téléphone:</p>
                    <p>{selectedDirectClient?.telephone || '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-600">ID:</p>
                    <p>{selectedDirectClient?.id ?? '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-600">Total remise (nouveau):</p>
                    <p className="font-bold text-blue-700">{Number(directClientTotalRemise || 0).toFixed(2)} DH</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900">Bons liés + remises</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-blue-50 to-cyan-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-blue-700 uppercase tracking-wider">Bon</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-blue-700 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-blue-700 uppercase tracking-wider">Statut</th>
                        <th className="px-6 py-4 text-center text-xs font-semibold text-blue-700 uppercase tracking-wider">Lignes remisées</th>
                        <th className="px-6 py-4 text-right text-xs font-semibold text-blue-700 uppercase tracking-wider">Remise (Nouveau)</th>
                        <th className="px-6 py-4 text-center text-xs font-semibold text-blue-700 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {directClientBons.map((b: any) => {
                        const numero = getBonNumeroDisplay({ id: b?.id, type: b?.type, numero: b?.numero });
                        const d = b?.date_creation ? new Date(b.date_creation).toLocaleDateString('fr-FR') : '-';
                        const lines = Array.isArray(b?._items_with_remise) ? b._items_with_remise.length : 0;
                        const r = Number(b?._new_total_remise || 0);
                        return (
                          <tr key={`${b?.type}-${b?.id}`} className="hover:bg-gradient-to-r hover:from-blue-25 hover:to-cyan-25 transition-all duration-200">
                            <td className="px-6 py-4 font-medium text-gray-900">{numero || `${b?.type} #${b?.id}`}</td>
                            <td className="px-6 py-4 text-gray-600">{d}</td>
                            <td className="px-6 py-4 text-gray-600">{b?.statut || '-'}</td>
                            <td className="px-6 py-4 text-center text-gray-700">{lines}</td>
                            <td className="px-6 py-4 text-right"><span className="text-lg font-bold text-blue-600">{r.toFixed(2)} DH</span></td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors duration-200"
                                  title="Modifier bon"
                                  onClick={() => {
                                    setIsDirectDetailsOpen(false);
                                    setSelectedDirectClient(null);
                                    openEditBon(b);
                                  }}
                                >
                                  <Edit size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {directClientBons.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">Aucun bon trouvé pour ce client.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900">Commandes e-commerce + remises</h3>
                  <p className="text-xs text-gray-500 mt-1">Remises calculées depuis ecommerce_order_items (remise_amount / remise_percent_applied)</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-amber-50 to-orange-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-amber-700 uppercase tracking-wider">Commande</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-amber-700 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-amber-700 uppercase tracking-wider">Statut</th>
                        <th className="px-6 py-4 text-center text-xs font-semibold text-amber-700 uppercase tracking-wider">Lignes remisées</th>
                        <th className="px-6 py-4 text-right text-xs font-semibold text-amber-700 uppercase tracking-wider">Remise (ecom)</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {directClientEcommerceOrders.map((o: any) => {
                        const orderId = o?.id;
                        const numero = String(o?.numero || (o?.ecommerce_raw?.order_number ? `ECOM-${o.ecommerce_raw.order_number}` : `ECOM-${orderId}`));
                        const d = (o?.date_creation || o?.created_at) ? new Date(o.date_creation || o.created_at).toLocaleDateString('fr-FR') : '-';
                        const statut = o?.statut || o?.ecommerce_raw?.status || '-';
                        const lines = Array.isArray(o?._ecom_items_with_remise) ? o._ecom_items_with_remise.length : 0;
                        const r = Number(o?._ecom_total_remise || 0);
                        return (
                          <tr key={`ecom-${orderId}`} className="hover:bg-gradient-to-r hover:from-amber-25 hover:to-orange-25 transition-all duration-200">
                            <td className="px-6 py-4 font-medium text-gray-900">{numero}</td>
                            <td className="px-6 py-4 text-gray-600">{d}</td>
                            <td className="px-6 py-4 text-gray-600">{statut}</td>
                            <td className="px-6 py-4 text-center text-gray-700">{lines}</td>
                            <td className="px-6 py-4 text-right"><span className="text-lg font-bold text-amber-700">{r.toFixed(2)} DH</span></td>
                          </tr>
                        );
                      })}
                      {directClientEcommerceOrders.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">Aucune commande e-commerce avec remise trouvée pour ce client.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition Bon (depuis Remises) */}
      <BonFormModal
        key={editingBon ? `${editingBon?.type || 'bon'}-${editingBon?.id}` : 'bon-edit'}
        isOpen={isBonEditOpen}
        onClose={() => { setIsBonEditOpen(false); setEditingBon(null); }}
        currentTab={editingBon?.type || 'Sortie'}
        initialValues={editingBon || undefined}
        onBonAdded={() => {
          setIsBonEditOpen(false);
          setEditingBon(null);
        }}
      />
    </div>
  );
};

const RemiseDetail: React.FC<{ clientRemise: any; onItemsChanged?: () => void }> = ({ clientRemise, onItemsChanged }) => {
  const { user } = useAuth();
  const { data: items = [], refetch: refetchItems } = useGetRemiseItemsQuery(clientRemise.id);
  const [createItem] = useCreateRemiseItemMutation();
  const [updateItem] = useUpdateRemiseItemMutation();
  const [deleteItem] = useDeleteRemiseItemMutation();
  const { data: products = [] } = useGetProductsQuery();
  const { data: sorties = [] } = useGetBonsByTypeQuery('Sortie');
  const { data: comptants = [] } = useGetBonsByTypeQuery('Comptant');
  const { data: commandes = [] } = useGetBonsByTypeQuery('Commande');

  const newSystemBons = useMemo(() => {
    const id = Number(clientRemise?.id);
    if (!Number.isFinite(id)) return [] as any[];
    const list = [...(sorties || []), ...(comptants || [])]
      .filter((b: any) => {
        const { remise_is_client, remise_id } = getBonRemiseTarget(b);
        return remise_is_client === 0 && remise_id === id;
      })
      .map((b: any) => {
        const totalRemise = computeBonDiscount(b);
        return { ...b, _new_total_remise: totalRemise };
      })
      .sort((a: any, b: any) => {
        const ta = new Date(a?.date_creation || a?.date || 0).getTime() || 0;
        const tb = new Date(b?.date_creation || b?.date || 0).getTime() || 0;
        return tb - ta;
      });
    return list;
  }, [clientRemise?.id, sorties, comptants]);

  const newSystemTotal = useMemo(() => {
    return (newSystemBons || []).reduce((sum: number, b: any) => sum + Number(b?._new_total_remise || 0), 0);
  }, [newSystemBons]);

  const productOptions = useMemo(() => (products || []).map((p: any) => ({
    value: String(p.id),
    label: `${p.id}${p.designation ? ' - ' + p.designation : ''}`
  })), [products]);

  const bonOptions = useMemo(() => {
    const fmt = (type: string, b: any) => {
  const numero = getBonNumeroDisplay({ id: b?.id, type, numero: b?.numero });
      const name = b?.nom_client || b?.nom_fournisseur || '-';
      const total = Number(b?.montant_total ?? 0);
      return {
        value: `${type}:${b.id}`,
        label: `${numero} _ ${name} - ${total} DH`,
      };
    };
    return [
      ...(sorties || []).map((b: any) => fmt('Sortie', b)),
      ...(comptants || []).map((b: any) => fmt('Comptant', b)),
      ...(commandes || []).map((b: any) => fmt('Commande', b)),
    ];
  }, [sorties, comptants, commandes]);

  const [newItem, setNewItem] = useState({ product_id: '', qte: 1, prix_remise: 0, bon_select: '' as string, isNegative: false });
  const selectedProduct = useMemo(() => (products || []).find((p: any) => String(p.id) === newItem.product_id), [products, newItem.product_id]);
  const unitPrice = Number(
    (selectedProduct as any)?.prix_vente ??
    (selectedProduct as any)?.prix ??
    (selectedProduct as any)?.prix_unitaire ??
    (selectedProduct as any)?.prix_achat ??
    0
  ) || 0;

  const total = items
    .filter((it: any) => it.statut !== 'Annulé')
    .reduce((sum: number, it: any) => sum + Number(it.qte || 0) * Number(it.prix_remise || 0), 0);
  

  return (
    <div className="mt-2">
      {/* Infos client */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <h3 className="font-bold text-lg mb-2">Informations Client Remise</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div>
            <p className="font-semibold text-gray-600">Nom:</p>
            <p>{clientRemise.nom || '-'}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-600">Téléphone:</p>
            <p>{clientRemise.phone || '-'}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-600">CIN:</p>
            <p>{clientRemise.cin || '-'}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-600">Créer le:</p>
            <p>{clientRemise.created_at ? new Date(clientRemise.created_at).toLocaleDateString('fr-FR') : '-'}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-600">Total Remises:</p>
            <p className="font-medium">Ancien: {Number(total).toFixed(2)} DH</p>
            <p className="font-medium">Nouveau: {Number(newSystemTotal).toFixed(2)} DH</p>
            <p className="font-semibold">Global: {Number(total + newSystemTotal).toFixed(2)} DH</p>
          </div>
        </div>
      </div>

      {/* Nouveau système: remises calculées depuis bons Sortie/Comptant (remise_montant/remise_pourcentage) */}
      <div className="bg-white rounded shadow p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Nouveau système (bons)</h3>
          <div className="text-sm text-gray-700">
            Total nouveau: <span className="font-bold text-amber-700">{Number(newSystemTotal).toFixed(2)} DH</span>
          </div>
        </div>

        {newSystemBons.length === 0 ? (
          <div className="text-sm text-gray-500">Aucun bon lié à ce client remise (nouveau système).</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bon</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Montant</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Remise (calc.)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {newSystemBons.map((b: any) => {
                  const type = String(b?.type || b?.bon_type || '');
                  const numero = getBonNumeroDisplay({ id: b?.id, type, numero: b?.numero });
                  const dateStr = b?.date_creation ? new Date(b.date_creation).toLocaleDateString('fr-FR') : (b?.date ? new Date(b.date).toLocaleDateString('fr-FR') : '-');
                  return (
                    <tr key={`${type}:${b.id}`}>
                      <td className="px-4 py-2">{numero}</td>
                      <td className="px-4 py-2">{dateStr}</td>
                      <td className="px-4 py-2 text-right">{Number(b?.montant_total ?? 0).toFixed(2)} DH</td>
                      <td className="px-4 py-2 text-right font-semibold text-amber-700">{Number(b?._new_total_remise ?? 0).toFixed(2)} DH</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white rounded shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Produits Remisés</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-56">
                <label htmlFor="remise-add-produit" className="text-sm font-medium text-gray-700 mb-1 block">Produit</label>
                <SearchableSelect
                  id="remise-add-produit"
                  options={productOptions}
                  value={newItem.product_id}
                  onChange={(v) => setNewItem({ ...newItem, product_id: v })}
                  placeholder="Choisir un produit"
                />
              </div>
              <div className="w-28">
                <label htmlFor="remise-add-qte" className="text-sm font-medium text-gray-700 mb-1 block">Qté</label>
                <input id="remise-add-qte" type="number" className="border rounded px-2 py-1 w-full" placeholder="Qté" value={newItem.qte} onChange={(e) => setNewItem({ ...newItem, qte: Number(e.target.value) })} />
              </div>
              <div className="w-32">
                <label htmlFor="remise-add-prix" className="text-sm font-medium text-gray-700 mb-1 block">Prix remise</label>
                <input id="remise-add-prix" type="number" className="border rounded px-2 py-1 w-full" placeholder="Prix remise" value={newItem.prix_remise} onChange={(e) => setNewItem({ ...newItem, prix_remise: Number(e.target.value) })} />
              </div>
              <div className="w-40">
                <label htmlFor="remise-add-negative" className="text-sm font-medium text-gray-700 mb-1 block">Remise négative</label>
                <div className="flex items-center h-[38px] gap-2">
                  <input
                    id="remise-add-negative"
                    type="checkbox"
                    checked={newItem.isNegative}
                    onChange={(e) => setNewItem({ ...newItem, isNegative: e.target.checked })}
                  />
                  <span className="text-sm">{newItem.isNegative ? 'Oui' : 'Non'}</span>
                </div>
              </div>
              {newItem.isNegative ? (
                <div className="w-32">
                  <span className="text-sm font-medium text-gray-700 mb-1 block">Prix unitaire</span>
                  <div className="h-[38px] flex items-center">{unitPrice} DH</div>
                </div>
              ) : (
                <div className="w-56">
                  <label htmlFor="remise-add-bon" className="text-sm font-medium text-gray-700 mb-1 block">Bon (optionnel)</label>
                  <SearchableSelect
                    id="remise-add-bon"
                    options={bonOptions}
                    value={newItem.bon_select}
                    onChange={(v) => setNewItem({ ...newItem, bon_select: v })}
                    placeholder="Lier à un bon (optionnel)"
                  />
                </div>
              )}
              <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={async () => {
                let bon_id: number | undefined = undefined;
                let bon_type: string | undefined = undefined;
                if (!newItem.isNegative && newItem.bon_select) {
                  const [t, id] = newItem.bon_select.split(':');
                  bon_type = t as any;
                  bon_id = Number(id);
                }
                const prix = Math.abs(Number(newItem.prix_remise || 0));
                const prixToSave = newItem.isNegative ? -prix : prix;
                await createItem({ clientRemiseId: clientRemise.id, data: { product_id: newItem.product_id, qte: newItem.qte, prix_remise: prixToSave, statut: 'En attente', bon_id, bon_type } }).unwrap();
                setNewItem({ product_id: '', qte: 1, prix_remise: 0, bon_select: '', isNegative: false });
                await refetchItems();
                onItemsChanged?.();
              }}>Ajouter</button>
            </div>
          </div>

          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[18%]" />
              <col className="w-[8%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produit</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bon</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qté</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Prix Remise</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Créer le</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((it: any) => (
                <tr key={it.id}>
                  <td className="px-4 py-2 max-w-0 truncate">{it.reference ? `${it.reference} - ${it.designation}` : it.product_id}</td>
                  <td className="px-4 py-2 max-w-0 truncate">{it.bon_id ? `${it.bon_type || ''} #${it.bon_id}` : '-'}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{it.qte}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{Number(it.prix_remise || 0)} DH</td>
                  <td className="px-4 py-2 whitespace-nowrap">{it.created_at ? new Date(it.created_at).toLocaleDateString('fr-FR') : '-'}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        className={`p-1 rounded ${it.statut === 'En attente' ? 'bg-yellow-50 text-yellow-600' : 'text-gray-500 hover:text-yellow-600'}`}
                        title="Mettre en attente"
                        onClick={async () => { await updateItem({ id: it.id, data: { statut: 'En attente' } }).unwrap(); await refetchItems(); onItemsChanged?.(); }}
                      >
                        <Clock size={18} />
                      </button>
                      {user?.role === 'PDG' && (
                        <button
                          className={`p-1 rounded ${it.statut === 'Validé' ? 'bg-green-50 text-green-600' : 'text-gray-500 hover:text-green-600'}`}
                          title="Valider"
                          onClick={async () => { await updateItem({ id: it.id, data: { statut: 'Validé' } }).unwrap(); await refetchItems(); onItemsChanged?.(); }}
                        >
                          <CheckCircle size={18} />
                        </button>
                      )}
                      <button
                        className={`p-1 rounded ${it.statut === 'Annulé' ? 'bg-red-50 text-red-600' : 'text-gray-500 hover:text-red-600'}`}
                        title="Annuler"
                        onClick={async () => { await updateItem({ id: it.id, data: { statut: 'Annulé' } }).unwrap(); await refetchItems(); onItemsChanged?.(); }}
                      >
                        <XCircle size={18} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {user?.role === 'PDG' && (
                      <button className="text-gray-500 hover:text-red-600" title="Supprimer" onClick={async () => { await deleteItem(it.id).unwrap(); await refetchItems(); onItemsChanged?.(); }}>
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

  {/* Section achats supprimée: flux négatif géré via prix_remise négatif */}
      </div>
    </div>
  );
};

export default RemisesPage;
