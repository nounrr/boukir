import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Eye, Package, Plus, RotateCcw, Search, X } from 'lucide-react';
import {
  useCancelStockTransferMutation,
  useCreateStockTransferMutation,
  useGetDepot2StockQuery,
  useGetDepotTransferProductsQuery,
  useGetStockTransfersQuery,
} from '../store/api/stockDepotApi';
import type { DepotStockRow, TransferDirection, TransferProduct } from '../store/api/stockDepotApi';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';

const formatNum = (value: any) => String(parseFloat(Number(value || 0).toFixed(3)));
const money = (value: any) => `${Number(value || 0).toFixed(2)} DH`;

const imageSrc = (url?: string | null) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return url.startsWith('/') ? url : `/uploads/products/${url}`;
};

const productTypeLabel = (row: DepotStockRow) => {
  if (row.est_service) return 'Service';
  if (row.non_stockable) return 'Non stockable';
  return 'Produit';
};

const productLabel = (row: { designation?: string; variant_name?: string | null; bon_commande_id?: number | null; product_snapshot_id?: number }) => {
  const variant = row.variant_name ? ` - ${row.variant_name}` : '';
  const bon = row.bon_commande_id ? ` | BC${row.bon_commande_id}` : ` | Snap ${row.product_snapshot_id || ''}`;
  return `${row.designation || ''}${variant}${bon}`;
};

const DepotDetailsModal: React.FC<{ row: DepotStockRow | null; onClose: () => void }> = ({ row, onClose }) => {
  if (!row) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{row.designation}</h2>
            <p className="text-sm text-gray-500">{row.variant_name || 'Sans variante'} | Snapshot #{row.snapshot_id}</p>
          </div>
          <button className="p-2 rounded-md hover:bg-gray-100" onClick={onClose} title="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Quantites</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Depot 2</span><strong>{formatNum(row.depot_quantite)}</strong></div>
              <div className="flex justify-between"><span>Stock normal</span><strong>{formatNum(row.stock_normal_quantite)}</strong></div>
              <div className="flex justify-between"><span>Unite base</span><strong>{row.base_unit || '-'}</strong></div>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Prix snapshot</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Prix achat</span><strong>{money(row.prix_achat)}</strong></div>
              <div className="flex justify-between"><span>Cout revient</span><strong>{money(row.cout_revient)}</strong></div>
              <div className="flex justify-between"><span>Prix gros</span><strong>{money(row.prix_gros)}</strong></div>
              <div className="flex justify-between"><span>Prix vente</span><strong>{money(row.prix_vente)}</strong></div>
              <div className="flex justify-between"><span>Prix vente 2</span><strong>{money(row.prix_vente_2)}</strong></div>
            </div>
          </div>

          <div className="md:col-span-2 border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Unites</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(row.units || []).length ? row.units?.map((unit) => (
                <div key={unit.id} className="flex justify-between text-sm bg-gray-50 rounded-md px-3 py-2">
                  <span>{unit.unit_name}</span>
                  <strong>x {formatNum(unit.conversion_factor)}</strong>
                </div>
              )) : <span className="text-sm text-gray-500">Aucune unite speciale</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TransferModal: React.FC<{ direction: TransferDirection; onClose: () => void }> = ({ direction, onClose }) => {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<TransferProduct | null>(null);
  const [quantite, setQuantite] = useState('');
  const [unitId, setUnitId] = useState<string>('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<Array<{ product: TransferProduct; quantite: number; unit_id: number | null }>>([]);
  const { data: products = [], isFetching } = useGetDepotTransferProductsQuery({ direction, q, limit: 80 });
  const [createTransfer, { isLoading }] = useCreateStockTransferMutation();

  const title = direction === 'VERS_DEPOT' ? 'Bon vers depot' : 'Bon vers stock';
  const availableLabel = direction === 'VERS_DEPOT' ? 'Stock normal' : 'Depot 2';

  const selectedUnitFactor = useMemo(() => {
    if (!selected || !unitId) return 1;
    const unit = selected.units?.find((u) => String(u.id) === unitId);
    return Number(unit?.conversion_factor || 1) || 1;
  }, [selected, unitId]);

  const addLine = () => {
    if (!selected) return showError('Choisir un produit');
    const qty = Number(String(quantite).replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) return showError('Quantite invalide');
    const qtyBase = qty * selectedUnitFactor;
    if (direction === 'VERS_STOCK' && qtyBase > Number(selected.quantite_disponible || 0)) return showError('Quantite insuffisante');
    setItems((prev) => [...prev, { product: selected, quantite: qty, unit_id: unitId ? Number(unitId) : null }]);
    setSelected(null);
    setQuantite('');
    setUnitId('');
  };

  const submit = async () => {
    if (!items.length) return showError('Ajouter au moins une ligne');
    try {
      const res = await createTransfer({
        direction,
        note,
        items: items.map((item) => ({
          product_snapshot_id: item.product.product_snapshot_id,
          source_kind: item.product.source_kind,
          source_key: item.product.source_key,
          unit_id: item.unit_id,
          quantite: item.quantite,
        })),
      }).unwrap();
      showSuccess(`${res.numero} cree`);
      onClose();
    } catch (err: any) {
      showError(err?.data?.message || 'Erreur creation bon');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-lg shadow-xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button className="p-2 rounded-md hover:bg-gray-100" onClick={onClose} title="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5 overflow-y-auto">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input className="w-full border rounded-md pl-9 pr-3 py-2 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher produit" />
            </div>

            <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Produit</th>
                    <th className="text-right px-3 py-2">{availableLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr
                      key={`${p.source_kind}-${p.source_key}-${p.depot_stock_snapshot_id || 0}`}
                      className={`border-t cursor-pointer hover:bg-blue-50 ${selected?.source_kind === p.source_kind && selected?.source_key === p.source_key ? 'bg-blue-50' : ''}`}
                      onClick={() => setSelected(p)}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{productLabel(p)}</div>
                        <div className="text-xs text-gray-500">Achat {money(p.prix_achat)} | Vente {money(p.prix_vente)}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatNum(p.quantite_disponible)}</td>
                    </tr>
                  ))}
                  {!products.length && (
                    <tr><td colSpan={2} className="px-3 py-8 text-center text-gray-500">{isFetching ? 'Chargement...' : 'Aucun produit'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input className="border rounded-md px-3 py-2 text-sm" value={quantite} onChange={(e) => setQuantite(e.target.value)} placeholder="Quantite" />
              <select className="border rounded-md px-3 py-2 text-sm" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Unite base</option>
                {selected?.units?.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.unit_name}</option>
                ))}
              </select>
              <button className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white rounded-md px-3 py-2 text-sm hover:bg-blue-700" onClick={addLine}>
                <Plus className="w-4 h-4" /> Ajouter
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <textarea className="w-full border rounded-md px-3 py-2 text-sm" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2">Produit</th>
                    <th className="text-right px-3 py-2">Qte</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((line, index) => (
                    <tr key={`${line.product.source_kind}-${line.product.source_key}-${index}`} className="border-t">
                      <td className="px-3 py-2">{productLabel(line.product)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatNum(line.quantite)}</td>
                      <td className="px-3 py-2">
                        <button className="p-1 rounded hover:bg-gray-100" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))} title="Retirer">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!items.length && <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-500">Aucune ligne</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t bg-gray-50">
          <button className="px-4 py-2 rounded-md border text-sm" onClick={onClose}>Annuler</button>
          <button className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-60" disabled={isLoading} onClick={submit}>Valider</button>
        </div>
      </div>
    </div>
  );
};

const StockDepot2Page: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'products' | 'history'>('products');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<DepotStockRow | null>(null);
  const [transferDirection, setTransferDirection] = useState<TransferDirection | null>(null);
  const { data, isFetching } = useGetDepot2StockQuery({ page, limit: 30, q: search || undefined });
  const { data: transfers = [] } = useGetStockTransfersQuery();
  const [cancelTransfer] = useCancelStockTransferMutation();

  const rows = data?.data || [];
  const totalValue = rows.reduce((sum, row) => sum + Number(row.depot_quantite || 0) * Number(row.cout_revient || row.prix_achat || 0), 0);

  const onCancelTransfer = async (id: number) => {
    const result = await showConfirmation('Annuler ce bon de transfert ?');
    if (!result.isConfirmed) return;
    try {
      await cancelTransfer(id).unwrap();
      showSuccess('Bon annule');
    } catch (err: any) {
      showError(err?.data?.message || 'Erreur annulation');
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6" /> STOCK DEPOT 2
          </h1>
          <p className="text-sm text-gray-500">Reserve separee</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 bg-blue-600 text-white rounded-md px-4 py-2 text-sm hover:bg-blue-700" onClick={() => setTransferDirection('VERS_DEPOT')}>
            <ArrowLeftRight className="w-4 h-4" /> Bon vers depot
          </button>
          <button className="inline-flex items-center gap-2 bg-emerald-600 text-white rounded-md px-4 py-2 text-sm hover:bg-emerald-700" onClick={() => setTransferDirection('VERS_STOCK')}>
            <RotateCcw className="w-4 h-4" /> Bon vers stock
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Articles</div>
          <div className="text-2xl font-semibold">{data?.meta.total || 0}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Quantite affichee</div>
          <div className="text-2xl font-semibold">{formatNum(rows.reduce((sum, row) => sum + Number(row.depot_quantite || 0), 0))}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Valeur cout</div>
          <div className="text-2xl font-semibold">{money(totalValue)}</div>
        </div>
      </div>

      <div className="bg-white border rounded-lg">
        <div className="flex border-b">
          <button
            className={`px-5 py-3 text-sm font-medium border-b-2 ${activeTab === 'products' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
            onClick={() => setActiveTab('products')}
          >
            Produits
          </button>
          <button
            className={`px-5 py-3 text-sm font-medium border-b-2 ${activeTab === 'history' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
            onClick={() => setActiveTab('history')}
          >
            Historique transferts
          </button>
        </div>
      </div>

      {activeTab === 'products' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="p-4 border-b flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                className="w-full border rounded-md pl-9 pr-3 py-2 text-sm"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    setSearch(searchInput);
                  }
                }}
                placeholder="Rechercher dans depot"
              />
            </div>
            <button className="px-4 py-2 rounded-md border text-sm" onClick={() => { setPage(1); setSearch(searchInput); }}>Rechercher</button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3">Image</th>
                  <th className="text-left px-4 py-3">ID</th>
                  <th className="text-left px-4 py-3">Designation</th>
                  <th className="text-left px-4 py-3">Categorie</th>
                  <th className="text-left px-4 py-3">Variante</th>
                  <th className="text-right px-4 py-3">Quantite depot</th>
                  <th className="text-right px-4 py-3">Stock normal</th>
                  <th className="text-left px-4 py-3">Unite</th>
                  <th className="text-right px-4 py-3">Prix achat</th>
                  <th className="text-right px-4 py-3">Cout revient</th>
                  <th className="text-right px-4 py-3">Prix gros</th>
                  <th className="text-right px-4 py-3">Prix vente</th>
                  <th className="text-right px-4 py-3">Prix vente 2</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.depot_stock_snapshot_id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {imageSrc(row.image_url) ? (
                        <img src={imageSrc(row.image_url) || ''} alt={row.designation} className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="h-10 w-10 bg-gray-200 rounded flex items-center justify-center text-gray-400">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{row.product_id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.designation}</div>
                      <div className="text-xs text-gray-500">Snapshot #{row.snapshot_id}{row.bon_commande_id ? ` | BC${row.bon_commande_id}` : ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {row.categorie_nom || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.variant_name || '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatNum(row.depot_quantite)}</td>
                    <td className="px-4 py-3 text-right">{formatNum(row.stock_normal_quantite)}</td>
                    <td className="px-4 py-3">{row.base_unit || '-'}</td>
                    <td className="px-4 py-3 text-right">{money(row.prix_achat)}</td>
                    <td className="px-4 py-3 text-right">{money(row.cout_revient)}</td>
                    <td className="px-4 py-3 text-right">{money(row.prix_gros)}</td>
                    <td className="px-4 py-3 text-right">{money(row.prix_vente)}</td>
                    <td className="px-4 py-3 text-right">{money(row.prix_vente_2)}</td>
                    <td className="px-4 py-3">{productTypeLabel(row)}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="p-2 rounded-md hover:bg-gray-100" title="Voir details" onClick={() => setDetails(row)}>
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={15} className="px-4 py-10 text-center text-gray-500">{isFetching ? 'Chargement...' : 'Aucun stock dans depot 2'}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t flex items-center justify-between text-sm">
            <span>Page {data?.meta.page || page} / {data?.meta.totalPages || 1}</span>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 rounded-md border disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Precedent</button>
              <button className="px-3 py-1.5 rounded-md border disabled:opacity-50" disabled={page >= (data?.meta.totalPages || 1)} onClick={() => setPage((p) => p + 1)}>Suivant</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-96">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3">Bon</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Statut</th>
                  <th className="text-left px-4 py-3">Lignes</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((bon) => (
                  <tr key={bon.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{bon.numero}</td>
                    <td className="px-4 py-3">{bon.direction === 'VERS_DEPOT' ? 'Vers depot' : 'Vers stock'}</td>
                    <td className="px-4 py-3">{new Date(bon.date_creation).toLocaleString()}</td>
                    <td className="px-4 py-3">{bon.statut}</td>
                    <td className="px-4 py-3">{bon.items?.length || 0}</td>
                    <td className="px-4 py-3 text-right">
                      {bon.statut !== 'Annule' && bon.statut !== 'Annulé' && (
                        <button className="p-2 rounded-md hover:bg-gray-100" title="Annuler" onClick={() => onCancelTransfer(bon.id)}>
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!transfers.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Aucun bon</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DepotDetailsModal row={details} onClose={() => setDetails(null)} />
      {transferDirection && <TransferModal direction={transferDirection} onClose={() => setTransferDirection(null)} />}
    </div>
  );
};

export default StockDepot2Page;
