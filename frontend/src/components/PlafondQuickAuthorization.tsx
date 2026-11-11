import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ShieldPlus } from 'lucide-react';
import { useAuth } from '../hooks/redux';
import { useGetClientsQuery } from '../store/api/contactsApi';
import { useGetEmployeesQueryServer, useGrantClientPlafondAuthorizationsMutation } from '../store/api/employeesApi.server';
import type { Contact } from '../types';
import { showSuccess } from '../utils/notifications';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';

function AuthorizationForm({ onGranted }: { onGranted: () => void }) {
  const id = useId();
  const [clientSearch, setClientSearch] = useState('');
  const [search, setSearch] = useState('');
  const [client, setClient] = useState<Contact | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState('');
  const searchTerm = clientSearch.trim();
  const canSearch = !client && searchTerm.length >= 2;
  const clients = useGetClientsQuery({ search, limit: 12, sortBy: 'nom' }, {
    skip: !canSearch || search !== searchTerm,
  });
  const employees = useGetEmployeesQueryServer(undefined, { refetchOnMountOrArgChange: true });
  const [grantAuthorization, { isLoading: isGranting }] = useGrantClientPlafondAuthorizationsMutation();
  const recipients = (employees.data ?? []).filter(employee => employee.role && employee.role !== 'PDG');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchTerm), 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const count = Number(quantity);
    if (isGranting || !client || !employeeId || !Number.isInteger(count) || count < 1 || count > 100000) return;
    setError('');
    try {
      const result = await grantAuthorization({
        employeeId: Number(employeeId),
        client_id: client.id,
        quantity: count,
      }).unwrap();
      showSuccess(`Autorisation accordée. Il reste ${result.remaining} passage(s) pour ${client.nom_complet}.`);
      onGranted();
    } catch (cause) {
      setError((cause as { data?: { message?: string } })?.data?.message || 'Impossible d’accorder l’autorisation.');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        {client ? (
          <>
            <p className="mb-1 text-sm font-semibold text-slate-700">Client sélectionné</p>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
              <span className="min-w-0 break-words font-medium text-slate-900">
                {client.nom_complet}{client.reference ? ` · ${client.reference}` : ''}
              </span>
              <button
                type="button"
                aria-label="Changer de client"
                disabled={isGranting}
                onClick={() => { setClient(null); setEmployeeId(''); setError(''); }}
                className="min-h-8 shrink-0 font-semibold text-blue-700 hover:underline"
              >
                Changer
              </button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor={`${id}-client`} className="mb-1 block text-sm font-semibold text-slate-700">Client</label>
            <input
              id={`${id}-client`}
              type="search"
              className={inputClass}
              value={clientSearch}
              onChange={event => setClientSearch(event.target.value)}
              placeholder="Rechercher par nom ou référence"
              autoComplete="off"
            />
            {canSearch && (search !== searchTerm || clients.isFetching) && (
              <p role="status" className="mt-2 text-xs text-slate-500">Recherche des clients…</p>
            )}
            {canSearch && search === searchTerm && clients.isError && (
              <p role="alert" className="mt-2 text-xs text-red-700">La recherche a échoué. Modifiez votre recherche pour réessayer.</p>
            )}
            {canSearch && search === searchTerm && clients.currentData && (
              clients.currentData.data.length > 0 ? (
                <ul className="mt-2 max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {clients.currentData.data.map(result => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() => setClient(result)}
                        className="block min-h-11 w-full px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-blue-50 focus:bg-blue-50"
                      >
                        {result.nom_complet}
                        <span className="text-xs font-normal text-slate-500">{` · ${result.reference || result.telephone || `#${result.id}`}`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-xs text-slate-500">Aucun client trouvé.</p>
            )}
          </>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-employee`} className="mb-1 block text-sm font-semibold text-slate-700">Employé</label>
        <select
          id={`${id}-employee`}
          className={inputClass}
          value={employeeId}
          onChange={event => setEmployeeId(event.target.value)}
          disabled={!client || employees.isLoading || isGranting}
          required
        >
          <option value="">{employees.isLoading ? 'Chargement…' : 'Choisir un employé'}</option>
          {recipients.map(employee => (
            <option key={employee.id} value={employee.id}>
              {employee.nom_complet || employee.cin} · {employee.role} · {employee.cin}
            </option>
          ))}
        </select>
        {employees.isError && <p role="alert" className="mt-2 text-xs text-red-700">Impossible de charger les employés.</p>}
      </div>
      <div>
        <label htmlFor={`${id}-quantity`} className="mb-1 block text-sm font-semibold text-slate-700">Nombre de dépassements à ajouter</label>
        <input
          id={`${id}-quantity`}
          type="number"
          min={1}
          max={100000}
          step={1}
          className={inputClass}
          value={quantity}
          onChange={event => setQuantity(event.target.value)}
          disabled={!employeeId || isGranting}
          required
        />
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={!client || !employeeId || !quantity || isGranting}
        className="min-h-11 w-full rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {isGranting ? 'Enregistrement…' : 'Accorder l’autorisation'}
      </button>
    </form>
  );
}

export default function PlafondQuickAuthorization() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  if (user?.role !== 'PDG') return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Autoriser un dépassement de plafond"
          title="Autoriser un dépassement de plafond"
          className="fixed bottom-24 right-20 z-[60] grid h-14 w-14 place-items-center rounded-full border-2 border-white bg-blue-700 text-white shadow-lg shadow-blue-900/25 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 md:bottom-6 md:right-[5.5rem]"
        >
          <ShieldPlus className="h-6 w-6" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className="z-[70] max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle>Dépassement de plafond</DialogTitle>
          <DialogDescription>Accordez à un employé un nombre de dépassements pour un client précis.</DialogDescription>
        </DialogHeader>
        <AuthorizationForm onGranted={() => setIsOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
