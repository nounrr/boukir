import React, { useMemo, useState } from 'react';
import {
  Search, Users, Truck, Phone, Mail,
  DollarSign,
  ChevronUp, ChevronDown, Archive, Clock, Settings
} from 'lucide-react';
import type { Contact } from '../types';
import { 
  useGetClientsQuery, 
  useGetFournisseursQuery,
} from '../store/api/contactsApi';
import { formatDateDMY } from '../utils/dateUtils';
import PeriodConfig from '../components/PeriodConfig';

const ContactArchiverPage: React.FC = () => {
  const { data: clients = [] } = useGetClientsQuery();
  const { data: fournisseurs = [] } = useGetFournisseursQuery();

  // États locaux
  const [activeTab, setActiveTab] = useState<'clients' | 'fournisseurs'>('clients');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>('nom_complet');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // États pour la configuration des périodes
  const [showSettings, setShowSettings] = useState(false);
  const [inactiveValue, setInactiveValue] = useState(() => {
    const saved = localStorage.getItem('contacts-inactive-value');
    return saved ? parseInt(saved) : 4;
  });
  const [inactiveUnit, setInactiveUnit] = useState<'days' | 'months'>(() => {
    const saved = localStorage.getItem('contacts-inactive-unit');
    return (saved as 'days' | 'months') || 'months';
  });
  const [ignoreDate, setIgnoreDate] = useState(() => {
    const saved = localStorage.getItem('contacts-ignore-date');
    return saved === 'true';
  });
  
  // Sauvegarder les paramètres dans localStorage
  React.useEffect(() => {
    localStorage.setItem('contacts-inactive-value', inactiveValue.toString());
    localStorage.setItem('contacts-inactive-unit', inactiveUnit);
    localStorage.setItem('contacts-ignore-date', ignoreDate.toString());
  }, [inactiveValue, inactiveUnit, ignoreDate]);

  // Fonction pour calculer si un contact est inactif (solde = 0 depuis la période configurée)
  const isInactiveContact = (contact: Contact): boolean => {
    // Debug: vérifier les valeurs de solde
    const soldeBackend = contact.solde_cumule;
    const soldeLocal = contact.solde;
    
    // Utiliser solde_cumule du backend s'il existe, sinon fallback sur solde local
    let solde: number;
    if (soldeBackend != null) {
      solde = Number(soldeBackend);
    } else if (soldeLocal != null) {
      solde = Number(soldeLocal);
    } else {
      solde = 0;
    }
    
    // Vérifier si le solde est exactement 0
    if (solde !== 0) return false;
    
    // Si l'option "ignorer la date" est activée, considérer tous les contacts avec solde 0 comme inactifs
    if (ignoreDate) return true;
    
    // Si pas de date de dernière modification, considérer comme inactif
    if (!contact.updated_at) return true;
    
    try {
      const lastUpdate = new Date(contact.updated_at);
      const now = new Date();
      
      // Vérifier que la date est valide
      if (isNaN(lastUpdate.getTime())) {
        console.warn('Date invalide pour contact:', contact.id, contact.updated_at);
        return true; // Considérer comme inactif si date invalide
      }
      
      // Calculer la différence en millisecondes
      const diffMs = now.getTime() - lastUpdate.getTime();
      
      if (inactiveUnit === 'days') {
        // Convertir en jours
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return diffDays >= inactiveValue;
      } else {
        // Convertir en mois (approximatif: 30 jours par mois)
        const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
        return diffMonths >= inactiveValue;
      }
    } catch (error) {
      console.error('Erreur calcul date pour contact:', contact.id, error);
      return true; // En cas d'erreur, considérer comme inactif
    }
  };

  // Filtrage des contacts selon les critères
  const filteredContacts = useMemo(() => {
    const contactsToFilter = activeTab === 'clients' ? clients : fournisseurs;
    
    return contactsToFilter.filter(contact => {
      // Filtrer par terme de recherche
      const matchesSearch = !searchTerm || 
        contact.nom_complet?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.telephone?.includes(searchTerm) ||
        contact.email?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Inclure seulement les contacts inactifs (solde = 0 depuis +4 mois)
      const isArchivable = isInactiveContact(contact);
      
      return matchesSearch && isArchivable;
    });
  }, [clients, fournisseurs, activeTab, searchTerm, inactiveValue, inactiveUnit, ignoreDate]);

  // Tri des contacts par champ sélectionné
  const sortedContacts = useMemo(() => {
    return [...filteredContacts].sort((a, b) => {
      // Trier par le champ sélectionné
      let aValue = a[sortField as keyof Contact];
      let bValue = b[sortField as keyof Contact];
      
      // Gérer les valeurs null/undefined
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      
      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredContacts, sortField, sortDirection, isInactiveContact, inactiveValue, inactiveUnit, ignoreDate]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronUp className="w-4 h-4 opacity-30" />;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
  };

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Archive className="w-8 h-8 text-orange-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Contacts Archivés</h1>
            <p className="text-gray-600">
              Contacts inactifs avec solde à 0 depuis la période configurée
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              showSettings 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title="Paramètres d'inactivité"
          >
            <Settings size={16} />
            Paramètres
          </button>
        </div>
      </div>

      {/* Section Paramètres */}
      {showSettings && (
        <div className="mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                <Settings className="w-5 h-5 mr-2 text-blue-600" />
                Paramètres d'Inactivité
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PeriodConfig
                title="Période d'Inactivité"
                description="Contacts avec solde = 0 non modifiés depuis cette période seront considérés comme inactifs"
                value={inactiveValue}
                unit={inactiveUnit}
                onValueChange={setInactiveValue}
                onUnitChange={setInactiveUnit}
                icon={Clock}
                colorClass="yellow"
              />
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center mb-3">
                  <Settings className="w-5 h-5 text-blue-600 mr-2" />
                  <h3 className="text-sm font-medium text-blue-800">Options d'affichage</h3>
                </div>
                
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={ignoreDate}
                      onChange={(e) => setIgnoreDate(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                    <span className="ml-2 text-sm text-blue-800">
                      Ignorer la date - Afficher tous les contacts avec solde = 0
                    </span>
                  </label>
                  
                  <p className="text-xs text-blue-600 opacity-80">
                    {ignoreDate 
                      ? "Tous les contacts avec solde à 0 seront affichés, peu importe la date" 
                      : `Seuls les contacts avec solde à 0 depuis ${inactiveValue} ${inactiveUnit === 'days' ? 'jour(s)' : 'mois'} seront affichés`
                    }
                  </p>
                </div>
              </div>
            </div>
            
            {/* Section de diagnostic */}
            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-800 mb-3">🔍 Diagnostic avancé</h3>
              <div className="grid grid-cols-1 gap-3 text-xs">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <span className="font-medium">Total {activeTab} :</span>
                    <span className="ml-2 font-bold text-gray-600">
                      {activeTab === 'clients' ? clients.length : fournisseurs.length}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Avec solde = 0 :</span>
                    <span className="ml-2 font-bold text-blue-600">
                      {activeTab === 'clients' 
                        ? clients.filter(c => {
                            const solde = c.solde_cumule != null ? Number(c.solde_cumule) : Number(c.solde || 0);
                            return solde === 0;
                          }).length
                        : fournisseurs.filter(c => {
                            const solde = c.solde_cumule != null ? Number(c.solde_cumule) : Number(c.solde || 0);
                            return solde === 0;
                          }).length
                      }
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Archivables :</span>
                    <span className="ml-2 font-bold text-yellow-600">
                      {activeTab === 'clients' 
                        ? clients.filter(c => isInactiveContact(c)).length
                        : fournisseurs.filter(c => isInactiveContact(c)).length
                      }
                    </span>
                  </div>
                </div>
                
                {/* Debug détaillé */}
                <div className="mt-3 p-2 bg-white border rounded text-xs">
                  <div className="font-medium mb-2">🔬 Analyse détaillée (premiers 3 contacts avec solde = 0):</div>
                  {(() => {
                    const contactsWithZeroBalance = (activeTab === 'clients' ? clients : fournisseurs)
                      .filter(c => {
                        const solde = c.solde_cumule != null ? Number(c.solde_cumule) : Number(c.solde || 0);
                        return solde === 0;
                      })
                      .slice(0, 3);
                      
                    return contactsWithZeroBalance.map((contact) => {
                      const solde = contact.solde_cumule != null ? Number(contact.solde_cumule) : Number(contact.solde || 0);
                      const isInactive = isInactiveContact(contact);
                      const lastUpdate = contact.updated_at ? new Date(contact.updated_at) : null;
                      const daysSinceUpdate = lastUpdate ? Math.floor((new Date().getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24)) : null;
                      
                      return (
                        <div key={contact.id} className="mb-1 text-xs">
                          <strong>{contact.nom_complet || 'Sans nom'}</strong> - 
                          Solde: {solde} - 
                          Dernière MAJ: {contact.updated_at || 'Jamais'} - 
                          Il y a: {daysSinceUpdate || 'N/A'} jours - 
                          Inactif: {isInactive ? '✅' : '❌'}
                        </div>
                      );
                    });
                  })()}
                </div>
                
                <p className="text-xs text-gray-600 mt-2">
                  <strong>Configuration:</strong> {ignoreDate ? 'Ignorer date activé' : `Période: ${inactiveValue} ${inactiveUnit === 'days' ? 'jour(s)' : 'mois'}`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <Clock className="w-8 h-8 text-yellow-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Contacts Inactifs</p>
              <p className="text-2xl font-bold text-yellow-900">
                {filteredContacts.filter(c => isInactiveContact(c)).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <Archive className="w-8 h-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-blue-800">Total Archivables</p>
              <p className="text-2xl font-bold text-blue-900">
                {filteredContacts.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Onglets et recherche */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-6 space-y-4 sm:space-y-0">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab('clients')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'clients'
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Users className="w-4 h-4 inline mr-2" />
                Clients ({clients.filter(c => isInactiveContact(c)).length})
              </button>
              <button
                onClick={() => setActiveTab('fournisseurs')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'fournisseurs'
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Truck className="w-4 h-4 inline mr-2" />
                Fournisseurs ({fournisseurs.filter(c => isInactiveContact(c)).length})
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Tableau */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('nom_complet')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Nom</span>
                    <SortIcon field="nom_complet" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('solde_cumule')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Solde</span>
                    <SortIcon field="solde_cumule" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('updated_at')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Dernière MAJ</span>
                    <SortIcon field="updated_at" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedContacts.map((contact) => {
                const isInactive = isInactiveContact(contact);
                
                return (
                  <tr 
                    key={contact.id} 
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {contact.nom_complet || 'Sans nom'}
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="space-y-1">
                        {contact.telephone && (
                          <div className="flex items-center">
                            <Phone className="w-3 h-3 mr-2 text-gray-400" />
                            {contact.telephone}
                          </div>
                        )}
                        {contact.email && (
                          <div className="flex items-center">
                            <Mail className="w-3 h-3 mr-2 text-gray-400" />
                            {contact.email}
                          </div>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center">
                        <DollarSign className="w-4 h-4 mr-1 text-gray-400" />
                        <span className="font-medium text-gray-900">
                          {contact.solde_cumule?.toFixed(2) || '0.00'} DH
                        </span>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isInactive ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <Clock className="w-3 h-3 mr-1" />
                          Inactif
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Normal
                        </span>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {contact.updated_at ? formatDateDMY(contact.updated_at) : 'Jamais'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {sortedContacts.length === 0 && (
            <div className="text-center py-12">
              <Archive className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun contact archivable</h3>
              <p className="mt-1 text-sm text-gray-500">
                Aucun contact ne correspond aux critères d'archivage actuels.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactArchiverPage;