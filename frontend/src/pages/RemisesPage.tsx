import React, { useMemo, useState } from 'react';
import { Search, Eye, Edit, Trash2, CheckCircle, XCircle, Clock, Plus, X } from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';
import { getBonNumeroDisplay } from '../utils/numero';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { useGetClientRemisesQuery, useCreateClientRemiseMutation, useUpdateClientRemiseMutation, useDeleteClientRemiseMutation, useGetRemiseItemsQuery, useCreateRemiseItemMutation, useUpdateRemiseItemMutation, useDeleteRemiseItemMutation } from '../store/api/remisesApi';
import { useGetProductsQuery } from '../store/api/productsApi';

const RemisesPage: React.FC = () => {
  const { data: clients = [], refetch } = useGetClientRemisesQuery();
  const [createClient] = useCreateClientRemiseMutation();
  const [updateClient] = useUpdateClientRemiseMutation();
  const [deleteClient] = useDeleteClientRemiseMutation();

  useGetProductsQuery();

  type ClientRemise = { id: number; nom?: string; phone?: string; cin?: string } | null;
  const [selected, setSelected] = useState<ClientRemise>(null);
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((c: any) =>
      String(c.nom || '').toLowerCase().includes(term) ||
      String(c.phone || '').toLowerCase().includes(term) ||
      String(c.cin || '').toLowerCase().includes(term)
    );
  }, [clients, search]);

  const [form, setForm] = useState({ nom: '', phone: '', cin: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);


  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Gestion des Remises</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input className="pl-10 pr-3 py-2 border rounded-md" placeholder="Recherche (Nom, Téléphone, CIN)" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2"
            onClick={() => {
              setEditingId(0);
              setForm({ nom: '', phone: '', cin: '' });
              setIsFormModalOpen(true);
            }}
          >
            <Plus size={16} /> Nouveau
          </button>
        </div>
      </div>

      {/* Inline form removed; handled by modal below */}

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Téléphone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CIN</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Remises</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.map((c: any) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">{c.nom}</td>
                <td className="px-6 py-4">{c.phone || '-'}</td>
                <td className="px-6 py-4">{c.cin || '-'}</td>
                <td className="px-6 py-4 text-right">
                  {Array.isArray(c.items)
                    ? c.items.filter((it: any) => it.statut !== 'Annulé').reduce((sum: number, it: any) => sum + Number(it.qte || 0) * Number(it.prix_remise || 0), 0).toFixed(2)
                    : Number(c.total_remise ?? 0).toFixed(2)
                  } DH
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <button
                      className="text-gray-600 hover:text-blue-600"
                      title="Détails"
                      onClick={() => { setSelected(c); setIsDetailsModalOpen(true); }}
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      className="text-gray-600 hover:text-amber-600"
                      title="Modifier"
                      onClick={() => {
                        setEditingId(c.id);
                        setForm({ nom: c.nom || '', phone: c.phone || '', cin: c.cin || '' });
                        setIsFormModalOpen(true);
                      }}
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      className="text-gray-600 hover:text-red-600"
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Création/Édition Client Remise */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Fermer le modal"
            onClick={() => { setIsFormModalOpen(false); setEditingId(null); }}
          />
          <div className="relative bg-white rounded-lg shadow-xl w-[95vw] max-w-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{editingId === 0 ? 'Nouveau client remise' : 'Modifier client remise'}</h2>
              <button className="text-gray-500 hover:text-gray-700" aria-label="Fermer" onClick={() => { setIsFormModalOpen(false); setEditingId(null); }}>
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              <div className="flex flex-col">
                <label htmlFor="client-remise-nom" className="text-sm font-medium text-gray-700 mb-1">Nom</label>
                <input id="client-remise-nom" className="border rounded px-3 py-2 w-full" placeholder="Nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
              </div>
              <div className="flex flex-col">
                <label htmlFor="client-remise-phone" className="text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                <input id="client-remise-phone" className="border rounded px-3 py-2 w-full" placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="flex flex-col">
                <label htmlFor="client-remise-cin" className="text-sm font-medium text-gray-700 mb-1">CIN</label>
                <input id="client-remise-cin" className="border rounded px-3 py-2 w-full" placeholder="CIN" value={form.cin} onChange={(e) => setForm({ ...form, cin: e.target.value })} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded inline-flex items-center gap-2" onClick={() => { setIsFormModalOpen(false); setEditingId(null); }}>
                <XCircle size={18} />
                <span className="hidden sm:inline">Annuler</span>
              </button>
              <button
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded inline-flex items-center gap-2"
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
                <CheckCircle size={18} />
                <span className="hidden sm:inline">Enregistrer</span>
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
          <div className="relative bg-white rounded-lg w-full max-w-6xl max-h-[95vh] overflow-y-auto">
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
    </div>
  );
};

const RemiseDetail: React.FC<{ clientRemise: any; onItemsChanged?: () => void }> = ({ clientRemise, onItemsChanged }) => {
  const { data: items = [], refetch: refetchItems } = useGetRemiseItemsQuery(clientRemise.id);
  const [createItem] = useCreateRemiseItemMutation();
  const [updateItem] = useUpdateRemiseItemMutation();
  const [deleteItem] = useDeleteRemiseItemMutation();
  const { data: products = [] } = useGetProductsQuery();
  const { data: sorties = [] } = useGetBonsByTypeQuery('Sortie');
  const { data: comptants = [] } = useGetBonsByTypeQuery('Comptant');
  const { data: commandes = [] } = useGetBonsByTypeQuery('Commande');

  const productOptions = useMemo(() => (products || []).map((p: any) => ({
    value: String(p.id),
    label: `${p.id}${p.designation ? ' - ' + p.designation : ''}`
  })), [products]);

  const bonOptions = useMemo(() => {
    const fmt = (type: string, b: any) => {
  const numero = getBonNumeroDisplay({ id: b?.id, type, numero: b?.numero });
      const name = b?.nom_client || b?.nom_fournisseur || '-';
      const total = Number(b?.montant_total ?? 0).toFixed(2);
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
            <p className="font-semibold text-gray-600">Total Remises:</p>
            <p className="font-medium">{total.toFixed(2)} DH</p>
          </div>
        </div>
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
                  <div className="h-[38px] flex items-center">{unitPrice.toFixed(2)} DH</div>
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
              <col className="w-[36%]" />
              <col className="w-[24%]" />
              <col className="w-[8%]" />
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
                  <td className="px-4 py-2 text-right whitespace-nowrap">{Number(it.prix_remise || 0).toFixed(2)} DH</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        className={`p-1 rounded ${it.statut === 'En attente' ? 'bg-yellow-50 text-yellow-600' : 'text-gray-500 hover:text-yellow-600'}`}
                        title="Mettre en attente"
                        onClick={async () => { await updateItem({ id: it.id, data: { statut: 'En attente' } }).unwrap(); await refetchItems(); onItemsChanged?.(); }}
                      >
                        <Clock size={18} />
                      </button>
                      <button
                        className={`p-1 rounded ${it.statut === 'Validé' ? 'bg-green-50 text-green-600' : 'text-gray-500 hover:text-green-600'}`}
                        title="Valider"
                        onClick={async () => { await updateItem({ id: it.id, data: { statut: 'Validé' } }).unwrap(); await refetchItems(); onItemsChanged?.(); }}
                      >
                        <CheckCircle size={18} />
                      </button>
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
                    <button className="text-gray-500 hover:text-red-600" title="Supprimer" onClick={async () => { await deleteItem(it.id).unwrap(); await refetchItems(); onItemsChanged?.(); }}>
                      <Trash2 size={18} />
                    </button>
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
