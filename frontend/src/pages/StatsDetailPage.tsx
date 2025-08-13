import React, { useEffect, useMemo, useState } from "react";
import { Activity, Filter } from "lucide-react";
import { useGetProductsQuery } from "../store/api/productsApi";
import { useGetClientsQuery } from "../store/api/contactsApi";
import { useGetComptantQuery } from "../store/api/comptantApi";
import { useGetSortiesQuery } from "../store/api/sortiesApi";

const toNumber = (value: any): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const toDisplayDate = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
};

const convertDisplayToISO = (displayDate: string) => {
  if (!displayDate) return "";
  const parts = displayDate.split("-");
  if (parts.length !== 3) return "";
  const [day, month, year] = parts;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const StatsDetailPage: React.FC = () => {
  const { data: products = [] } = useGetProductsQuery();
  const { data: clients = [] } = useGetClientsQuery();
  const { data: bonsComptant = [] } = useGetComptantQuery(undefined);
  const { data: bonsSortie = [] } = useGetSortiesQuery(undefined);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailMatrixMode, setDetailMatrixMode] = useState<"produits" | "clients">("produits");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  useEffect(() => {
    setSelectedProductId("");
    setSelectedClientId("");
  }, [detailMatrixMode]);

  const inDateRange = (displayDate: string) => {
    if (!dateFrom && !dateTo) return true;
    const iso = convertDisplayToISO(displayDate);
    if (!iso) return true;
    const itemDate = new Date(iso).getTime();
    if (Number.isNaN(itemDate)) return true;
    const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
    const to = dateTo ? new Date(dateTo).getTime() : Infinity;
    return itemDate >= from && itemDate <= to;
  };

  const clientBonsForItems = useMemo(() => {
    const all = [...bonsComptant, ...bonsSortie];
    return all.filter((b: any) => inDateRange(toDisplayDate(b.date || b.created_at)));
  }, [bonsComptant, bonsSortie, dateFrom, dateTo]);

  const { productClientStats, clientProductStats } = useMemo(() => {
    const pcs: Record<string, any> = {};
    const cps: Record<string, any> = {};

    for (const bon of clientBonsForItems) {
      const clientId = String(bon.client_id ?? bon.contact_id ?? "");
      if (!clientId) continue;

      let items: any[] = [];
      if (Array.isArray(bon.items)) items = bon.items;
      else if (typeof bon.items === "string") {
        try {
          const parsed = JSON.parse(bon.items);
          if (Array.isArray(parsed)) items = parsed;
        } catch {}
      }

      for (const it of items) {
        const productId = String(it.product_id ?? it.id ?? "");
        if (!productId) continue;
        const qty = toNumber(it.quantite ?? it.qty ?? 0);
        const unit = toNumber(it.prix ?? it.prix_vente ?? it.price ?? 0);
        const total = toNumber(it.total ?? it.montant ?? unit * qty);

        if (!pcs[productId]) pcs[productId] = { totalVentes: 0, totalQuantite: 0, totalMontant: 0, clients: {} };
        const pcEntry = pcs[productId];
        if (!pcEntry.clients[clientId]) pcEntry.clients[clientId] = { ventes: 0, quantite: 0, montant: 0 };
        pcEntry.clients[clientId].ventes += 1;
        pcEntry.clients[clientId].quantite += qty;
        pcEntry.clients[clientId].montant += total;
        pcEntry.totalVentes += 1;
        pcEntry.totalQuantite += qty;
        pcEntry.totalMontant += total;

        if (!cps[clientId]) cps[clientId] = { totalVentes: 0, totalQuantite: 0, totalMontant: 0, products: {} };
        const cpEntry = cps[clientId];
        if (!cpEntry.products[productId]) cpEntry.products[productId] = { ventes: 0, quantite: 0, montant: 0 };
        cpEntry.products[productId].ventes += 1;
        cpEntry.products[productId].quantite += qty;
        cpEntry.products[productId].montant += total;
        cpEntry.totalVentes += 1;
        cpEntry.totalQuantite += qty;
        cpEntry.totalMontant += total;
      }
    }

    return { productClientStats: pcs, clientProductStats: cps };
  }, [clientBonsForItems]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistiques détaillées</h1>
          <p className="text-gray-600 mt-1">Ventes par produit et par client</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Filtres</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="dateFrom" className="block text-sm font-medium text-gray-700 mb-1">
              Date de début
            </label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="dateTo" className="block text-sm font-medium text-gray-700 mb-1">
              Date de fin
            </label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="detailMode" className="block text-sm font-medium text-gray-700 mb-1">
              Vue
            </label>
            <select
              id="detailMode"
              value={detailMatrixMode}
              onChange={(e) => setDetailMatrixMode(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="produits">Par produit</option>
              <option value="clients">Par client</option>
            </select>
          </div>

          {detailMatrixMode === "produits" ? (
            <div>
              <label htmlFor="detailProduct" className="block text-sm font-medium text-gray-700 mb-1">
                Produit
              </label>
              <select
                id="detailProduct"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Tous</option>
                {Object.keys(productClientStats).map((pid) => {
                  const p = products.find((x: any) => String(x.id) === String(pid));
                  const label = p?.designation ?? `Produit ${pid}`;
                  return (
                    <option key={pid} value={pid}>{label}</option>
                  );
                })}
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor="detailClient" className="block text-sm font-medium text-gray-700 mb-1">
                Client
              </label>
              <select
                id="detailClient"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Tous</option>
                {Object.keys(clientProductStats).map((cid) => {
                  const c = clients.find((x: any) => String(x.id) === String(cid));
                  const label = c?.nom_complet ?? `Client ${cid}`;
                  return (
                    <option key={cid} value={cid}>{label}</option>
                  );
                })}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Matrices */}
      <div className="bg-white p-6 rounded-lg shadow">
        {detailMatrixMode === "produits" ? (
          <div className="space-y-6">
            {(() => {
              const entries = Object.entries(productClientStats).map(([pid, data]: any) => ({ productId: pid, ...data }));
              const filtered = selectedProductId
                ? entries.filter((e: any) => String(e.productId) === String(selectedProductId))
                : entries;
              const top = [...filtered].sort((a: any, b: any) => b.totalMontant - a.totalMontant).slice(0, selectedProductId ? 1 : 10);

              if (top.length === 0) return <div className="text-sm text-gray-500">Aucune donnée à afficher.</div>;

              return top.map((row: any) => {
                const product = products.find((p: any) => String(p.id) === String(row.productId));
                const title = product?.designation ?? `Produit ${row.productId}`;
                const clientRows = Object.entries(row.clients)
                  .map(([cid, stats]: any) => ({ clientId: cid, ...(stats as any) }))
                  .sort((a: any, b: any) => b.montant - a.montant)
                  .slice(0, 10);

                return (
                  <div key={row.productId} className="border rounded-lg">
                    <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="text-indigo-600" size={18} />
                        <div>
                          <h3 className="font-semibold text-gray-900">{title}</h3>
                          <p className="text-xs text-gray-500">ID: {row.productId}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Quantité totale</p>
                        <p className="text-lg font-semibold text-gray-900">{toNumber(row.totalQuantite)}</p>
                        <p className="text-xs text-gray-500">{toNumber(row.totalMontant).toFixed(2)} DH</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-white">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ventes</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Quantité</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {clientRows.map((cr: any) => {
                            const c = clients.find((x: any) => String(x.id) === String(cr.clientId));
                            const cname = c?.nom_complet ?? `Client ${cr.clientId}`;
                            return (
                              <tr key={cr.clientId} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm text-gray-900">{cname}</td>
                                <td className="px-4 py-2 text-sm text-right text-gray-900">{cr.ventes}</td>
                                <td className="px-4 py-2 text-sm text-right text-gray-900">{toNumber(cr.quantite)}</td>
                                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900">{toNumber(cr.montant).toFixed(2)} DH</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="space-y-6">
            {(() => {
              const entries = Object.entries(clientProductStats).map(([cid, data]: any) => ({ clientId: cid, ...data }));
              const filtered = selectedClientId
                ? entries.filter((e: any) => String(e.clientId) === String(selectedClientId))
                : entries;
              const top = [...filtered].sort((a: any, b: any) => b.totalMontant - a.totalMontant).slice(0, selectedClientId ? 1 : 10);

              if (top.length === 0) return <div className="text-sm text-gray-500">Aucune donnée à afficher.</div>;

              return top.map((row: any) => {
                const c = clients.find((x: any) => String(x.id) === String(row.clientId));
                const cname = c?.nom_complet ?? `Client ${row.clientId}`;
                const productRows = Object.entries(row.products)
                  .map(([pid, stats]: any) => ({ productId: pid, ...(stats as any) }))
                  .sort((a: any, b: any) => b.montant - a.montant)
                  .slice(0, 10);

                return (
                  <div key={row.clientId} className="border rounded-lg">
                    <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="text-indigo-600" size={18} />
                        <div>
                          <h3 className="font-semibold text-gray-900">{cname}</h3>
                          <p className="text-xs text-gray-500">ID: {row.clientId}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Quantité totale</p>
                        <p className="text-lg font-semibold text-gray-900">{toNumber(row.totalQuantite)}</p>
                        <p className="text-xs text-gray-500">{toNumber(row.totalMontant).toFixed(2)} DH</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-white">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produit</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ventes</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Quantité</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {productRows.map((pr: any) => {
                            const p = products.find((x: any) => String(x.id) === String(pr.productId));
                            const pname = p?.designation ?? `Produit ${pr.productId}`;
                            return (
                              <tr key={pr.productId} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm text-gray-900">{pname}</td>
                                <td className="px-4 py-2 text-sm text-right text-gray-900">{pr.ventes}</td>
                                <td className="px-4 py-2 text-sm text-right text-gray-900">{toNumber(pr.quantite)}</td>
                                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900">{toNumber(pr.montant).toFixed(2)} DH</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsDetailPage;
