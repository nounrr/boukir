import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Activity, Filter, Users, ArrowLeft } from "lucide-react";
import { useGetProductsQuery } from "../store/api/productsApi";
import { useGetAllClientsQuery } from '../store/api/contactsApi';
import { useGetBonsByTypeQuery } from "../store/api/bonsApi";
import SearchableSelect from "../components/SearchableSelect";
import type { RootState } from "../store";

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

const getBonSign = (bonType: string): number => {
  // Logique comptable demandée:
  // - Sortie/Comptant: le client paie => +
  // - Ecommerce: vente e-commerce => +
  // - Commande: je paie le fournisseur => -
  // - Avoir client/comptant: le client retourne => -
  // - Avoir e-commerce: retour e-commerce => -
  // - Avoir fournisseur: je retourne au fournisseur (annule une dépense) => +
  switch (bonType) {
    case 'Sortie':
    case 'Comptant':
    case 'Ecommerce':
      return 1;
    case 'Commande':
      return -1;
    case 'Avoir':
    case 'AvoirComptant':
    case 'AvoirEcommerce':
      return -1;
    case 'AvoirFournisseur':
      return 1;
    default:
      return 1;
  }
};

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

  const { data: products = [] } = useGetProductsQuery();
  const { data: clients = [] } = useGetAllClientsQuery();
  const { data: bonsSortie = [] } = useGetBonsByTypeQuery('Sortie');
  const { data: bonsComptant = [] } = useGetBonsByTypeQuery('Comptant');
  const { data: bonsEcommerce = [] } = useGetBonsByTypeQuery('Ecommerce');
  const { data: bonsCommandes = [] } = useGetBonsByTypeQuery('Commande');
  const { data: avoirsClient = [] } = useGetBonsByTypeQuery('Avoir');
  const { data: avoirsFournisseur = [] } = useGetBonsByTypeQuery('AvoirFournisseur');
  const { data: avoirsComptant = [] } = useGetBonsByTypeQuery('AvoirComptant');
  const { data: avoirsEcommerce = [] } = useGetBonsByTypeQuery('AvoirEcommerce');

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailMatrixMode, setDetailMatrixMode] = useState<"produits" | "clients">("produits");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  // Etat d'expansion des clients par produit (productId -> clientId -> boolean)
  const [expandedClients, setExpandedClients] = useState<Record<string, Record<string, boolean>>>({});
  // Filtres de type de bons (3 checkbox demandées)
  const [includeVentes, setIncludeVentes] = useState<boolean>(true); // Sortie + Comptant
  const [includeCommandes, setIncludeCommandes] = useState<boolean>(true);
  const [includeAvoirs, setIncludeAvoirs] = useState<boolean>(true);

  // Option: afficher sans condition de client (mode actuel = groupé par client)
  const [useClientCondition, setUseClientCondition] = useState<boolean>(false);

  // useEffect doit être avant tout return conditionnel
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
    // Construire une liste unifiée selon les 3 checkbox: Ventes, Commandes, Avoirs
    const ventes = includeVentes
      ? [
          ...bonsSortie.map((b: any) => ({ ...b, __kind: 'Sortie' })),
          ...bonsComptant.map((b: any) => ({ ...b, __kind: 'Comptant' })),
          ...bonsEcommerce.map((b: any) => ({ ...b, __kind: 'Ecommerce' })),
        ]
      : [];

    const commandes = includeCommandes
      ? bonsCommandes.map((b: any) => ({ ...b, __kind: 'Commande' }))
      : [];

    const avoirs = includeAvoirs
      ? [
          ...avoirsClient.map((b: any) => ({ ...b, __kind: 'Avoir' })),
          ...avoirsFournisseur.map((b: any) => ({ ...b, __kind: 'AvoirFournisseur' })),
          ...avoirsComptant.map((b: any) => ({ ...b, __kind: 'AvoirComptant' })),
          ...avoirsEcommerce.map((b: any) => ({ ...b, __kind: 'AvoirEcommerce' })),
        ]
      : [];

    const all = [...ventes, ...commandes, ...avoirs];

    return all.filter((b: any) => {
      // Exclure les bons avec isNotCalculated = true
      if (b.isNotCalculated) return false;

      const bonType = String(b.__kind || b.type || '');
      const inRange = inDateRange(toDisplayDate(b.date || b.date_creation));

      const norm = (v: any) => String(v ?? '').trim().toLowerCase();

      // Filtrage statuts: garder large (objectif: afficher tous),
      // mais exclure les états clairement invalides.
      const statut = b.statut;
      let validStatus = true;

      if (bonType === 'Comptant') {
        // Pour Comptant: exclure Annulé + les lignes déjà converties en Avoir
        validStatus = statut ? !['Annulé', 'Avoir'].includes(statut) : true;
      } else if (bonType === 'Ecommerce') {
        // Statuts e-commerce: exclure seulement cancelled/refunded (+ variantes)
        const s = norm(statut);
        validStatus = s ? !['cancelled', 'canceled', 'refunded', 'annulé', 'annule'].includes(s) : true;
      } else {
        validStatus = statut ? !['Annulé', 'Refusé', 'Expiré'].includes(statut) : true;
      }

      return inRange && validStatus;
    });
  }, [
    bonsSortie,
    bonsComptant,
    bonsEcommerce,
    bonsCommandes,
    avoirsClient,
    avoirsFournisseur,
    avoirsComptant,
    avoirsEcommerce,
    dateFrom,
    dateTo,
    includeVentes,
    includeCommandes,
    includeAvoirs,
  ]);

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
      const bonType = String((bon as any).__kind || bon.type || '');
      const sign = getBonSign(bonType);

      // Résoudre l'identifiant "contact" selon le type
      let clientId = '';

      if (bonType === 'Commande' || bonType === 'AvoirFournisseur') {
        clientId = String(bon.fournisseur_id ?? bon.contact_id ?? bon.client_id ?? '');
      } else {
        clientId = String(bon.client_id ?? bon.contact_id ?? '');
      }

      // Comptant / AvoirComptant: si pas d'ID, utiliser client_nom
      if (!clientId && (bonType === 'Comptant' || bonType === 'AvoirComptant')) {
        const clientNom = bon.client_nom || 'Sans nom';
        clientId = `comptant_${clientNom}`;
      }

      // Ecommerce / AvoirEcommerce: si pas d'ID, utiliser un identifiant stable basé sur nom/phone/email
      if (!clientId && (bonType === 'Ecommerce' || bonType === 'AvoirEcommerce')) {
        const name = (bon.client_nom || bon.customer_name || bon.contact_nom_complet || bon.contact_name || '').toString().trim();
        const phone = (bon.phone || '').toString().trim();
        const email = (bon.customer_email || '').toString().trim().toLowerCase();
        const key = name || phone || email || String(bon.numero || bon.order_number || bon.id || '');
        clientId = `ecom_${key || 'inconnu'}`;
      }

      // Si on désactive la condition client, on regroupe tout sous un seul "client".
      if (!useClientCondition) {
        clientId = '__all__';
      }

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
        const productId = String(it.product_id ?? it.produit_id ?? it.produitId ?? it.id ?? "");
        if (!productId) continue;
        const rawQty = it.quantite ?? it.qty ?? it.quantity ?? 0;
        const qtySource = it.quantite != null ? 'item.quantite' : (it.qty != null ? 'item.qty' : '0');
        const qty = toNumber(rawQty);

        // Prix unitaire : priorité prix_unitaire puis prix / prix_vente / price / prix_achat
        const rawUnit = it.prix_unitaire ?? it.unit_price ?? it.prix ?? it.prix_vente ?? it.price ?? it.prix_achat;
        const unitSource =
          it.prix_unitaire != null
            ? 'item.prix_unitaire'
            : it.prix != null
              ? 'item.prix'
              : it.prix_vente != null
                ? 'item.prix_vente'
                : it.price != null
                  ? 'item.price'
                  : it.prix_achat != null
                    ? 'item.prix_achat'
                    : '0';
        const unit = toNumber(rawUnit);
        const total = toNumber(it.total ?? it.montant ?? it.montant_ligne ?? it.subtotal ?? unit * qty);
        const signedQty = qty * sign;
        const signedTotal = total * sign;

        const totalSource =
          it.total != null
            ? 'item.total'
            : it.montant != null
              ? 'item.montant'
              : it.montant_ligne != null
                ? 'item.montant_ligne'
                : it.subtotal != null
                  ? 'item.subtotal'
              : 'prix_unitaire×quantite';
        const baseBeforeSign = total;

        // ── Résoudre variant_name, unit_name, cost depuis le catalogue produits ──
        const productData: any = products.find((p: any) => String(p.id) === String(productId));

        // variant_name : item snapshot (ecommerce) → catalogue
        let variantName = it.variant_name || '';
        if (!variantName && it.variant_id && productData?.variants) {
          const v = productData.variants.find((vr: any) => String(vr.id) === String(it.variant_id));
          if (v) variantName = v.variant_name || '';
        }

        // unit_name : item snapshot (ecommerce) → catalogue
        let unitName = it.unit_name || '';
        let conversionFactor = 1;
        if (!unitName && it.unit_id && productData?.units) {
          const u = productData.units.find((un: any) => String(un.id) === String(it.unit_id));
          if (u) {
            unitName = u.unit_name || '';
            conversionFactor = toNumber(u.conversion_factor) || 1;
          }
        } else if (it.unit_id && productData?.units) {
          const u = productData.units.find((un: any) => String(un.id) === String(it.unit_id));
          if (u) conversionFactor = toNumber(u.conversion_factor) || 1;
        }

        // Cost : variant-level → item-level → product-level
        let costUnit = 0;
        if (it.variant_id && productData?.variants) {
          const v = productData.variants.find((vr: any) => String(vr.id) === String(it.variant_id));
          if (v) costUnit = toNumber(v.cout_revient) || toNumber(v.prix_achat) || 0;
        }
        if (!costUnit) {
          costUnit = toNumber(it.cout_revient) || toNumber(it.prix_achat)
            || toNumber(productData?.cout_revient) || toNumber(productData?.prix_achat) || 0;
        }
        // Ajuster le coût par le facteur de conversion de l'unité
        const adjustedCost = costUnit * conversionFactor;
        const profitItem = (unit - adjustedCost) * qty * sign;

        if (!pcs[productId]) pcs[productId] = { totalVentes: 0, totalQuantite: 0, totalMontant: 0, totalProfit: 0, clients: {} };
        const pcEntry = pcs[productId];
        if (!pcEntry.clients[clientId]) pcEntry.clients[clientId] = { ventes: 0, quantite: 0, montant: 0, profit: 0, details: [] };
        pcEntry.clients[clientId].ventes += 1;
        pcEntry.clients[clientId].quantite += signedQty;
        pcEntry.clients[clientId].montant += signedTotal;
        pcEntry.clients[clientId].profit += profitItem;
        pcEntry.totalVentes += 1;
        pcEntry.totalQuantite += signedQty;
        pcEntry.totalMontant += signedTotal;
        pcEntry.totalProfit += profitItem;

        // Détails par bon pour l'accordéon (vue produits)
        pcEntry.clients[clientId].details.push({
          bonId: bon.id,
          bonNumero: bon.numero || bon.numero_bon || bon.code || `#${bon.id}`,
          date: toDisplayDate(bon.date || bon.date_creation),
            // conserver valeurs brutes aussi
          quantite: signedQty,
          rawQuantite: qty,
          qtySource,
          prix_unitaire: unit,
          unitSource,
          total: signedTotal,
          totalSource,
          baseBeforeSign,
          sign,
          statut: bon.statut,
          type: bonType,
          variantName,
          unitName,
          costUnit: adjustedCost,
          profit: profitItem,
        });

        // Pour les produits : calculer les statistiques des clients
        if (!cps[clientId]) cps[clientId] = { totalVentes: 0, totalQuantite: 0, totalMontant: 0, totalProfit: 0, products: {} };
        const cpEntry = cps[clientId];
        if (!cpEntry.products[productId]) cpEntry.products[productId] = { ventes: 0, quantite: 0, montant: 0, profit: 0 };
        cpEntry.products[productId].ventes += 1;
        cpEntry.products[productId].quantite += signedQty;
        cpEntry.products[productId].montant += signedTotal;
        cpEntry.products[productId].profit += profitItem;
        cpEntry.totalVentes += 1;
        cpEntry.totalQuantite += signedQty;
        cpEntry.totalMontant += signedTotal;
        cpEntry.totalProfit += profitItem;
      }
    }

    // Les statistiques des contacts sont déjà calculées dans la boucle ci-dessus
    // puisque clientBonsForItems contient les bons filtrés par statut
    return { productClientStats: pcs, clientProductStats: cps };
  }, [clientBonsForItems, useClientCondition, products]);

  // Options recherchables (produits & clients)
  const productOptions = useMemo(() => {
    const base = [{ value: "", label: "Tous" }];
    // Build a union of product ids from products list and computed stats so we include products with 0 ventes
    const idSet = new Set<string>();
    for (const p of products) {
      if (p && p.id != null) idSet.add(String(p.id));
    }
    for (const pid of Object.keys(productClientStats)) idSet.add(String(pid));

    const mapped = Array.from(idSet).map((pid) => {
      const p: any = products.find((x: any) => String(x.id) === String(pid));
      const ref = p?.reference ? String(p.reference).trim() : "";
      const designation = p?.designation ? String(p.designation).trim() : "";
      const label = [ref, designation].filter(Boolean).join(" - ") || `Produit ${pid}`;
      return { value: pid, label };
    });

    // Sort options alphabetically by label (keep "Tous" first)
    mapped.sort((a, b) => a.label.localeCompare(b.label));
    return base.concat(mapped);
  }, [productClientStats, products]);

  const clientOptions = useMemo(() => {
    const base = [{ value: "", label: "Tous" }];
    const ids = Object.keys(clientProductStats);
    const mapped = ids.map((cid) => {
      if (cid === '__all__') {
        return { value: cid, label: 'Tous (sans condition client)' };
      }
      // Gérer les clients fictifs pour Comptant
      if (cid.startsWith('comptant_')) {
        const clientNom = cid.replace('comptant_', '');
        return { value: cid, label: `${clientNom} (Comptant)` };
      }

      // Gérer les clients fictifs pour Ecommerce (quand pas de client_id)
      if (cid.startsWith('ecom_')) {
        const key = cid.replace('ecom_', '');
        return { value: cid, label: `${key} (Ecommerce)` };
      }
      
      const c: any = clients.find((x: any) => String(x.id) === String(cid));
      const label = c?.nom_complet ? String(c.nom_complet) : `Client ${cid}`;
      return { value: cid, label };
    });
    return base.concat(mapped);
  }, [clientProductStats, clients]);

  // Vérification du mot de passe pour accéder à la page
  const handlePasswordVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cin: user?.cin,
          password: passwordInput,
        }),
      });

      if (response.ok) {
        setIsPasswordVerified(true);
        setShowPasswordError(false);
        setPasswordInput('');
      } else {
        setShowPasswordError(true);
      }
    } catch (error) {
      console.error('Erreur de vérification:', error);
      setShowPasswordError(true);
    }
  };

  // Afficher la popup de mot de passe si pas encore vérifié
  if (!isPasswordVerified) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center mb-4">
            <Users size={48} className="text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-center mb-2">Page Stats Détaillées</h2>
          <p className="text-gray-600 text-center mb-6">
            Veuillez entrer le mot de passe pour accéder à cette page
          </p>
          <form onSubmit={handlePasswordVerification}>
            <div className="mb-4">
              <label htmlFor="password-verify" className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe
              </label>
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
              {showPasswordError && (
                <p className="mt-2 text-sm text-red-600">
                  Mot de passe incorrect. Veuillez réessayer.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <ArrowLeft size={18} />
                Retour
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Accéder
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistiques détaillées</h1>
          <p className="text-gray-600 mt-1">Ventes par produit et par client</p>
        </div>
      </div>

      {/* Clés de couleur (légende) */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-600 font-medium mr-1">Clés de couleur :</span>
        <span className="inline-flex items-center px-2 py-1 rounded border border-green-200 bg-green-50 text-green-800">
          Sortie / Comptant / Ecommerce
        </span>
        <span className="inline-flex items-center px-2 py-1 rounded border border-amber-200 bg-amber-50 text-amber-800">
          Commande
        </span>
        <span className="inline-flex items-center px-2 py-1 rounded border border-red-200 bg-red-50 text-red-800">
          Avoir (client / comptant / ecommerce)
        </span>
        <span className="inline-flex items-center px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-800">
          Avoir fournisseur
        </span>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Filtres</h2>
        </div>
        
        {/* Indicateur de filtrage par statut */}
        <div className="mb-4">
          {(() => {
            const totalVentes = bonsSortie.length + bonsComptant.length + bonsEcommerce.length;
            const totalCommandes = bonsCommandes.length;
            const totalAvoirs = avoirsClient.length + avoirsFournisseur.length + avoirsComptant.length + avoirsEcommerce.length;

            const filteredVentes = clientBonsForItems.filter((b: any) => ['Sortie', 'Comptant', 'Ecommerce'].includes(String(b.__kind || b.type))).length;
            const filteredCommandes = clientBonsForItems.filter((b: any) => String(b.__kind || b.type) === 'Commande').length;
            const filteredAvoirs = clientBonsForItems.filter((b: any) => ['Avoir', 'AvoirFournisseur', 'AvoirComptant', 'AvoirEcommerce'].includes(String(b.__kind || b.type))).length;

            const labels: string[] = [];
            if (includeVentes) labels.push('Ventes');
            if (includeCommandes) labels.push('Commandes');
            if (includeAvoirs) labels.push('Avoirs');
            const typesLabel = labels.length ? labels.join(' + ') : 'Aucun type sélectionné';
            return (
              <div className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">
                <Filter className="w-3 h-3 mr-2" />
                Affichage : {typesLabel} (statuts filtrés) | Ventes {filteredVentes}/{totalVentes} - Commandes {filteredCommandes}/{totalCommandes} - Avoirs {filteredAvoirs}/{totalAvoirs}
              </div>
            );
          })()}
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

        {/* Cases à cocher pour filtrer les types de bons (3 checkbox) */}
        <div className="mt-4 flex flex-wrap gap-6 items-center">
          <div className="flex items-center gap-2">
            <input
              id="chkVentes"
              type="checkbox"
              checked={includeVentes}
              onChange={() =>
                setIncludeVentes((prev) => {
                  const next = !prev;
                  if (!next && !includeCommandes && !includeAvoirs) return prev;
                  return next;
                })
              }
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="chkVentes" className="text-sm text-gray-700">Inclure Ventes (Sortie + Comptant + Ecommerce)</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="chkCommandes"
              type="checkbox"
              checked={includeCommandes}
              onChange={() =>
                setIncludeCommandes((prev) => {
                  const next = !prev;
                  if (!next && !includeVentes && !includeAvoirs) return prev;
                  return next;
                })
              }
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="chkCommandes" className="text-sm text-gray-700">Inclure Commandes</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="chkAvoirs"
              type="checkbox"
              checked={includeAvoirs}
              onChange={() =>
                setIncludeAvoirs((prev) => {
                  const next = !prev;
                  if (!next && !includeVentes && !includeCommandes) return prev;
                  return next;
                })
              }
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="chkAvoirs" className="text-sm text-gray-700">Inclure Avoirs (client + fournisseur + comptant + ecommerce)</label>
          </div>
          {(!includeVentes && !includeCommandes && !includeAvoirs) && (
            <p className="text-xs text-red-600 font-medium">Sélectionnez au moins un type de bon.</p>
          )}
        </div>

        {/* Option: condition client */}
        <div className="mt-3 flex flex-wrap gap-6 items-center">
          <div className="flex items-center gap-2">
            <input
              id="chkClientCondition"
              type="checkbox"
              checked={useClientCondition}
              onChange={() => setUseClientCondition((v) => !v)}
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="chkClientCondition" className="text-sm text-gray-700">
              Condition client (mode actuel)
            </label>
          </div>
          {!useClientCondition && (
            <p className="text-xs text-gray-500">Tous les bons seront regroupés dans “Tous”, même sans client.</p>
          )}
        </div>
      </div>

      {/* Matrices */}
      <div className="bg-white p-6 rounded-lg shadow">
        {detailMatrixMode === "produits" ? (
          <div className="space-y-6">
            {(() => {
              // Ensure we include all products (even those with zero ventes)
              const allProductIds = new Set<string>([...Object.keys(productClientStats), ...products.map((p:any) => String(p.id))]);
              const entries = Array.from(allProductIds).map((pid) => {
                const data = productClientStats[pid] || { totalVentes: 0, totalQuantite: 0, totalMontant: 0, totalProfit: 0, clients: {} };
                return { productId: pid, ...data };
              });
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
                        <p className={`text-xs font-semibold ${toNumber(row.totalProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>Profit: {toNumber(row.totalProfit).toFixed(2)} DH</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto w-full">
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
                          {clientRows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-4 text-center text-sm text-gray-500">Aucune vente pour ce produit</td>
                            </tr>
                          ) : clientRows.map((cr: any) => {
                            // Gérer l'affichage du nom client pour les bons Comptant
                            let cname;
                            if (String(cr.clientId) === '__all__') {
                              cname = 'Tous (sans condition client)';
                            } else if (String(cr.clientId).startsWith('comptant_')) {
                              cname = String(cr.clientId).replace('comptant_', '') + ' (Comptant)';
                            } else if (String(cr.clientId).startsWith('ecom_')) {
                              cname = String(cr.clientId).replace('ecom_', '') + ' (Ecommerce)';
                            } else {
                              const c = clients.find((x: any) => String(x.id) === String(cr.clientId));
                              cname = c?.nom_complet ?? `Client ${cr.clientId}`;
                            }
                            
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
                                  <td className={`px-4 py-2 text-sm text-right font-semibold ${toNumber(cr.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{toNumber(cr.profit).toFixed(2)} DH</td>
                                </tr>
                                {isOpen && cr.details && cr.details.length > 0 && (
                                  <tr className="bg-gray-50/60">
                                    <td colSpan={5} className="px-4 pb-4 pt-0">
                                      <div className="mt-2 border border-gray-200 rounded-md bg-white w-full overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead className="bg-gray-100">
                                            <tr>
                                              <th className="px-2 py-1 text-left font-medium text-gray-600">Bon</th>
                                              <th className="px-2 py-1 text-left font-medium text-gray-600">Type</th>
                                              <th className="px-2 py-1 text-left font-medium text-gray-600">Date</th>
                                              <th className="px-2 py-1 text-left font-medium text-gray-600">Variante</th>
                                              <th className="px-2 py-1 text-left font-medium text-gray-600">Unité</th>
                                              <th className="px-2 py-1 text-right font-medium text-gray-600">Qté</th>
                                              <th className="px-2 py-1 text-right font-medium text-gray-600">P.Unit</th>
                                              <th className="px-2 py-1 text-right font-medium text-gray-600">Coût</th>
                                              <th className="px-2 py-1 text-right font-medium text-gray-600">Total</th>
                                              <th className="px-2 py-1 text-right font-medium text-gray-600">Profit</th>
                                              <th className="px-2 py-1 text-right font-medium text-gray-600">Solde</th>
                                              <th className="px-2 py-1 text-left font-medium text-gray-600">Statut</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(() => {
                                              const detailsSorted = [...(cr.details || [])].sort((a: any, b: any) => {
                                                const da = String(a.date || '');
                                                const db = String(b.date || '');
                                                if (da !== db) return da.localeCompare(db);
                                                const na = String(a.bonNumero || '');
                                                const nb = String(b.bonNumero || '');
                                                if (na !== nb) return na.localeCompare(nb);
                                                return toNumber(a.bonId) - toNumber(b.bonId);
                                              });

                                              let solde = 0;
                                              let profitCumul = 0;
                                              const rows = detailsSorted.map((d: any, idx: number) => {
                                                solde += toNumber(d.total);
                                                profitCumul += toNumber(d.profit);
                                                const rowSolde = solde;
                                                return (
                                                  <tr key={idx} className={`border-t last:border-b-0 ${getBonRowBg(String(d.type || ''))}`}>
                                                    <td className="px-2 py-1">{d.bonNumero}</td>
                                                    <td className="px-2 py-1">{d.type}</td>
                                                    <td className="px-2 py-1">{d.date}</td>
                                                    <td className="px-2 py-1 text-left">{d.variantName || <span className="text-gray-300">—</span>}</td>
                                                    <td className="px-2 py-1 text-left">{d.unitName || <span className="text-gray-300">—</span>}</td>
                                                    <td className="px-2 py-1 text-right">{toNumber(d.quantite)}</td>
                                                    <td className="px-2 py-1 text-right">{toNumber(d.prix_unitaire).toFixed(2)} DH</td>
                                                    <td className="px-2 py-1 text-right text-gray-500">{toNumber(d.costUnit).toFixed(2)} DH</td>
                                                    <td className="px-2 py-1 text-right font-medium">{toNumber(d.total).toFixed(2)} DH</td>
                                                    <td className={`px-2 py-1 text-right font-medium ${toNumber(d.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{toNumber(d.profit).toFixed(2)} DH</td>
                                                    <td className="px-2 py-1 text-right font-semibold text-gray-900">{toNumber(rowSolde).toFixed(2)} DH</td>
                                                    <td className="px-2 py-1">{d.statut}</td>
                                                  </tr>
                                                );
                                              });

                                              const soldeFinal = solde;
                                              const profitFinal = profitCumul;
                                              rows.push(
                                                <tr key="__solde_final__" className="border-t bg-gray-100">
                                                  <td className="px-2 py-1 font-semibold text-gray-900" colSpan={8}>Solde final</td>
                                                  <td className="px-2 py-1 text-right font-semibold text-gray-900">{toNumber(soldeFinal).toFixed(2)} DH</td>
                                                  <td className={`px-2 py-1 text-right font-semibold ${profitFinal >= 0 ? 'text-green-600' : 'text-red-600'}`}>{toNumber(profitFinal).toFixed(2)} DH</td>
                                                  <td className="px-2 py-1 text-right font-semibold text-gray-900">{toNumber(soldeFinal).toFixed(2)} DH</td>
                                                  <td className="px-2 py-1"></td>
                                                </tr>
                                              );

                                              return rows;
                                            })()}
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
                // Gérer l'affichage du nom client pour les bons Comptant  
                let cname;
                if (String(row.clientId) === '__all__') {
                  cname = 'Tous (sans condition client)';
                } else if (String(row.clientId).startsWith('comptant_')) {
                  cname = String(row.clientId).replace('comptant_', '') + ' (Comptant)';
                } else if (String(row.clientId).startsWith('ecom_')) {
                  cname = String(row.clientId).replace('ecom_', '') + ' (Ecommerce)';
                } else {
                  const c = clients.find((x: any) => String(x.id) === String(row.clientId));
                  cname = c?.nom_complet ?? `Client ${row.clientId}`;
                }
                
                // Include products with zero sales for this client
                const prodIdsForClient = new Set<string>([...Object.keys(row.products || {}), ...products.map((p:any) => String(p.id))]);
                const productRows = Array.from(prodIdsForClient).map((pid) => {
                  const stats = row.products?.[pid] || { ventes: 0, quantite: 0, montant: 0 };
                  return { productId: pid, ...stats };
                }).sort((a: any, b: any) => b.montant - a.montant).slice(0, 10);

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
                        <p className={`text-xs font-semibold ${toNumber(row.totalProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>Profit: {toNumber(row.totalProfit).toFixed(2)} DH</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto w-full">
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
                          {productRows.map((pr: any) => {
                            const p = products.find((x: any) => String(x.id) === String(pr.productId));
                            const pname = p?.designation ?? `Produit ${pr.productId}`;
                            return (
                              <tr key={pr.productId} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm text-gray-900">{pname}</td>
                                <td className="px-4 py-2 text-sm text-right text-gray-900">{pr.ventes}</td>
                                <td className="px-4 py-2 text-sm text-right text-gray-900">{toNumber(pr.quantite)}</td>
                                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900">{toNumber(pr.montant).toFixed(2)} DH</td>
                                <td className={`px-4 py-2 text-sm text-right font-semibold ${toNumber(pr.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{toNumber(pr.profit).toFixed(2)} DH</td>
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
