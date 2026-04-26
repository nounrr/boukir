import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Filter,
  Download,
  FileText,
  PieChart,
  Activity,
  X,
  Eye,
  ArrowLeft,
} from "lucide-react";
import { useGetProductsQuery } from "../store/api/productsApi";
import { useGetAllClientsQuery, useGetAllFournisseursQuery } from "../store/api/contactsApi";
import { useGetComptantQuery } from "../store/api/comptantApi";
import { useGetSortiesQuery } from "../store/api/sortiesApi";
import { useGetCommandesQuery } from "../store/api/commandesApi";
import { useGetPaymentsQuery } from "../store/api/paymentsApi";
import { useGetBonsByTypeQuery } from "../store/api/bonsApi";
import { formatDateTimeWithHour } from "../utils/dateUtils";
import { getBonNumeroDisplay } from "../utils/numero";
import type { RootState } from "../store";

/** ---------- Helpers ---------- */
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

const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");

// Parse bon items that may be an array or a JSON string
const parseBonItems = (items: any): any[] => {
  if (Array.isArray(items)) return items;
  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/** ---------- Types locaux souples ---------- */
type BonLite = {
  id: number | string;
  numero: string;
  type: "Comptant" | "Sortie" | "Commande" | "Avoir" | "AvoirFournisseur" | "Vehicule";
  contact_id?: number | string | null;
  date: string; // jj-mm-aa
  date_creation?: string | null;
  montant: number;
  statut: string;
};

type PaymentLite = {
  id: number | string;
  numero?: string;
  contact_id?: number | string | null;
  date: string; // jj-mm-aa
  montant: number;
  mode?: string;
  type: string;
  date_paiement?: string | null;
};

const ReportsPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordError, setShowPasswordError] = useState(false);

  /** ---------- Data (RTK Query) ---------- */
  const { data: clients = [] } = useGetAllClientsQuery(undefined);
  const { data: fournisseurs = [] } = useGetAllFournisseursQuery(undefined);
  const { data: products = [] } = useGetProductsQuery();
  const { data: bonsComptant = [] } = useGetComptantQuery(undefined);
  const { data: bonsSortie = [] } = useGetSortiesQuery(undefined);
  const { data: bonsCommande = [] } = useGetCommandesQuery(undefined);
  const { data: bonsVehicule = [] } = useGetBonsByTypeQuery("Vehicule");
  const { data: payments = [] } = useGetPaymentsQuery(undefined);
  // Avoirs (retours)
  const { data: avoirsClientRaw = [] } = useGetBonsByTypeQuery("Avoir");
  const { data: avoirsFournisseurRaw = [] } = useGetBonsByTypeQuery("AvoirFournisseur");

  /** ---------- State ---------- */
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [contactType, setContactType] = useState<"all" | "clients" | "fournisseurs">("all");
  const [reportType, setReportType] = useState<"overview" | "sales" | "payments" | "products">("overview");
  const [topProductsLimit, setTopProductsLimit] = useState<number>(5);
  const [selectedDetailModal, setSelectedDetailModal] = useState<
    "bons" | "payments" | "clients" | "benefice" | "fournisseurs" | null
  >(null);
  // Scope for bons detail modal: all (default), clients (Sortie + Comptant), fournisseurs (Commande)
  const [bonsModalScope, setBonsModalScope] = useState<"all" | "clients" | "fournisseurs">("all");
  // detailed matrices moved to dedicated StatsDetailPage

  /** ---------- Sets utilitaires pour filtre contactType ---------- */
  const clientIds = useMemo(() => new Set(clients.map((c: any) => String(c.id))), [clients]);
  const fournisseurIds = useMemo(() => new Set(fournisseurs.map((f: any) => String(f.id))), [fournisseurs]);

  /** ---------- Normalisation ---------- */
  const normalizedBons: BonLite[] = useMemo(() => {
    const mapComptant = (b: any): BonLite => ({
      id: b.id,
      numero: getBonNumeroDisplay({ id: b.id, type: 'Comptant', numero: b.numero }),
      type: "Comptant",
      contact_id: b.client_id ?? b.contact_id ?? null,
      date: toDisplayDate(b.date || b.date_creation),
      montant: toNumber(b.montant_total ?? b.total ?? 0),
      statut: b.statut || b.status || "Validé",
    });

    const mapSortie = (b: any): BonLite => ({
      id: b.id,
      numero: getBonNumeroDisplay({ id: b.id, type: 'Sortie', numero: b.numero }),
      type: "Sortie",
      contact_id: b.client_id ?? b.contact_id ?? null,
      date: toDisplayDate(b.date || b.date_creation),
      montant: toNumber(b.montant_total ?? b.total ?? 0),
      statut: b.statut || b.status || "Livré",
    });

    const mapCommande = (b: any): BonLite => ({
      id: b.id,
      numero: getBonNumeroDisplay({ id: b.id, type: 'Commande', numero: b.numero }),
      type: "Commande",
      contact_id: b.fournisseur_id ?? b.contact_id ?? null,
      date: toDisplayDate(b.date || b.date_creation),
      montant: toNumber(b.montant_total ?? b.total ?? 0),
      statut: b.statut || b.status || "Validé",
    });

    const mapVehicule = (b: any): BonLite => ({
      id: b.id,
      numero: getBonNumeroDisplay({ id: b.id, type: 'Vehicule', numero: b.numero }),
      type: "Vehicule",
      contact_id: b.vehicule_id ?? b.contact_id ?? null,
      date: toDisplayDate(b.date || b.date_creation),
      montant: toNumber(b.montant_total ?? b.total ?? 0),
      statut: b.statut || b.status || "Validé",
    });

    // Exclure les bons avec isNotCalculated = true
    const filteredComptant = bonsComptant.filter((b: any) => !b.isNotCalculated);
    const filteredSortie = bonsSortie.filter((b: any) => !b.isNotCalculated);
    const filteredCommande = bonsCommande.filter((b: any) => !b.isNotCalculated);
    const filteredVehicule = bonsVehicule.filter((b: any) => !b.isNotCalculated);

    return [...filteredComptant.map(mapComptant), ...filteredSortie.map(mapSortie), ...filteredCommande.map(mapCommande), ...filteredVehicule.map(mapVehicule)];
  }, [bonsComptant, bonsSortie, bonsCommande, bonsVehicule]);

  // Normaliser Avoirs
  const normalizedAvoirsClient: BonLite[] = useMemo(() => {
    const mapAvoirC = (b: any): BonLite => ({
      id: b.id,
      numero: getBonNumeroDisplay({ id: b.id, type: 'Avoir', numero: b.numero }),
      type: "Avoir",
      contact_id: b.client_id ?? b.contact_id ?? null,
      date: toDisplayDate(b.date || b.date_creation),
      montant: toNumber(b.montant_total ?? b.total ?? 0),
      statut: b.statut || b.status || "Avoir",
    });
    const list = Array.isArray(avoirsClientRaw) ? avoirsClientRaw : (avoirsClientRaw as any)?.data ?? [];
    // Exclure les avoirs avec isNotCalculated = true
    const filteredList = list.filter((b: any) => !b.isNotCalculated);
    return filteredList.map(mapAvoirC);
  }, [avoirsClientRaw]);

  const normalizedAvoirsFournisseur: BonLite[] = useMemo(() => {
    const mapAvoirF = (b: any): BonLite => ({
      id: b.id,
      numero: getBonNumeroDisplay({ id: b.id, type: 'AvoirFournisseur', numero: b.numero }),
      type: "AvoirFournisseur",
      contact_id: b.fournisseur_id ?? b.contact_id ?? null,
      date: toDisplayDate(b.date || b.date_creation),
      montant: toNumber(b.montant_total ?? b.total ?? 0),
      statut: b.statut || b.status || "Avoir",
    });
    const list = Array.isArray(avoirsFournisseurRaw) ? avoirsFournisseurRaw : (avoirsFournisseurRaw as any)?.data ?? [];
    // Exclure les avoirs avec isNotCalculated = true
    const filteredList = list.filter((b: any) => !b.isNotCalculated);
    return filteredList.map(mapAvoirF);
  }, [avoirsFournisseurRaw]);

  // Function to display payment numbers with PAY prefix
  const getDisplayNumeroPayment = (payment: any) => {
    try {
      const raw = String(payment?.numero ?? payment?.id ?? '').trim();
      if (raw === '') return raw;
      
      // remove any leading 'pay', 'pa' (case-insensitive) and optional separators
      const suffix = raw.replace(/^(pay|pa)\s*[-:\s]*/i, '');
      return `PAY${suffix}`;
    } catch (e) {
      return String(payment?.numero ?? payment?.id ?? '');
    }
  };

  const normalizedPayments: PaymentLite[] = useMemo(
    () =>
      payments.map((p: any) => ({
        id: p.id,
        numero: getDisplayNumeroPayment(p),
        contact_id: p.contact_id ?? null,
        date: toDisplayDate(p.date_paiement || p.date),
        montant: toNumber(p.montant_total ?? p.montant ?? 0),
        mode: p.mode_paiement || p.mode || "Autre",
        type: p.type || "Payment",
      })),
    [payments]
  );

  /** ---------- Filtres (dates + type contact) ---------- */
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

  const matchContactTypeBon = (b: BonLite) => {
    if (contactType === "all") return true;
    if (!b.contact_id) return false;
    const id = String(b.contact_id);
    return contactType === "clients" ? clientIds.has(id) : fournisseurIds.has(id);
  };

  const matchContactTypePayment = (p: PaymentLite) => {
    if (contactType === "all") return true;
    if (!p.contact_id) return false;
    const id = String(p.contact_id);
    return contactType === "clients" ? clientIds.has(id) : fournisseurIds.has(id);
  };

  /** ---------- Bons filtrés ---------- */
  const filteredBons = useMemo(() => {
    return normalizedBons.filter((b) => {
      // Filtre par date et type de contact
      if (!inDateRange(b.date) || !matchContactTypeBon(b)) return false;

  // Exclure uniquement les bons annulés
  if (b.statut === "Annulé" || b.statut === "Cancelled") return false;

      // Inclure seulement les statuts valides (inclure aussi 'Avoir')
      const validStatuts = [
        "Validé",
        "En attente",
        "Livré",
        "En cours",
        "Pending",
        "Valid",
        "Delivered",
        "Avoir"
      ];
      return validStatuts.includes(b.statut);
    });
  }, [normalizedBons, dateFrom, dateTo, contactType, clientIds, fournisseurIds]);

  // Avoirs filtrés
  const filteredAvoirsClient = useMemo(
    () =>
      normalizedAvoirsClient.filter((b) => inDateRange(b.date) && matchContactTypeBon(b)),
    [normalizedAvoirsClient, dateFrom, dateTo, contactType, clientIds, fournisseurIds]
  );

  const filteredAvoirsFournisseur = useMemo(
    () =>
      normalizedAvoirsFournisseur.filter((b) => inDateRange(b.date) && matchContactTypeBon(b)),
    [normalizedAvoirsFournisseur, dateFrom, dateTo, contactType, clientIds, fournisseurIds]
  );

  // RÈGLE MÉTIER :
  // - Bons Clients = Sortie + Comptant
  // - Bons Fournisseurs = Commande
  // - Bons Véhicules = Vehicule (coûts supplémentaires)
  const bonsFournisseurs = useMemo(() => filteredBons.filter((bon) => bon.type === "Commande"), [filteredBons]);
  const bonsClients = useMemo(
    () => filteredBons.filter((bon) => bon.type === "Sortie" || bon.type === "Comptant"),
    [filteredBons]
  );
  const bonsVehicules = useMemo(() => filteredBons.filter((bon) => bon.type === "Vehicule"), [filteredBons]);

  const filteredPayments = useMemo(
    () => normalizedPayments.filter((p) => inDateRange(p.date) && matchContactTypePayment(p)),
    [normalizedPayments, dateFrom, dateTo, contactType, clientIds, fournisseurIds]
  );

  /** ---------- Solde Clients/Fournisseurs (en utilisant les bons séparés) ---------- */
  const calculateClientTotalSolde = (client: any): number => {
    const soldeDB = toNumber(client.solde_a_recevoir ?? client.solde) || 0;
    const bonsClient = bonsClients
      .filter((bon) => sameId(bon.contact_id, client.id))
      .reduce((total, bon) => total + toNumber(bon.montant), 0);
    const paymentsClient = filteredPayments
      .filter((payment) => sameId(payment.contact_id, client.id))
      .reduce((total, payment) => total + toNumber(payment.montant), 0);
    // Ce que le client nous doit
    return soldeDB + bonsClient - paymentsClient;
  };

  const calculateFournisseurTotalSolde = (fournisseur: any): number => {
    const soldeDB = toNumber(fournisseur.solde_a_recevoir ?? fournisseur.solde) || 0;
    const bonsFournisseur = bonsFournisseurs
      .filter((bon) => sameId(bon.contact_id, fournisseur.id))
      .reduce((total, bon) => total + toNumber(bon.montant), 0);
    const paymentsFournisseur = filteredPayments
      .filter((payment) => sameId(payment.contact_id, fournisseur.id))
      .reduce((total, payment) => total + toNumber(payment.montant), 0);
    // Ce qu’on doit au fournisseur
    return soldeDB + bonsFournisseur - paymentsFournisseur;
  };

  const totalSoldeClients = useMemo(
    () => clients.reduce((sum: number, c: any) => sum + calculateClientTotalSolde(c), 0),
    [clients, bonsClients, filteredPayments]
  );

  const totalSoldeFournisseurs = useMemo(
    () => fournisseurs.reduce((sum: number, f: any) => sum + calculateFournisseurTotalSolde(f), 0),
    [fournisseurs, bonsFournisseurs, filteredPayments]
  );

  // Paiements Clients (période en cours)
  const clientPaymentsStats = useMemo(() => {
    const list = filteredPayments.filter((p) => p.contact_id && clientIds.has(String(p.contact_id)));
    const total = list.reduce((sum, p) => sum + toNumber(p.montant), 0);
    return { total, count: list.length };
  }, [filteredPayments, clientIds]);

  // Paiements Fournisseurs (période en cours)
  const fournisseurPaymentsStats = useMemo(() => {
    const list = filteredPayments.filter((p) => p.contact_id && fournisseurIds.has(String(p.contact_id)));
    const total = list.reduce((sum, p) => sum + toNumber(p.montant), 0);
    return { total, count: list.length };
  }, [filteredPayments, fournisseurIds]);

  // Statistiques séparées pour bons clients et fournisseurs
  const clientBonsStats = useMemo(() => {
    const total = bonsClients.reduce((sum, bon) => sum + toNumber(bon.montant), 0);
    return {
      count: bonsClients.length,
      total,
      byType: bonsClients.reduce((acc, bon) => {
        acc[bon.type] = (acc[bon.type] || 0) + toNumber(bon.montant);
        return acc;
      }, {} as Record<string, number>),
    };
  }, [bonsClients]);

  const fournisseurBonsStats = useMemo(() => {
    const total = bonsFournisseurs.reduce((sum, bon) => sum + toNumber(bon.montant), 0);
    return {
      count: bonsFournisseurs.length,
      total,
      byType: bonsFournisseurs.reduce((acc, bon) => {
        acc[bon.type] = (acc[bon.type] || 0) + toNumber(bon.montant);
        return acc;
      }, {} as Record<string, number>),
    };
  }, [bonsFournisseurs]);

  const vehiculeBonsStats = useMemo(() => {
    const total = bonsVehicules.reduce((sum, bon) => sum + toNumber(bon.montant), 0);
    return {
      count: bonsVehicules.length,
      total,
      byType: bonsVehicules.reduce((acc, bon) => {
        acc[bon.type] = (acc[bon.type] || 0) + toNumber(bon.montant);
        return acc;
      }, {} as Record<string, number>),
    };
  }, [bonsVehicules]);

  /** ---------- Agrégations globales ---------- */
  // Pour calcul du bénéfice net: 
  // REVENUS = Bons Clients (Sortie + Comptant) - Avoirs Clients
  // COÛTS = Commandes + Bons Véhicules + Paiements - Avoirs Fournisseurs
  const totalRevenus = useMemo(() => {
    const bonsClientsTotal = bonsClients.reduce((sum, bon) => sum + toNumber(bon.montant), 0);
    const avoirsClientsTotal = filteredAvoirsClient.reduce((sum, avoir) => sum + toNumber(avoir.montant), 0);
    return bonsClientsTotal - avoirsClientsTotal;
  }, [bonsClients, filteredAvoirsClient]);

  const totalCouts = useMemo(() => {
    const commandesTotal = bonsFournisseurs.reduce((sum, bon) => sum + toNumber(bon.montant), 0);
    const vehiculesTotal = bonsVehicules.reduce((sum, bon) => sum + toNumber(bon.montant), 0);
    const paymentsFournisseursTotal = fournisseurPaymentsStats.total;
    const avoirsFournisseursTotal = filteredAvoirsFournisseur.reduce((sum, avoir) => sum + toNumber(avoir.montant), 0);
    return commandesTotal + vehiculesTotal + paymentsFournisseursTotal - avoirsFournisseursTotal;
  }, [bonsFournisseurs, bonsVehicules, fournisseurPaymentsStats.total, filteredAvoirsFournisseur]);

  const beneficeNet = useMemo(() => totalRevenus - totalCouts, [totalRevenus, totalCouts]);

  // Pour compatibilité avec les autres sections (graphiques, etc.)
  const totalBons = useMemo(() => filteredBons.reduce((sum, bon) => sum + toNumber(bon.montant), 0), [filteredBons]);
  const totalPayments = useMemo(
    () => filteredPayments.reduce((sum, p) => sum + toNumber(p.montant), 0),
    [filteredPayments]
  );
  const bonsByType: Record<string, number> = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const b of filteredBons) acc[b.type] = (acc[b.type] || 0) + toNumber(b.montant);
    return acc;
  }, [filteredBons]);

  const paymentsByMode: Record<string, number> = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const p of filteredPayments) {
      const k = p.mode || "Autre";
      acc[k] = (acc[k] || 0) + toNumber(p.montant);
    }
    return acc;
  }, [filteredPayments]);

  const avoirsClientStats = useMemo(() => {
    const total = filteredAvoirsClient.reduce((sum, a) => sum + toNumber(a.montant), 0);
    return { total, count: filteredAvoirsClient.length };
  }, [filteredAvoirsClient]);

  const avoirsFournisseurStats = useMemo(() => {
    const total = filteredAvoirsFournisseur.reduce((sum, a) => sum + toNumber(a.montant), 0);
    return { total, count: filteredAvoirsFournisseur.length };
  }, [filteredAvoirsFournisseur]);

  /** ---------- Matrices détaillées: Produits ⇄ Clients ---------- */
  // detailed matrices moved; no need to prefilter bons for items here

  // matrices removed here; see StatsDetailPage

  /** ---------- Stats produits (items des bons comptant + sortie) ---------- */
  const productMetrics = useMemo(() => {
    const stats: Record<string, { totalVendu: number; chiffreAffaires: number }> = {};
    // Exclure les bons avec isNotCalculated = true
    const sourceBons = [...bonsComptant, ...bonsSortie].filter((bon: any) => !bon.isNotCalculated);

    for (const bon of sourceBons) {
  const items = parseBonItems(bon.items);

      for (const it of items) {
        const productId = String(it.product_id ?? it.id ?? "");
        if (!productId) continue;
        if (!stats[productId]) stats[productId] = { totalVendu: 0, chiffreAffaires: 0 };
        stats[productId].totalVendu += toNumber(it.quantite ?? it.qty ?? 0);
        const ligneTotal =
          it.total ?? it.montant ?? toNumber(it.prix ?? it.prix_vente ?? it.price) * toNumber(it.quantite ?? it.qty);
        stats[productId].chiffreAffaires += toNumber(ligneTotal);
      }
    }
    return stats;
  }, [bonsComptant, bonsSortie]);

  const topProducts = useMemo(() => {
    const rows = products.map((p: any) => {
      const id = String(p.id);
      return {
        ...p,
        totalVendu: productMetrics[id]?.totalVendu || 0,
        chiffreAffaires: productMetrics[id]?.chiffreAffaires || 0,
      };
    });
  const rowsSorted = [...rows].sort((a: any, b: any) => b.chiffreAffaires - a.chiffreAffaires);
  const safeLimit = Math.max(1, Math.min(100, Number(topProductsLimit) || 5));
  return rowsSorted.slice(0, safeLimit);
  }, [products, productMetrics, topProductsLimit]);

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
          <h2 className="text-2xl font-bold text-center mb-2">Page Rapports</h2>
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

  /** ---------- Export JSON ---------- */
  const handleExport = () => {
    const data = {
      periode: `${dateFrom || "Début"} - ${dateTo || "Fin"}`,
      filtreContact: contactType,
      typeRapport: reportType,
      // Ancien calcul (pour compatibilité)
      totalBons,
      totalPayments,
      // Nouveau calcul de bénéfice net
      totalRevenus,
      totalCouts,
      beneficeNet,
      // Détails
      clientBonsStats,
      fournisseurBonsStats,
      vehiculeBonsStats,
      avoirsClientStats,
      avoirsFournisseurStats,
      nombreBons: filteredBons.length,
      nombrePayments: filteredPayments.length,
      bonsByType,
      paymentsByMode,
      totalSoldeClients,
      totalSoldeFournisseurs,
    };
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** ---------- UI helpers ---------- */
  const ratio = (num: number, den: number) => (den > 0 ? Math.min(100, Math.max(0, (num / den) * 100)) : 0);

  /** ---------- Modales ---------- */
  const renderBonsDetailModal = () => {
    let bonsForModal: BonLite[];
    if (bonsModalScope === "clients") {
      bonsForModal = bonsClients;
    } else if (bonsModalScope === "fournisseurs") {
      bonsForModal = bonsFournisseurs;
    } else {
      bonsForModal = filteredBons;
    }

    const bonsByTypeModal: Record<string, number> = bonsForModal.reduce((acc, b) => {
      acc[b.type] = (acc[b.type] || 0) + toNumber(b.montant);
      return acc;
    }, {} as Record<string, number>);
    let titleSuffix = "";
    if (bonsModalScope === "clients") titleSuffix = " - Clients";
    else if (bonsModalScope === "fournisseurs") titleSuffix = " - Fournisseurs";

    const getTypeBadgeClass = (type: BonLite["type"]) => {
      switch (type) {
        case "Comptant":
          return "bg-green-200 text-green-700";
        case "Sortie":
          return "bg-purple-200 text-purple-700";
        default:
          return "bg-blue-200 text-blue-700";
      }
    };

    const getStatutBadgeClass = (statut: string) => {
      if (statut === "Validé") return "bg-green-200 text-green-700";
      if (statut === "Livré") return "bg-blue-200 text-blue-700";
      return "bg-yellow-200 text-yellow-700";
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="bg-blue-600 px-6 py-4 rounded-t-lg flex justify-between items-center">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText size={24} />
              Détails des Bons{titleSuffix} ({bonsForModal.length})
            </h2>
            <button
              onClick={() => {
                setSelectedDetailModal(null);
                setBonsModalScope("all");
              }}
              className="text-white hover:text-gray-200"
            >
              <X size={24} />
            </button>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {Object.entries(bonsByTypeModal).map(([type, montant]) => (
                <div key={type} className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900">{type}</h3>
                  <p className="text-2xl font-bold text-blue-600">{toNumber(montant).toFixed(2)} DH</p>
                  <p className="text-sm text-gray-500">{bonsForModal.filter((b) => b.type === type).length} bons</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Numéro</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date création</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {bonsForModal.map((bon) => (
                    <tr key={`${bon.type}-${bon.id}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{getBonNumeroDisplay({ id: bon.id, type: bon.type, numero: (bon as any).numero })}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeBadgeClass(bon.type)}`}>
                          {bon.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{bon.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{bon.date_creation ? formatDateTimeWithHour(bon.date_creation as string) : '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right">
                        {toNumber(bon.montant).toFixed(2)} DH
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatutBadgeClass(bon.statut)}`}>
                          {bon.statut}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPaymentsDetailModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="bg-green-600 px-6 py-4 rounded-t-lg flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <DollarSign size={24} />
            Détails des Paiements ({filteredPayments.length})
          </h2>
          <button onClick={() => setSelectedDetailModal(null)} className="text-white hover:text-gray-200">
            <X size={24} />
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {Object.entries(paymentsByMode).map(([mode, montant]) => (
              <div key={mode} className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900">{mode}</h3>
                <p className="text-2xl font-bold text-green-600">{toNumber(montant).toFixed(2)} DH</p>
                <p className="text-sm text-gray-500">
                  {filteredPayments.filter((p) => (p.mode || "Autre") === mode).length} paiements
                </p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Numéro</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mode</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date création</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{payment.numero}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right text-green-600">
                      {toNumber(payment.montant).toFixed(2)} DH
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-700">
                        {payment.mode || "Autre"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {payment.date_paiement ? formatDateTimeWithHour(payment.date_paiement) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderClientsDetailModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="bg-orange-600 px-6 py-4 rounded-t-lg flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={24} />
            Détails des Clients ({clients.length})
          </h2>
          <button onClick={() => setSelectedDetailModal(null)} className="text-white hover:text-gray-200">
            <X size={24} />
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900">Soldes Positifs</h3>
              <p className="text-2xl font-bold text-green-600">
                {clients.filter((c: any) => calculateClientTotalSolde(c) > 0).length}
              </p>
              <p className="text-sm text-gray-500">clients</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900">Soldes Négatifs</h3>
              <p className="text-2xl font-bold text-red-600">
                {clients.filter((c: any) => calculateClientTotalSolde(c) < 0).length}
              </p>
              <p className="text-sm text-gray-500">clients</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900">Solde Moyen</h3>
              <p className="text-2xl font-bold text-blue-600">
                {clients.length ? (totalSoldeClients / clients.length).toFixed(2) : "0.00"} DH
              </p>
              <p className="text-sm text-gray-500">par client</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Téléphone</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Solde</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Plafond</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date création</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {clients.slice(0, 50).map((client: any) => {
                  const soldeTotal = calculateClientTotalSolde(client);
                  return (
                    <tr key={client.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {client.nom_complet}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{client.telephone || "-"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right">
                        <span
                          className={(() => {
                            if (soldeTotal > 0) return "text-green-600";
                            if (soldeTotal < 0) return "text-red-600";
                            return "text-gray-900";
                          })()}
                        >
                          {soldeTotal.toFixed(2)} DH
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                        {client.plafond ? `${toNumber(client.plafond).toFixed(2)} DH` : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {client.date_creation ? formatDateTimeWithHour(client.date_creation) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {clients.length > 50 && (
              <div className="px-6 py-3 bg-gray-50 text-center text-sm text-gray-500">
                ... et {clients.length - 50} autres clients
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderFournisseursDetailModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="bg-red-600 px-6 py-4 rounded-t-lg flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={24} />
            Détails des Fournisseurs ({fournisseurs.length})
          </h2>
          <button onClick={() => setSelectedDetailModal(null)} className="text-white hover:text-gray-200">
            <X size={24} />
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900">À Payer (dettes)</h3>
              <p className="text-2xl font-bold text-red-600">
                {fournisseurs.filter((f: any) => calculateFournisseurTotalSolde(f) > 0).length}
              </p>
              <p className="text-sm text-gray-500">fournisseurs</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900">Avances</h3>
              <p className="text-2xl font-bold text-green-600">
                {fournisseurs.filter((f: any) => calculateFournisseurTotalSolde(f) < 0).length}
              </p>
              <p className="text-sm text-gray-500">fournisseurs</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900">Solde Moyen</h3>
              <p className="text-2xl font-bold text-blue-600">
                {fournisseurs.length ? (totalSoldeFournisseurs / fournisseurs.length).toFixed(2) : "0.00"} DH
              </p>
              <p className="text-sm text-gray-500">par fournisseur</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Téléphone</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Solde</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date création</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {fournisseurs.slice(0, 50).map((f: any) => {
                  const soldeTotal = calculateFournisseurTotalSolde(f);
                  return (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {f.nom_complet ?? f.raison_sociale ?? "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{f.telephone || "-"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right">
                        <span
                          className={(() => {
                            if (soldeTotal > 0) return "text-red-600";
                            if (soldeTotal < 0) return "text-green-600";
                            return "text-gray-900";
                          })()}
                        >
                          {soldeTotal.toFixed(2)} DH
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {f.date_creation ? formatDateTimeWithHour(f.date_creation) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {fournisseurs.length > 50 && (
              <div className="px-6 py-3 bg-gray-50 text-center text-sm text-gray-500">
                ... et {fournisseurs.length - 50} autres fournisseurs
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  /** ---------- Render ---------- */
  const handleCardClick = (type: "bons" | "payments" | "clients" | "benefice" | "fournisseurs") =>
    setSelectedDetailModal(type);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapports et Statistiques</h1>
          <p className="text-gray-600 mt-1">Analyse des données commerciales</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            <Download size={20} />
            Exporter
          </button>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="contactType" className="block text-sm font-medium text-gray-700 mb-1">
              Type de contact
            </label>
            <select
              id="contactType"
              value={contactType}
              onChange={(e) => setContactType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tous</option>
              <option value="clients">Clients uniquement</option>
              <option value="fournisseurs">Fournisseurs uniquement</option>
            </select>
          </div>

          <div>
            <label htmlFor="reportType" className="block text-sm font-medium text-gray-700 mb-1">
              Type de rapport
            </label>
            <select
              id="reportType"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="overview">Vue d'ensemble</option>
              <option value="sales">Ventes</option>
              <option value="payments">Paiements</option>
              <option value="products">Produits</option>
            </select>
          </div>
        </div>

        {/* Raccourcis */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              const today = new Date();
              const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
              setDateFrom(thisMonth.toISOString().split("T")[0]);
              setDateTo(today.toISOString().split("T")[0]);
            }}
            className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors text-sm"
          >
            Ce mois
          </button>
          <button
            onClick={() => {
              const today = new Date();
              const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
              const endLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
              setDateFrom(lastMonth.toISOString().split("T")[0]);
              setDateTo(endLastMonth.toISOString().split("T")[0]);
            }}
            className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-md transition-colors text-sm"
          >
            Mois dernier
          </button>
          <button
            onClick={() => {
              setDateFrom("2024-01-01");
              setDateTo("2024-12-31");
            }}
            className="px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-md transition-colors text-sm"
          >
            2024
          </button>
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors text-sm"
          >
            Toutes les dates
          </button>
        </div>
      </div>

      {/* Section Statistiques des Bons */}
      <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="text-purple-600" size={24} />
          Statistiques des Bons (Validés uniquement)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Bons Clients (Ventes) */}
          <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500">
            <h3 className="font-semibold text-green-900 mb-3">Bons Clients (Ventes)</h3>
            <p className="text-xs text-green-600 mb-2">Bons Sortie + Comptant</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-green-700">Nombre de bons:</span>
                <span className="font-semibold text-green-900">{clientBonsStats.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-green-700">Montant total:</span>
                <span className="font-semibold text-green-900">{clientBonsStats.total.toFixed(2)} DH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-green-700">Montant moyen:</span>
                <span className="font-semibold text-green-900">
                  {clientBonsStats.count > 0 ? (clientBonsStats.total / clientBonsStats.count).toFixed(2) : "0.00"} DH
                </span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-green-200">
              <h4 className="font-medium text-green-800 mb-2">Par type:</h4>
              {Object.entries(clientBonsStats.byType).map(([type, montant]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="text-green-700">{type}:</span>
                  <span className="font-medium text-green-900">{toNumber(montant).toFixed(2)} DH</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bons Fournisseurs (Achats) */}
          <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-500">
            <h3 className="font-semibold text-orange-900 mb-3">Bons Fournisseurs (Achats)</h3>
            <p className="text-xs text-orange-600 mb-2">Bons Commande uniquement</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-orange-700">Nombre de bons:</span>
                <span className="font-semibold text-orange-900">{fournisseurBonsStats.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-orange-700">Montant total:</span>
                <span className="font-semibold text-orange-900">{fournisseurBonsStats.total.toFixed(2)} DH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-orange-700">Montant moyen:</span>
                <span className="font-semibold text-orange-900">
                  {fournisseurBonsStats.count > 0
                    ? (fournisseurBonsStats.total / fournisseurBonsStats.count).toFixed(2)
                    : "0.00"}{" "}
                  DH
                </span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-orange-200">
              <h4 className="font-medium text-orange-800 mb-2">Par type:</h4>
              {Object.entries(fournisseurBonsStats.byType).map(([type, montant]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="text-orange-700">{type}:</span>
                  <span className="font-medium text-orange-900">{toNumber(montant).toFixed(2)} DH</span>
                </div>
              ))}
            </div>
          </div>
        </div>

  {/* Résumé global supprimé */}
      </div>

      {/* Statistiques des Avoirs (retours) */}
      <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="text-red-600" size={24} />
          Statistiques des Avoirs (Retours)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-500">
            <h3 className="font-semibold text-red-900 mb-3">Avoirs Clients</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-red-700">Nombre d'avoirs:</span>
                <span className="font-semibold text-red-900">{avoirsClientStats.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-red-700">Montant total:</span>
                <span className="font-semibold text-red-900">{avoirsClientStats.total.toFixed(2)} DH</span>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-500">
            <h3 className="font-semibold text-orange-900 mb-3">Avoirs Fournisseurs</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-orange-700">Nombre d'avoirs:</span>
                <span className="font-semibold text-orange-900">{avoirsFournisseurStats.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-orange-700">Montant total:</span>
                <span className="font-semibold text-orange-900">{avoirsFournisseurStats.total.toFixed(2)} DH</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Relations Commerciales */}
      <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="text-indigo-600" size={24} />
          Relations Commerciales - Vue d'ensemble
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Clients */}
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
            <h3 className="font-semibold text-blue-900 mb-3">Clients</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-blue-700">Nombre:</span>
                <span className="font-semibold text-blue-900">{clients.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-blue-700">Ventes (période):</span>
                <span className="font-semibold text-blue-900">{clientBonsStats.total.toFixed(2)} DH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-blue-700">Paiements (période):</span>
                <span className="font-semibold text-blue-900">{clientPaymentsStats.total.toFixed(2)} DH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-blue-700">Solde total:</span>
                <span className={`font-semibold ${totalSoldeClients >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {totalSoldeClients.toFixed(2)} DH
                </span>
              </div>
            </div>
          </div>

          {/* Fournisseurs */}
          <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-500">
            <h3 className="font-semibold text-orange-900 mb-3">Fournisseurs</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-orange-700">Nombre:</span>
                <span className="font-semibold text-orange-900">{fournisseurs.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-orange-700">Achats (période):</span>
                <span className="font-semibold text-orange-900">{fournisseurBonsStats.total.toFixed(2)} DH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-orange-700">Paiements (période):</span>
                <span className="font-semibold text-orange-900">{fournisseurPaymentsStats.total.toFixed(2)} DH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-orange-700">Solde total:</span>
                <span className={`font-semibold ${totalSoldeFournisseurs >= 0 ? "text-red-600" : "text-green-600"}`}>
                  {totalSoldeFournisseurs.toFixed(2)} DH
                </span>
              </div>
            </div>
          </div>

          {/* Flux de trésorerie */}
          <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500">
            <h3 className="font-semibold text-green-900 mb-3">Flux de Trésorerie</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-green-700">Entrées (clients):</span>
                <span className="font-semibold text-green-900">+{clientPaymentsStats.total.toFixed(2)} DH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-green-700">Sorties (fournisseurs):</span>
                <span className="font-semibold text-red-600">-{fournisseurPaymentsStats.total.toFixed(2)} DH</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-sm font-medium text-green-700">Flux net:</span>
                <span className={`font-bold ${(clientPaymentsStats.total - fournisseurPaymentsStats.total) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {(clientPaymentsStats.total - fournisseurPaymentsStats.total).toFixed(2)} DH
                </span>
              </div>
            </div>
          </div>

          {/* Indicateurs de performance */}
          <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-500">
            <h3 className="font-semibold text-purple-900 mb-3">Performance</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-purple-700">Marge bénéficiaire:</span>
                <span className={`font-semibold ${beneficeNet >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {totalRevenus > 0 ? ((beneficeNet / totalRevenus) * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-purple-700">Ratio créances/dettes:</span>
                <span className="font-semibold text-purple-900">
                  {totalSoldeFournisseurs !== 0 ? (totalSoldeClients / Math.abs(totalSoldeFournisseurs)).toFixed(2) : "∞"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-purple-700">Évolution trésorerie:</span>
                <span className={`font-semibold ${(clientPaymentsStats.total - fournisseurPaymentsStats.total) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {(clientPaymentsStats.total - fournisseurPaymentsStats.total) >= 0 ? "↗ Positif" : "↘ Négatif"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Section Clients - À recevoir */}
      <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="text-blue-600" size={24} />
          Rapport Clients - À Recevoir
        </h2>
        {/* Sous-section: À Recevoir */}
        <h3 className="text-lg font-semibold text-gray-900 mb-3">À Recevoir</h3>
  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Total à Recevoir</h3>
            <p className={`text-3xl font-bold mb-2 ${totalSoldeClients >= 0 ? "text-blue-600" : "text-red-600"}`}>
              {totalSoldeClients.toFixed(2)} DH
            </p>
            <p className="text-sm text-gray-600">{clients.length} clients</p>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold text-green-900 mb-2">Créances Positives</h3>
            <p className="text-2xl font-bold text-green-600 mb-2">
              {clients.filter((c: any) => calculateClientTotalSolde(c) > 0).length}
            </p>
            <p className="text-sm text-gray-600">clients nous doivent</p>
          </div>

          <div className="bg-red-50 p-4 rounded-lg">
            <h3 className="font-semibold text-red-900 mb-2">Crédits Client</h3>
            <p className="text-2xl font-bold text-red-600 mb-2">
              {clients.filter((c: any) => calculateClientTotalSolde(c) < 0).length}
            </p>
            <p className="text-sm text-gray-600">clients en crédit</p>
          </div>

          <button
            type="button"
            className="bg-gray-50 p-4 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors text-left"
            onClick={() => handleCardClick("clients")}
          >
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              Détail Clients <Eye className="h-4 w-4" />
            </h3>
            <p className="text-2xl font-bold text-gray-700 mb-2">
              {clients.length ? (totalSoldeClients / clients.length).toFixed(2) : "0.00"}
            </p>
            <p className="text-sm text-gray-600">DH en moyenne</p>
          </button>
        </div>

        {/* Sous-section: Paiements */}
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Paiements</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-teal-50 p-4 rounded-lg">
            <h3 className="font-semibold text-teal-900 mb-2">Paiements Clients (période)</h3>
            <p className="text-3xl font-bold text-teal-600 mb-2">{clientPaymentsStats.total.toFixed(2)} DH</p>
            <p className="text-sm text-gray-600">{clientPaymentsStats.count} paiements</p>
          </div>

          <div className="bg-orange-50 p-4 rounded-lg">
            <h3 className="font-semibold text-orange-900 mb-2">Paiements Fournisseurs (période)</h3>
            <p className="text-3xl font-bold text-orange-600 mb-2">{fournisseurPaymentsStats.total.toFixed(2)} DH</p>
            <p className="text-sm text-gray-600">{fournisseurPaymentsStats.count} paiements</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-2">Solde Net des Relations</h3>
            <p className={`text-3xl font-bold mb-2 ${totalSoldeClients - totalSoldeFournisseurs >= 0 ? "text-green-600" : "text-red-600"}`}>
              {(totalSoldeClients - totalSoldeFournisseurs).toFixed(2)} DH
            </p>
            <p className="text-sm text-gray-600">Clients - Fournisseurs</p>
          </div>
        </div>
      </div>

      {/* Section Fournisseurs - À payer */}
      <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="text-red-600" size={24} />
          Rapport Fournisseurs - À Payer
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-red-50 p-4 rounded-lg">
            <h3 className="font-semibold text-red-900 mb-2">Total à Payer</h3>
            <p className={`text-3xl font-bold mb-2 ${totalSoldeFournisseurs >= 0 ? "text-red-600" : "text-green-600"}`}>
              {totalSoldeFournisseurs.toFixed(2)} DH
            </p>
            <p className="text-sm text-gray-600">{fournisseurs.length} fournisseurs</p>
          </div>

          <div className="bg-orange-50 p-4 rounded-lg">
            <h3 className="font-semibold text-orange-900 mb-2">Dettes</h3>
            <p className="text-2xl font-bold text-orange-600 mb-2">
              {fournisseurs.filter((f: any) => calculateFournisseurTotalSolde(f) > 0).length}
            </p>
            <p className="text-sm text-gray-600">fournisseurs à payer</p>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold text-green-900 mb-2">Avances</h3>
            <p className="text-2xl font-bold text-green-600 mb-2">
              {fournisseurs.filter((f: any) => calculateFournisseurTotalSolde(f) < 0).length}
            </p>
            <p className="text-sm text-gray-600">avances fournisseurs</p>
          </div>

          <button
            type="button"
            className="bg-gray-50 p-4 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors text-left"
            onClick={() => handleCardClick("fournisseurs")}
          >
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              Détail Fournisseurs <Eye className="h-4 w-4" />
            </h3>
            <p className="text-2xl font-bold text-gray-700 mb-2">
              {fournisseurs.length ? (totalSoldeFournisseurs / fournisseurs.length).toFixed(2) : "0.00"}
            </p>
            <p className="text-sm text-gray-600">DH en moyenne</p>
          </button>
        </div>
      </div>

      {/* Cartes résumé des transactions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        {/* Bons Clients (Sortie + Comptant) */}
        <button
          type="button"
          className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer transform hover:scale-105 text-left"
          onClick={() => {
            setBonsModalScope("clients");
            handleCardClick("bons");
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-full">
                <FileText className="text-blue-600" size={24} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Bons Clients</p>
                <p className="text-2xl font-bold text-gray-900">{clientBonsStats.total.toFixed(2)} DH</p>
                <p className="text-sm text-gray-500">{clientBonsStats.count} bons</p>
              </div>
            </div>
            <Eye className="text-gray-400" size={20} />
          </div>
  </button>

        {/* Bons Fournisseurs (Commandes) */}
        <button
          type="button"
          className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer transform hover:scale-105 text-left"
          onClick={() => {
            setBonsModalScope("fournisseurs");
            handleCardClick("bons");
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-orange-100 rounded-full">
                <FileText className="text-orange-600" size={24} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Bons Fournisseurs</p>
                <p className="text-2xl font-bold text-gray-900">{fournisseurBonsStats.total.toFixed(2)} DH</p>
                <p className="text-sm text-gray-500">{fournisseurBonsStats.count} bons</p>
              </div>
            </div>
            <Eye className="text-gray-400" size={20} />
          </div>
  </button>

  <button
          type="button"
          className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer transform hover:scale-105 text-left"
          onClick={() => handleCardClick("payments")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-full">
                <DollarSign className="text-green-600" size={24} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Paiements</p>
                <p className="text-2xl font-bold text-gray-900">{totalPayments.toFixed(2)} DH</p>
                <p className="text-sm text-gray-500">{filteredPayments.length} paiements</p>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs text-teal-600">Clients: {clientPaymentsStats.total.toFixed(0)} DH</span>
                  <span className="text-xs text-orange-600">Fourn: {fournisseurPaymentsStats.total.toFixed(0)} DH</span>
                </div>
              </div>
            </div>
            <Eye className="text-gray-400" size={20} />
          </div>
  </button>

  <button
          type="button"
          className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer transform hover:scale-105 text-left"
          onClick={() => handleCardClick("benefice")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 rounded-full">
                <BarChart3 className="text-purple-600" size={24} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Bénéfice Net</p>
                <p className={`text-2xl font-bold ${beneficeNet >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {beneficeNet.toFixed(2)} DH
                </p>
                <p className="text-sm text-gray-500">
                  {totalRevenus > 0 ? ((beneficeNet / totalRevenus) * 100).toFixed(1) : "0.0"}% marge
                </p>
              </div>
            </div>
            <Eye className="text-gray-400" size={20} />
          </div>
  </button>
      </div>

      {/* Graphiques simples (barres horizontales) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center gap-2 mb-4">
            <PieChart size={20} className="text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900">Répartition par Type de Bon</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(bonsByType).map(([type, montant]) => (
              <div key={type} className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{type}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${ratio(toNumber(montant), totalBons)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-20 text-right">
                    {toNumber(montant).toFixed(0)} DH
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={20} className="text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900">Modes de Paiement</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(paymentsByMode).map(([mode, montant]) => (
              <div key={mode} className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{mode}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${ratio(toNumber(montant), totalPayments)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-20 text-right">
                    {toNumber(montant).toFixed(0)} DH
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top produits */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
            <Activity size={20} className="text-gray-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                Top {Math.max(1, Math.min(100, Number(topProductsLimit) || 5))} Produits
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="top-products-limit" className="text-sm text-gray-600">
                Nombre:
              </label>
              <input
                id="top-products-limit"
                type="number"
                min={1}
                max={100}
                value={topProductsLimit}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setTopProductsLimit(Number.isFinite(n) ? n : 5);
                }}
                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Produit
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantité Vendue
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prix Unitaire
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Chiffre d'Affaires
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stock Restant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date création
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {topProducts.map((product: any, index: number) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-xs font-bold text-gray-600">#{index + 1}</span>
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {product.designation ?? product.name ?? "-"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.reference ?? product.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {toNumber(product.totalVendu)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {toNumber(product.prix_vente ?? product.price).toFixed(2)} DH
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600 text-right">
                    {toNumber(product.chiffreAffaires).toFixed(2)} DH
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    {(() => {
                      const qty = toNumber(product.quantite ?? product.stock);
                      let colorClass = "bg-red-100 text-red-800";
                      if (qty > 10) colorClass = "bg-green-100 text-green-800";
                      else if (qty > 5) colorClass = "bg-yellow-100 text-yellow-800";
                      return (
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colorClass}`}>
                          {qty}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {product.date_creation ? formatDateTimeWithHour(product.date_creation) : '-'}
                  </td>
                </tr>
              ))}
              {topProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                    Aucun produit à afficher.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modales */}
      {selectedDetailModal === "bons" && renderBonsDetailModal()}
      {selectedDetailModal === "payments" && renderPaymentsDetailModal()}
      {selectedDetailModal === "clients" && renderClientsDetailModal()}
      {selectedDetailModal === "fournisseurs" && renderFournisseursDetailModal()}
      {selectedDetailModal === "benefice" && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="bg-purple-600 px-6 py-4 rounded-t-lg flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp size={24} />
                Analyse du Bénéfice Net
              </h2>
              <button onClick={() => setSelectedDetailModal(null)} className="text-white hover:text-gray-200">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-green-50 rounded-lg p-4">
                  <h3 className="font-semibold text-green-900 mb-2">Revenus Net</h3>
                  <p className="text-3xl font-bold text-green-600 mb-2">{totalRevenus.toFixed(2)} DH</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Bons Clients:</span>
                      <span className="font-semibold">{clientBonsStats.total.toFixed(2)} DH</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">- Avoirs Clients:</span>
                      <span className="font-semibold text-red-600">-{avoirsClientStats.total.toFixed(2)} DH</span>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 rounded-lg p-4">
                  <h3 className="font-semibold text-red-900 mb-2">Coûts Total</h3>
                  <p className="text-3xl font-bold text-red-600 mb-2">{totalCouts.toFixed(2)} DH</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Commandes:</span>
                      <span className="font-semibold">{fournisseurBonsStats.total.toFixed(2)} DH</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Paiements Fournisseurs:</span>
                      <span className="font-semibold">{fournisseurPaymentsStats.total.toFixed(2)} DH</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">- Avoirs Fournisseurs:</span>
                      <span className="font-semibold text-green-600">-{avoirsFournisseurStats.total.toFixed(2)} DH</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-6 text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Bénéfice Net</h3>
                  <p className={`text-4xl font-bold mb-2 ${beneficeNet > 0 ? "text-green-600" : "text-red-600"}`}>
                    {beneficeNet.toFixed(2)} DH
                  </p>
                  <p className="text-sm text-gray-600">
                    Marge: {totalRevenus > 0 ? ((beneficeNet / totalRevenus) * 100).toFixed(1) : "0.0"}%
                  </p>
                  <div className="mt-4">
                    {beneficeNet > 0 ? (
                      <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        ✓ Bénéfice Positif
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-red-100 text-red-800">
                        ⚠ Perte
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-3">Détail du Calcul</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700"><strong>Revenus:</strong></span>
                    <span className="font-semibold text-green-600">{totalRevenus.toFixed(2)} DH</span>
                  </div>
                  <div className="flex justify-between pl-4">
                    <span className="text-gray-600">• Sortie: {clientBonsStats.byType.Sortie ? toNumber(clientBonsStats.byType.Sortie).toFixed(2) : "0.00"} DH</span>
                  </div>
                  <div className="flex justify-between pl-4">
                    <span className="text-gray-600">• Comptant: {clientBonsStats.byType.Comptant ? toNumber(clientBonsStats.byType.Comptant).toFixed(2) : "0.00"} DH</span>
                  </div>
                  <div className="flex justify-between pl-4">
                    <span className="text-gray-600">• Moins Avoirs Clients: -{avoirsClientStats.total.toFixed(2)} DH</span>
                  </div>
                  
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-700"><strong>Coûts:</strong></span>
                    <span className="font-semibold text-red-600">{totalCouts.toFixed(2)} DH</span>
                  </div>
                  <div className="flex justify-between pl-4">
                    <span className="text-gray-600">• Commandes: {fournisseurBonsStats.total.toFixed(2)} DH</span>
                  </div>
                  <div className="flex justify-between pl-4">
                    <span className="text-gray-600">• Paiements Fournisseurs: {fournisseurPaymentsStats.total.toFixed(2)} DH</span>
                  </div>
                  <div className="flex justify-between pl-4">
                    <span className="text-gray-600">• Moins Avoirs Fournisseurs: -{avoirsFournisseurStats.total.toFixed(2)} DH</span>
                  </div>
                  
                  <div className="flex justify-between border-t pt-2 font-bold">
                    <span className="text-gray-900">Résultat Net (Revenus - Coûts):</span>
                    <span className={beneficeNet >= 0 ? "text-green-600" : "text-red-600"}>{beneficeNet.toFixed(2)} DH</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;