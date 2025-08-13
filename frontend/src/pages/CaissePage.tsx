import { useState } from 'react';
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
import type { Payment, Bon, Contact } from '../types';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { useGetClientsQuery, useGetFournisseursQuery } from '../store/api/contactsApi';
import { showSuccess, showError, showConfirmation } from '../utils/notifications';
import { resetFilters } from '../store/slices/paymentsSlice';
import { useGetPaymentsQuery, useCreatePaymentMutation, useUpdatePaymentMutation, useDeletePaymentMutation, useGetPersonnelNamesQuery } from '../store/api/paymentsApi';
import { useUploadPaymentImageMutation, useDeletePaymentImageMutation } from '../store/api/uploadApi';
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
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);

  // Redux data
  const user = useAppSelector(state => state.auth.user);
  const { data: clients = [] } = useGetClientsQuery();
  const { data: fournisseurs = [] } = useGetFournisseursQuery();
  const { data: paymentsApi = [] } = useGetPaymentsQuery();
  const payments = paymentsApi;
  const [createPayment] = useCreatePaymentMutation();
  const [updatePaymentApi] = useUpdatePaymentMutation();
  const [deletePaymentApi] = useDeletePaymentMutation();
  const [uploadPaymentImage] = useUploadPaymentImageMutation();
  const [deletePaymentImage] = useDeletePaymentImageMutation();
  const { data: personnelNames = [] } = useGetPersonnelNamesQuery();
  // Bons from database: only Sorties and Comptant (client-linked only)
  const { data: sorties = [], isLoading: sortiesLoading } = useGetBonsByTypeQuery('Sortie');
  const { data: comptantsRaw = [], isLoading: comptantsLoading } = useGetBonsByTypeQuery('Comptant');
  const bonsLoading = sortiesLoading || comptantsLoading;
  const bons: Bon[] = [
    ...(Array.isArray(sorties) ? sorties : []),
    ...(Array.isArray(comptantsRaw) ? comptantsRaw.filter((b: any) => !!b.client_id) : []),
  ];

  // Backend now provides payments; no mock seeding

  // Filtrer les paiements
  const filteredPayments = payments.filter((payment: Payment) => {
    const matchesSearch = String(payment.id).includes(searchTerm) ||
                         payment.numero?.toLowerCase?.().includes(searchTerm.toLowerCase()) ||
                         payment.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = !dateFilter || payment.date_paiement === dateFilter;
    
    const matchesMode = modeFilter === 'all' || payment.mode_paiement === modeFilter;
    
    return matchesSearch && matchesDate && matchesMode;
  });

  // Calculs statistiques
  const amountOf = (p: Payment) => Number(p.montant ?? p.montant_total ?? 0);
  const totalEncaissements = filteredPayments.reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalEspeces = filteredPayments
    .filter((p: Payment) => p.mode_paiement === 'Espèces')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalCheques = filteredPayments
    .filter((p: Payment) => p.mode_paiement === 'Chèque')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalVirements = filteredPayments
    .filter((p: Payment) => p.mode_paiement === 'Virement')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalTraites = filteredPayments
    .filter((p: Payment) => p.mode_paiement === 'Traite')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);

  const handleDelete = async (id: number) => {
    const result = await showConfirmation(
      'Cette action est irréversible.',
      'Êtes-vous sûr de vouloir supprimer ce paiement ?',
      'Oui, supprimer',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      try {
        await deletePaymentApi({ id }).unwrap();
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
 const toNull = (v: any, orig: any) => (orig === '' ? null : v);

 // On traite les dates comme des chaînes 'YYYY-MM-DD' pour éviter les conversions en Date par Yup
 const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

const paymentValidationSchema = Yup.object({
  montant: Yup.number()
    .typeError('Le montant doit être un nombre')
    .required('Montant est requis')
    .positive('Le montant doit être positif'),

  mode_paiement: Yup.mixed<'Espèces'|'Chèque'|'Virement'|'Traite'>()
    .oneOf(['Espèces','Chèque','Virement','Traite'], 'Mode invalide')
    .required('Mode de paiement est requis'),

  date_paiement: Yup.string()
    .required('Date de paiement est requise')
    .matches(ymdRegex, 'Date de paiement invalide (format attendu YYYY-MM-DD)'),

  contact_id: Yup.number()
    .transform((v, orig) => (orig === '' ? null : v))
    .typeError('Contact invalide')
    .integer('Contact invalide')
    .when('contact_optional', {
      is: true,
      then: (schema) => schema.nullable().notRequired(),
      otherwise: (schema) => schema.required('Contact est requis'),
    }),

  code_reglement: Yup.string()
    .transform(toNull)
    .nullable(),

  banque: Yup.string()
    .transform(toNull)
    .nullable(),

  personnel: Yup.string()
    .transform(toNull)
    .nullable(),

  date_echeance: Yup.string()
    .transform((v, orig) => (orig === '' ? null : v))
    .nullable()
    .test('ymd-format', 'Date d\'échéance invalide (format attendu YYYY-MM-DD)', (val) => {
      if (val == null || val === '') return true;
      return ymdRegex.test(val);
    }),

  notes: Yup.string().transform(toNull).nullable(),
  bon_id: Yup.number().transform((v, orig) => (orig === '' ? null : v)).nullable(),
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
    // Si c'est une image existante sur le serveur, on peut la supprimer
    if (selectedPayment?.image_url && !selectedImage) {
      deleteImageFromServer(selectedPayment.image_url);
    }
    setSelectedImage(null);
    setImagePreview('');
  };

  // Ajuster type/contact selon le bon choisi
  const onBonChange = (e: React.ChangeEvent<HTMLSelectElement>, setFieldValue: (f: string, v: any) => void, currentType: 'Client'|'Fournisseur') => {
    const val = e.target.value;
    setFieldValue('bon_id', val);
    const bon = bons.find((b: Bon) => String(b.id) === String(val));
    if (bon) {
      // Respect current selected payer type; just populate matching contact
      if (currentType === 'Fournisseur') {
        setFieldValue('contact_optional', false);
        const fid = bon.fournisseur_id;
        if (fid) setFieldValue('contact_id', String(fid));
      } else {
        if (bon.type === 'Comptant' && !bon.client_id) {
          setFieldValue('contact_optional', true);
          setFieldValue('contact_id', '');
        } else {
          setFieldValue('contact_optional', false);
          const cid = bon.client_id;
          if (cid) setFieldValue('contact_id', String(cid));
        }
      }
    } else {
      setFieldValue('type_paiement', 'Client');
      setFieldValue('contact_optional', false);
    }
  };

  // Fonction pour uploader l'image vers le serveur
  const uploadImageToServer = async (file: File): Promise<string> => {
    try {
      setUploadingImage(true);
      const result = await uploadPaymentImage(file).unwrap();
      if (result.success) {
        return result.imageUrl;
      } else {
        throw new Error(result.message || 'Erreur lors de l\'upload');
      }
    } catch (error: any) {
      console.error('Erreur upload image:', error);
      showError(error?.data?.message || error?.message || 'Erreur lors de l\'upload de l\'image');
      throw error;
    } finally {
      setUploadingImage(false);
    }
  };

  // Fonction pour supprimer une image du serveur
  const deleteImageFromServer = async (imageUrl: string): Promise<void> => {
    try {
      // Extraire le nom du fichier depuis l'URL
      const filename = imageUrl.split('/').pop();
      if (filename) {
        await deletePaymentImage(filename).unwrap();
      }
    } catch (error: any) {
      console.error('Erreur suppression image:', error);
      // Ne pas afficher d'erreur à l'utilisateur car c'est optionnel
    }
  };

  const getInitialValues = () => {
    if (selectedPayment) {
      const normDate = (d?: string) => {
        if (!d) return '';
        const s = String(d).slice(0, 10);
        if (s === '0000-00-00') return '';
        return s;
      };
      // Déterminer si le contact est optionnel (bon comptant sans client)
      let contactOptional = false;
      if (selectedPayment.bon_id) {
        const related = bons.find((b: Bon) => b.id === selectedPayment.bon_id);
        if (related && related.type === 'Comptant' && !related.client_id) {
          contactOptional = true;
        }
      }
      return {
        type_paiement: selectedPayment.type_paiement || 'Client',
        contact_optional: contactOptional,
        contact_id: selectedPayment.contact_id || '',
        bon_id: selectedPayment.bon_id || '',
        montant: selectedPayment.montant || selectedPayment.montant_total,
        mode_paiement: selectedPayment.mode_paiement,
        date_paiement: normDate(selectedPayment.date_paiement),
  // champs référence supprimés
        notes: selectedPayment.notes || selectedPayment.designation || '',
        banque: selectedPayment.banque || '',
        personnel: selectedPayment.personnel || '',
        date_echeance: normDate(selectedPayment.date_echeance) || '',
  code_reglement: selectedPayment.code_reglement || '',
      };
    }
    
  return {
      type_paiement: 'Client',
      contact_optional: false,
      contact_id: '',
      bon_id: '',
      montant: 0,
      mode_paiement: 'Espèces',
      date_paiement: new Date().toISOString().split('T')[0],
  // champs référence supprimés
      notes: '',
      banque: '',
      personnel: '',
      date_echeance: '',
  code_reglement: '',
    };
  };

  const toYMD = (val: any): string | null => {
    if (!val && val !== 0) return null;
    // Already in YYYY-MM-DD format
    if (typeof val === 'string') {
      if (val.match(/^\d{4}-\d{2}-\d{2}$/)) return val;
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return null;
    }
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return null;
  };

  const handleSubmit = async (values: any) => {
    try {
      // Upload de l'image si présente
      let imageUrl: string | null = selectedPayment?.image_url || '';
      if (selectedImage && (values.mode_paiement === 'Chèque' || values.mode_paiement === 'Traite')) {
        imageUrl = await uploadImageToServer(selectedImage);
      } else if (selectedPayment && !selectedImage && !imagePreview && selectedPayment.image_url) {
        // L'utilisateur a supprimé l'image existante
        imageUrl = null;
      }

      // Normaliser les champs optionnels (éviter '' pour les colonnes DATE/NULLABLE)
  const cleanedDatePaiement = toYMD(values.date_paiement);
      const cleanedBanque = values.banque?.trim() ? values.banque : null;
      const cleanedPersonnel = values.personnel?.trim() ? values.personnel : null;
  const cleanedDateEcheance = toYMD(values.date_echeance);
      const cleanedCodeReglement = values.code_reglement?.trim() ? values.code_reglement : null;

      const paymentData: any = {
        id: selectedPayment ? selectedPayment.id : Date.now(),
        type_paiement: values.type_paiement || 'Client',
        contact_id: values.contact_id ? Number(values.contact_id) : null,
        bon_id: values.bon_id ? Number(values.bon_id) : null,
        montant_total: Number(values.montant),
        montant: Number(values.montant), // Alias
        mode_paiement: values.mode_paiement,
        date_paiement: cleanedDatePaiement,
        designation: values.notes || '',
        notes: values.notes || '', // Alias
        // champs optionnels normalisés
        banque: cleanedBanque,
        personnel: cleanedPersonnel,
        date_echeance: cleanedDateEcheance,
        code_reglement: cleanedCodeReglement,
  image_url: imageUrl,
        created_by: user?.id || 1,
        updated_by: selectedPayment ? user?.id || 1 : undefined,
        created_at: selectedPayment ? selectedPayment.created_at : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (selectedPayment) {
  const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = paymentData;
        await updatePaymentApi({ id: selectedPayment.id, updated_by: user?.id || 1, ...rest }).unwrap();
        showSuccess('Paiement mis à jour avec succès');
      } else {
        const body: any = {
          type_paiement: paymentData.type_paiement,
          bon_id: paymentData.bon_id,
          montant_total: paymentData.montant_total,
          mode_paiement: paymentData.mode_paiement,
          date_paiement: paymentData.date_paiement,
          designation: paymentData.designation,
          date_echeance: paymentData.date_echeance,
          banque: paymentData.banque,
          personnel: paymentData.personnel,
          code_reglement: paymentData.code_reglement,
          image_url: paymentData.image_url,
          created_by: user?.id || 1,
        };
        if (paymentData.contact_id !== null) body.contact_id = paymentData.contact_id;
        await createPayment(body).unwrap();
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

  // Format date as YYYY-MM-DD for table display
  const formatYMD = (d?: string) => {
    if (!d) return '';
    if (d === '0000-00-00') return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    if (d.includes('T')) return d.slice(0, 10);
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return d;
  };

  const getReferencePlaceholder = (mode: string) => {
    switch (mode) {
      case 'Chèque':
  return 'Code/Numéro de chèque';
      case 'Virement':
  return 'Code/Numéro de virement';
      case 'Traite':
  return 'Code/Numéro de traite';
      default:
  return 'Code règlement (optionnel)';
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
                  Client / Fournisseur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mode de paiement
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
                      <div className="text-sm font-medium text-gray-900">{payment.id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatYMD(payment.date_paiement)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{getBonInfo(payment.bon_id)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            payment.type_paiement === 'Fournisseur'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {payment.type_paiement}
                        </span>
                        <span className="truncate max-w-[220px]" title={
                          payment.type_paiement === 'Fournisseur'
                            ? (fournisseurs.find(f => f.id === payment.contact_id)?.nom_complet || '-')
                            : (clients.find(c => c.id === payment.contact_id)?.nom_complet || '-')
                        }>
                          {payment.type_paiement === 'Fournisseur'
                            ? (fournisseurs.find(f => f.id === payment.contact_id)?.nom_complet || '-')
                            : (clients.find(c => c.id === payment.contact_id)?.nom_complet || '-')}
                        </span>
                      </div>
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
                      <div className="text-sm font-semibold text-gray-900">{Number(payment.montant ?? payment.montant_total ?? 0).toFixed(2)} DH</div>
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
              enableReinitialize
              validationSchema={paymentValidationSchema}
              onSubmit={handleSubmit}
            >
              {({ values, setFieldValue }) => {
                const isFournisseurPayment = values.type_paiement === 'Fournisseur';
                return (
                <Form className="space-y-6">
                  {/* Adjust grid for three inputs per row */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="type_paiement" className="block text-sm font-medium text-gray-700 mb-1">
                        Type de paiement
                      </label>
            <Field
                        as="select"
                        id="type_paiement"
                        name="type_paiement"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onChange={(e: any) => {
                          setFieldValue('type_paiement', e.target.value);
                          // reset contact to avoid mismatch between client/fournisseur lists
                          setFieldValue('contact_id', '');
              // also reset bon to force re-selection based on new filter
              setFieldValue('bon_id', '');
                        }}
                      >
                        <option value="Client">Client</option>
                        <option value="Fournisseur">Fournisseur</option>
                      </Field>
                    </div>
                    <div>
                      <label htmlFor="contact_id" className="block text-sm font-medium text-gray-700 mb-1">
                        {isFournisseurPayment ? 'Fournisseur payeur' : 'Client payeur'} {values.contact_optional ? '' : '*'}
                      </label>
                      <Field
                        as="select"
                        id="contact_id"
                        name="contact_id"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">{isFournisseurPayment ? 'Sélectionner un fournisseur' : 'Sélectionner un client'}</option>
                        {isFournisseurPayment
                          ? fournisseurs.map((f: Contact) => (
                              <option key={`f-${f.id}`} value={f.id}>
                                {f.nom_complet || `Fournisseur #${f.id}`}
                              </option>
                            ))
                          : clients.map((c: Contact) => (
                              <option key={`c-${c.id}`} value={c.id}>
                                {c.nom_complet || `Client #${c.id}`}
                              </option>
                            ))}
                      </Field>
                      <ErrorMessage name="contact_id" component="div" className="text-red-500 text-sm mt-1" />
                    </div>
                    {/* Numéro supprimé: il sera égal à l'ID automatiquement */}

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
                        onChange={(e: any) => onBonChange(e, setFieldValue, (values.type_paiement as 'Client'|'Fournisseur'))}
                      >
                        <option value="" disabled={bonsLoading}>
                          {bonsLoading ? 'Chargement des bons…' : 'Paiement libre'}
                        </option>
            {bons
              .filter((bon: Bon) => {
                if (bon.type === 'Avoir' || bon.type === 'AvoirFournisseur') return false;
                return values.type_paiement === 'Fournisseur'
                  ? bon.type === 'Commande'
                  : bon.type === 'Sortie' || bon.type === 'Comptant';
              })
              .map((bon: Bon) => (
                          <option key={bon.id} value={bon.id}>
              {bon.type} {bon.numero} - {Number(bon.montant_total ?? 0).toFixed(2)} DH
                          </option>
                        ))}
                      </Field>
                    </div>

                    <div>
                      <label htmlFor="code_reglement" className="block text-sm font-medium text-gray-700 mb-1">
                        Code règlement (optionnel)
                      </label>
                      <Field
                        id="code_reglement"
                        name="code_reglement"
                        type="text"
                        placeholder={getReferencePlaceholder(values.mode_paiement)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <ErrorMessage name="code_reglement" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    {/* Champs optionnels pour tous les types de paiement */}
                    <div>
                      <label htmlFor="banque" className="block text-sm font-medium text-gray-700 mb-1">
                        Banque (optionnel)
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
                        Nom de la personne (optionnel)
                      </label>
                      <div>
                        <Field
                          id="personnel"
                          name="personnel"
                          list="personnel_list"
                          placeholder="Rechercher ou saisir un nom"
                          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <datalist id="personnel_list">
                          {personnelNames.map((n) => (
                            <option key={n} value={n} />
                          ))}
                        </datalist>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        💡 Tapez pour rechercher dans la liste ou ajoutez un nouveau nom
                      </p>
                      <ErrorMessage name="personnel" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    <div>
                      <label htmlFor="date_echeance" className="block text-sm font-medium text-gray-700 mb-1">
                        Date d'échéance (optionnel)
                      </label>
                      <Field
                        id="date_echeance"
                        name="date_echeance"
                        type="date"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <ErrorMessage name="date_echeance" component="div" className="text-red-500 text-sm mt-1" />
                    </div>

                    {/* Upload d'image seulement pour Chèque et Traite */}
                    {(values.mode_paiement === 'Chèque' || values.mode_paiement === 'Traite') && (
                      <div className="col-span-2">
                        <label htmlFor="file_input" className="block text-sm font-medium text-gray-700 mb-1">
                          📷 Image du {values.mode_paiement === 'Chèque' ? 'chèque' : 'traite'} (optionnel)
                        </label>
                        <div className="space-y-3">
                          {imagePreview && (
                            <div className="relative inline-block">
                              <img
                                src={imagePreview.startsWith('http') || imagePreview.startsWith('blob:') 
                                  ? imagePreview 
                                  : `http://localhost:3001${imagePreview}`}
                                alt="Preview"
                                className="w-full max-w-xs h-32 object-cover rounded-lg border shadow-sm"
                                onError={(e) => {
                                  console.error('Erreur chargement preview:', imagePreview);
                                  e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRkZGIiBzdHJva2U9IiNEREQiLz4KPHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHg9IjMwIiB5PSIzMCI+CjxwYXRoIGQ9Ik04MCAyMEgyMEM5LjcgMjAgMCA5LjMgMCAyMFYzMEgxMDBWMjBDMTAwIDkuMyA5MC4zIDIwIDgwIDIwWiIgZmlsbD0iI0NDQyIvPgo8L3N2Zz4KPC9zdmc+';
                                }}
                              />
                              <button
                                type="button"
                                onClick={removeImage}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-md"
                                title="Supprimer l'image"
                                disabled={uploadingImage}
                              >
                                <X size={16} />
                              </button>
                            </div>
                          )}
                          {uploadingImage && (
                            <div className="flex items-center gap-2 text-blue-600">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                              <span className="text-sm">Upload en cours...</span>
                            </div>
                          )}
                          <input
                            id="file_input"
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/gif"
                            onChange={handleImageUpload}
                            disabled={uploadingImage}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <p className="text-xs text-gray-500">
                            📁 Formats acceptés: JPEG, JPG, PNG, GIF (max 5MB)
                          </p>
                        </div>
                      </div>
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
                );
              }}
            </Formik>
          </div>
        </div>
      )}

      {/* Modal de visualisation */}
      {isViewModalOpen && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Détails du Paiement {selectedPayment.id}</h2>
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
                  <p className="text-lg">{selectedPayment.id}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Date de paiement:</p>
                  <p className="text-lg">{formatYMD(selectedPayment.date_paiement)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Montant:</p>
                  <p className="text-xl font-bold text-blue-600">{Number(selectedPayment.montant ?? selectedPayment.montant_total ?? 0).toFixed(2)} DH</p>
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
                
                
                {/* Affichage des champs spécifiques aux chèques, traites et virements */}
                {(selectedPayment.mode_paiement === 'Chèque' || selectedPayment.mode_paiement === 'Traite' || selectedPayment.mode_paiement === 'Virement') && (
                  <>
          {selectedPayment.code_reglement && (
                      <div>
                        <p className="text-sm font-semibold text-gray-600">Code règlement:</p>
            <p className="text-lg">{selectedPayment.code_reglement}</p>
                      </div>
                    )}
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
            <p className="text-lg">{formatYMD(selectedPayment.date_echeance)}</p>
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
                      onClick={() => {
                        // Construire l'URL complète de l'image
                        const imageUrl = selectedPayment.image_url || '';
                        const fullImageUrl = imageUrl.startsWith('http') 
                          ? imageUrl 
                          : `http://localhost:3001${imageUrl}`;
                        window.open(fullImageUrl, '_blank');
                      }}
                      className="w-full focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                      title="Cliquer pour agrandir"
                    >
                      <img
                        src={(() => {
                          const imageUrl = selectedPayment.image_url || '';
                          return imageUrl.startsWith('http') 
                            ? imageUrl 
                            : `http://localhost:3001${imageUrl}`;
                        })()}
                        alt={`${selectedPayment.mode_paiement} ${selectedPayment.id}`}
                        className="w-full max-w-lg h-auto max-h-64 object-contain mx-auto rounded hover:opacity-90 transition-opacity"
                        onError={(e) => {
                          // En cas d'erreur de chargement, masquer l'image
                          console.error('Erreur chargement image:', selectedPayment.image_url);
                          e.currentTarget.style.display = 'none';
                        }}
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
