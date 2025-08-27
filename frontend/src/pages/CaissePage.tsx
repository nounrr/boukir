import { useState, useMemo } from 'react';
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
  Check,
  Clock,
  XCircle,
  CreditCard, 
  DollarSign,
  Receipt,
  Filter,
  Calendar,
  User,
  LogOut,
  X,
  Printer,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import type { Payment, Bon, Contact } from '../types';
import { getBonNumeroDisplay } from '../utils/numero';
import { useGetBonsByTypeQuery } from '../store/api/bonsApi';
import { useGetClientsQuery, useGetFournisseursQuery } from '../store/api/contactsApi';
import { useGetTalonsQuery } from '../store/api/talonsApi';
import { showSuccess, showError, showConfirmation } from '../utils/notifications';
import { formatDateTimeWithHour, formatDateInputToMySQL, formatMySQLToDateTimeInput, getCurrentDateTimeInput } from '../utils/dateUtils';
import { resetFilters } from '../store/slices/paymentsSlice';
import { toBackendUrl } from '../utils/url';
import { useGetPaymentsQuery, useCreatePaymentMutation, useUpdatePaymentMutation, useDeletePaymentMutation, useGetPersonnelNamesQuery, useChangePaymentStatusMutation } from '../store/api/paymentsApi';
import { useUploadPaymentImageMutation, useDeletePaymentImageMutation } from '../store/api/uploadApi';
import SearchableSelect from '../components/SearchableSelect';
import { logout } from '../store/slices/authSlice';
import PaymentPrintModal from '../components/PaymentPrintModal';

const CaissePage = () => {
  const dispatch = useDispatch();
  
  // État local
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [modeFilter, setModeFilter] = useState<'all' | 'Espèces' | 'Chèque' | 'Virement' | 'Traite'>('all');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [createOpenedAt, setCreateOpenedAt] = useState<string | null>(null); // capture datetime à l'ouverture du modal création

  // Sorting
  const [sortField, setSortField] = useState<'numero' | 'date' | 'contact' | 'montant' | 'echeance' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Redux data
  const user = useAppSelector(state => state.auth.user);
  const { data: clients = [] } = useGetClientsQuery();
  const { data: fournisseurs = [] } = useGetFournisseursQuery();
  const { data: talons = [] } = useGetTalonsQuery(undefined);
  const { data: paymentsApi = [] } = useGetPaymentsQuery();
  const payments = paymentsApi;
  const [createPayment] = useCreatePaymentMutation();
  const [updatePaymentApi] = useUpdatePaymentMutation();
  const [deletePaymentApi] = useDeletePaymentMutation();
  const [changePaymentStatusApi] = useChangePaymentStatusMutation();
  const [uploadPaymentImage] = useUploadPaymentImageMutation();
  const [deletePaymentImage] = useDeletePaymentImageMutation();
  const { data: personnelNames = [] } = useGetPersonnelNamesQuery();
  // Bons from database: only Sorties and Comptant (client-linked only)
  const { data: sorties = [], isLoading: sortiesLoading } = useGetBonsByTypeQuery('Sortie');
  const { data: comptantsRaw = [], isLoading: comptantsLoading } = useGetBonsByTypeQuery('Comptant');
  const { data: commandes = [], isLoading: commandesLoading } = useGetBonsByTypeQuery('Commande');
  const bonsLoading = sortiesLoading || comptantsLoading || commandesLoading;
  const bons: Bon[] = [
    ...(Array.isArray(sorties) ? sorties : []),
    ...(Array.isArray(comptantsRaw) ? comptantsRaw.filter((b: any) => !!b.client_id) : []),
    ...(Array.isArray(commandes) ? commandes : []),
  ];

  // Backend now provides payments; no mock seeding

  // Available statuses for payments
  const availableStatuses = ['En attente', 'Validé', 'Refusé', 'Annulé'];

  // Handle sorting
  const handleSort = (field: 'numero' | 'date' | 'contact' | 'montant' | 'echeance') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filtrer et trier les paiements
  const sortedPayments = useMemo(() => {
    // First filter
    const filtered = payments.filter((payment: Payment) => {
      const term = searchTerm.trim().toLowerCase();
      // Compute display payment number (e.g., PAY01) to allow searching by it
      const displayPayNum = (() => {
        const idStr = String(payment?.id ?? '').trim();
        if (!idStr) return '';
        return `pay${idStr.padStart(2, '0')}`.toLowerCase();
      })();

      // Search includes payment fields and linked contact name (client or fournisseur)
      const contactName = (() => {
        // try to use explicit fields if present
        const byName = (payment as any).contact_nom || (payment as any).client_nom || (payment as any).fournisseur_nom || '';
        if (byName) return String(byName).toLowerCase();
        // fallback: try to lookup in clients/fournisseurs arrays
        const cid = String((payment as any).contact_id || (payment as any).client_id || (payment as any).fournisseur_id || '');
        if (cid) {
          const c = clients.find((cl: any) => String(cl.id) === cid);
          if (c) return String(c.nom_complet || '').toLowerCase();
          const f = fournisseurs.find((fo: any) => String(fo.id) === cid);
          if (f) return String(f.nom_complet || '').toLowerCase();
        }
        return '';
      })();

      // Include contact company name (société) in search
      const contactSociete = (() => {
        const cid = String((payment as any).contact_id || (payment as any).client_id || (payment as any).fournisseur_id || '');
        if (!cid) return '';
        const c = clients.find((cl: any) => String(cl.id) === cid);
        const f = c ? undefined : fournisseurs.find((fo: any) => String(fo.id) === cid);
        const s = c?.societe ?? f?.societe;
        return s ? String(s).toLowerCase() : '';
      })();

      const matchesSearch = !term || (
        String(payment.id).includes(term) ||
        (payment.numero?.toLowerCase?.() || '').includes(term) ||
        displayPayNum.includes(term) ||
        (payment.notes?.toLowerCase?.() || '').includes(term) ||
        contactName.includes(term) ||
        contactSociete.includes(term)
      );

      const matchesDate = !dateFilter || payment.date_paiement === dateFilter;

      const matchesMode = modeFilter === 'all' || payment.mode_paiement === modeFilter;

      const matchesStatus = (() => {
        if (!statusFilter || (Array.isArray(statusFilter) && statusFilter.length === 0)) return true;
        const pStat = String((payment as any).statut || '').toString();
        return statusFilter.includes(pStat);
      })();

      return matchesSearch && matchesDate && matchesMode && matchesStatus;
    });

    // Then sort
    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      const getContactName = (payment: Payment) => {
        const byName = (payment as any).contact_nom || (payment as any).client_nom || (payment as any).fournisseur_nom || '';
        if (byName) return String(byName).toLowerCase();
        const cid = String((payment as any).contact_id || (payment as any).client_id || (payment as any).fournisseur_id || '');
        if (cid) {
          const c = clients.find((cl: any) => String(cl.id) === cid);
          if (c) return String(c.nom_complet || '').toLowerCase();
          const f = fournisseurs.find((fo: any) => String(fo.id) === cid);
          if (f) return String(f.nom_complet || '').toLowerCase();
        }
        return '';
      };

      const getDisplayNumeroPayment = (payment: Payment) => {
        const id = String(payment?.id ?? '').trim();
        if (!id) return '';
        return `PAY${id.padStart(2, '0')}`;
      };

      switch (sortField) {
        case 'numero':
          aValue = getDisplayNumeroPayment(a).toLowerCase();
          bValue = getDisplayNumeroPayment(b).toLowerCase();
          break;
        case 'date':
          aValue = new Date(a.date_paiement || 0).getTime();
          bValue = new Date(b.date_paiement || 0).getTime();
          break;
        case 'contact':
          aValue = getContactName(a);
          bValue = getContactName(b);
          break;
        case 'montant':
          aValue = Number(a.montant || a.montant_total || 0);
          bValue = Number(b.montant || b.montant_total || 0);
          break;
        case 'echeance':
          aValue = a.date_echeance ? new Date(a.date_echeance).getTime() : Number.POSITIVE_INFINITY;
          bValue = b.date_echeance ? new Date(b.date_echeance).getTime() : Number.POSITIVE_INFINITY;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [payments, searchTerm, dateFilter, statusFilter, modeFilter, sortField, sortDirection, clients, fournisseurs]);

  // Calculs statistiques
  const amountOf = (p: Payment) => Number(p.montant ?? p.montant_total ?? 0);
  const totalEncaissements = sortedPayments.reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalEspeces = sortedPayments
    .filter((p: Payment) => p.mode_paiement === 'Espèces')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalCheques = sortedPayments
    .filter((p: Payment) => p.mode_paiement === 'Chèque')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalVirements = sortedPayments
    .filter((p: Payment) => p.mode_paiement === 'Virement')
    .reduce((total: number, p: Payment) => total + amountOf(p), 0);
  const totalTraites = sortedPayments
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

  const handlePrintPayment = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsPrintModalOpen(true);
  };

  // Change payment statut helper (only change statut via table actions)
  const changePaymentStatus = async (paymentId: number, newStatut: 'En attente'|'Validé'|'Refusé'|'Annulé') => {
    try {
      await changePaymentStatusApi({ id: paymentId, statut: newStatut }).unwrap();
      showSuccess(`Statut mis à jour: ${newStatut}`);
    } catch (err: any) {
      console.error('Erreur mise à jour statut:', err);
      showError(err?.data?.message || err?.message || 'Erreur lors de la mise à jour du statut');
    }
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
 // Regex pour datetime-local: YYYY-MM-DDTHH:MM
 const datetimeLocalRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

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
    .matches(datetimeLocalRegex, 'Date de paiement invalide (format attendu YYYY-MM-DDTHH:MM)'),

  statut: Yup.string()
    .oneOf(['En attente','Validé','Refusé','Annulé'], 'Statut invalide')
    .required('Statut est requis'),

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
  talon_id: Yup.number().transform((v, orig) => (orig === '' ? null : v)).nullable(),
});

  // Function to display payment numbers with PAY prefix
  const getDisplayNumeroPayment = (payment: Payment) => {
    const id = String(payment?.id ?? '').trim();
    if (!id) return '';
    return `PAY${id.padStart(2, '0')}`;
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Vérifier le type de fichier
      if (!file.type.startsWith('image/')) {
        showError('Veuillez sélectionner un fichier image valide');
        return;
      }
  // Taille illimitée acceptée (suppression de la limite 5MB)
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
      let contactOptional = false;
      if (selectedPayment.bon_id) {
        const related = bons.find((b: Bon) => b.id === selectedPayment.bon_id);
        if (related && related.type === 'Comptant' && !related.client_id) contactOptional = true;
      }
      return {
        type_paiement: selectedPayment.type_paiement || 'Client',
        contact_optional: contactOptional,
        contact_id: selectedPayment.contact_id || '',
        bon_id: selectedPayment.bon_id || '',
        montant: selectedPayment.montant || selectedPayment.montant_total,
        mode_paiement: selectedPayment.mode_paiement,
        statut: selectedPayment.statut || 'En attente',
        date_paiement: formatMySQLToDateTimeInput(selectedPayment.date_paiement),
        notes: selectedPayment.notes || selectedPayment.designation || '',
        banque: selectedPayment.banque || '',
        personnel: selectedPayment.personnel || '',
        date_echeance: selectedPayment.date_echeance || '',
        code_reglement: selectedPayment.code_reglement || '',
        talon_id: selectedPayment.talon_id || '',
      };
    }
    return {
      type_paiement: 'Client',
      contact_optional: false,
      contact_id: '',
      bon_id: '',
      montant: 0,
      mode_paiement: 'Espèces',
      statut: 'En attente',
      date_paiement: createOpenedAt || getCurrentDateTimeInput(),
      notes: '',
      banque: '',
      personnel: '',
      date_echeance: '',
      code_reglement: '',
      talon_id: '',
    };
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
      // Utiliser les nouvelles fonctions pour gérer les DATETIME
      const cleanedDatePaiement = formatDateInputToMySQL(values.date_paiement); // Datetime-local inclut déjà l'heure
      const cleanedBanque = values.banque?.trim() ? values.banque : null;
      const cleanedPersonnel = values.personnel?.trim() ? values.personnel : null;
      // date_echeance reste en format DATE (YYYY-MM-DD)
      const cleanedDateEcheance = values.date_echeance?.trim() ? values.date_echeance : null;
      const cleanedCodeReglement = values.code_reglement?.trim() ? values.code_reglement : null;
      const cleanedTalonId = values.talon_id ? Number(values.talon_id) : null;

  const paymentData: any = {
        id: selectedPayment ? selectedPayment.id : Date.now(),
        type_paiement: values.type_paiement || 'Client',
        contact_id: values.contact_id ? Number(values.contact_id) : null,
        bon_id: values.bon_id ? Number(values.bon_id) : null,
        montant_total: Number(values.montant),
        montant: Number(values.montant), // Alias
        mode_paiement: values.mode_paiement,
  statut: values.statut,
        date_paiement: cleanedDatePaiement,
        designation: values.notes || '',
        notes: values.notes || '', // Alias
        // champs optionnels normalisés
        banque: cleanedBanque,
        personnel: cleanedPersonnel,
        date_echeance: cleanedDateEcheance,
        code_reglement: cleanedCodeReglement,
        talon_id: cleanedTalonId,
  image_url: imageUrl,
        created_by: user?.id || 1,
        updated_by: selectedPayment ? user?.id || 1 : undefined,
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
          statut: paymentData.statut,
          date_paiement: paymentData.date_paiement,
          designation: paymentData.designation,
          date_echeance: paymentData.date_echeance,
          banque: paymentData.banque,
          personnel: paymentData.personnel,
          code_reglement: paymentData.code_reglement,
          talon_id: paymentData.talon_id,
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
    return bon ? `${bon.type} ${getBonNumeroDisplay(bon)}` : 'Bon supprimé';
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

  const displayStatut = (s?: string) => {
    if (!s) return '-';
  const norm = String(s).toLowerCase();
  if (norm === 'en attente' || norm === 'attente') return 'En attente';
  if (norm === 'validé' || norm === 'valide') return 'Validé';
  if (norm === 'refusé' || norm === 'refuse') return 'Refusé';
  if (norm === 'annulé' || norm === 'annule') return 'Annulé';
  return s;
  };

  function getStatusClasses(statut?: string) {
    switch (String(statut || '').trim()) {
      case 'Brouillon':
        return 'bg-gray-200 text-gray-700';
      case 'Validé':
      case 'Accepté':
      case 'Livré':
        return 'bg-green-200 text-green-700';
      case 'En attente':
      case 'Envoyé':
        return 'bg-blue-200 text-blue-700';
      case 'Avoir':
        return 'bg-purple-200 text-purple-700';
      case 'Annulé':
      case 'Refusé':
      case 'Expiré':
        return 'bg-red-200 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }

  const getStatusIcon = (statut?: string) => {
  const s = String(statut || '').toLowerCase();
  // Icons should inherit the text color from the badge container
  if (s.includes('en attente') || s === 'attente') return <Clock size={14} className="text-current" />;
  if (s.includes('valid')) return <Check size={14} className="text-current" />;
  // Use XCircle for refusé/annulé to keep a consistent filled cross icon
  if (s.includes('refus')) return <XCircle size={14} className="text-current" />;
  if (s.includes('annul')) return <XCircle size={14} className="text-current" />;
  return null;
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
    <div className="p-4 sm:p-6">
      {/* Header avec informations utilisateur */}
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center mb-6 bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Gestion de la Caisse</h1>
          {user && (
            <div className="flex items-center flex-wrap gap-2 text-sm text-gray-600">
              <User size={16} />
              <span className="font-medium truncate max-w-[160px] sm:max-w-none">{user.nom_complet}</span>
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                {user.role}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              setSelectedPayment(null);
              setSelectedImage(null);
              setImagePreview('');
              setCreateOpenedAt(getCurrentDateTimeInput());
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors text-sm"
          >
            <Plus size={18} className="shrink-0" />
            <span className="whitespace-nowrap">Nouveau Paiement</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors text-sm"
          >
            <LogOut size={18} className="shrink-0" />
            <span className="whitespace-nowrap">Déconnexion</span>
          </button>
        </div>
      </div>

  {/* Statistiques de caisse */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
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
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center mb-6">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 items-start sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Rechercher (N° paiement, Nom, Société, Notes)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-80 pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar size={16} className="text-gray-500" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={16} className="text-gray-500" />
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value as any)}
              className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tous les modes</option>
              <option value="Espèces">Espèces</option>
              <option value="Chèque">Chèque</option>
              <option value="Virement">Virement</option>
              <option value="Traite">Traite</option>
            </select>
          </div>

          <div className="flex items-start gap-2 w-full sm:w-auto">
            <label className="text-sm text-gray-600">Statut</label>
            <select
              multiple
              value={statusFilter}
              onChange={(e) => setStatusFilter(Array.from(e.target.selectedOptions).map(o => o.value))}
              className="px-2 py-2 border border-gray-300 rounded-md h-28 text-sm"
              title="Filtrer par statut (sélection multiple)"
            >
              {availableStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex flex-col gap-2 ml-2 shrink-0">
              <button type="button" className="px-2 py-1 bg-gray-100 rounded text-xs" onClick={() => setStatusFilter([])}>Tous</button>
              <button type="button" className="px-2 py-1 bg-gray-100 rounded text-xs" onClick={() => setStatusFilter([...availableStatuses])}>Tout</button>
            </div>
          </div>
        </div>
        
        <button
          onClick={() => {
            setSearchTerm('');
            setDateFilter('');
            setModeFilter('all');
            setStatusFilter([]);
            dispatch(resetFilters());
          }}
          className="self-start md:self-auto px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
        >
          Réinitialiser les filtres
        </button>
      </div>

      {/* Table des paiements (desktop) */}
      <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
        <div className="responsive-table-container gradient-mask">
          <table className="responsive-table responsive-table-min divide-y divide-gray-200 text-sm table-sticky-header">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('numero')}
                >
                  <div className="flex items-center gap-1">
                    Numéro
                    {sortField === 'numero' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-1">
                    Date paiement
                    {sortField === 'date' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bon associé
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('contact')}
                >
                  <div className="flex items-center gap-1">
                    Client / Fournisseur
                    {sortField === 'contact' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Société
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mode de paiement
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('montant')}
                >
                  <div className="flex items-center gap-1">
                    Montant
                    {sortField === 'montant' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('echeance')}
                >
                  <div className="flex items-center gap-1">
                    Échéance
                    {sortField === 'echeance' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedPayments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-4 text-center text-sm text-gray-500">
                    Aucun paiement trouvé
                  </td>
                </tr>
              ) : (
                sortedPayments.map((payment: Payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{getDisplayNumeroPayment(payment)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-700">{formatDateTimeWithHour(payment.date_paiement)}</div>
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
                      <div className="text-sm text-gray-900 truncate max-w-[220px]" title={
                        payment.type_paiement === 'Fournisseur'
                          ? (fournisseurs.find(f => f.id === payment.contact_id)?.societe || '-')
                          : (clients.find(c => c.id === payment.contact_id)?.societe || '-')
                      }>
                        {payment.type_paiement === 'Fournisseur'
                          ? (fournisseurs.find(f => f.id === payment.contact_id)?.societe || '-')
                          : (clients.find(c => c.id === payment.contact_id)?.societe || '-')}
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payment.date_echeance ? formatYMD(payment.date_echeance) : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <span className={`inline-flex items-center gap-2 px-2 py-1 text-xs font-semibold rounded-full ${getStatusClasses(displayStatut(payment.statut))}`}>
                          {getStatusIcon(displayStatut(payment.statut))}
                          {displayStatut(payment.statut)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        {/* Status action buttons (table-only) */}
                        <div className="flex items-center gap-1">
                          {/* En attente */}
                          <button
                            onClick={() => changePaymentStatus(payment.id, 'En attente')}
                            title="Mettre en attente"
                            className={`${payment.statut === 'En attente' ? 'text-yellow-700' : 'text-gray-500 hover:text-yellow-700'} p-1 rounded`}
                            disabled={payment.statut === 'En attente'}
                          >
                            <Clock size={20} />
                          </button>

                          {/* For employees allow only En attente and Annulé, others see all options */}
                          { (user?.role === 'Employé') ? (
                            <>
                              {/* Annulé */}
                              <button
                                onClick={() => changePaymentStatus(payment.id, 'Annulé')}
                                title="Annuler"
                                className={`${payment.statut === 'Annulé' ? 'text-red-700' : 'text-gray-500 hover:text-red-700'} p-1 rounded`}
                                disabled={payment.statut === 'Annulé'}
                              >
                                <XCircle size={20} />
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Validé */}
                              <button
                                onClick={() => changePaymentStatus(payment.id, 'Validé')}
                                title="Valider"
                                className={`${payment.statut === 'Validé' ? 'text-green-600' : 'text-gray-500 hover:text-green-600'} p-1 rounded`}
                                disabled={payment.statut === 'Validé'}
                              >
                                <Check size={20} />
                              </button>

                              {/* Refusé */}
                              <button
                                onClick={() => changePaymentStatus(payment.id, 'Refusé')}
                                title="Refuser"
                                className={`${payment.statut === 'Refusé' ? 'text-orange-600' : 'text-gray-500 hover:text-orange-600'} p-1 rounded`}
                                disabled={payment.statut === 'Refusé'}
                              >
                                <X size={20} />
                              </button>

                              {/* Annulé */}
                              <button
                                onClick={() => changePaymentStatus(payment.id, 'Annulé')}
                                title="Annuler"
                                className={`${payment.statut === 'Annulé' ? 'text-red-700' : 'text-gray-500 hover:text-red-700'} p-1 rounded`}
                                disabled={payment.statut === 'Annulé'}
                              >
                                <XCircle size={20} />
                              </button>
                            </>
                          )}
                        </div>

                        {/* Existing actions: view / edit / delete */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewPayment(payment)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Voir détails"
                          >
                            <Eye size={20} />
                          </button>
                          <button
                            onClick={() => handleEditPayment(payment)}
                            className="text-green-600 hover:text-green-900"
                            title="Modifier"
                          >
                            <Edit size={20} />
                          </button>
                          <button
                            onClick={() => handlePrintPayment(payment)}
                            className="text-purple-600 hover:text-purple-900"
                            title="Imprimer"
                          >
                            <Printer size={20} />
                          </button>
                          {user?.role !== 'Employé' && (
                            <button
                              onClick={() => handleDelete(payment.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Supprimer"
                            >
                              <Trash2 size={20} />
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Liste mobile des paiements */}
      <div className="md:hidden space-y-4 mb-10">
        {sortedPayments.length === 0 ? (
          <div className="text-center text-sm text-gray-500 bg-white rounded-lg p-6 shadow">Aucun paiement trouvé</div>
        ) : (
          sortedPayments.map((payment: Payment) => {
            const contactName = payment.type_paiement === 'Fournisseur'
              ? (fournisseurs.find(f => f.id === payment.contact_id)?.nom_complet || '-')
              : (clients.find(c => c.id === payment.contact_id)?.nom_complet || '-');
            const societe = payment.type_paiement === 'Fournisseur'
              ? (fournisseurs.find(f => f.id === payment.contact_id)?.societe || '-')
              : (clients.find(c => c.id === payment.contact_id)?.societe || '-');
            return (
              <div key={payment.id} className="bg-white rounded-lg shadow p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-gray-900">{getDisplayNumeroPayment(payment)}</h3>
                    <p className="text-xs text-gray-500">{formatDateTimeWithHour(payment.date_paiement)}</p>
                  </div>
                  <div>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-full ${getStatusClasses(displayStatut(payment.statut))}`}>
                      {getStatusIcon(displayStatut(payment.statut))}
                      {displayStatut(payment.statut)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${payment.type_paiement === 'Fournisseur' ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}`}>{payment.type_paiement}</span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{payment.mode_paiement}</span>
                  {payment.image_url && (payment.mode_paiement === 'Chèque' || payment.mode_paiement === 'Traite') && (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">Image</span>
                  )}
                </div>
                <div className="text-sm">
                  <p className="font-medium text-gray-800 truncate">{contactName}</p>
                  <p className="text-gray-500 text-xs truncate">{societe}</p>
                  <p className="mt-1 text-gray-700 font-semibold">{Number(payment.montant ?? payment.montant_total ?? 0).toFixed(2)} DH</p>
                  {payment.date_echeance && (
                    <p className="text-xs text-gray-500">Échéance: {formatYMD(payment.date_echeance)}</p>
                  )}
                  <p className="text-xs text-gray-500">{getBonInfo(payment.bon_id)}</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {/* Actions principales */}
                  <button onClick={() => handleViewPayment(payment)} className="flex items-center gap-1 text-blue-600 text-xs font-medium px-2 py-1 bg-blue-50 rounded">
                    <Eye size={18} /> Voir
                  </button>
                  <button onClick={() => handleEditPayment(payment)} className="flex items-center gap-1 text-green-600 text-xs font-medium px-2 py-1 bg-green-50 rounded">
                    <Edit size={18} /> Edit
                  </button>
                  <button onClick={() => handlePrintPayment(payment)} className="flex items-center gap-1 text-purple-600 text-xs font-medium px-2 py-1 bg-purple-50 rounded">
                    <Printer size={18} /> Imp
                  </button>
                  {user?.role !== 'Employé' && (
                    <button onClick={() => handleDelete(payment.id)} className="flex items-center gap-1 text-red-600 text-xs font-medium px-2 py-1 bg-red-50 rounded">
                      <Trash2 size={18} /> Suppr
                    </button>
                  )}
                  {/* Changement de statut condensé */}
                  <div className="flex items-center gap-1 ml-auto">
                    <button onClick={() => changePaymentStatus(payment.id, 'En attente')} className={`p-1 rounded ${payment.statut === 'En attente' ? 'text-yellow-700' : 'text-gray-400'}`} title="En attente">
                      <Clock size={18} />
                    </button>
                    {user?.role === 'Employé' ? (
                      <button onClick={() => changePaymentStatus(payment.id, 'Annulé')} className={`p-1 rounded ${payment.statut === 'Annulé' ? 'text-red-700' : 'text-gray-400'}`} title="Annuler">
                        <XCircle size={18} />
                      </button>
                    ) : (
                      <>
                        <button onClick={() => changePaymentStatus(payment.id, 'Validé')} className={`p-1 rounded ${payment.statut === 'Validé' ? 'text-green-600' : 'text-gray-400'}`} title="Valider">
                          <Check size={18} />
                        </button>
                        <button onClick={() => changePaymentStatus(payment.id, 'Refusé')} className={`p-1 rounded ${payment.statut === 'Refusé' ? 'text-orange-600' : 'text-gray-400'}`} title="Refuser">
                          <X size={18} />
                        </button>
                        <button onClick={() => changePaymentStatus(payment.id, 'Annulé')} className={`p-1 rounded ${payment.statut === 'Annulé' ? 'text-red-700' : 'text-gray-400'}`} title="Annuler">
                          <XCircle size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
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
                <Form
                  className="space-y-6"
                  onKeyDown={(e: React.KeyboardEvent<HTMLFormElement>) => {
                    const target = e.target as HTMLElement | null;

                    // Navigation avec flèches gauche/droite: navigation globale précédent/suivant si curseur aux bords
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      const formEl = e.currentTarget as HTMLFormElement;
                      // Calculer si on doit déplacer le focus
                      let shouldMove = true;
                      const t = target as any;
                      const isInputOrTextarea = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
                      if (isInputOrTextarea && typeof t.selectionStart === 'number' && typeof t.selectionEnd === 'number') {
                        const valueLength = (t.value ?? '').length as number;
                        if (e.key === 'ArrowLeft') {
                          shouldMove = t.selectionStart === 0 && t.selectionEnd === 0;
                        } else {
                          shouldMove = t.selectionStart === valueLength && t.selectionEnd === valueLength;
                        }
                      }
                      if (!shouldMove) return; // laisser bouger le curseur dans le champ

                      // Collecter les éléments focusables
                      const focusableSelector = [
                        'button:not([disabled])',
                        'input:not([disabled]):not([type="hidden"])',
                        'select:not([disabled])',
                        'textarea:not([disabled])',
                        '[tabindex]:not([tabindex="-1"])',
                      ].join(',');
                      const focusables = Array.from(formEl.querySelectorAll<HTMLElement>(focusableSelector))
                        .filter((el) => el.offsetParent !== null || el.getAttribute('aria-hidden') !== 'true');
                      const currentIndex = focusables.indexOf(target as HTMLElement);
                      if (currentIndex === -1) return;
                      const delta = e.key === 'ArrowLeft' ? -1 : 1;
                      let nextIndex = currentIndex + delta;
                      nextIndex = Math.max(0, Math.min(focusables.length - 1, nextIndex));
                      const nextEl = focusables[nextIndex];
                      if (nextEl) {
                        e.preventDefault();
                        nextEl.focus();
                        // Si l'élément suivant est notre SearchableSelect, laisser onFocus l'ouvrir automatiquement
                        // (autoOpenOnFocus gère l'ouverture et le focus de la recherche)
                        // Essayer de sélectionner tout le texte pour les inputs
                        try {
                          if ((nextEl as any).select) (nextEl as any).select();
                        } catch {}
                      }
                    }

                    // Navigation haut/bas pour se déplacer verticalement entre les champs
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      const formEl = e.currentTarget as HTMLFormElement;
                      const focusableSelector = [
                        'button:not([disabled])',
                        'input:not([disabled]):not([type="hidden"])',
                        'select:not([disabled])',
                        'textarea:not([disabled])',
                        '[tabindex]:not([tabindex="-1"])',
                      ].join(',');
                      const focusables = Array.from(formEl.querySelectorAll<HTMLElement>(focusableSelector))
                        .filter((el) => el.offsetParent !== null || el.getAttribute('aria-hidden') !== 'true');
                      const currentIndex = focusables.indexOf(target as HTMLElement);
                      if (currentIndex === -1) return;
                      
                      // Pour la navigation verticale, on cherche l'élément dans la ligne suivante/précédente
                      const delta = e.key === 'ArrowDown' ? 3 : -3; // grid-cols-3, donc on saute de 3 éléments
                      let nextIndex = currentIndex + delta;
                      nextIndex = Math.max(0, Math.min(focusables.length - 1, nextIndex));
                      const nextEl = focusables[nextIndex];
                      if (nextEl) {
                        e.preventDefault();
                        nextEl.focus();
                        // Si l'élément suivant est notre SearchableSelect, laisser onFocus l'ouvrir automatiquement
                        // (autoOpenOnFocus gère l'ouverture et le focus de la recherche)
                        // Essayer de sélectionner tout le texte pour les inputs
                        try {
                          if ((nextEl as any).select) (nextEl as any).select();
                        } catch {}
                      }
                    }
                  }}
                >
                  {/* Responsive grid: 2 cols on small screens, 3 on md+ */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                      <SearchableSelect
                        id="contact_id_select"
                        options={(isFournisseurPayment ? fournisseurs : clients).map((c: Contact) => ({
                          value: String(c.id),
                          label: c.nom_complet || `${isFournisseurPayment ? 'Fournisseur' : 'Client'} #${c.id}`,
                          data: c,
                        }))}
                        value={values.contact_id ? String(values.contact_id) : ''}
                        onChange={(v) => { setFieldValue('contact_id', v); setFieldValue('bon_id', ''); }}
                        placeholder={isFournisseurPayment ? 'Sélectionner un fournisseur' : 'Sélectionner un client'}
                        className="w-full"
                        autoOpenOnFocus={true}
                      />
                      <ErrorMessage name="contact_id" component="div" className="text-red-500 text-sm mt-1" />
                    </div>
                    {/* Numéro supprimé: il sera égal à l'ID automatiquement */}

                    <div>
                      <label htmlFor="date_paiement" className="block text-sm font-medium text-gray-700 mb-1">
                        Date et heure de paiement *
                      </label>
                      <Field
                        id="date_paiement"
                        name="date_paiement"
                        type="datetime-local"
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

                          {/* statut removed from creation modal: default kept as 'En attente' server-side */}

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
                // If a contact is selected, only show bons associated with that contact
                if (values.contact_id) {
                  return values.type_paiement === 'Fournisseur'
                    ? String(bon.fournisseur_id) === String(values.contact_id)
                    : String(bon.client_id) === String(values.contact_id);
                }
                return values.type_paiement === 'Fournisseur'
                  ? bon.type === 'Commande'
                  : bon.type === 'Sortie' || bon.type === 'Comptant';
              })
              .map((bon: Bon) => (
                          <option key={bon.id} value={bon.id}>
              {bon.type} {getBonNumeroDisplay(bon)} - {Number(bon.montant_total ?? 0).toFixed(2)} DH
                          </option>
                        ))}
                      </Field>
                    </div>

                    <div>
                      <label htmlFor="talon_id" className="block text-sm font-medium text-gray-700 mb-1">
                        Talon associé (optionnel)
                      </label>
                      <Field
                        as="select"
                        id="talon_id"
                        name="talon_id"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Aucun talon</option>
                        {talons.map((talon: any) => (
                          <option key={talon.id} value={talon.id}>
                            {talon.nom} {talon.phone ? `- ${talon.phone}` : ''}
                          </option>
                        ))}
                      </Field>
                      <ErrorMessage name="talon_id" component="div" className="text-red-500 text-sm mt-1" />
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
                                  : toBackendUrl(imagePreview)}
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
              <h2 className="text-lg font-semibold">Détails du Paiement {getDisplayNumeroPayment(selectedPayment)}</h2>
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
                  <p className="text-lg">{getDisplayNumeroPayment(selectedPayment)}</p>
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
                          : toBackendUrl(imageUrl);
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
                            : toBackendUrl(imageUrl);
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
                  Date de paiement: {new Date(selectedPayment.date_paiement).toLocaleString('fr-FR')}
                  {selectedPayment.updated_at && (
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
                <button
                  onClick={() => setIsPrintModalOpen(true)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
                >
                  Imprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'impression paiement */}
      {isPrintModalOpen && selectedPayment && (
        <PaymentPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          payment={selectedPayment}
          client={clients.find(c => c.id === selectedPayment.contact_id)}
          fournisseur={fournisseurs.find(f => f.id === selectedPayment.contact_id)}
          allPayments={payments}
        />
      )}
    </div>
  );
};

export default CaissePage;
