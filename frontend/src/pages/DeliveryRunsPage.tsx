import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Plus,
  Truck,
  X,
  Package,
  Car,
  Filter,
  Search,
  ShieldCheck,
  CircleAlert,
  RotateCcw,
  Route,
  type LucideIcon,
} from "lucide-react";
import SearchableSelect from "../components/SearchableSelect";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { showSuccess } from "../utils/notifications";
import {
  useDeliveryAccessQuery,
  useDeliveryPermissionsQuery,
  useSetDeliveryPermissionMutation,
  useDeliveryResourcesQuery,
  useDeliveryBonsQuery,
  useDeliveryQueueQuery,
  useRemoveDeliveryQueueMutation,
  useDeliveryRunsQuery,
  useStartDeliveryMutation,
  useFinishDeliveryMutation,
  useDeliveryStatsQuery,
  type DeliveryBon,
  type DeliveryRun,
  type DeliveryFilters,
} from "../store/api/deliveryRunsApi";

const input =
  "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${button} !border-blue-600 !bg-blue-600 !text-white hover:!bg-blue-700`;
const panel = "min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm";
const tableClass =
  "w-full text-left text-sm [&_thead]:bg-slate-50 [&_thead]:text-xs [&_thead]:text-slate-500 [&_th]:font-semibold [&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-4 [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-slate-50/80";
const polling = { pollingInterval: 30000, refetchOnFocus: true };
const keyOf = (b: DeliveryBon) => `${b.bon_type}:${b.bon_id}`;
const dateTime = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const duration = (minutes: number | null | undefined) =>
  minutes == null
    ? "—"
    : `${Math.floor(Number(minutes) / 60)} h ${Math.floor(Number(minutes) % 60)
        .toString()
        .padStart(2, "0")}`;
const errorMessage = (error: unknown) => {
  const e = error as {
    data?: { message?: string; error?: string };
    message?: string;
  };
  return (
    e?.data?.message ||
    e?.data?.error ||
    e?.message ||
    "Impossible de réaliser cette opération. Réessayez."
  );
};
function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      {errorMessage(error)}
      {retry && (
        <button className={`${button} ml-3`} onClick={retry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      <span className="rounded-xl bg-slate-100 p-3 text-slate-400">
        <Package size={24} />
      </span>
      <p className="max-w-md text-sm leading-6 text-slate-500">{children}</p>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: LucideIcon;
  tone?: "blue" | "teal" | "amber" | "slate";
}) {
  const color = {
    blue: "bg-blue-50 text-blue-700",
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  }[tone];
  return (
    <div className={`${panel} p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-2">
        <dt className="text-xs font-medium text-slate-600 sm:text-sm">
          {label}
        </dt>
        <span className={`rounded-lg p-2 ${color}`}>
          <Icon size={18} />
        </span>
      </div>
      <dd className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </dd>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}
function PageHeader({
  stats = false,
  children,
}: {
  stats?: boolean;
  children: ReactNode;
}) {
  return (
    <header className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
          <Truck size={15} />
          Opérations · Livraison
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {stats ? "Performance des livraisons" : "Livraisons"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {stats
            ? "Comprenez les résultats de vos tournées pour améliorer le service."
            : "Du bon à préparer au retour du chauffeur, tout est ici."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </header>
  );
}
function Gate({ children }: { children: (pdg: boolean) => ReactNode }) {
  const access = useDeliveryAccessQuery(undefined, polling);
  if (access.isLoading) return <Empty>Vérification de votre accès…</Empty>;
  if (access.isError)
    return <ErrorBox error={access.error} retry={access.refetch} />;
  if (!access.currentData?.allowed)
    return (
      <Empty>
        Accès réservé au PDG et aux employés autorisés. Contactez votre
        responsable.
      </Empty>
    );
  return <>{children(access.currentData.pdg)}</>;
}
function Badge({ status }: { status: string }) {
  const active = status === "in_progress";
  const completed = status === "completed" || status === "delivered";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold ${active ? "bg-blue-50 text-blue-800" : completed ? "bg-teal-50 text-teal-800" : status === "failed" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {active
        ? "En route"
        : status === "completed"
          ? "Terminée"
          : status === "delivered"
            ? "Livré"
            : status === "failed"
              ? "Non livré"
              : "En attente"}
    </span>
  );
}
function ResourcesFilters({
  value,
  onChange,
}: {
  value: DeliveryFilters;
  onChange: (v: DeliveryFilters) => void;
}) {
  const resources = useDeliveryResourcesQuery(undefined, polling);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm">
          Du
          <input
            aria-label="Date de départ minimale"
            type="date"
            className={input}
            value={value.from || ""}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm">
          Au
          <input
            aria-label="Date de départ maximale"
            type="date"
            className={input}
            value={value.to || ""}
            min={value.from}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </label>
        <div className="space-y-1 text-sm">
          <label htmlFor="filter-driver">Chauffeur</label>
          <SearchableSelect
            id="filter-driver"
            minSearchLength={0}
            placeholder="Tous les chauffeurs"
            value={value.chauffeur_id || ""}
            onChange={(v) => onChange({ ...value, chauffeur_id: v })}
            options={[
              { value: "", label: "Tous les chauffeurs" },
              ...(resources.data?.drivers || []).map((d) => ({
                value: String(d.id),
                label: d.nom_complet,
              })),
            ]}
          />
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor="filter-vehicle">Véhicule</label>
          <SearchableSelect
            id="filter-vehicle"
            minSearchLength={0}
            placeholder="Tous les véhicules"
            value={value.vehicule_id || ""}
            onChange={(v) => onChange({ ...value, vehicule_id: v })}
            options={[
              { value: "", label: "Tous les véhicules" },
              ...(resources.data?.vehicles || []).map((v) => ({
                value: String(v.id),
                label: v.nom,
              })),
            ]}
          />
        </div>
      </div>
      {resources.isError && (
        <ErrorBox error={resources.error} retry={resources.refetch} />
      )}
    </>
  );
}
function NewDelivery({
  initial,
  onClose,
}: {
  initial: DeliveryBon[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(initial);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [start, mutation] = useStartDeliveryMutation();
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const bons = useDeliveryBonsQuery({ q, type });
  const resources = useDeliveryResourcesQuery(undefined, polling);
  const toggle = (bon: DeliveryBon) =>
    setSelected((s) =>
      s.some((b) => keyOf(b) === keyOf(bon))
        ? s.filter((b) => keyOf(b) !== keyOf(bon))
        : [...s, bon],
    );
  const availableDriver = resources.data?.drivers.find(
    (d) => String(d.id) === driver && !Number(d.busy),
  );
  const availableVehicle = resources.data?.vehicles.find(
    (v) => String(v.id) === vehicle && !Number(v.busy),
  );
  // Le chauffeur est facultatif : seul un chauffeur choisi mais indisponible bloque.
  const ready =
    selected.length > 0 &&
    selected.length <= 100 &&
    (!driver || availableDriver) &&
    availableVehicle &&
    !mutation.isLoading &&
    !resources.isError &&
    !resources.isLoading;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isLoading) onClose();
      }}
    >
      <DialogContent
        className="max-h-[92vh] w-[calc(100%-1.5rem)] max-w-3xl overflow-y-auto rounded-xl border-slate-200 bg-slate-50 p-4 sm:p-6"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-slate-900">
            <Truck size={22} className="text-blue-600" />
            Nouvelle livraison
          </DialogTitle>
          <DialogDescription>
            Regroupez les bons, choisissez un véhicule — et un chauffeur si
            vous en connaissez déjà un — puis démarrez la tournée.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!ready) return;
            setError(null);
            try {
              await start({
                chauffeur_id: driver ? Number(driver) : null,
                vehicule_id: Number(vehicle),
                bons: selected.map(({ bon_id, bon_type }) => ({
                  bon_id,
                  bon_type,
                })),
                notes,
              }).unwrap();
              void showSuccess("Livraison démarrée");
              onClose();
            } catch (err) {
              setError(err);
            }
          }}
        >
          <fieldset
            disabled={mutation.isLoading}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <legend className="px-2 text-sm font-semibold text-blue-800">
              1. Bons à livrer
            </legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <label className="sr-only" htmlFor="delivery-bon-search">
                Rechercher les bons
              </label>
              <input
                id="delivery-bon-search"
                autoComplete="off"
                className={input}
                placeholder="Numéro, série, client… plusieurs mots possibles"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Type de bon"
                className={input}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Tous les types</option>
                {bons.data?.types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
              <p className="mb-2 text-xs font-semibold text-blue-900">
                Sélection · {selected.length} / 100 bons
              </p>
              {selected.length === 0 && (
                <p className="text-xs text-slate-500">
                  Choisissez un ou plusieurs bons dans les résultats ci-dessous.
                </p>
              )}
              <div
                className="flex flex-wrap gap-2"
                aria-label="Bons sélectionnés"
              >
                {selected.map((b) => (
                  <button
                    key={keyOf(b)}
                    type="button"
                    onClick={() => toggle(b)}
                    className="inline-flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-sm text-blue-900"
                    aria-label={`Retirer ${b.numero} (${b.bon_type})`}
                  >
                    {b.numero} · {b.bon_type}
                    <X size={14} />
                  </button>
                ))}
              </div>
            </div>
            {selected.length > 100 && (
              <p role="alert" className="text-sm text-rose-700">
                Une livraison peut contenir 100 bons maximum. Retirez des bons
                pour continuer.
              </p>
            )}
            <div
              className="max-h-56 overflow-y-auto rounded-md border border-slate-200"
              aria-busy={bons.isFetching}
            >
              {bons.isError ? (
                <ErrorBox error={bons.error} retry={bons.refetch} />
              ) : bons.isFetching ? (
                <Empty>Recherche des bons…</Empty>
              ) : !bons.data?.items.length ? (
                <Empty>Aucun bon disponible pour cette recherche.</Empty>
              ) : (
                bons.data.items.map((b) => (
                  <label
                    key={keyOf(b)}
                    className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-3 text-sm last:border-0 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.some((s) => keyOf(s) === keyOf(b))}
                      onChange={() => toggle(b)}
                      className="rounded border-slate-300"
                    />
                    <span className="min-w-0 flex-1">
                      <strong>{b.numero}</strong>
                      <span className="ml-2 text-slate-500">{b.bon_type}</span>
                      <span className="block truncate text-slate-600">
                        {b.contact_nom || "Sans contact"}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-slate-500">
              {selected.length} bon(s) sélectionné(s). Jusqu’à 80 résultats par
              type : précisez la recherche si nécessaire.
            </p>
          </fieldset>
          <fieldset
            disabled={mutation.isLoading}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <legend className="px-2 text-sm font-semibold text-blue-800">
              2. Équipe et véhicule
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 text-sm">
                <label htmlFor="delivery-driver">
                  Chauffeur{" "}
                  <span className="text-slate-500">(facultatif)</span>
                </label>
                <SearchableSelect
                  id="delivery-driver"
                  minSearchLength={0}
                  disabled={mutation.isLoading || resources.isLoading}
                  placeholder="Sans chauffeur"
                  value={driver}
                  onChange={setDriver}
                  options={[
                    { value: "", label: "Sans chauffeur" },
                    ...(resources.data?.drivers || []).map((d) => ({
                      value: String(d.id),
                      label: `${d.nom_complet}${Number(d.busy) ? " · En livraison" : ""}`,
                      disabled: Boolean(Number(d.busy)),
                    })),
                  ]}
                />
                {!driver && (
                  <p className="text-xs text-slate-500">
                    La tournée démarre sans chauffeur assigné.
                  </p>
                )}
              </div>
              <div className="space-y-1 text-sm">
                <label htmlFor="delivery-vehicle">Véhicule *</label>
                <SearchableSelect
                  id="delivery-vehicle"
                  minSearchLength={0}
                  disabled={mutation.isLoading || resources.isLoading}
                  placeholder="Rechercher un véhicule"
                  value={vehicle}
                  onChange={setVehicle}
                  options={(resources.data?.vehicles || []).map((v) => ({
                    value: String(v.id),
                    label: `${v.nom}${Number(v.busy) ? " · En livraison" : ""}`,
                    disabled: Boolean(Number(v.busy)),
                  }))}
                />
              </div>
            </div>
            {resources.isError && (
              <ErrorBox error={resources.error} retry={resources.refetch} />
            )}
            {resources.data && !resources.data.vehicles.length && (
              <p className="text-sm text-amber-800">
                Un véhicule doit être créé avant de démarrer une livraison.
              </p>
            )}
            <label className="block space-y-1 text-sm">
              <span>Instructions / notes (facultatif)</span>
              <textarea
                className={input}
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </fieldset>
          {error != null && <ErrorBox error={error} />}
          <footer className="sticky -bottom-4 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:-bottom-6 sm:-mx-6 sm:px-6">
            <p className="text-xs text-slate-500">
              La date de départ sera enregistrée au démarrage.
            </p>
            <div className="flex gap-2">
              <button
                className={button}
                disabled={mutation.isLoading}
                type="button"
                onClick={onClose}
              >
                Annuler
              </button>
              <button className={primary} disabled={!ready} type="submit">
                <Truck size={16} />
                {mutation.isLoading ? "Démarrage…" : "Démarrer la livraison"}
              </button>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function FinishDelivery({
  run,
  onClose,
}: {
  run: DeliveryRun;
  onClose: () => void;
}) {
  const [results, setResults] = useState(
    run.items.map((i) => ({
      queue_id: i.queue_id,
      outcome: "delivered",
      failure_reason: "",
    })),
  );
  const [finish, mutation] = useFinishDeliveryMutation();
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !mutation.isLoading) onClose();
      }}
    >
      <DialogContent
        className="max-h-[92vh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-xl border-slate-200 bg-slate-50 p-4 sm:p-6"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Terminer la livraison #{run.id}</DialogTitle>
          <DialogDescription>
            {run.chauffeur_nom || "Sans chauffeur"} · {run.vehicule_nom}.
            Confirmez le résultat de
            chaque bon au retour.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (mutation.isLoading) return;
            setError(null);
            try {
              await finish({ id: run.id, results }).unwrap();
              void showSuccess("Livraison terminée");
              onClose();
            } catch (err) {
              setError(err);
            }
          }}
        >
          {run.items.map((item, index) => (
            <fieldset
              key={item.queue_id}
              disabled={mutation.isLoading}
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <legend className="px-1 text-sm font-semibold">
                {item.numero} · {item.bon_type}
              </legend>
              <select
                aria-label={`Résultat de ${item.numero}`}
                className={input}
                value={results[index].outcome}
                onChange={(e) =>
                  setResults((s) =>
                    s.map((r, i) =>
                      i === index
                        ? { ...r, outcome: e.target.value, failure_reason: "" }
                        : r,
                    ),
                  )
                }
              >
                <option value="delivered">Livré</option>
                <option value="failed">Non livré — à reprogrammer</option>
              </select>
              {results[index].outcome === "failed" && (
                <label className="block text-sm">
                  Motif obligatoire
                  <input
                    required
                    maxLength={500}
                    className={`${input} mt-1`}
                    value={results[index].failure_reason}
                    onChange={(e) =>
                      setResults((s) =>
                        s.map((r, i) =>
                          i === index
                            ? { ...r, failure_reason: e.target.value }
                            : r,
                        ),
                      )
                    }
                    placeholder="Client absent, adresse introuvable…"
                  />
                </label>
              )}
            </fieldset>
          ))}
          <p className="text-sm text-slate-600">
            La date de retour sera enregistrée. Les bons non livrés retourneront
            dans la file d’attente.
          </p>
          {error != null && <ErrorBox error={error} />}
          <div className="sticky -bottom-4 z-20 -mx-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-4 py-4 sm:-bottom-6 sm:-mx-6 sm:px-6">
            <button
              className={button}
              type="button"
              disabled={mutation.isLoading}
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              className={primary}
              type="submit"
              disabled={
                mutation.isLoading ||
                results.some(
                  (r) => r.outcome === "failed" && !r.failure_reason.trim(),
                )
              }
            >
              {mutation.isLoading ? "Enregistrement…" : "Confirmer le retour"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function Permissions() {
  const query = useDeliveryPermissionsQuery();
  const [setPermission, mutation] = useSetDeliveryPermissionMutation();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<unknown>(null);
  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-600">
        Ces employés pourront préparer, démarrer et terminer les livraisons, et
        consulter les statistiques.
      </p>
      <input
        aria-label="Rechercher un employé autorisé"
        className={input}
        placeholder="Rechercher un employé…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {query.isLoading ? (
        <Empty>Chargement des employés…</Empty>
      ) : query.isError ? (
        <ErrorBox error={query.error} retry={query.refetch} />
      ) : (
        <div className="max-h-72 overflow-y-auto">
          {query.data
            ?.filter((e) =>
              e.nom_complet
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase()),
            )
            .map((e) => (
              <label
                key={e.id}
                className="flex items-center gap-3 border-b border-slate-100 py-3 text-sm"
              >
                <input
                  type="checkbox"
                  disabled={mutation.isLoading || query.isFetching}
                  checked={Boolean(Number(e.allowed))}
                  onChange={async (event) => {
                    setError(null);
                    try {
                      await setPermission({
                        id: e.id,
                        allowed: event.target.checked,
                      }).unwrap();
                    } catch (err) {
                      setError(err);
                    }
                  }}
                />
                <span>
                  {e.nom_complet}
                  <span className="ml-2 text-xs text-slate-500">{e.role}</span>
                </span>
              </label>
            ))}
        </div>
      )}
      {error != null && <ErrorBox error={error} />}
    </section>
  );
}
function Management({ pdg }: { pdg: boolean }) {
  const queue = useDeliveryQueueQuery(undefined, polling);
  const [filters, setFilters] = useState<DeliveryFilters>({});
  const [page, setPage] = useState(1);
  const runs = useDeliveryRunsQuery({ ...filters, page }, polling);
  const [remove, removing] = useRemoveDeliveryQueueMutation();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DeliveryBon[]>([]);
  const [initial, setInitial] = useState<DeliveryBon[] | null>(null);
  const [finishRun, setFinishRun] = useState<DeliveryRun | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const selectedWaiting = selected.filter((b) =>
    queue.data?.some((q) => keyOf(q) === keyOf(b) && q.status === "waiting"),
  );
  const filteredQueue = (queue.data || []).filter((b) =>
    search
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .every((t) =>
        `${b.numero} ${b.bon_type} ${b.contact_nom || ""}`
          .toLowerCase()
          .includes(t),
      ),
  );
  const waitingCount = queue.data?.filter((q) => q.status === "waiting").length;
  const onRoadCount = queue.data?.filter(
    (q) => q.status === "in_progress",
  ).length;
  const visibleWaiting = filteredQueue.filter((b) => b.status === "waiting");
  const allVisibleSelected =
    visibleWaiting.length > 0 &&
    visibleWaiting.every((b) =>
      selectedWaiting.some((s) => keyOf(s) === keyOf(b)),
    );
  const activeTours = new Set(
    queue.data?.filter((b) => b.status === "in_progress").map((b) => b.run_id),
  ).size;
  const runData = runs.currentData;
  return (
    <main className="min-w-0 space-y-6 bg-slate-50/60 p-4 text-slate-900 md:p-6 lg:p-8">
      <PageHeader>
        <Link className={button} to="/livraisons/statistiques">
          <BarChart3 size={16} />
          Statistiques
        </Link>
        <button className={primary} onClick={() => setInitial(selectedWaiting)}>
          <Plus size={17} />
          Nouvelle livraison
        </button>
      </PageHeader>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Bons en attente"
          value={waitingCount ?? "—"}
          detail="À regrouper dans une prochaine tournée"
          icon={Package}
          tone="amber"
        />
        <Metric
          label="Bons en route"
          value={onRoadCount ?? "—"}
          detail="En cours de livraison chez vos clients"
          icon={Truck}
        />
        <Metric
          label="Tournées actives"
          value={queue.data ? activeTours : "—"}
          detail="En attente du retour de la tournée"
          icon={Route}
          tone="teal"
        />
      </dl>
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-4 sm:p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Package size={18} className="text-amber-600" />
              Bons à livrer
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Cochez les bons en attente pour préparer leur départ ensemble.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-3 text-slate-400"
            />
            <input
              aria-label="Filtrer la file des bons"
              className={input + " pl-9"}
              placeholder="Numéro, type ou contact…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {error != null && <ErrorBox error={error} />}
        {queue.isLoading ? (
          <Empty>Chargement de la file…</Empty>
        ) : queue.isError ? (
          <ErrorBox error={queue.error} retry={queue.refetch} />
        ) : !filteredQueue.length ? (
          <Empty>
            Aucun bon dans cette file. Ajoutez des bons depuis la page Bons ou
            créez une nouvelle livraison.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>
                    <input
                      aria-label="Sélectionner tous les bons en attente affichés"
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={!visibleWaiting.length}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [
                                ...s.filter(
                                  (b) =>
                                    !visibleWaiting.some(
                                      (v) => keyOf(v) === keyOf(b),
                                    ),
                                ),
                                ...visibleWaiting,
                              ]
                            : s.filter(
                                (b) =>
                                  !visibleWaiting.some(
                                    (v) => keyOf(v) === keyOf(b),
                                  ),
                              ),
                        )
                      }
                    />
                  </th>
                  <th>Bon / type</th>
                  <th>Contact</th>
                  <th>Ajouté le</th>
                  <th>État</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.map((b) => (
                  <tr
                    key={b.id}
                    className={
                      selectedWaiting.some((s) => keyOf(s) === keyOf(b))
                        ? "bg-blue-50/60"
                        : ""
                    }
                  >
                    <td>
                      <input
                        aria-label={"Sélectionner " + b.numero}
                        type="checkbox"
                        disabled={b.status !== "waiting"}
                        checked={selectedWaiting.some(
                          (s) => keyOf(s) === keyOf(b),
                        )}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked
                              ? [...s.filter((x) => keyOf(x) !== keyOf(b)), b]
                              : s.filter((x) => keyOf(x) !== keyOf(b)),
                          )
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="font-semibold text-slate-800">
                        {b.numero}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {b.bon_type}
                      </span>
                    </td>
                    <td>{b.contact_nom || "—"}</td>
                    <td className="whitespace-nowrap text-slate-500">
                      {dateTime(b.queued_at)}
                    </td>
                    <td>
                      <Badge status={b.status} />
                    </td>
                    <td>
                      {b.status === "waiting" && (
                        <button
                          className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                          disabled={removing.isLoading}
                          onClick={async () => {
                            setError(null);
                            try {
                              await remove(b.id).unwrap();
                              setSelected((s) =>
                                s.filter((x) => keyOf(x) !== keyOf(b)),
                              );
                            } catch (err) {
                              setError(err);
                            }
                          }}
                        >
                          Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div
          className={
            "flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-slate-100 px-4 py-3 text-xs " +
            (selectedWaiting.length
              ? "bg-blue-50 text-blue-900"
              : "bg-slate-50/50 text-slate-500")
          }
        >
          <span>
            {selectedWaiting.length
              ? selectedWaiting.length + " bon(s) sélectionné(s)"
              : filteredQueue.length + " bon(s) dans la file affichée"}
          </span>
          {selectedWaiting.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button className={button} onClick={() => setSelected([])}>
                Effacer
              </button>
              <button
                className={primary}
                onClick={() => setInitial(selectedWaiting)}
              >
                Préparer la livraison
                <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <span>Actualisation automatique toutes les 30 s</span>
          )}
        </div>
      </section>
      <section className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Route size={20} className="text-blue-600" />
            Tournées et historique
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Consultez les départs et les retours sur la période de votre choix.
          </p>
        </div>
        <div className={panel + " space-y-3 p-4"}>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Filter size={14} />
              Filtrer les tournées
            </span>
            <button
              className="text-xs font-medium text-blue-700 hover:underline"
              onClick={() => {
                setFilters({});
                setPage(1);
              }}
            >
              Réinitialiser
            </button>
          </div>
          <ResourcesFilters
            value={filters}
            onChange={(v) => {
              setFilters(v);
              setPage(1);
            }}
          />
        </div>
        <div className={panel + " overflow-hidden"}>
          {runs.isError ? (
            <ErrorBox error={runs.error} retry={runs.refetch} />
          ) : !runData && runs.isFetching ? (
            <Empty>Chargement des livraisons…</Empty>
          ) : !runData?.items.length ? (
            <Empty>Aucune livraison sur cette période.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    {[
                      "Tournée",
                      "Chauffeur / véhicule",
                      "Départ / retour",
                      "Durée",
                      "Bons / résultat",
                      "Action",
                    ].map((h) => (
                      <th key={h} className="whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runData.items.map((r) => (
                    <tr
                      key={r.id}
                      className={
                        "align-top " +
                        (r.status === "in_progress" ? "bg-blue-50/20" : "")
                      }
                    >
                      <td>
                        <strong className="mb-2 block">#{r.id}</strong>
                        <Badge status={r.status} />
                      </td>
                      <td>
                        <span
                          className={
                            "block whitespace-nowrap font-medium " +
                            (r.chauffeur_nom ? "" : "italic text-slate-400")
                          }
                        >
                          {r.chauffeur_nom || "Sans chauffeur"}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <Car size={13} />
                          {r.vehicule_nom}
                        </span>
                        {r.notes && (
                          <p className="mt-2 max-w-xs whitespace-pre-wrap text-xs text-slate-500">
                            {r.notes}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="block">{dateTime(r.started_at)}</span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {r.ended_at ? dateTime(r.ended_at) : "Retour attendu"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <span
                          className={
                            "text-base font-semibold tabular-nums " +
                            (r.status === "in_progress"
                              ? "text-blue-700"
                              : "text-slate-700")
                          }
                        >
                          {duration(
                            r.status === "in_progress"
                              ? Math.max(
                                  0,
                                  (now - new Date(r.started_at).getTime()) /
                                    60000,
                                )
                              : r.duration_minutes,
                          )}
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-500">
                          {r.status === "in_progress"
                            ? "Depuis le départ"
                            : "Durée totale"}
                        </span>
                      </td>
                      <td className="min-w-[200px]">
                        <ul className="space-y-2">
                          {r.items.map((b) => (
                            <li key={b.queue_id}>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium">{b.numero}</span>
                                <span className="text-[11px] text-slate-500">
                                  {b.bon_type}
                                </span>
                                {b.outcome && <Badge status={b.outcome} />}
                              </div>
                              {b.failure_reason && (
                                <p className="mt-1 text-xs text-rose-700">
                                  {b.failure_reason}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        {r.status === "in_progress" ? (
                          <button
                            className={
                              button +
                              " whitespace-nowrap !border-blue-200 text-blue-700"
                            }
                            onClick={() => setFinishRun(r)}
                          >
                            <CheckCircle2 size={15} />
                            Terminer la livraison
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-teal-700">
                            <CheckCircle2 size={14} />
                            Retour confirmé
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500">
            <span>
              {Number(runData?.total || 0)} tournée(s) · page {page}
            </span>
            <div className="flex gap-2">
              <button
                className={button}
                disabled={page <= 1 || runs.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </button>
              <button
                className={button}
                disabled={
                  page * 30 >= Number(runData?.total || 0) || runs.isFetching
                }
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </button>
            </div>
          </div>
        </div>
      </section>
      {pdg && (
        <details
          className={panel + " p-4 sm:p-5"}
          onToggle={(e) => setPermissionsOpen(e.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-semibold">
            <ShieldCheck size={17} className="mr-2 inline text-slate-500" />
            Employés autorisés à gérer les livraisons
            <span className="ml-2 text-xs font-normal text-slate-400">
              Administration
            </span>
          </summary>
          {permissionsOpen && (
            <div className="mt-4">
              <Permissions />
            </div>
          )}
        </details>
      )}
      {initial !== null && (
        <NewDelivery
          initial={initial}
          onClose={() => {
            setInitial(null);
            setSelected([]);
          }}
        />
      )}
      {finishRun && (
        <FinishDelivery run={finishRun} onClose={() => setFinishRun(null)} />
      )}
    </main>
  );
}
export default function DeliveryRunsPage() {
  return <Gate>{(pdg) => <Management pdg={pdg} />}</Gate>;
}

type GroupMetric = {
  // null = tournées sans chauffeur assigné
  id: number | null;
  name: string;
  runs: number;
  bons: number;
  delivered: number;
  failed: number;
  avg_minutes: number | null;
};
const percent = (delivered: number, failed: number) =>
  Number(delivered) + Number(failed)
    ? `${((100 * Number(delivered)) / (Number(delivered) + Number(failed))).toFixed(1)} %`
    : "—";
function GroupTable({ title, rows }: { title: string; rows: GroupMetric[] }) {
  return (
    <section className={panel + " overflow-hidden"}>
      <div className="flex items-center justify-between gap-3 p-5">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-xs text-slate-500">
          {rows.length} résultat(s)
        </span>
      </div>
      {!rows.length ? (
        <Empty>Aucune donnée sur cette période.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                {[
                  "Nom",
                  "Tournées",
                  "Bons",
                  "Livrés",
                  "Non livrés",
                  "Durée moy.",
                  "Réussite",
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id ?? "unassigned"}>
                  <th className="text-slate-800">{r.name}</th>
                  <td className="tabular-nums">{Number(r.runs)}</td>
                  <td className="tabular-nums">{Number(r.bons)}</td>
                  <td className="font-medium text-teal-700 tabular-nums">
                    {Number(r.delivered)}
                  </td>
                  <td className="text-rose-700 tabular-nums">
                    {Number(r.failed)}
                  </td>
                  <td className="whitespace-nowrap tabular-nums">
                    {duration(r.avg_minutes)}
                  </td>
                  <td className="min-w-[110px]">
                    <span className="text-xs font-semibold tabular-nums">
                      {percent(r.delivered, r.failed)}
                    </span>
                    <div className="mt-1.5 h-1 w-20 rounded bg-slate-100">
                      <div
                        className="h-1 rounded bg-teal-500"
                        style={{
                          width:
                            Number(r.delivered) + Number(r.failed)
                              ? (Number(r.delivered) /
                                  (Number(r.delivered) + Number(r.failed))) *
                                  100 +
                                "%"
                              : "0%",
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function Statistics() {
  const monthFilters = (): DeliveryFilters => {
    const now = new Date();
    const month =
      now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    return {
      from: month + "-01",
      to: month + "-" + String(now.getDate()).padStart(2, "0"),
    };
  };
  const [filters, setFilters] = useState<DeliveryFilters>(monthFilters);
  const query = useDeliveryStatsQuery(filters, polling);
  const data = query.currentData;
  const s = data?.summary;
  const max = Math.max(
    1,
    ...(data?.daily || []).map((d) => Number(d.delivered) + Number(d.failed)),
  );
  return (
    <main className="min-w-0 space-y-6 bg-slate-50/60 p-4 text-slate-900 md:p-6 lg:p-8">
      <PageHeader stats>
        <Link className={button} to="/livraisons">
          <ArrowLeft size={16} />
          Livraisons
        </Link>
      </PageHeader>
      <section className={panel + " space-y-4 p-4 sm:p-5"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Filter size={16} className="text-blue-600" />
            Période et ressources
          </h2>
          <button
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline"
            onClick={() => setFilters(monthFilters())}
          >
            <RotateCcw size={13} />
            Ce mois-ci
          </button>
        </div>
        <ResourcesFilters value={filters} onChange={setFilters} />
        <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
          Les dates filtrent le départ des tournées. Les durées moyennes
          concernent uniquement les tournées terminées.
        </p>
      </section>
      {query.isError ? (
        <ErrorBox error={query.error} retry={query.refetch} />
      ) : !data && query.isFetching ? (
        <Empty>Calcul des statistiques…</Empty>
      ) : (
        data &&
        s && (
          <>
            <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Metric
                label="Tournées"
                value={Number(s.runs)}
                detail={
                  Number(s.active) +
                  " en cours · " +
                  Number(s.completed) +
                  " terminées"
                }
                icon={Truck}
              />
              <Metric
                label="Taux de réussite"
                value={percent(s.delivered, s.failed)}
                detail="Sur les tentatives avec résultat"
                icon={CheckCircle2}
                tone="teal"
              />
              <Metric
                label="Durée moyenne"
                value={duration(s.avg_minutes)}
                detail="Du départ au retour confirmé"
                icon={Clock3}
                tone="slate"
              />
              <Metric
                label="Bons en attente"
                value={Number(data.waiting)}
                detail="File globale, tous filtres confondus"
                icon={Package}
                tone="amber"
              />
            </dl>
            <div
              className={
                panel +
                " flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 text-sm"
              }
            >
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal-500" />
                <strong className="text-teal-800 tabular-nums">
                  {Number(s.delivered)}
                </strong>
                <span className="text-slate-600">bons livrés</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                <strong className="text-rose-800 tabular-nums">
                  {Number(s.failed)}
                </strong>
                <span className="text-slate-600">bons non livrés</span>
              </span>
              <span className="text-xs text-slate-500">
                Réussite = livrés ÷ (livrés + non livrés). Les bons en route
                sont exclus.
              </span>
            </div>
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <section className={panel + " p-4 sm:p-5"}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      Résultats par jour de départ
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Nombre de bons, par tentative de livraison
                    </p>
                  </div>
                  <div className="flex gap-3 text-[11px] text-slate-600">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm bg-teal-500" />
                      Livrés
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm bg-rose-400" />
                      Non livrés
                    </span>
                  </div>
                </div>
                {!data.daily.length ? (
                  <Empty>Aucune tournée sur cette période.</Empty>
                ) : (
                  <div className="mt-6 max-h-96 space-y-4 overflow-y-auto pr-1">
                    {data.daily.map((d) => (
                      <div
                        key={d.day}
                        className="grid grid-cols-[72px_minmax(0,1fr)_52px] items-center gap-2 text-xs sm:grid-cols-[90px_minmax(0,1fr)_65px] sm:gap-3"
                      >
                        <time
                          className="text-slate-500"
                          dateTime={String(d.day).slice(0, 10)}
                        >
                          {String(d.day)
                            .slice(0, 10)
                            .split("-")
                            .reverse()
                            .slice(0, 2)
                            .join("/")}
                        </time>
                        <div
                          className="flex h-6 overflow-hidden rounded-md bg-slate-100"
                          role="img"
                          aria-label={
                            String(d.day).slice(0, 10) +
                            " : " +
                            Number(d.delivered) +
                            " livrés, " +
                            Number(d.failed) +
                            " non livrés"
                          }
                        >
                          <span
                            className="bg-teal-500"
                            style={{
                              width: (Number(d.delivered) / max) * 100 + "%",
                            }}
                          />
                          <span
                            className="bg-rose-400"
                            style={{
                              width: (Number(d.failed) / max) * 100 + "%",
                            }}
                          />
                        </div>
                        <span className="text-right tabular-nums">
                          <strong className="font-medium text-teal-800">
                            {Number(d.delivered)}
                          </strong>
                          <span className="text-slate-400"> / </span>
                          <span className="text-rose-700">
                            {Number(d.failed)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className={panel + " overflow-hidden"}>
                <div className="p-4 sm:p-5">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <CircleAlert size={17} className="text-amber-600" />
                    Motifs de non-livraison
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Les 10 motifs les plus fréquents sur la période
                  </p>
                </div>
                {!data.reasons.length ? (
                  <Empty>Aucun échec enregistré sur cette période.</Empty>
                ) : (
                  <table className={tableClass}>
                    <thead>
                      <tr>
                        <th>Motif</th>
                        <th className="text-right">Tentatives</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.reasons.map((r, i) => (
                        <tr key={i}>
                          <td className="break-words">
                            <span className="mr-2 text-xs text-slate-400">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            {r.reason}
                          </td>
                          <td className="text-right font-semibold tabular-nums">
                            {Number(r.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
            <GroupTable title="Performance par chauffeur" rows={data.drivers} />
            <GroupTable title="Performance par véhicule" rows={data.vehicles} />
          </>
        )
      )}
    </main>
  );
}
export function DeliveryStatsPage() {
  return <Gate>{() => <Statistics />}</Gate>;
}
