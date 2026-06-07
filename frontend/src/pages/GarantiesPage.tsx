import React, { useMemo, useState } from 'react';
import { Building2, Edit, Search, ShieldCheck, Users } from 'lucide-react';
import ContactFormModal from '../components/ContactFormModal';
import {
  useGetAllChargeClientsQuery,
  useGetAllClientsQuery,
  useGetAllFournisseursQuery,
} from '../store/api/contactsApi';
import type { Contact } from '../types';

type GarantieTab = 'clients' | 'fournisseurs' | 'charges';

const formatAmount = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getEffectiveLimit = (contact: Contact) => {
  const plafond = Number(contact.plafond);
  const garantie = Number(contact.montant_garantie);
  const values = [plafond, garantie].filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.min(...values) : null;
};

const hasGuarantee = (contact: Contact) => Number(contact.montant_garantie || 0) > 0;

const GarantiesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<GarantieTab>('clients');
  const [search, setSearch] = useState('');
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const { data: clients = [], isLoading: clientsLoading } = useGetAllClientsQuery();
  const { data: fournisseurs = [], isLoading: fournisseursLoading } = useGetAllFournisseursQuery();
  const { data: charges = [], isLoading: chargesLoading } = useGetAllChargeClientsQuery();

  const tabs = [
    { id: 'clients' as const, label: 'Garantie client', count: clients.filter(hasGuarantee).length },
    { id: 'fournisseurs' as const, label: 'Garantie fournisseur', count: fournisseurs.filter(hasGuarantee).length },
    { id: 'charges' as const, label: 'Garantie charge', count: charges.filter(hasGuarantee).length },
  ];

  const source = activeTab === 'clients' ? clients : activeTab === 'fournisseurs' ? fournisseurs : charges;
  const isLoading = activeTab === 'clients' ? clientsLoading : activeTab === 'fournisseurs' ? fournisseursLoading : chargesLoading;

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('fr');
    return source.filter((contact) => {
      if (!hasGuarantee(contact)) return false;
      if (!term) return true;
      return [
        contact.nom_complet,
        contact.societe,
        contact.telephone,
        contact.numero_garantie,
        contact.reference,
      ].some((value) => String(value || '').toLocaleLowerCase('fr').includes(term));
    });
  }, [search, source]);

  const guaranteedContacts = source.filter((contact) => Number(contact.montant_garantie || 0) > 0);
  const totalGuarantee = guaranteedContacts.reduce((sum, contact) => sum + Number(contact.montant_garantie || 0), 0);
  const contactType: 'Client' | 'Fournisseur' = activeTab === 'fournisseurs' ? 'Fournisseur' : 'Client';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <h1 className="text-xl font-bold text-gray-900">Garanties</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Suivi des montants et références de garantie.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 min-w-[320px]">
          <div className="border border-gray-200 bg-white rounded-md px-4 py-3">
            <p className="text-xs text-gray-500">Contacts garantis</p>
            <p className="text-lg font-bold text-gray-900">{guaranteedContacts.length}</p>
          </div>
          <div className="border border-emerald-200 bg-emerald-50 rounded-md px-4 py-3">
            <p className="text-xs text-emerald-700">Total garantie</p>
            <p className="text-lg font-bold text-emerald-800">{formatAmount(totalGuarantee)} DH</p>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            {tab.label}
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nom, société ou référence..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-14">#</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Société</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Plafond</th>
                <th className="text-right px-4 py-3 font-semibold text-emerald-700">Garantie</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">N° / référence</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Limite appliquée</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 w-20">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 7 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    {Array.from({ length: 8 }).map((__, cell) => (
                      <td key={cell} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center text-gray-400">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    Aucun contact trouvé
                  </td>
                </tr>
              ) : filteredContacts.map((contact, index) => {
                const effectiveLimit = getEffectiveLimit(contact);
                return (
                  <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Users className="w-4 h-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{contact.nom_complet || contact.societe || `Contact #${contact.id}`}</p>
                          <p className="text-xs text-gray-400">ID {contact.id}{contact.telephone ? ` · ${contact.telephone}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {contact.societe ? <span className="inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-gray-400" />{contact.societe}</span> : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-700">
                      {Number(contact.plafond || 0) > 0 ? `${formatAmount(contact.plafond)} DH` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">
                      {Number(contact.montant_garantie || 0) > 0 ? `${formatAmount(contact.montant_garantie)} DH` : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[220px] truncate" title={contact.numero_garantie || ''}>
                      {contact.numero_garantie || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {effectiveLimit !== null
                        ? <span className="inline-flex rounded bg-amber-50 px-2 py-1 font-semibold text-amber-800">{formatAmount(effectiveLimit)} DH</span>
                        : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingContact(contact)}
                        className="p-2 rounded-md text-emerald-700 hover:bg-emerald-50 transition-colors"
                        title="Modifier la garantie"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ContactFormModal
        isOpen={Boolean(editingContact)}
        onClose={() => setEditingContact(null)}
        contactType={contactType}
        initialValues={editingContact || undefined}
        defaultIsCharge={activeTab === 'charges'}
      />
    </div>
  );
};

export default GarantiesPage;
