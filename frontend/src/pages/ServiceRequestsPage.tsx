import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Bell, CalendarDays, CheckCircle2, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleDot,
  Clock3, ExternalLink, FileText, Filter, HardHat, Loader2, MapPin, MessageCircle, Paperclip, Phone, RefreshCw, RotateCcw,
  Save, Search, SlidersHorizontal, Star, UserRound, Wrench, X, XCircle,
} from 'lucide-react';
import { useAuth } from '../hooks/redux';
import { ServiceInterventionPanel } from '../components/service-requests/ServiceInterventionPanel';
import { serviceRequestDashboardKpiFilters } from './serviceRequestDashboardPresets';
import {
  type BackofficeServiceRequest,
  type ServiceRequestFilters,
  type ServiceRequestDashboardResponse,
  type ServiceRequestPriority,
  type ServiceRequestStatus,
  useAddServiceRequestAttachmentsMutation,
  useAddServiceRequestContactMutation,
  useAddServiceRequestNoteMutation,
  useAssignServiceRequestMaalemMutation,
  useGetBackofficeServiceRequestQuery,
  useGetBackofficeServiceRequestsQuery,
  useGetServiceRequestDashboardQuery,
  useGetServiceRequestFiltersQuery,
  useGetAssignmentCandidatesQuery,
  useTransitionServiceRequestMutation,
  useRetryServiceRequestNotificationMutation,
  useUnassignServiceRequestMaalemMutation,
  useUpdateServiceRequestQualificationMutation,
} from '../store/api/serviceRequestsApi';

const statusLabels: Record<ServiceRequestStatus, string> = {
  new: 'Nouvelle', to_contact: 'À contacter', processing: 'En traitement',
  waiting_customer: 'En attente client', confirmed: 'Confirmée', assigned: 'Maalem affecté',
  scheduled: 'Planifiée', to_do: 'À faire', en_route: 'En route', arrived: 'Arrivé',
  work_in_progress: 'Travaux en cours', completed: 'Terminée par le Maalem', closed: 'Clôturée', cancelled: 'Annulée',
};
const sourceLabels = { selected_maalem: 'Maalem choisi', selected_service: 'Service choisi', quick_request: 'Demande rapide' };
const priorityLabels: Record<ServiceRequestPriority, string> = { low: 'Basse', normal: 'Normale', high: 'Haute', urgent: 'Urgente' };
const reviewInvitationLabels = {
  scheduled: 'Programmée', sent: 'Envoyée', failed: 'Échouée', suspended: 'Suspendue',
  expired: 'Expirée', review_received: 'Avis reçu',
} as const;
const nextStatuses: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  new: ['to_contact'], to_contact: ['processing'], processing: ['waiting_customer', 'confirmed', 'cancelled'],
  waiting_customer: ['processing', 'cancelled'], confirmed: [], assigned: [], scheduled: [], to_do: [],
  en_route: [], arrived: [], work_in_progress: [], completed: [], closed: [], cancelled: [],
};

function dateTime(value?: string | null) {
  return value ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function statusClass(status: ServiceRequestStatus) {
  return ({
    new: 'bg-blue-50 text-blue-700', to_contact: 'bg-violet-50 text-violet-700', processing: 'bg-amber-50 text-amber-700',
    waiting_customer: 'bg-orange-50 text-orange-700', confirmed: 'bg-emerald-50 text-emerald-700', assigned: 'bg-cyan-50 text-cyan-700',
    scheduled: 'bg-indigo-50 text-indigo-700', to_do: 'bg-sky-50 text-sky-700', en_route: 'bg-purple-50 text-purple-700',
    arrived: 'bg-fuchsia-50 text-fuchsia-700', work_in_progress: 'bg-amber-50 text-amber-700', completed: 'bg-lime-50 text-lime-700',
    closed: 'bg-slate-100 text-slate-700', cancelled: 'bg-red-50 text-red-700',
  } as const)[status];
}

function messageFromError(error: unknown) {
  const candidate = error as { data?: { message?: string; errors?: Record<string, string> }; error?: string };
  const details = candidate?.data?.errors ? Object.values(candidate.data.errors).join(' · ') : '';
  return [candidate?.data?.message || candidate?.error || 'Une erreur est survenue', details].filter(Boolean).join(' — ');
}

const inputClass = 'h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500';
const textareaClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500';

type DashboardMetrics = ServiceRequestDashboardResponse['metrics'];
type QuickView = NonNullable<ServiceRequestFilters['quick_view']>;

const quickViews: Array<{ value: QuickView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'to_process', label: 'À traiter', icon: CircleDot },
  { value: 'today', label: "Aujourd’hui", icon: CalendarDays },
  { value: 'overdue', label: 'En retard', icon: AlertTriangle },
  { value: 'in_progress', label: 'En cours', icon: Wrench },
  { value: 'to_close', label: 'À clôturer', icon: CheckCheck },
  { value: 'finished', label: 'Terminées', icon: CheckCircle2 },
];

const kpis: Array<{
  key: keyof DashboardMetrics;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'blue' | 'cyan' | 'amber' | 'red' | 'slate';
  filters: Partial<ServiceRequestFilters>;
}> = [
  { key: 'new_requests', label: 'Nouvelles', hint: 'À prendre en charge', icon: CircleDot, tone: 'blue', filters: serviceRequestDashboardKpiFilters.new_requests },
  { key: 'to_contact', label: 'À contacter', hint: 'Contact client requis', icon: Phone, tone: 'amber', filters: serviceRequestDashboardKpiFilters.to_contact },
  { key: 'processing', label: 'En traitement', hint: 'Qualification en cours', icon: Wrench, tone: 'blue', filters: serviceRequestDashboardKpiFilters.processing },
  { key: 'waiting_customer', label: 'Attente client', hint: 'Réponse attendue', icon: Clock3, tone: 'amber', filters: serviceRequestDashboardKpiFilters.waiting_customer },
  { key: 'confirmed_without_maalem', label: 'Sans Maalem', hint: 'Confirmées à affecter', icon: UserRound, tone: 'cyan', filters: serviceRequestDashboardKpiFilters.confirmed_without_maalem },
  { key: 'assigned_without_schedule', label: 'À planifier', hint: 'Affectées sans date', icon: CalendarDays, tone: 'cyan', filters: serviceRequestDashboardKpiFilters.assigned_without_schedule },
  { key: 'scheduled_today', label: "Prévues aujourd’hui", hint: 'Interventions du jour', icon: CalendarDays, tone: 'blue', filters: serviceRequestDashboardKpiFilters.scheduled_today },
  { key: 'in_progress', label: 'En cours terrain', hint: 'Interventions actives', icon: HardHat, tone: 'blue', filters: serviceRequestDashboardKpiFilters.in_progress },
  { key: 'overdue', label: 'En retard', hint: 'Action prioritaire', icon: AlertTriangle, tone: 'red', filters: serviceRequestDashboardKpiFilters.overdue },
  { key: 'completed_to_verify', label: 'À vérifier', hint: 'Déclarées terminées', icon: CheckCheck, tone: 'amber', filters: serviceRequestDashboardKpiFilters.completed_to_verify },
  { key: 'closed', label: 'Clôturées', hint: 'Dossiers finalisés', icon: CheckCircle2, tone: 'slate', filters: serviceRequestDashboardKpiFilters.closed },
  { key: 'cancelled', label: 'Annulées', hint: 'Demandes annulées', icon: XCircle, tone: 'red', filters: serviceRequestDashboardKpiFilters.cancelled },
];

const kpiTone = {
  blue: 'border-l-blue-500 text-blue-700 bg-blue-50',
  cyan: 'border-l-cyan-500 text-cyan-700 bg-cyan-50',
  amber: 'border-l-amber-500 text-amber-700 bg-amber-50',
  red: 'border-l-red-500 text-red-700 bg-red-50',
  slate: 'border-l-gray-400 text-gray-600 bg-gray-100',
};

function shortDate(value?: string | null) {
  if (!value) return '—';
  const [date] = value.split('T');
  return new Intl.DateTimeFormat('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

function KpiCard({ kpi, value, loading, selected, onClick }: {
  kpi: (typeof kpis)[number]; value: number; loading: boolean; selected: boolean;
  emphasis?: 'priority' | 'standard' | 'quiet'; onClick: () => void;
}) {
  const { label, hint, icon: Icon, tone } = kpi;
  return <button type="button" onClick={onClick} aria-label={`${label} : ${value}`} className={`group min-w-[158px] border-b-2 bg-white px-3 py-3 text-left transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${kpiTone[tone].split(' ')[0]} ${selected ? 'bg-blue-50 ring-2 ring-inset ring-blue-500' : ''}`}>
    <div className="flex items-center justify-between gap-3"><span className="truncate text-[11px] font-bold uppercase tracking-wide text-gray-600">{label}</span><span className={`rounded-md p-1 ${kpiTone[tone].split(' ').slice(1).join(' ')}`}><Icon className="h-3.5 w-3.5" /></span></div>
    <div className="mt-1 text-2xl font-bold tabular-nums text-gray-950">{loading ? <span className="inline-block h-6 w-8 animate-pulse rounded bg-gray-200" /> : value}</div>
    <p className="mt-0.5 truncate text-[11px] text-gray-500">{hint}</p>
  </button>;
}

export default function ServiceRequestsPage() {
  const [filters, setFilters] = useState<ServiceRequestFilters>({ page: 1, limit: 25 });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { data, isLoading, isFetching, isError, refetch } = useGetBackofficeServiceRequestsQuery(filters, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    pollingInterval: 60_000,
  });
  const dashboard = useGetServiceRequestDashboardQuery(undefined, { refetchOnFocus: true, pollingInterval: 60_000 });
  const { data: options } = useGetServiceRequestFiltersQuery();
  const set = (key: keyof ServiceRequestFilters, value: string | number | boolean | undefined) => setFilters((current) => ({
    ...current,
    page: 1,
    [key]: value === '' || value === undefined ? undefined : value,
  }));
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.limit || 25)));
  const activeAdvancedCount = Object.entries(filters).filter(([key, value]) => !['page', 'limit', 'q', 'quick_view'].includes(key) && value !== undefined && value !== '').length;
  const activeFilterChips = useMemo(() => {
    const names: Partial<Record<keyof ServiceRequestFilters, string>> = {
      q: 'Recherche', request_number: 'SRV', client: 'Client', phone: 'Téléphone', status: 'Statut', source: 'Origine',
      service_id: 'Service', category_id: 'Catégorie', requested_maalem_id: 'Maalem souhaité', assigned_maalem_id: 'Maalem affecté',
      city: 'Ville', created_from: 'Créées depuis', created_to: 'Créées avant', planned_date: 'Planifiées le', planned_from: 'Planifiées depuis',
      planned_to: 'Planifiées avant', overdue: 'Retard', assigned: 'Affectation', planned: 'Planification', handled_by_employee_id: 'Responsable', quick_view: 'Vue',
    };
    const quickViewLabels = Object.fromEntries(quickViews.map((view) => [view.value, view.label]));
    const optionName = (items: Array<{ id: number; nom?: string; name?: string }> | undefined, value: unknown) => items?.find((item) => item.id === Number(value))?.nom || items?.find((item) => item.id === Number(value))?.name || String(value);
    return Object.entries(filters).filter(([key, value]) => !['page', 'limit'].includes(key) && value !== undefined && value !== '').map(([rawKey, value]) => {
      const key = rawKey as keyof ServiceRequestFilters;
      let displayValue = String(value);
      if (key === 'status') displayValue = statusLabels[value as ServiceRequestStatus] || displayValue;
      if (key === 'source') displayValue = sourceLabels[value as keyof typeof sourceLabels] || displayValue;
      if (key === 'quick_view') displayValue = quickViewLabels[String(value)] || displayValue;
      if (key === 'service_id') displayValue = optionName(options?.services, value);
      if (key === 'category_id') displayValue = optionName(options?.categories, value);
      if (key === 'requested_maalem_id' || key === 'assigned_maalem_id') displayValue = optionName(options?.maalems, value);
      if (key === 'handled_by_employee_id') displayValue = optionName(options?.employees, value);
      if (key === 'overdue') displayValue = value ? 'En retard' : 'À l’heure';
      if (key === 'assigned') displayValue = value ? 'Avec affectation' : 'Sans affectation';
      if (key === 'planned') displayValue = value ? 'Avec planification' : 'Sans planification';
      return { key, label: names[key] || rawKey, value: displayValue };
    });
  }, [filters, options]);

  const applyPreset = (preset: Partial<ServiceRequestFilters>) => setFilters({ page: 1, limit: filters.limit || 25, ...preset });
  const refreshAll = () => { void refetch(); void dashboard.refetch(); };

  return (
    <div className="space-y-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Back-office</p><div className="mt-1 flex items-center gap-2"><Wrench className="h-7 w-7 text-blue-600" /><h1 className="text-2xl font-bold tracking-tight text-gray-950">Demandes de service</h1></div><p className="mt-1 text-sm text-gray-500">Qualifiez, affectez et suivez les demandes jusqu’à la clôture.</p></div>
          <div className="flex items-center gap-3">
            <p className="hidden text-right text-xs text-gray-500 sm:block">Dernière mise à jour<br /><span className="font-medium text-gray-700">{dashboard.data ? dateTime(dashboard.data.generated_at) : '—'}</span></p>
            <button type="button" onClick={refreshAll} disabled={isFetching || dashboard.isFetching} className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-3.5 text-sm font-semibold text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${(isFetching || dashboard.isFetching) ? 'animate-spin' : ''}`} /> Actualiser
            </button>
          </div>
        </header>

        <section aria-label="Résumé opérationnel" className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <nav aria-label="Vues rapides" className="overflow-x-auto border-b border-gray-200 bg-gray-50 p-1">
          <div className="flex min-w-max gap-1">
            {quickViews.map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-pressed={filters.quick_view === value} onClick={() => applyPreset(filters.quick_view === value ? {} : { quick_view: value })} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${filters.quick_view === value ? 'bg-blue-700 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'}`}><Icon className="h-4 w-4" />{label}</button>)}
          </div>
        </nav>

          {dashboard.isError && <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Les indicateurs ne sont pas disponibles. La liste reste utilisable.</div>}
            <div className="grid grid-flow-col auto-cols-[minmax(158px,1fr)] divide-x divide-gray-200 overflow-x-auto xl:grid-flow-row xl:grid-cols-6 xl:auto-cols-auto">
              {kpis.map((kpi) => <KpiCard key={kpi.key} kpi={kpi} value={dashboard.data?.metrics[kpi.key] ?? 0} loading={dashboard.isLoading} selected={Object.entries(kpi.filters).every(([key, value]) => filters[key as keyof ServiceRequestFilters] === value)} onClick={() => applyPreset(kpi.filters)} />)}
            </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
            <label className="relative flex-1"><span className="sr-only">Recherche rapide</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={`${inputClass} pl-9 pr-9`} placeholder="Rechercher un n° SRV, client, téléphone ou Maalem…" value={filters.q || ''} onChange={(e) => set('q', e.target.value)} />{filters.q && <button type="button" aria-label="Effacer la recherche" onClick={() => set('q', undefined)} className="absolute right-2.5 top-2.5 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>}</label>
            <button type="button" onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-300 px-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200"><SlidersHorizontal className="h-4 w-4" />Filtres avancés{activeAdvancedCount > 0 && <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">{activeAdvancedCount}</span>}<ChevronDown className={`h-4 w-4 transition ${advancedOpen ? 'rotate-180' : ''}`} /></button>
            <button type="button" onClick={() => applyPreset({})} disabled={activeAdvancedCount === 0 && !filters.q && !filters.quick_view} className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:opacity-40"><RotateCcw className="h-4 w-4" />Réinitialiser</button>
          </div>
          {advancedOpen && <div className="space-y-5 border-t border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500"><Filter className="h-3.5 w-3.5" />Filtres combinables</div>
            <fieldset><legend className="mb-3 border-b border-slate-200 pb-2 text-sm font-bold text-slate-800">Demande et client</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Numéro SRV"><input className={inputClass} placeholder="Ex. SRV-2026-001" value={filters.request_number || ''} onChange={(e) => set('request_number', e.target.value)} /></Field>
              <Field label="Nom du client"><input className={inputClass} placeholder="Nom ou raison sociale" value={filters.client || ''} onChange={(e) => set('client', e.target.value)} /></Field>
              <Field label="Téléphone"><input className={inputClass} placeholder="Numéro autorisé" value={filters.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Statut administratif"><select className={inputClass} value={filters.status || ''} onChange={(e) => set('status', e.target.value)}><option value="">Tous les statuts</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Origine"><select className={inputClass} value={filters.source || ''} onChange={(e) => set('source', e.target.value)}><option value="">Toutes les origines</option>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Service"><select className={inputClass} value={filters.service_id || ''} onChange={(e) => set('service_id', Number(e.target.value) || undefined)}><option value="">Tous les services</option>{options?.services.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select></Field>
              <Field label="Catégorie Maalem"><select className={inputClass} value={filters.category_id || ''} onChange={(e) => set('category_id', Number(e.target.value) || undefined)}><option value="">Toutes les catégories</option>{options?.categories.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select></Field>
              <Field label="Ville"><select className={inputClass} value={filters.city || ''} onChange={(e) => set('city', e.target.value)}><option value="">Toutes les villes</option>{options?.cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></Field>
            </div></fieldset>
            <fieldset><legend className="mb-3 border-b border-slate-200 pb-2 text-sm font-bold text-slate-800">Affectation et responsabilité</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Maalem souhaité"><select className={inputClass} value={filters.requested_maalem_id || ''} onChange={(e) => set('requested_maalem_id', Number(e.target.value) || undefined)}><option value="">Tous</option>{options?.maalems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Maalem affecté"><select className={inputClass} value={filters.assigned_maalem_id || ''} onChange={(e) => set('assigned_maalem_id', Number(e.target.value) || undefined)}><option value="">Tous</option>{options?.maalems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Responsable Back-office"><select className={inputClass} value={filters.handled_by_employee_id || ''} onChange={(e) => set('handled_by_employee_id', Number(e.target.value) || undefined)}><option value="">Tous les responsables</option>{options?.employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="État d’affectation"><select className={inputClass} value={filters.assigned === undefined ? '' : String(filters.assigned)} onChange={(e) => set('assigned', e.target.value === '' ? undefined : e.target.value === 'true')}><option value="">Toutes</option><option value="true">Avec affectation</option><option value="false">Sans affectation</option></select></Field>
            </div></fieldset>
            <fieldset><legend className="mb-3 border-b border-slate-200 pb-2 text-sm font-bold text-slate-800">Dates et pilotage</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              <Field label="État de planification"><select className={inputClass} value={filters.planned === undefined ? '' : String(filters.planned)} onChange={(e) => set('planned', e.target.value === '' ? undefined : e.target.value === 'true')}><option value="">Toutes</option><option value="true">Avec planification</option><option value="false">Sans planification</option></select></Field>
              <Field label="Retard calculé"><select className={inputClass} value={filters.overdue === undefined ? '' : String(filters.overdue)} onChange={(e) => set('overdue', e.target.value === '' ? undefined : e.target.value === 'true')}><option value="">Tous</option><option value="true">En retard</option><option value="false">À l’heure</option></select></Field>
              <Field label="Créées du"><input className={inputClass} type="date" value={filters.created_from || ''} onChange={(e) => set('created_from', e.target.value)} /></Field>
              <Field label="Créées au"><input className={inputClass} type="date" value={filters.created_to || ''} onChange={(e) => set('created_to', e.target.value)} /></Field>
              <Field label="Date planifiée"><input className={inputClass} type="date" value={filters.planned_date || ''} onChange={(e) => set('planned_date', e.target.value)} /></Field>
              <Field label="Planifiées du"><input className={inputClass} type="date" value={filters.planned_from || ''} onChange={(e) => set('planned_from', e.target.value)} /></Field>
              <Field label="Planifiées au"><input className={inputClass} type="date" value={filters.planned_to || ''} onChange={(e) => set('planned_to', e.target.value)} /></Field>
            </div></fieldset>
          </div>}
        </section>

        {activeFilterChips.length > 0 && <section aria-label="Filtres actifs" aria-live="polite" className="-mt-2 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Filtres actifs</span>
          {activeFilterChips.map((chip) => <button key={chip.key} type="button" onClick={() => set(chip.key, undefined)} aria-label={`Retirer le filtre ${chip.label}`} className="group inline-flex max-w-full items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:border-blue-300 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-200"><span className="text-blue-500">{chip.label} :</span><span className="max-w-44 truncate">{chip.value}</span><X className="h-3.5 w-3.5 text-blue-400 group-hover:text-blue-700" /></button>)}
          <button type="button" onClick={() => applyPreset({})} className="px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">Tout effacer</button>
        </section>}

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="font-semibold text-slate-900">File des demandes</h2><p className="text-xs text-slate-500">{data?.total || 0} résultat(s) · filtres côté serveur</p></div>{isFetching && !isLoading && <span className="inline-flex items-center gap-1.5 text-xs text-blue-600"><Loader2 className="h-3.5 w-3.5 animate-spin" />Mise à jour</span>}</div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1740px] text-left text-[13px]">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500"><tr>{['N° SRV', 'Client / origine', 'Service / catégorie', 'Maalem souhaité', 'Maalem affecté', 'Ville', 'Création', 'Planification', 'Administratif', 'Opérationnel', 'Pilotage', 'Mise à jour'].map((title) => <th key={title} className="whitespace-nowrap px-3 py-3 font-bold">{title}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading && <tr><td colSpan={12} className="px-4 py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" /><p className="mt-2 text-slate-500">Chargement de la file opérationnelle…</p></td></tr>}
                {isError && <tr><td colSpan={12} className="px-4 py-14 text-center"><AlertTriangle className="mx-auto h-7 w-7 text-red-500" /><p className="mt-2 font-medium text-red-700">Impossible de charger les demandes.</p><button type="button" onClick={() => void refetch()} className="mt-3 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">Réessayer</button></td></tr>}
                {!isLoading && !isError && data?.requests.length === 0 && <tr><td colSpan={12} className="px-4 py-16 text-center"><Search className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 font-medium text-slate-700">Aucune demande dans cette vue</p><p className="text-sm text-slate-500">Modifiez les filtres ou réinitialisez la recherche.</p></td></tr>}
                {data?.requests.map((request) => <RequestRow key={request.id} request={request} />)}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 md:hidden">
            {isLoading && <div className="px-4 py-14 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" /><p className="mt-2 text-sm text-slate-500">Chargement de la file…</p></div>}
            {isError && <div className="px-4 py-12 text-center"><AlertTriangle className="mx-auto h-7 w-7 text-red-500" /><p className="mt-2 text-sm font-medium text-red-700">Impossible de charger les demandes.</p><button type="button" onClick={() => void refetch()} className="mt-3 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700">Réessayer</button></div>}
            {!isLoading && !isError && data?.requests.length === 0 && <div className="px-4 py-14 text-center"><Search className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 font-medium text-slate-700">Aucune demande dans cette vue</p><p className="text-sm text-slate-500">Modifiez ou effacez les filtres.</p></div>}
            {data?.requests.map((request) => <RequestMobileCard key={request.id} request={request} />)}
          </div>
          <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><span>{data?.total || 0} demande(s)</span><select aria-label="Nombre de lignes par page" className="h-8 rounded border border-slate-200 bg-white px-2 text-xs" value={filters.limit || 25} onChange={(e) => set('limit', Number(e.target.value))}><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option></select></div>
            <div className="flex items-center gap-2"><button aria-label="Page précédente" disabled={(filters.page || 1) <= 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) - 1 }))} className="rounded-md border border-gray-300 bg-white p-2 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span className="min-w-28 text-center">Page {filters.page || 1} / {totalPages}</span><button aria-label="Page suivante" disabled={(filters.page || 1) >= totalPages} onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) + 1 }))} className="rounded-md border border-gray-300 bg-white p-2 hover:bg-gray-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div>
          </div>
        </section>
    </div>
  );
}

function RequestMobileCard({ request }: { request: BackofficeServiceRequest }) {
  const administrativeStatus = request.administrative_status || request.status;
  const operationalStatus = request.operational_status || request.intervention_status;
  return <Link to={`/service-requests/${request.id}`} className={`block p-4 transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-300 ${request.is_overdue ? 'bg-red-50/40 active:bg-red-50' : 'active:bg-blue-50'}`}>
    <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-sm font-bold text-blue-700">{request.request_number}</div><div className="mt-0.5 text-[11px] text-slate-500">Créée {shortDate(request.created_at)} · {sourceLabels[request.request_source]}</div></div>{request.is_overdue ? <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-100 px-2 py-1 text-[11px] font-bold text-red-700"><AlertTriangle className="h-3 w-3" />En retard</span> : <ChevronRight className="h-5 w-5 text-slate-300" />}</div>
    <div className="mt-3"><p className="truncate text-base font-bold text-slate-900">{request.requester_name || request.contact_account_name || 'Client non renseigné'}</p><p className="mt-0.5 truncate text-sm text-slate-600">{request.qualified_service_name || request.initial_service_name || 'Service non défini'}{request.qualified_category_name ? ` · ${request.qualified_category_name}` : ''}</p></div>
    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-slate-50 p-3 text-xs">
      <div><dt className="text-slate-400">Maalem affecté</dt><dd className={`mt-0.5 truncate font-semibold ${request.current_assigned_maalem_name ? 'text-cyan-700' : 'text-amber-700'}`}>{request.current_assigned_maalem_name || 'Non affecté'}</dd></div>
      <div><dt className="text-slate-400">Planification</dt><dd className="mt-0.5 font-semibold text-slate-700">{shortDate(request.planned_date)}{request.planned_time_slot ? ` · ${request.planned_time_slot}` : ''}</dd></div>
      <div><dt className="text-slate-400">Ville</dt><dd className="mt-0.5 truncate font-medium text-slate-700">{request.city || '—'}</dd></div>
      <div><dt className="text-slate-400">Maalem souhaité</dt><dd className="mt-0.5 truncate font-medium text-slate-700">{request.requested_maalem_name || '—'}</dd></div>
    </dl>
    <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${statusClass(administrativeStatus)}`}>{statusLabels[administrativeStatus]}</span>{operationalStatus && <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${statusClass(operationalStatus)}`}>{statusLabels[operationalStatus]}</span>}<span className="ml-auto text-[10px] text-slate-400">Màj {dateTime(request.updated_at)}</span></div>
  </Link>;
}

function RequestRow({ request }: { request: BackofficeServiceRequest }) {
  const navigate = useNavigate();
  const administrativeStatus = request.administrative_status || request.status;
  const operationalStatus = request.operational_status || request.intervention_status;
  const open = () => navigate(`/service-requests/${request.id}`);
  return <tr role="link" tabIndex={0} onClick={open} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }} className={`cursor-pointer transition hover:bg-blue-50/50 focus:bg-blue-50 focus:outline-none ${request.is_overdue ? 'bg-red-50/30' : ''}`}>
    <td className="whitespace-nowrap px-3 py-3"><Link onClick={(event) => event.stopPropagation()} className="font-bold text-blue-700 hover:underline" to={`/service-requests/${request.id}`}>{request.request_number}</Link><div className="mt-1 text-[11px] text-slate-500">{priorityLabels[request.priority]}</div></td>
    <td className="max-w-52 px-3 py-3"><div className="truncate font-semibold text-slate-800">{request.requester_name || request.contact_account_name || '—'}</div><div className="mt-0.5 truncate text-[11px] text-slate-500">{sourceLabels[request.request_source]} · {request.requester_phone || request.contact_account_phone || 'sans téléphone'}</div></td>
    <td className="max-w-48 px-3 py-3"><div className="truncate font-medium text-slate-800">{request.qualified_service_name || request.initial_service_name || '—'}</div><div className="mt-0.5 truncate text-[11px] text-slate-500">{request.qualified_category_name || 'Catégorie non définie'}</div></td>
    <td className="max-w-40 truncate px-3 py-3 text-slate-600">{request.requested_maalem_name || '—'}</td>
    <td className="max-w-40 px-3 py-3"><span className={request.current_assigned_maalem_name ? 'font-semibold text-cyan-700' : 'text-amber-700'}>{request.current_assigned_maalem_name || 'Non affecté'}</span></td>
    <td className="max-w-32 truncate px-3 py-3"><span className="inline-flex items-center gap-1 text-slate-700"><MapPin className="h-3.5 w-3.5 text-slate-400" />{request.city || '—'}</span></td>
    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{shortDate(request.created_at)}</td>
    <td className="whitespace-nowrap px-3 py-3"><div className="font-medium text-slate-800">{shortDate(request.planned_date)}</div><div className="mt-0.5 text-[11px] text-slate-500">{request.planned_time_slot || '—'}</div></td>
    <td className="whitespace-nowrap px-3 py-3"><span className={`rounded-md px-2 py-1 text-[11px] font-bold ${statusClass(administrativeStatus)}`}>{statusLabels[administrativeStatus]}</span></td>
    <td className="whitespace-nowrap px-3 py-3">{operationalStatus ? <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${statusClass(operationalStatus)}`}>{statusLabels[operationalStatus]}</span> : <span className="text-slate-400">—</span>}</td>
    <td className="whitespace-nowrap px-3 py-3">{request.is_overdue ? <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-1 text-[11px] font-bold text-red-700"><AlertTriangle className="h-3 w-3" />En retard</span> : <span className="text-[11px] text-slate-400">À l’heure</span>}</td>
    <td className="whitespace-nowrap px-3 py-3"><div className="text-slate-600">{dateTime(request.updated_at)}</div><div className="mt-0.5 max-w-32 truncate text-[11px] text-slate-500">{request.handled_by_name || 'Non attribuée'}</div></td>
  </tr>;
}

export function ServiceRequestDetailPage() {
  const id = Number(useParams().id);
  const { token } = useAuth();
  const { data, isLoading, error, refetch } = useGetBackofficeServiceRequestQuery(id, { skip: !Number.isInteger(id) });
  const { data: options } = useGetServiceRequestFiltersQuery();
  const [updateQualification, qualificationState] = useUpdateServiceRequestQualificationMutation();
  const [addNote, noteState] = useAddServiceRequestNoteMutation();
  const [addContact, contactState] = useAddServiceRequestContactMutation();
  const [transition, transitionState] = useTransitionServiceRequestMutation();
  const [retryNotification, retryNotificationState] = useRetryServiceRequestNotificationMutation();
  const [addAttachments, attachmentState] = useAddServiceRequestAttachmentsMutation();
  const request = data?.request;
  const [feedback, setFeedback] = useState('');
  const [qualification, setQualification] = useState<Record<string, string | number>>({});
  const [note, setNote] = useState({ visibility: 'INTERNAL' as 'INTERNAL' | 'SHARED', body: '' });
  const [contact, setContact] = useState({ channel: 'WHATSAPP', contacted_at: new Date().toISOString().slice(0, 16), result: '', internal_observation: '' });
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [assignmentCity, setAssignmentCity] = useState('');
  const [assignmentCategoryId, setAssignmentCategoryId] = useState('');
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const [selectedMaalemId, setSelectedMaalemId] = useState<number | null>(null);
  const [assignmentReason, setAssignmentReason] = useState('');
  const [compatibilityOverride, setCompatibilityOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const assignmentEnabled = Boolean(request && ['confirmed', 'assigned', 'scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress'].includes(request.status));
  const candidatesQuery = useGetAssignmentCandidatesQuery({
    id,
    q: assignmentSearch || undefined,
    city: assignmentCity || undefined,
    category_id: Number(assignmentCategoryId) || undefined,
    compatible_only: compatibleOnly,
  }, { skip: !assignmentEnabled });
  const [assignMaalem, assignState] = useAssignServiceRequestMaalemMutation();
  const [unassignMaalem, unassignState] = useUnassignServiceRequestMaalemMutation();

  useEffect(() => {
    if (!request) return;
    setQualification({ qualified_service_id: request.qualified_service_id || '', qualified_category_id: request.qualified_category_id || '',
      qualified_description: request.qualified_description || request.problem_description || '', requester_name: request.requester_name || request.contact_account_name || '',
      requester_phone: request.requester_phone || request.contact_account_phone || '', city: request.city || '', intervention_address: request.intervention_address || '',
      latitude: request.latitude ?? '', longitude: request.longitude ?? '', desired_date: request.desired_date?.slice(0, 10) || '', desired_time_slot: request.desired_time_slot || '',
      priority: request.priority, handled_by_employee_id: request.handled_by_employee_id || '' });
  }, [request]);

  const editable = request && !['confirmed', 'assigned', 'scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress', 'completed', 'closed', 'cancelled'].includes(request.status);
  const selectedCandidate = candidatesQuery.data?.candidates.find((candidate) => candidate.id === selectedMaalemId);
  const whatsappUrl = useMemo(() => {
    const phone = String(request?.requester_phone || request?.contact_account_phone || '').replace(/\D/g, '').replace(/^0/, '212');
    return phone ? `https://wa.me/${phone}` : '';
  }, [request]);

  async function action(run: () => Promise<unknown>, success: string) {
    setFeedback('');
    try { await run(); setFeedback(success); await refetch(); }
    catch (mutationError) { setFeedback(messageFromError(mutationError)); }
  }

  async function openAttachment(attachmentId: number, name: string) {
    const response = await fetch(`/api/admin/service-requests/${id}/attachments/${attachmentId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return setFeedback('Impossible d’ouvrir la pièce jointe.');
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a'); anchor.href = url; anchor.target = '_blank'; anchor.download = name; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  if (isLoading) return <div className="p-8 text-slate-500">Chargement du dossier…</div>;
  if (!request || error) return <div className="p-8 text-red-600">{messageFromError(error)}</div>;

  return <div className="space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-5"><div className="flex items-center gap-3"><Link to="/service-requests" aria-label="Retour aux demandes" className="rounded-md border border-gray-300 bg-white p-2 text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Dossier de demande</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">{request.request_number}</h1></div></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-md px-3 py-1.5 text-sm font-semibold ${statusClass(request.status)}`}>{statusLabels[request.status]}</span>{request.assignment_eligible && <span className="rounded-md bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-800">Éligible KAN-18</span>}</div></header>
    {feedback && <div className={`rounded-lg border px-4 py-3 text-sm ${feedback.includes('enregistr') || feedback.includes('mise à jour') || feedback.includes('succès') || feedback.includes('désaffecté') ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{feedback}</div>}

    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Panel title="Demande initiale" icon={<FileText className="h-5 w-5" />}><dl className="grid gap-4 sm:grid-cols-2"><Fact label="Origine" value={sourceLabels[request.request_source]} /><Fact label="Service initial" value={request.initial_service_name} /><Fact label="Maalem souhaité" value={request.requested_maalem_name} /><Fact label="Créée le" value={dateTime(request.created_at)} /><div className="sm:col-span-2"><Fact label="Description initiale" value={request.problem_description} /></div></dl></Panel>
        <Panel title="Qualification Back-office" icon={<Save className="h-5 w-5" />}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Service qualifié"><select disabled={!editable} className={inputClass} value={qualification.qualified_service_id} onChange={(e) => setQualification({ ...qualification, qualified_service_id: Number(e.target.value) || '' })}><option value="">Aucun</option>{options?.services.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select></Field>
            <Field label="Catégorie Maalem"><select disabled={!editable} className={inputClass} value={qualification.qualified_category_id} onChange={(e) => setQualification({ ...qualification, qualified_category_id: Number(e.target.value) || '' })}><option value="">Aucune</option>{options?.categories.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select></Field>
            <div className="sm:col-span-2"><Field label="Description qualifiée"><textarea disabled={!editable} rows={4} className={textareaClass} value={qualification.qualified_description} onChange={(e) => setQualification({ ...qualification, qualified_description: e.target.value })} /></Field></div>
            <Field label="Client / demandeur"><input disabled={!editable} className={inputClass} value={qualification.requester_name} onChange={(e) => setQualification({ ...qualification, requester_name: e.target.value })} /></Field>
            <Field label="Téléphone utile"><input disabled={!editable} className={inputClass} value={qualification.requester_phone} onChange={(e) => setQualification({ ...qualification, requester_phone: e.target.value })} /></Field>
            <Field label="Ville"><input disabled={!editable} className={inputClass} value={qualification.city} onChange={(e) => setQualification({ ...qualification, city: e.target.value })} /></Field>
            <Field label="Adresse"><input disabled={!editable} className={inputClass} value={qualification.intervention_address} onChange={(e) => setQualification({ ...qualification, intervention_address: e.target.value })} /></Field>
            <Field label="Latitude"><input disabled={!editable} type="number" step="any" className={inputClass} value={qualification.latitude} onChange={(e) => setQualification({ ...qualification, latitude: e.target.value })} /></Field>
            <Field label="Longitude"><input disabled={!editable} type="number" step="any" className={inputClass} value={qualification.longitude} onChange={(e) => setQualification({ ...qualification, longitude: e.target.value })} /></Field>
            <Field label="Date souhaitée"><input disabled={!editable} type="date" className={inputClass} value={qualification.desired_date} onChange={(e) => setQualification({ ...qualification, desired_date: e.target.value })} /></Field>
            <Field label="Créneau"><input disabled={!editable} className={inputClass} value={qualification.desired_time_slot} onChange={(e) => setQualification({ ...qualification, desired_time_slot: e.target.value })} /></Field>
            <Field label="Priorité"><select disabled={!editable} className={inputClass} value={qualification.priority} onChange={(e) => setQualification({ ...qualification, priority: e.target.value })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Responsable"><select disabled={!editable} className={inputClass} value={qualification.handled_by_employee_id} onChange={(e) => setQualification({ ...qualification, handled_by_employee_id: Number(e.target.value) || '' })}><option value="">Non attribuée</option>{options?.employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          </div>
          {editable && <button disabled={qualificationState.isLoading} onClick={() => void action(() => updateQualification({ id, body: qualification }).unwrap(), 'Qualification mise à jour.')} className="mt-4 flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"><Save className="h-4 w-4" /> Enregistrer la qualification</button>}
        </Panel>
        <Panel title="Notes et instructions" icon={<MessageCircle className="h-5 w-5" />}><div className="space-y-3">{data.notes.map((item) => <div key={item.id} className={`rounded-lg border p-3 ${item.visibility === 'INTERNAL' ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}><div className="flex justify-between text-xs font-semibold"><span>{item.visibility === 'INTERNAL' ? 'Note interne — privée' : 'Instruction partageable'}</span><span>{dateTime(item.created_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{item.body}</p><p className="mt-2 text-xs text-slate-500">{item.actor_name}</p></div>)}</div>
          <div className="mt-4 border-t pt-4"><select className={inputClass} value={note.visibility} onChange={(e) => setNote({ ...note, visibility: e.target.value as 'INTERNAL' | 'SHARED' })}><option value="INTERNAL">Note interne (jamais partagée)</option><option value="SHARED">Instruction partageable au Maalem</option></select><textarea className={`${textareaClass} mt-3`} rows={3} placeholder="Ajouter une information…" value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} /><button disabled={!note.body.trim() || noteState.isLoading} onClick={() => void action(async () => { await addNote({ id, ...note }).unwrap(); setNote({ ...note, body: '' }); }, 'Note enregistrée.')} className="mt-3 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">Ajouter</button></div>
        </Panel>
        <ServiceInterventionPanel request={request} options={options} onChanged={refetch} />
        <Panel title="Historique" icon={<Clock3 className="h-5 w-5" />}><div className="space-y-4">{data.history.map((event) => <div key={event.id} className="relative border-l-2 border-slate-200 pl-4"><div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-blue-500" /><p className="text-sm font-semibold text-slate-800">{event.event_type.replaceAll('_', ' ')}</p><p className="text-xs text-slate-500">{event.actor_name} · {dateTime(event.created_at)}</p>{event.old_status && <p className="mt-1 text-xs">{event.old_status} → {event.new_status}</p>}</div>)}</div></Panel>
      </div>

      <aside className="space-y-5">
        <Panel title="Affectation Maalem" icon={<HardHat className="h-5 w-5" />}>
          <div className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Fact label="Maalem souhaité" value={request.requested_maalem_name} />
            <Fact label="Maalem affecté" value={request.current_assigned_maalem_name} />
          </div>
          {assignmentEnabled ? <>
            <div className="mt-4 space-y-3 border-t pt-4">
              <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Rechercher par nom" value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2"><input className={inputClass} placeholder="Ville / zone" value={assignmentCity} onChange={(event) => setAssignmentCity(event.target.value)} /><select className={inputClass} value={assignmentCategoryId} onChange={(event) => setAssignmentCategoryId(event.target.value)}><option value="">Toutes catégories</option>{options?.categories.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select></div>
              <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={compatibleOnly} onChange={(event) => { setCompatibleOnly(event.target.checked); setSelectedMaalemId(null); }} /> Afficher uniquement les Maalems compatibles</label>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {candidatesQuery.isFetching && <p className="py-4 text-center text-sm text-slate-500">Recherche…</p>}
                {!candidatesQuery.isFetching && candidatesQuery.data?.candidates.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Aucun Maalem trouvé.</p>}
                {candidatesQuery.data?.candidates.map((candidate) => <button type="button" key={candidate.id} onClick={() => { setSelectedMaalemId(candidate.id); if (candidate.compatible) { setCompatibilityOverride(false); setOverrideReason(''); } }} className={`w-full rounded-lg border p-3 text-left ${selectedMaalemId === candidate.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <div className="flex items-start justify-between gap-2"><span className="font-semibold text-slate-800">{candidate.name}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${candidate.compatible ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{candidate.compatible ? 'Compatible' : 'Dérogation requise'}</span></div>
                  <p className="mt-1 text-xs text-slate-500">{candidate.category_name || 'Sans catégorie'} · {candidate.city || 'Ville non renseignée'}</p>
                  <p className="mt-1 text-xs text-slate-600">{candidate.active_missions} mission(s) active(s) · disponibilité déclarée : {candidate.declared_availability || 'non renseignée'}</p>
                </button>)}
              </div>
              <p className="text-[11px] leading-4 text-slate-500">{candidatesQuery.data?.availability_notice || 'Aucune disponibilité calendaire n’est garantie.'}</p>
              <textarea className={textareaClass} rows={2} placeholder={request.current_assignment_id ? 'Motif obligatoire de réaffectation' : 'Motif obligatoire d’affectation'} value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} />
              {selectedCandidate && !selectedCandidate.compatible && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3"><label className="flex items-center gap-2 text-sm font-medium text-amber-900"><input type="checkbox" checked={compatibilityOverride} onChange={(event) => setCompatibilityOverride(event.target.checked)} /> Autoriser une dérogation explicite</label>{compatibilityOverride && <textarea className={textareaClass} rows={2} placeholder="Justification obligatoire de la dérogation" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />}</div>}
              <button disabled={!selectedMaalemId || !assignmentReason.trim() || assignState.isLoading || Boolean(selectedCandidate && !selectedCandidate.compatible && (!compatibilityOverride || !overrideReason.trim()))} onClick={() => {
                const startedReassignment = ['en_route', 'arrived', 'work_in_progress'].includes(request.status);
                if (startedReassignment && !window.confirm('L’intervention a déjà commencé. Confirmer cette réaffectation exceptionnelle et historisée ?')) return;
                void action(async () => {
                await assignMaalem({ id, maalem_profile_id: selectedMaalemId!, expected_current_assignment_id: request.current_assignment_id, reason: assignmentReason, compatibility_override: compatibilityOverride, compatibility_override_reason: overrideReason || undefined, started_reassignment: startedReassignment }).unwrap();
                await candidatesQuery.refetch();
                setSelectedMaalemId(null); setAssignmentReason(''); setCompatibilityOverride(false); setOverrideReason('');
              }, request.current_assignment_id ? 'Maalem réaffecté avec succès.' : 'Maalem affecté avec succès.');
              }} className="w-full rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">{request.current_assignment_id ? 'Réaffecter ce Maalem' : 'Affecter ce Maalem'}</button>
              {request.current_assignment_id && request.status === 'assigned' && <button disabled={unassignState.isLoading} onClick={() => { const reason = window.prompt('Motif obligatoire de la désaffectation'); if (!reason?.trim()) return; void action(async () => { await unassignMaalem({ id, expected_current_assignment_id: request.current_assignment_id!, reason }).unwrap(); await candidatesQuery.refetch(); }, 'Maalem désaffecté ; la demande reste confirmée.'); }} className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Désaffecter le Maalem</button>}
            </div>
          </> : <p className="mt-4 text-sm text-slate-500">La demande doit être confirmée avant toute affectation.</p>}
          <div className="mt-5 border-t pt-4"><h3 className="mb-3 text-sm font-bold text-slate-800">Historique des affectations</h3><div className="space-y-3">{data.assignments.map((assignment) => <div key={assignment.id} className={`rounded-lg border p-3 text-xs ${assignment.is_current ? 'border-cyan-200 bg-cyan-50' : 'border-slate-200'}`}><div className="flex justify-between gap-2"><span className="font-bold text-slate-800">{assignment.maalem_name}</span><span className={assignment.is_current ? 'font-semibold text-cyan-700' : 'text-slate-500'}>{assignment.is_current ? 'Courante' : 'Clôturée'}</span></div><p className="mt-1 text-slate-600">Affecté par {assignment.assigned_by_name} · {dateTime(assignment.assigned_at)}</p><p className="mt-1"><strong>Motif :</strong> {assignment.assignment_reason}</p>{assignment.compatibility_override && <p className="mt-1 text-amber-800"><strong>Dérogation :</strong> {assignment.compatibility_override_reason}</p>}{assignment.unassigned_at && <div className="mt-2 border-t pt-2 text-slate-600"><p>Clôturée par {assignment.unassigned_by_name} · {dateTime(assignment.unassigned_at)}</p><p><strong>Motif :</strong> {assignment.unassignment_reason}</p></div>}</div>)}{data.assignments.length === 0 && <p className="text-sm text-slate-500">Aucune affectation enregistrée.</p>}</div></div>
        </Panel>
        <Panel title="Client" icon={<UserRound className="h-5 w-5" />}><div className="space-y-3 text-sm"><Fact label="Nom" value={request.requester_name || request.contact_account_name} /><Fact label="Téléphone" value={request.requester_phone || request.contact_account_phone} /><Fact label="E-mail" value={request.requester_email || request.contact_account_email} /><Fact label="Adresse" value={[request.intervention_address, request.city].filter(Boolean).join(', ')} />{request.latitude != null && <a className="flex items-center gap-2 font-medium text-blue-700" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${request.latitude},${request.longitude}`}><MapPin className="h-4 w-4" /> Ouvrir la localisation <ExternalLink className="h-3 w-3" /></a>}</div></Panel>
        <Panel title="Contacter le client" icon={<Phone className="h-5 w-5" />}><div className="grid grid-cols-2 gap-2">{whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}<a href={`tel:${request.requester_phone || request.contact_account_phone || ''}`} className="flex items-center justify-center gap-2 rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"><Phone className="h-4 w-4" /> Appeler</a></div><p className="mt-2 text-xs text-gray-500">L’ouverture WhatsApp n’envoie aucun message automatiquement.</p>
          <div className="mt-4 space-y-3 border-t pt-4"><select className={inputClass} value={contact.channel} onChange={(e) => setContact({ ...contact, channel: e.target.value })}><option value="WHATSAPP">WhatsApp</option><option value="PHONE">Téléphone</option><option value="OTHER">Autre</option></select><input className={inputClass} type="datetime-local" value={contact.contacted_at} onChange={(e) => setContact({ ...contact, contacted_at: e.target.value })} /><input className={inputClass} placeholder="Résultat de l’échange *" value={contact.result} onChange={(e) => setContact({ ...contact, result: e.target.value })} /><textarea className={textareaClass} rows={2} placeholder="Observation interne" value={contact.internal_observation} onChange={(e) => setContact({ ...contact, internal_observation: e.target.value })} /><button disabled={!contact.result.trim() || contactState.isLoading} onClick={() => void action(async () => { await addContact({ id, ...contact, contacted_at: new Date(contact.contacted_at).toISOString() }).unwrap(); setContact({ ...contact, result: '', internal_observation: '' }); }, 'Échange enregistré.')} className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">Enregistrer l’échange</button></div>
          <div className="mt-4 space-y-2 border-t pt-4">{data.contacts.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-xs"><p className="font-semibold">{item.channel} — {item.result}</p><p className="mt-1 text-slate-500">{item.employee_name} · {dateTime(item.contacted_at)}</p>{item.internal_observation && <p className="mt-2 text-slate-700">{item.internal_observation}</p>}</div>)}</div>
        </Panel>
        <Panel title="Pièces jointes" icon={<Paperclip className="h-5 w-5" />}><div className="space-y-2">{data.attachments.map((item) => <button key={item.id} onClick={() => void openAttachment(item.id, item.original_name)} className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm hover:bg-slate-50"><span className="truncate">{item.original_name}</span><ExternalLink className="h-4 w-4 shrink-0" /></button>)}{data.attachments.length === 0 && <p className="text-sm text-slate-500">Aucune pièce jointe.</p>}</div>{editable && <label className="mt-3 block cursor-pointer rounded-lg border border-dashed p-3 text-center text-sm font-medium text-blue-700"><input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) void action(() => addAttachments({ id, files }).unwrap(), 'Pièces jointes ajoutées.'); e.target.value = ''; }} />{attachmentState.isLoading ? 'Envoi…' : 'Ajouter des fichiers'}</label>}</Panel>
        <Panel title="Notifications opérationnelles" icon={<Bell className="h-5 w-5" />}>
          <div className="space-y-3">{data.notifications.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-xs">
            <div className="flex items-start justify-between gap-2"><div><p className="font-bold text-slate-800">{item.title}</p><p className="mt-0.5 text-slate-500">{item.recipient_name || item.recipient_type} · {item.channel} · {item.locale.toUpperCase()}</p></div><span className={`rounded-full px-2 py-0.5 font-semibold ${item.status === 'failed' ? 'bg-red-100 text-red-700' : item.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{item.status}</span></div>
            <p className="mt-2 whitespace-pre-wrap text-slate-600">{item.body}</p><p className="mt-2 text-slate-500">{dateTime(item.created_at)} · {item.attempts} tentative(s)</p>
            {item.last_error && <p className="mt-1 break-words text-red-700">{item.last_error}</p>}
            {item.channel === 'WHATSAPP' && item.status === 'failed' && <button disabled={retryNotificationState.isLoading} onClick={() => void action(() => retryNotification({ requestId: id, notificationId: item.id }).unwrap(), 'Notification relancée.')} className="mt-2 inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 font-semibold text-red-700 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Relancer</button>}
          </div>)}{data.notifications.length === 0 && <p className="text-sm text-slate-500">Aucune notification opérationnelle.</p>}</div>
        </Panel>
        <Panel title="Invitation à donner un avis" icon={<Star className="h-5 w-5" />}>
          {!data.review_invitation ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500">Non programmée</div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">État</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${data.review_invitation.status === 'review_received' ? 'bg-emerald-100 text-emerald-700' : data.review_invitation.status === 'failed' ? 'bg-red-100 text-red-700' : data.review_invitation.status === 'expired' || data.review_invitation.status === 'suspended' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>
                  {reviewInvitationLabels[data.review_invitation.status]}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <Fact label="Prévue" value={dateTime(data.review_invitation.scheduled_at)} />
                <Fact label="Expire" value={dateTime(data.review_invitation.expires_at)} />
                <Fact label="Dernier envoi" value={dateTime(data.review_invitation.last_sent_at)} />
                <Fact label="Ouverture" value={dateTime(data.review_invitation.opened_at)} />
                <Fact label="Relances" value={`${data.review_invitation.reminder_count} / ${data.review_invitation.max_reminders}`} />
                <Fact label="Avis soumis" value={dateTime(data.review_invitation.submitted_at)} />
              </dl>
              {data.review_invitation.last_error && <p className="break-words rounded-md bg-red-50 p-2 text-xs text-red-700">{data.review_invitation.last_error}</p>}
              <p className="text-xs text-slate-500">Consultation uniquement : aucun avis ne peut être publié depuis le Back-office.</p>
            </div>
          )}
        </Panel>
        <Panel title="Workflow" icon={<CheckCircle2 className="h-5 w-5" />}><div className="space-y-2">{nextStatuses[request.status].map((status) => <button key={status} disabled={transitionState.isLoading} onClick={() => { const reason = status === 'cancelled' ? window.prompt("Motif interne obligatoire de l’annulation") : undefined; if (status === 'cancelled' && !reason?.trim()) return; const publicReason = status === 'cancelled' ? window.prompt('Motif partageable avec le client (facultatif)') || undefined : undefined; void action(() => transition({ id, status, reason: reason || undefined, public_reason: publicReason }).unwrap(), `Demande passée au statut « ${statusLabels[status]} ».`); }} className={`flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${status === 'cancelled' ? 'bg-red-600 hover:bg-red-700' : status === 'confirmed' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-700 hover:bg-blue-800'}`}>{status === 'cancelled' ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{statusLabels[status]}</button>)}{nextStatuses[request.status].length === 0 && <p className="text-sm text-gray-500">{request.status === 'assigned' ? 'Le Maalem est affecté. Aucun travail ni planning n’a été démarré automatiquement.' : 'Cette demande est terminée.'}</p>}</div>{request.cancellation_reason && <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800"><strong>Motif interne :</strong> {request.cancellation_reason}{request.cancellation_public_reason && <p className="mt-1"><strong>Motif partagé :</strong> {request.cancellation_public_reason}</p>}</div>}</Panel>
      </aside>
    </div>
  </div>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><h2 className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3 font-bold text-gray-900"><span className="text-blue-600">{icon}</span>{title}</h2>{children}</section>; }
function Fact({ label, value }: { label: string; value?: React.ReactNode | null }) { return <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{value || '—'}</dd></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>; }
