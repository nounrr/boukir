import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/redux';
import {
  useGetSalairesGlobalQueryServer,
  useGetSalairesGlobalMonthsQueryServer,
  useGetSalairesByMonthQueryServer,
} from '../store/api/employeesApi.server';
import type { SalairesByMonthRow } from '../types';
import { DollarSign, Calendar, ChevronDown, ChevronRight, Users, Wallet, CalendarDays } from 'lucide-react';

const fmtMAD = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD' });

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};

// Détail mois-par-mois pour un employé (ligne dépliée)
const EmployeeMonthsDetail: React.FC<{ id: number }> = ({ id }) => {
  const { data, isLoading } = useGetSalairesGlobalMonthsQueryServer({ id });

  if (isLoading) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        <div className="inline-flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
          Chargement de l'historique…
        </div>
      </div>
    );
  }

  if (!data || data.months.length === 0) {
    return <div className="p-4 text-center text-sm text-gray-500">Aucun mois à afficher.</div>;
  }

  return (
    <div className="p-4 bg-gray-50">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Mois</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Jours travaillés</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Salaire / jour</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Salaire dû</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Payé</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Reste à payer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.months.map((m) => (
              <tr key={m.month} className={!m.present ? 'opacity-50' : ''}>
                <td className="px-4 py-2 capitalize text-gray-900">{monthLabel(m.month)}</td>
                <td className="px-4 py-2 text-right text-gray-700">
                  {m.worked_days} / {m.total_working_days}
                </td>
                <td className="px-4 py-2 text-right text-gray-700">{fmtMAD(m.daily_rate)}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-900">{fmtMAD(m.salaire_du)}</td>
                <td className="px-4 py-2 text-right text-emerald-600">{fmtMAD(m.paid)}</td>
                <td
                  className={`px-4 py-2 text-right font-medium ${
                    m.reste_a_payer > 0
                      ? 'text-blue-600'
                      : m.reste_a_payer < 0
                      ? 'text-red-600'
                      : 'text-gray-500'
                  }`}
                >
                  {fmtMAD(m.reste_a_payer)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Détail par employé d'un mois (ligne dépliée dans la vue par mois)
const MonthEmployeesDetail: React.FC<{ row: SalairesByMonthRow }> = ({ row }) => {
  if (row.details.length === 0) {
    return <div className="p-4 text-center text-sm text-gray-500">Aucun employé pour ce mois.</div>;
  }
  return (
    <div className="p-4 bg-gray-50">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Employé</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Jours travaillés</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Salaire / jour</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Salaire dû</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Payé</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">Reste à payer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {row.details.map((e) => (
              <tr key={e.id} className={!e.present ? 'opacity-50' : ''}>
                <td className="px-4 py-2 text-gray-900">
                  {e.nom_complet || e.cin || `#${e.id}`}
                  <span className="ml-2 text-xs text-gray-400">{e.role}</span>
                </td>
                <td className="px-4 py-2 text-right text-gray-700">
                  {e.worked_days} / {e.total_working_days}
                </td>
                <td className="px-4 py-2 text-right text-gray-700">{fmtMAD(e.daily_rate)}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-900">{fmtMAD(e.salaire_du)}</td>
                <td className="px-4 py-2 text-right text-emerald-600">{fmtMAD(e.paid)}</td>
                <td
                  className={`px-4 py-2 text-right font-medium ${
                    e.reste_a_payer > 0
                      ? 'text-blue-600'
                      : e.reste_a_payer < 0
                      ? 'text-red-600'
                      : 'text-gray-500'
                  }`}
                >
                  {fmtMAD(e.reste_a_payer)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Vue par mois (tous employés) — une ligne par mois, dépliable vers le détail par employé
const MonthlyView: React.FC = () => {
  const { data, isLoading, isFetching } = useGetSalairesByMonthQueryServer();
  const months = useMemo(() => data?.months ?? [], [data?.months]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const totals = useMemo(() => {
    return months.reduce(
      (acc, m) => {
        acc.du += Number(m.total_du) || 0;
        acc.paid += Number(m.total_paid) || 0;
        acc.reste += Number(m.reste_a_payer) || 0;
        return acc;
      },
      { du: 0, paid: 0, reste: 0 }
    );
  }, [months]);

  return (
    <>
      {/* Cartes de synthèse (cumul tous mois) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <DollarSign size={16} /> Total dû (tous mois)
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{fmtMAD(totals.du)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <DollarSign size={16} /> Total payé (tous mois)
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{fmtMAD(totals.paid)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <DollarSign size={16} /> Reste à payer
          </div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{fmtMAD(totals.reste)}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <CalendarDays size={18} className="text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">Salaire par mois</h3>
          {isFetching && <span className="text-xs text-gray-400 ml-2">Actualisation…</span>}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <div className="inline-flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
              Chargement…
            </div>
          </div>
        ) : months.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Aucun mois à afficher.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 w-8" />
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mois
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employés
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total dû
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total payé
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reste à payer
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {months.map((m) => {
                  const isOpen = expanded === m.month;
                  return (
                    <React.Fragment key={m.month}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : m.month)}
                      >
                        <td className="px-4 py-4 text-gray-400">
                          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </td>
                        <td className="px-4 py-4 capitalize font-medium text-gray-900">
                          {monthLabel(m.month)}
                        </td>
                        <td className="px-4 py-4 text-right text-sm text-gray-600">{m.employes_count}</td>
                        <td className="px-4 py-4 text-right text-sm font-semibold text-gray-900">
                          {fmtMAD(m.total_du)}
                        </td>
                        <td className="px-4 py-4 text-right text-sm text-emerald-600">{fmtMAD(m.total_paid)}</td>
                        <td
                          className={`px-4 py-4 text-right text-sm font-medium ${
                            m.reste_a_payer > 0
                              ? 'text-blue-600'
                              : m.reste_a_payer < 0
                              ? 'text-red-600'
                              : 'text-gray-500'
                          }`}
                        >
                          {fmtMAD(m.reste_a_payer)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <MonthEmployeesDetail row={m} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

const SalairesPage: React.FC = () => {
  const { user } = useAuth();
  const isDenied = user?.role !== 'PDG';

  // Accès réservé au PDG

  // Vue par défaut: par mois. Le switch bascule vers la vue par employé.
  const [viewMode, setViewMode] = useState<'month' | 'employee'>('month');

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading, isFetching } = useGetSalairesGlobalQueryServer({ month }, { skip: isDenied });
  const employees = useMemo(() => data?.employees ?? [], [data?.employees]);

  const totals = useMemo(() => {
    return employees.reduce(
      (acc, e) => {
        acc.du += Number(e.salaire_du) || 0;
        acc.paid += Number(e.paid_this_month) || 0;
        acc.reste += Number(e.reste_a_payer) || 0;
        return acc;
      },
      { du: 0, paid: 0, reste: 0 }
    );
  }, [employees]);

  if (isDenied) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 rounded-lg">
              <Wallet size={24} className="text-emerald-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Salaires</h1>
              <p className="text-gray-600 mt-1">
                Salaire dû calculé au prorata des jours travaillés (lun-sam)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Switch Vue par mois / par employé */}
            <button
              type="button"
              onClick={() => setViewMode((v) => (v === 'month' ? 'employee' : 'month'))}
              className="flex items-center gap-3 select-none"
              title="Basculer la vue"
            >
              <span className={`text-sm font-medium ${viewMode === 'month' ? 'text-emerald-700' : 'text-gray-400'}`}>
                Par mois
              </span>
              <span
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  viewMode === 'employee' ? 'bg-emerald-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    viewMode === 'employee' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </span>
              <span className={`text-sm font-medium ${viewMode === 'employee' ? 'text-emerald-700' : 'text-gray-400'}`}>
                Par employé
              </span>
            </button>

            {viewMode === 'employee' && (
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-gray-500" />
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            )}
          </div>
        </div>

        {viewMode === 'month' ? (
          <MonthlyView />
        ) : (
        <>

        {/* Cartes de synthèse */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <DollarSign size={16} /> Total dû ({monthLabel(month)})
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{fmtMAD(totals.du)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <DollarSign size={16} /> Total payé ce mois
            </div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{fmtMAD(totals.paid)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <DollarSign size={16} /> Reste à payer
            </div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{fmtMAD(totals.reste)}</div>
          </div>
        </div>

        {/* Tableau employés */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
            <Users size={18} className="text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900">
              Salaire par employé
            </h3>
            {isFetching && (
              <span className="text-xs text-gray-400 ml-2">Actualisation…</span>
            )}
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="inline-flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
                Chargement…
              </div>
            </div>
          ) : employees.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Aucun employé.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 w-8" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employé
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entrée
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Salaire mensuel
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Jours
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dû ce mois
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payé
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reste
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total versé
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {employees.map((e) => {
                    const isOpen = expanded === e.id;
                    return (
                      <React.Fragment key={e.id}>
                        <tr
                          className={`hover:bg-gray-50 cursor-pointer ${
                            !e.present ? 'opacity-60' : ''
                          }`}
                          onClick={() => setExpanded(isOpen ? null : e.id)}
                        >
                          <td className="px-4 py-4 text-gray-400">
                            {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-medium text-gray-900">
                              {e.nom_complet || e.cin || `#${e.id}`}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-2">
                              <span>{e.role}</span>
                              {e.deleted_at && (
                                <span className="text-red-500">
                                  Sorti le {fmtDate(e.deleted_at)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            {fmtDate(e.date_embauche || e.created_at)}
                          </td>
                          <td className="px-4 py-4 text-right text-sm text-gray-900">
                            {e.salaire > 0 ? fmtMAD(e.salaire) : <span className="text-gray-400">Non défini</span>}
                          </td>
                          <td className="px-4 py-4 text-right text-sm text-gray-600">
                            {e.worked_days} / {e.total_working_days}
                          </td>
                          <td className="px-4 py-4 text-right text-sm font-semibold text-gray-900">
                            {fmtMAD(e.salaire_du)}
                          </td>
                          <td className="px-4 py-4 text-right text-sm text-emerald-600">
                            {fmtMAD(e.paid_this_month)}
                          </td>
                          <td
                            className={`px-4 py-4 text-right text-sm font-medium ${
                              e.reste_a_payer > 0
                                ? 'text-blue-600'
                                : e.reste_a_payer < 0
                                ? 'text-red-600'
                                : 'text-gray-500'
                            }`}
                          >
                            {fmtMAD(e.reste_a_payer)}
                          </td>
                          <td className="px-4 py-4 text-right text-sm text-gray-700">
                            {fmtMAD(e.total_paid)}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={9} className="p-0">
                              <EmployeeMonthsDetail id={e.id} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
};

export default SalairesPage;
