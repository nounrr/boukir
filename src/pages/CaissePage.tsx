import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useAppSelector } from '../hooks/redux';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { 
  Plus, 
  Search, 
  Eye, 
  Edit, 
  Trash2, 
  CreditCard, 
  DollarSign,
  Receipt,
  Filter,
  Calendar,
  User,
  LogOut,
  X
} from 'lucide-react';
import type { Payment, Bon } from '../types';
import { showSuccess, showError, showConfirmation } from '../utils/notifications';
import { addPayment, deletePayment, resetFilters, updatePayment } from '../store/slices/paymentsSlice';
import { logout } from '../store/slices/authSlice';

const CaissePage = () => {
  const dispatch = useDispatch();
  
  // État local
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'Espèces' | 'Chèque' | 'Virement' | 'Traite'>('all');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  // Redux data
  const user = useAppSelector(state => state.auth.user);
  const payments = useAppSelector(state => (state as any).payments?.payments || []);
  const bons = useAppSelector(state => (state as any).bons?.bons || []);

  // Mock data - initialiser le store si vide
  const mockPayments = [
    {
      id: 1,
      numero: 'PAY-2024-001',
      type_paiement: 'Client' as const,
      contact_id: 5,
      bon_id: 1,
      montant_total: 17650.00,
      montant: 17650.00, // Alias
      mode_paiement: 'Virement' as const,
      date_paiement: '2024-01-20',
      designation: 'Paiement commande CMD-2024-001',
      notes: 'Paiement commande CMD-2024-001', // Alias
      reference_virement: 'VIR20240120001',
      reference: 'VIR20240120001', // Alias
      created_by: 2,
      created_at: '2024-01-20T16:00:00Z',
      updated_at: '2024-01-20T16:00:00Z',
    },
    {
      id: 2,
      numero: 'PAY-2024-002',
      type_paiement: 'Client' as const,
      contact_id: 6,
      bon_id: 2,
      montant_total: 9600.00,
      montant: 9600.00, // Alias
      mode_paiement: 'Chèque' as const,
      date_paiement: '2024-01-22',
      designation: 'Paiement bon de sortie SOR-2024-001',
      notes: 'Paiement bon de sortie SOR-2024-001', // Alias
      reference: 'CHQ1234567', // Numéro de chèque
      banque: 'BMCE Bank',
      personnel: 'Ahmed Benali',
      date_echeance: '2024-02-22',
      image_url: 'https://via.placeholder.com/400x200/3B82F6/FFFFFF?text=Ch%C3%A8que+DEMO', // URL d'image de démo
      created_by: 3,
      created_at: '2024-01-22T09:00:00Z',
      updated_at: '2024-01-22T09:00:00Z',
    },
    {
      id: 3,
      numero: 'PAY-2024-003',
      type_paiement: 'Client' as const,
      contact_id: 7,
      bon_id: 3,
      montant_total: 4000.00,
      montant: 4000.00, // Alias
      mode_paiement: 'Espèces' as const,
      date_paiement: '2024-01-25',
      designation: 'Paiement comptant CPT-2024-001',
      notes: 'Paiement comptant CPT-2024-001', // Alias
      created_by: 2,
      created_at: '2024-01-25T11:30:00Z',
      updated_at: '2024-01-25T11:30:00Z',
    },
    {
      id: 4,
      numero: 'PAY-2024-004',
      type_paiement: 'Fournisseur' as const,
      contact_id: 1,
      montant_total: 1500.00,
      montant: 1500.00, // Alias
      mode_paiement: 'Traite' as const,
      date_paiement: '2024-02-05',
      designation: 'Paiement divers - achat fournitures',
      notes: 'Paiement divers - achat fournitures', // Alias
      reference: 'TRAITE20240205001',
      banque: 'Attijariwafa Bank',
      personnel: 'Fatima Zohra',
      date_echeance: '2024-03-05',
      image_url: 'https://via.placeholder.com/400x200/F97316/FFFFFF?text=Traite+DEMO', // URL d'image de démo
      created_by: 4,
      created_at: '2024-02-05T13:00:00Z',
      updated_at: '2024-02-05T13:00:00Z',
    }
  ];

  // Initialiser le store avec des données de test si vide
  useEffect(() => {
    if (payments.length === 0) {
      mockPayments.forEach(payment => {
        dispatch(addPayment(payment));
      });
    }
  }, [payments.length, dispatch]);

  // Filtrer les paiements
  const filteredPayments = payments.filter((payment: Payment) => {
    const matchesSearch = payment.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = !dateFilter || payment.date_paiement === dateFilter;
    
    const matchesMode = modeFilter === 'all' || payment.mode_paiement === modeFilter;
    
    return matchesSearch && matchesDate && matchesMode;
  });

  // Calculs statistiques
  const totalEncaissements = filteredPayments.reduce((total: number, payment: Payment) => total + (payment.montant || payment.montant_total), 0);
  const totalEspeces = filteredPayments
    .filter((p: Payment) => p.mode_paiement === 'Espèces')
    .reduce((total: number, payment: Payment) => total + (payment.montant || payment.montant_total), 0);
  const totalCheques = filteredPayments
    .filter((p: Payment) => p.mode_paiement === 'Chèque')
    .reduce((total: number, payment: Payment) => total + (payment.montant || payment.montant_total), 0);
  const totalVirements = filteredPayments
    .filter((p: Payment) => p.mode_paiement === 'Virement')
    .reduce((total: number, payment: Payment) => total + (payment.montant || payment.montant_total), 0);
  const totalTraites = filteredPayments
    .filter((p: Payment) => p.mode_paiement === 'Traite')
    .reduce((total: number, payment: Payment) => total + (payment.montant || payment.montant_total), 0);

  const handleDelete = async (id: number) => {
    const result = await showConfirmation(
      'Cette action est irréversible.',
      'Êtes-vous sûr de vouloir supprimer ce paiement ?',
      'Oui, supprimer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        dispatch(deletePayment(id));
        showSuccess('Paiement supprimé avec succès');
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        showError('Erreur lors de la suppression du paiement');
      }
    }
  };

  const handleViewPayment = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsViewModalOpen(true);
  };

  const handleEditPayment = (payment: Payment) => {
    setSelectedPayment(payment);
    // Réinitialiser l'état de l'image
    setSelectedImage(null);
    setImagePreview(payment.image_url || '');
    setIsCreateModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setSelectedPayment(null);
    setSelectedImage(null);
    setImagePreview('');
  };

  const handleLogout = async () => {
    const result = await showConfirmation(
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      'Vous devrez vous reconnecter pour accéder à l\'application.',
      'Oui, se déconnecter',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      dispatch(logout());
      showSuccess('Déconnexion réussie');
    }
  };

  // Schéma de validation
  const paymentValidationSchema = Yup.object().shape({
    numero: Yup.string().required('Numéro est requis'),
    montant: Yup.number().required('Montant est requis').positive('Le montant doit être positif'),
    mode_paiement: Yup.string().required('Mode de paiement est requis'),
    date_paiement: Yup.date().required('Date de paiement est requise'),
    reference: Yup.string().when('mode_paiement', {
      is: (val: string) => val === 'Chèque' || val === 'Virement' || val === 'Traite',
      then: (schema) => schema.required('Référence est requise pour ce mode de paiement'),
      otherwise: (schema) => schema,
    }),
    banque: Yup.string().when('mode_paiement', {
      is: (val: string) => val === 'Chèque' || val === 'Traite',
      then: (schema) => schema.required('Banque est requise pour ce mode de paiement'),
      otherwise: (schema) => schema,
    }),
    personnel: Yup.string().when('mode_paiement', {
      is: (val: string) => val === 'Chèque' || val === 'Traite',
      then: (schema) => schema.required('Nom de la personne est requis pour ce mode de paiement'),
      otherwise: (schema) => schema,
    }),
    date_echeance: Yup.date().when('mode_paiement', {
      is: (val: string) => val === 'Chèque' || val === 'Traite',
      then: (schema) => schema.required('Date d\'échéance est requise pour ce mode de paiement'),
      otherwise: (schema) => schema,
    }),
  });

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Vérifier le type de fichier
      if (!file.type.startsWith('image/')) {
        showError('Veuillez sélectionner un fichier image valide');
        return;
      }
      
      // Vérifier la taille (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showError('La taille de l\'image ne doit pas dépasser 5MB');
        return;
      }
      
      setSelectedImage(file);
      
      // Créer une preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview('');
  };

  // Fonction pour simuler l'upload (en production, cela devrait être une API)
  const uploadImageToServer = async (file: File): Promise<string> => {
    // Simulation d'upload - en production, utilisez une vraie API
    return new Promise((resolve) => {
      setTimeout(() => {
        // Créer une URL fake pour la demo
        const fakeUrl = `uploads/cheques/${Date.now()}_${file.name}`;
        resolve(fakeUrl);
      }, 1000);
    });
  };

  const getInitialValues = () => {
    if (selectedPayment) {
      // Initialiser la preview de l'image si elle existe
      if (selectedPayment.image_url) {
        setImagePreview(selectedPayment.image_url);
      }
      
      return {
        numero: selectedPayment.numero,
        bon_id: selectedPayment.bon_id || '',
        montant: selectedPayment.montant || selectedPayment.montant_total,
        mode_paiement: selectedPayment.mode_paiement,
        date_paiement: selectedPayment.date_paiement,
        reference: selectedPayment.reference || selectedPayment.reference_virement || '',
        notes: selectedPayment.notes || selectedPayment.designation || '',
        banque: selectedPayment.banque || '',
        personnel: selectedPayment.personnel || '',
        date_echeance: selectedPayment.date_echeance || '',
      };
    }
    
    return {
      numero: `PAY-${new Date().getFullYear()}-${String(Date.now()).substring(8)}`,
      bon_id: '',
      montant: 0,
      mode_paiement: 'Espèces',
      date_paiement: new Date().toISOString().split('T')[0],
      reference: '',
      notes: '',
      banque: '',
      personnel: '',
      date_echeance: '',
    };
  };

  const handleSubmit = async (values: any) => {
    try {
      // Upload de l'image si présente
      let imageUrl = '';
      if (selectedImage && (values.mode_paiement === 'Chèque' || values.mode_paiement === 'Traite')) {
        imageUrl = await uploadImageToServer(selectedImage);
      }

      const paymentData: Payment = {
        id: selectedPayment ? selectedPayment.id : Date.now(),
        numero: values.numero,
        type_paiement: 'Client', // Par défaut, à adapter selon les besoins
        contact_id: 1, // Par défaut, à adapter selon les besoins
        bon_id: values.bon_id ? Number(values.bon_id) : undefined,
        montant_total: Number(values.montant),
        montant: Number(values.montant), // Alias
        mode_paiement: values.mode_paiement,
        date_paiement: values.date_paiement,
        designation: values.notes || '',
        notes: values.notes || '', // Alias
        reference_virement: values.mode_paiement === 'Virement' ? values.reference : undefined,
        reference: values.reference || '', // Alias
        banque: values.banque,
        personnel: values.personnel,
        date_echeance: values.date_echeance,
        image_url: imageUrl,
        created_by: user?.id || 1,
        updated_by: selectedPayment ? user?.id || 1 : undefined,
        created_at: selectedPayment ? selectedPayment.created_at : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (selectedPayment) {
        dispatch(updatePayment(paymentData));
        showSuccess('Paiement mis à jour avec succès');
      } else {
        dispatch(addPayment(paymentData));
        showSuccess('Paiement enregistré avec succès');
      }
      
      setIsCreateModalOpen(false);
      setSelectedPayment(null);
      setSelectedImage(null);
      setImagePreview('');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      showError('Erreur lors de la sauvegarde du paiement');
    }
  };

  const getBonInfo = (bonId?: number) => {
    if (!bonId) return 'Paiement libre';
    const bon = bons.find((b: Bon) => b.id === bonId);
    return bon ? `${bon.type} ${bon.numero}` : 'Bon supprimé';
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'Espèces':
        return <DollarSign size={16} className="text-green-600" />;
      case 'Chèque':
        return <Receipt size={16} className="text-blue-600" />;
      case 'Virement':
        return <CreditCard size={16} className="text-purple-600" />;
      case 'Traite':
        return <Receipt size={16} className="text-orange-600" />;
      default:
        return <DollarSign size={16} className="text-gray-600" />;
    }
  };

  const getReferencePlaceholder = (mode: string) => {
    switch (mode) {
      case 'Chèque':
        return 'Numéro de chèque';
      case 'Virement':
        return 'Référence virement';
      case 'Traite':
        return 'Numéro de traite';
      default:
        return 'Référence (optionnel)';
    }
  };

  return (
    <div className="p-6">
      {/* Header avec informations utilisateur */}
      <div className="flex justify-between items-center mb-6 bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Gestion de la Caisse</h1>
          {user && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User size={16} />
              <span className="font-medium">{user.nom_complet}</span>
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                {user.role}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setSelectedPayment(null);
              setSelectedImage(null);
              setImagePreview('');
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            <Plus size={20} />
            Nouveau Paiement
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            <LogOut size={20} />
            Déconnexion
          </button>
        </div>
      </div>

      {/* Statistiques de caisse */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Encaissements</p>
              <p className="text-2xl font-bold text-gray-900">{totalEncaissements.toFixed(2)} DH</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Espèces</p>
              <p className="text-xl font-bold text-green-600">{totalEspeces.toFixed(2)} DH</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Chèques</p>
              <p className="text-xl font-bold text-blue-600">{totalCheques.toFixed(2)} DH</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Receipt className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Virements</p>
              <p className="text-xl font-bold text-purple-600">{totalVirements.toFixed(2)} DH</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <CreditCard className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Traites</p>
              <p className="text-xl font-bold text-orange-600">{totalTraites.toFixed(2)} DH</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <Receipt className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-4 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Rechercher un paiement..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-80 pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-500" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-500" />
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tous les modes</option>
              <option value="Espèces">Espèces</option>
              <option value="Chèque">Chèque</option>
              <option value="Virement">Virement</option>
              <option value="Traite">Traite</option>
            </select>
          </div>
        </div>
        
        <button
          onClick={() => {
            setSearchTerm('');
            setDateFilter('');
            setModeFilter('all');
            dispatch(resetFilters());
          }}
          className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Réinitialiser les filtres
        </button>
      </div>

      {/* Table des paiements */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Numéro
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bon associé
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mode de paiement
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Référence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Montant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                    Aucun paiement trouvé
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment: Payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{payment.numero}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{payment.date_paiement}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{getBonInfo(payment.bon_id)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getModeIcon(payment.mode_paiement)}
                        <span className="text-sm text-gray-900">{payment.mode_paiement}</span>
                        {payment.image_url && (payment.mode_paiement === 'Chèque' || payment.mode_paiement === 'Traite') && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 ml-2">
                            📷 Image
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{payment.reference || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{(payment.montant || payment.montant_total).toFixed(2)} DH</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewPayment(payment)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Voir détails"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleEditPayment(payment)}
                          className="text-green-600 hover:text-green-900"
                          title="Modifier"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(payment.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de création/édition */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                {selectedPayment ? 'Modifier' : 'Enregistrer'} un paiement
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <Formik
              initialValues={getInitialValues()}
              validationSchema={paymentValidationSchema}
              onSubmit={handleSubmit}
            >
              {({ values }) => (
                <Form className="space-y-6">
                  {/* Adjust grid for three inputs per row */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="numero" className="block text-sm font-medium text-gray-700 mb-1">
                        Numéro *
                      </label>
                      <Field
                        id="numero"
                        name="numero"
                        type="text"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <ErrorMessage name="numero" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    <div>
                      <label htmlFor="date_paiement" className="block text-sm font-medium text-gray-700 mb-1">
                        Date de paiement *
                      </label>
                      <Field
                        id="date_paiement"
                        name="date_paiement"
                        type="date"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <ErrorMessage name="date_paiement" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    <div>
                      <label htmlFor="montant" className="block text-sm font-medium text-gray-700 mb-1">
                        Montant *
                      </label>
                      <Field
                        id="montant"
                        name="montant"
                        type="number"
                        step="0.01"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <ErrorMessage name="montant" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    <div>
                      <label htmlFor="mode_paiement" className="block text-sm font-medium text-gray-700 mb-1">
                        Mode de paiement *
                      </label>
                      <Field
                        as="select"
                        id="mode_paiement"
                        name="mode_paiement"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Espèces">Espèces</option>
                        <option value="Chèque">Chèque (avec possibilité d'image)</option>
                        <option value="Virement">Virement</option>
                        <option value="Traite">Traite (avec possibilité d'image)</option>
                      </Field>
                      <ErrorMessage name="mode_paiement" component="div" className="text-red-500 text-sm mt-1" />
                      <p className="text-xs text-gray-500 mt-1">
                        💡 Sélectionnez "Chèque" ou "Traite" pour pouvoir ajouter une image
                      </p>
                    </div>

                    <div>
                      <label htmlFor="bon_id" className="block text-sm font-medium text-gray-700 mb-1">
                        Bon associé (optionnel)
                      </label>
                      <Field
                        as="select"
                        id="bon_id"
                        name="bon_id"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Paiement libre</option>
                        {bons.map((bon: Bon) => (
                          <option key={bon.id} value={bon.id}>
                            {bon.type} {bon.numero} - {bon.montant_total.toFixed(2)} DH
                          </option>
                        ))}
                      </Field>
                    </div>

                    <div>
                      <label htmlFor="reference" className="block text-sm font-medium text-gray-700 mb-1">
                        Référence {(values.mode_paiement !== 'Espèces') && '*'}
                      </label>
                      <Field
                        id="reference"
                        name="reference"
                        type="text"
                        placeholder={getReferencePlaceholder(values.mode_paiement)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <ErrorMessage name="reference" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    {/* Champs spécifiques aux chèques et traites */}
                    {(values.mode_paiement === 'Chèque' || values.mode_paiement === 'Traite') && (
                      <>
                        <div>
                          <label htmlFor="banque" className="block text-sm font-medium text-gray-700 mb-1">
                            Banque *
                          </label>
                          <Field
                            id="banque"
                            name="banque"
                            type="text"
                            placeholder="Ex: BMCE Bank"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <ErrorMessage name="banque" component="div" className="text-red-500 text-sm mt-1" />
                        </div>

                        <div>
                          <label htmlFor="personnel" className="block text-sm font-medium text-gray-700 mb-1">
                            Nom de la personne *
                          </label>
                          <Field
                            id="personnel"
                            name="personnel"
                            type="text"
                            placeholder="Ex: Ahmed Benali"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <ErrorMessage name="personnel" component="div" className="text-red-500 text-sm mt-1" />
                        </div>

                        <div>
                          <label htmlFor="date_echeance" className="block text-sm font-medium text-gray-700 mb-1">
                            Date d'échéance *
                          </label>
                          <Field
                            id="date_echeance"
                            name="date_echeance"
                            type="date"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <ErrorMessage name="date_echeance" component="div" className="text-red-500 text-sm mt-1" />
                        </div>

                        {/* Upload d'image */}
                        <div className="col-span-2">
                          <label htmlFor="file_input" className="block text-sm font-medium text-gray-700 mb-1">
                            📷 Image du {values.mode_paiement === 'Chèque' ? 'chèque' : 'traite'} (optionnel)
                          </label>
                          <div className="space-y-3">
                            {imagePreview && (
                              <div className="relative inline-block">
                                <img
                                  src={imagePreview}
                                  alt="Preview"
                                  className="w-full max-w-xs h-32 object-cover rounded-lg border shadow-sm"
                                />
                                <button
                                  type="button"
                                  onClick={removeImage}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-md"
                                  title="Supprimer l'image"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            )}
                            <input
                              id="file_input"
                              type="file"
                              accept="image/jpeg,image/jpg,image/png"
                              onChange={handleImageUpload}
                              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <Field
                      as="textarea"
                      id="notes"
                      name="notes"
                      rows="3"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Informations complémentaires..."
                    />
                  </div>

                  <div className="flex justify-end space-x-6 pt-4">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                    >
                      {selectedPayment ? 'Mettre à jour' : 'Enregistrer'} le paiement
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* Modal de visualisation */}
      {isViewModalOpen && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Détails du Paiement {selectedPayment.numero}</h2>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-600">Numéro:</p>
                  <p className="text-lg">{selectedPayment.numero}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Date de paiement:</p>
                  <p className="text-lg">{selectedPayment.date_paiement}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Montant:</p>
                  <p className="text-xl font-bold text-blue-600">{(selectedPayment.montant || selectedPayment.montant_total).toFixed(2)} DH</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Mode de paiement:</p>
                  <div className="flex items-center gap-2">
                    {getModeIcon(selectedPayment.mode_paiement)}
                    <span className="text-lg">{selectedPayment.mode_paiement}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Bon associé:</p>
                  <p className="text-lg">{getBonInfo(selectedPayment.bon_id)}</p>
                </div>
                {selectedPayment.reference && (
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Référence:</p>
                    <p className="text-lg">{selectedPayment.reference}</p>
                  </div>
                )}
                
                {/* Affichage des champs spécifiques aux chèques et traites */}
                {(selectedPayment.mode_paiement === 'Chèque' || selectedPayment.mode_paiement === 'Traite') && (
                  <>
                    {selectedPayment.banque && (
                      <div>
                        <p className="text-sm font-semibold text-gray-600">Banque:</p>
                        <p className="text-lg">{selectedPayment.banque}</p>
                      </div>
                    )}
                    {selectedPayment.personnel && (
                      <div>
                        <p className="text-sm font-semibold text-gray-600">Nom de la personne:</p>
                        <p className="text-lg">{selectedPayment.personnel}</p>
                      </div>
                    )}
                    {selectedPayment.date_echeance && (
                      <div>
                        <p className="text-sm font-semibold text-gray-600">Date d'échéance:</p>
                        <p className="text-lg">{selectedPayment.date_echeance}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Affichage de l'image du chèque/traite */}
              {selectedPayment.image_url && (selectedPayment.mode_paiement === 'Chèque' || selectedPayment.mode_paiement === 'Traite') && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-gray-600 mb-3">
                    Image du {selectedPayment.mode_paiement === 'Chèque' ? 'chèque' : 'traite'}:
                  </p>
                  <div className="border rounded-lg overflow-hidden shadow-sm bg-gray-50 p-2">
                    <button
                      type="button"
                      onClick={() => window.open(selectedPayment.image_url, '_blank')}
                      className="w-full focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                      title="Cliquer pour agrandir"
                    >
                      <img
                        src={selectedPayment.image_url}
                        alt={`${selectedPayment.mode_paiement} ${selectedPayment.numero}`}
                        className="w-full max-w-lg h-auto max-h-64 object-contain mx-auto rounded hover:opacity-90 transition-opacity"
                      />
                    </button>
                    <p className="text-xs text-gray-500 text-center mt-2">
                      Cliquez sur l'image pour l'agrandir
                    </p>
                  </div>
                </div>
              )}

              {selectedPayment.notes && (
                <div>
                  <p className="text-sm font-semibold text-gray-600">Notes:</p>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-md">{selectedPayment.notes}</p>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-xs text-gray-500">
                  Créé le {new Date(selectedPayment.created_at).toLocaleString('fr-FR')}
                  {selectedPayment.updated_at !== selectedPayment.created_at && (
                    <>
                      <br />
                      Modifié le {new Date(selectedPayment.updated_at).toLocaleString('fr-FR')}
                    </>
                  )}
                </p>
              </div>

              <div className="flex justify-end space-x-6 pt-4">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Fermer
                </button>
                <button
                  onClick={() => {
                    setIsViewModalOpen(false);
                    handleEditPayment(selectedPayment);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                >
                  Modifier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CaissePage;
