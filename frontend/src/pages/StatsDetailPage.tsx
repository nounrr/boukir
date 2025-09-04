import React, { useEffect, useMemo, useState } from "react";
import { Activity, Filter } from "lucide-react";
import { useGetProductsQuery } from "../store/api/productsApi";
import { useGetClientsQuery } from "../store/api/contactsApi";
import { useGetComptantQuery } from "../store/api/comptantApi";
import { useGetSortiesQuery } from "../store/api/sortiesApi";
import SearchableSelect from "../components/SearchableSelect";

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
  // Etat d'expansion des clients par produit (productId -> clientId -> boolean)
  const [expandedClients, setExpandedClients] = useState<Record<string, Record<string, boolean>>>({});

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
    // Filtrer par date ET par statut (exclure "Refusé" et "Annulé" pour tous)
    return all.filter((b: any) => {
      const inRange = inDateRange(toDisplayDate(b.date || b.date_creation));
      const validStatus = b.statut === 'En attente' || b.statut === 'Validé';
      return inRange && validStatus;
    });
  }, [bonsComptant, bonsSortie, dateFrom, dateTo]);

  // clientBonsForItems contient déjà les bons filtrés par statut et date
  // On peut l'utiliser pour les deux vues (produits et contacts)

  const { productClientStats, clientProductStats } = useMemo(() => {
    const pcs: Record<string, any> = {};
    const cps: Record<string, any> = {};

    // LOGIQUE DE FILTRAGE :
    // - Produits ET Contacts : Seulement les bons avec statut "En attente" et "Validé"
    // - Exclure "Refusé" et "Annulé" pour tous

    // Pour les produits : utiliser seulement les bons "En attente" et "Validé"
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
        // Déterminer le prix unitaire selon le type de bon
        const rawUnit = (() => {
          if (bon.type === 'Commande') {
            return it.prix_achat ?? it.prix_unitaire ?? it.prix ?? it.prix_vente ?? it.price;
          }
            // Sortie / Comptant / autres: prix_unitaire prioritaire
          return it.prix_unitaire ?? it.prix ?? it.prix_vente ?? it.price ?? it.prix_achat;
        })();
        const unit = toNumber(rawUnit);
        const total = toNumber(it.total ?? it.montant ?? unit * qty);

        if (!pcs[productId]) pcs[productId] = { totalVentes: 0, totalQuantite: 0, totalMontant: 0, clients: {} };
        const pcEntry = pcs[productId];
        if (!pcEntry.clients[clientId]) pcEntry.clients[clientId] = { ventes: 0, quantite: 0, montant: 0, details: [] };
        pcEntry.clients[clientId].ventes += 1;
        pcEntry.clients[clientId].quantite += qty;
        pcEntry.clients[clientId].montant += total;
        pcEntry.totalVentes += 1;
        pcEntry.totalQuantite += qty;
        pcEntry.totalMontant += total;

        // Détails par bon pour l'accordéon (vue produits)
        pcEntry.clients[clientId].details.push({
          bonId: bon.id,
          bonNumero: bon.numero || bon.numero_bon || bon.code || `#${bon.id}`,
          date: toDisplayDate(bon.date || bon.date_creation),
            // conserver valeurs brutes aussi
          quantite: qty,
          prix_unitaire: unit,
          total,
          statut: bon.statut,
          type: bon.type,
        });

        // Pour les produits : calculer les statistiques des clients
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

    // Les statistiques des contacts sont déjà calculées dans la boucle ci-dessus
    // puisque clientBonsForItems contient les bons filtrés par statut
    return { productClientStats: pcs, clientProductStats: cps };
  }, [clientBonsForItems]);

  // Options recherchables (produits & clients)
  const productOptions = useMemo(() => {
    const base = [{ value: "", label: "Tous" }];
    const ids = Object.keys(productClientStats);
    const mapped = ids.map((pid) => {
      const p: any = products.find((x: any) => String(x.id) === String(pid));
      const ref = p?.reference ? String(p.reference).trim() : "";
      const designation = p?.designation ? String(p.designation).trim() : "";
      const label = [ref, designation].filter(Boolean).join(" - ") || `Produit ${pid}`;
      return { value: pid, label };
    });
    return base.concat(mapped);
  }, [productClientStats, products]);

  const clientOptions = useMemo(() => {
    const base = [{ value: "", label: "Tous" }];
    const ids = Object.keys(clientProductStats);
    const mapped = ids.map((cid) => {
      const c: any = clients.find((x: any) => String(x.id) === String(cid));
      const label = c?.nom_complet ? String(c.nom_complet) : `Client ${cid}`;
      return { value: cid, label };
    });
    return base.concat(mapped);
  }, [clientProductStats, clients]);

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
        
        {/* Indicateur de filtrage par statut */}
        <div className="mb-4">
          <div className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">
            <Filter className="w-3 h-3 mr-2" />
            Affichage : Bons "En attente" et "Validé" uniquement (exclut "Refusé" et "Annulé")
          </div>
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
              <label htmlFor="detailProductSearch" className="block text-sm font-medium text-gray-700 mb-1">Produit</label>
              <SearchableSelect
                options={productOptions}
                value={selectedProductId}
                onChange={(v) => setSelectedProductId(v)}
                placeholder="Rechercher produit (réf ou désignation)"
                className="w-full"
                autoOpenOnFocus
                id="detailProductSearch"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="detailClientSearch" className="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <SearchableSelect
                options={clientOptions}
                value={selectedClientId}
                onChange={(v) => setSelectedClientId(v)}
                placeholder="Rechercher client (nom)"
                className="w-full"
                autoOpenOnFocus
                id="detailClientSearch"
              />
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
                  .map(([cid, stats]: any) => ({ clientId: cid, ...stats }))
                  .sort((a: any, b: any) => b.montant - a.montant)
                  .slice(0, 10);

                const toggle = (cid: string) => {
                  setExpandedClients(prev => {
                    const currentProduct = prev[row.productId] || {};
                    const currentVal = currentProduct[cid];
                    return {
                      ...prev,
                      [row.productId]: {
                        ...currentProduct,
                        [cid]: currentVal === undefined ? false : !currentVal,
                      }
                    };
                  });
                };

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
                            const isOpen = (expandedClients[row.productId] &&
                              expandedClients[row.productId][String(cr.clientId)]) !== undefined
                              ? expandedClients[row.productId][String(cr.clientId)]
                              : true; // ouvert par défaut si pas encore dans l'état
                            return (
                              <React.Fragment key={cr.clientId}>
                                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggle(String(cr.clientId))}>
                                  <td className="px-4 py-2 text-sm text-gray-900">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block w-3 text-gray-500">{isOpen ? '▾' : '▸'}</span>
                                      <span>{cname}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right text-gray-900">{cr.ventes}</td>
                                  <td className="px-4 py-2 text-sm text-right text-gray-900">{toNumber(cr.quantite)}</td>
                                  <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900">{toNumber(cr.montant).toFixed(2)} DH</td>
                                </tr>
                                {isOpen && cr.details && cr.details.length > 0 && (
                                  <tr className="bg-gray-50/60">
                                    <td colSpan={4} className="px-4 pb-4 pt-0">
                                      <div className="mt-2 border border-gray-200 rounded-md bg-white">
                                        <table className="min-w-full text-xs">
                                          <thead className="bg-gray-100">
                                            <tr>
                                              <th className="px-2 py-1 text-left font-medium text-gray-600">Bon</th>
                                              <th className="px-2 py-1 text-left font-medium text-gray-600">Date</th>
                                              <th className="px-2 py-1 text-right font-medium text-gray-600">Qté</th>
                                              <th className="px-2 py-1 text-right font-medium text-gray-600">P.Unit</th>
                                              <th className="px-2 py-1 text-right font-medium text-gray-600">Total</th>
                                              <th className="px-2 py-1 text-left font-medium text-gray-600">Statut</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {cr.details.map((d: any, idx: number) => (
                                              <tr key={idx} className="border-t last:border-b-0">
                                                <td className="px-2 py-1">{d.bonNumero}</td>
                                                <td className="px-2 py-1">{d.date}</td>
                                                <td className="px-2 py-1 text-right">{toNumber(d.quantite)}</td>
                                                <td className="px-2 py-1 text-right">{toNumber(d.prix_unitaire).toFixed(2)} DH</td>
                                                <td className="px-2 py-1 text-right font-medium">{toNumber(d.total).toFixed(2)} DH</td>
                                                <td className="px-2 py-1">{d.statut}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
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
                  .map(([pid, stats]: any) => ({ productId: pid, ...stats }))
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
