import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Eye,
  FileImage,
  FileText,
  History,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useGetActiveMaalemCategoriesQuery } from '../store/api/maalemCategoriesApi';
import {
  type MaalemLookupResponse,
  type AdminMaalemFilters,
  type AdminMaalemProfile,
  type MaalemProfileOrigin,
  type MaalemProfileStatus,
  type MaalemProfessionalData,
  type TeamCreateMaalemResponse,
  useAddAdminMaalemNoteMutation,
  useDownloadAdminMaalemDocumentMutation,
  useGetAdminMaalemProfileDetailsQuery,
  useGetAdminMaalemProfilesQuery,
  useLookupMaalemIdentityMutation,
  useReissueAdminMaalemInvitationMutation,
  useRetryAdminMaalemNotificationMutation,
  useTeamCreateMaalemMutation,
  useUpdateAdminMaalemCategoryMutation,
  useUpdateAdminMaalemProfessionalDataMutation,
  useSubmitAdminMaalemProfileMutation,
  useUpdateAdminMaalemStatusMutation,
  useUpdateAdminMaalemPublicationMutation,
  useUploadAdminMaalemAvatarMutation,
  useUploadAdminMaalemCvMutation,
  useUploadAdminMaalemRealizationsMutation,
} from '../store/api/maalemProfilesApi';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';
import { useAppSelector } from '../hooks/redux';

const EMPTY_PROFESSIONAL_DATA: MaalemProfessionalData = {
  skills: [],
  contact_phone: null,
  city: null,
  intervention_areas: [],
  experience_years: null,
  professional_summary: null,
  experiences: null,
  availability: null,
  other_information: null,
};

function apiErrorMessage(error: unknown) {
  const candidate = error as { data?: { message?: string }; error?: string; message?: string };
  return candidate?.data?.message || candidate?.error || candidate?.message || 'Une erreur est survenue';
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 disabled:text-gray-500';

const DIALOG_FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function useAccessibleDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const initial = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')
      || dialog.querySelector<HTMLElement>(DIALOG_FOCUSABLE)
      || dialog;
    requestAnimationFrame(() => initial.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE))
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) {
        const fallback = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')
          || dialog.querySelector<HTMLElement>(DIALOG_FOCUSABLE)
          || dialog;
        fallback.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', keepFocusInside);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => previouslyFocused?.focus());
    };
  }, []);

  return dialogRef;
}

interface CreateMaalemModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const CreateMaalemModal: React.FC<CreateMaalemModalProps> = ({ onClose, onCreated }) => {
  const dialogRef = useAccessibleDialog(onClose);
  const { data: categories = [], isLoading: categoriesLoading } = useGetActiveMaalemCategoriesQuery();
  const [lookupIdentity, { isLoading: isLookingUp }] = useLookupMaalemIdentityMutation();
  const [createMaalem, { isLoading: isCreating }] = useTeamCreateMaalemMutation();
  const [uploadCv] = useUploadAdminMaalemCvMutation();
  const [uploadRealizations] = useUploadAdminMaalemRealizationsMutation();
  const [lookup, setLookup] = useState<MaalemLookupResponse | null>(null);
  const [result, setResult] = useState<TeamCreateMaalemResponse | null>(null);
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [reference, setReference] = useState('');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [skills, setSkills] = useState('');
  const [city, setCity] = useState('');
  const [areas, setAreas] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [summary, setSummary] = useState('');
  const [experiences, setExperiences] = useState('');
  const [availability, setAvailability] = useState<MaalemProfessionalData['availability']>(null);
  const [otherInformation, setOtherInformation] = useState('');
  const [cv, setCv] = useState<File | null>(null);
  const [realizations, setRealizations] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const blockedState = lookup && !['not_found', 'existing_artisan'].includes(lookup.state);
  const existingArtisan = lookup?.state === 'existing_artisan';

  const performLookup = async () => {
    const trimmedReference = reference.trim();
    try {
      // Une référence identifie un contact précis : elle prime sur email/téléphone.
      const found = await lookupIdentity(
        trimmedReference
          ? { reference: trimmedReference }
          : { email: email.trim(), telephone: telephone.trim() }
      ).unwrap();
      setResult(null);
      if (found.contact) {
        setLookup(found);
        setPrenom(found.contact.prenom || '');
        setNom(found.contact.nom || '');
        setEmail(found.contact.email || email);
        setTelephone(found.contact.telephone || telephone);
        return;
      }
      if (trimmedReference) {
        // Une référence sans correspondance ne permet pas de créer un compte :
        // il n'y a ni email ni téléphone à reprendre.
        setLookup(null);
        await showError(`Aucun contact ne correspond à la référence ${trimmedReference}. Recherchez par email ou téléphone pour créer un nouveau compte.`);
        return;
      }
      setLookup(found);
    } catch (error) {
      setLookup(null);
      await showError(apiErrorMessage(error));
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lookup) {
      await showError('Recherchez d’abord la personne par email, téléphone ou référence.');
      return;
    }
    if (blockedState) return;
    if (!email.trim() || !telephone.trim()) {
      await showError('Cette fiche n’a pas d’email ou de téléphone. Complétez-les avant de créer le dossier Maalem.');
      return;
    }

    try {
      const created = await createMaalem({
        prenom: prenom.trim(),
        nom: nom.trim(),
        email: email.trim(),
        telephone: telephone.trim(),
        // Transmet la référence ayant servi au lookup : le contact est alors identifié
        // par sa clé primaire côté serveur, évitant un faux conflit si l'email/téléphone
        // stockés divergent légèrement du format saisi (ancien contact, espace, etc.).
        reference: reference.trim() || undefined,
        category_id: Number(categoryId),
        locale: 'fr',
        professional_data: {
          ...EMPTY_PROFESSIONAL_DATA,
          skills: splitList(skills),
          contact_phone: telephone.trim() || null,
          city: city.trim() || null,
          intervention_areas: splitList(areas),
          experience_years: experienceYears === '' ? null : Number(experienceYears),
          professional_summary: summary.trim() || null,
          experiences: experiences.trim() || null,
          availability,
          other_information: otherInformation.trim() || null,
        },
      }).unwrap();

      setIsUploading(true);
      const uploadErrors: string[] = [];
      if (cv) {
        try { await uploadCv({ profileId: created.profile.id, file: cv }).unwrap(); }
        catch (error) { uploadErrors.push(`CV : ${apiErrorMessage(error)}`); }
      }
      if (realizations.length) {
        try { await uploadRealizations({ profileId: created.profile.id, files: realizations }).unwrap(); }
        catch (error) { uploadErrors.push(`Réalisations : ${apiErrorMessage(error)}`); }
      }
      setResult(created);
      onCreated();
      if (uploadErrors.length) await showError(`Profil créé, mais certains documents ont échoué. ${uploadErrors.join(' — ')}`);
      else void showSuccess(created.created_user ? 'Compte Artisan et dossier Maalem créés' : 'Dossier Maalem rattaché à l’Artisan existant');
    } catch (error) {
      await showError(apiErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  };

  const lookupMessage = useMemo(() => {
    if (!lookup) return null;
    const messages: Record<MaalemLookupResponse['state'], string> = {
      not_found: 'Aucun compte trouvé : un nouveau compte e-commerce Artisan sera créé avec une invitation sécurisée.',
      existing_artisan: 'Artisan existant trouvé : son compte, ses commandes et ses remises seront conservés.',
      existing_maalem_profile: `Cette personne possède déjà un dossier Maalem (${lookup.contact?.maalem_profile_status || 'statut inconnu'}). Aucun doublon ne sera créé.`,
      inactive_account: 'Le compte correspondant est supprimé, bloqué ou inactif. Réactivez-le avant de continuer.',
      backoffice_contact: 'Un contact Back-office existe avec ces identifiants. Activez son compte e-commerce via le workflow existant.',
      non_artisan_account: 'Ce compte existe mais n’est pas Artisan. Utilisez d’abord le workflow Artisan existant.',
    };
    return messages[lookup.state];
  }, [lookup]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" role="presentation">
      <div ref={dialogRef as React.RefObject<HTMLDivElement>} tabIndex={-1} className="mx-auto my-4 w-full max-w-6xl rounded-xl bg-white shadow-xl outline-none" role="dialog" aria-modal="true" aria-labelledby="create-maalem-title">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h2 id="create-maalem-title" className="text-lg font-semibold text-gray-900">Ajouter un Maalem</h2>
            <p className="text-xs text-gray-500">Création d’équipe — le dossier restera en brouillon pour KAN-7.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Fermer"><X className="h-5 w-5" /></button>
        </div>

        {result ? (
          <div className="space-y-5 p-6">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
              <div className="flex items-center gap-2 font-semibold"><UserCheck className="h-5 w-5" />Dossier Maalem #{result.profile.id} prêt</div>
              <p className="mt-1 text-sm">Origine TEAM_CREATED, statut brouillon. Aucune validation Maalem automatique n’a été accordée.</p>
            </div>
            {result.invitation && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="font-semibold text-blue-900">Invitation sécurisée</p>
                <p className="mt-1 text-sm text-blue-800">
                  {result.invitation.delivery_status === 'sent_whatsapp'
                    ? 'Le lien a été envoyé par WhatsApp.'
                    : 'Le service WhatsApp n’a pas confirmé l’envoi. Copiez ce lien et transmettez-le par un canal sécurisé.'}
                </p>
                <div className="mt-3 flex gap-2">
                  <input readOnly value={result.invitation.activation_url} className={`${inputClass} bg-white`} aria-label="Lien d’activation" />
                  <button type="button" onClick={() => navigator.clipboard.writeText(result.invitation!.activation_url)} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"><Copy className="h-4 w-4" />Copier</button>
                </div>
                <p className="mt-2 text-xs text-blue-700">Lien à usage unique, valable {result.invitation.expires_in_hours} heures.</p>
              </div>
            )}
            <div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">Fermer</button></div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-6 p-6">
            <section className="rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900">1. Recherche anti-doublon obligatoire</h3>
              <p className="mt-1 text-xs text-gray-500">Un seul champ suffit : email, téléphone ou référence contact (ex. 42 ou #42).</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input data-dialog-initial-focus type="email" value={email} onChange={(event) => { setEmail(event.target.value); setLookup(null); }} disabled={Boolean(reference.trim())} className={inputClass} placeholder="Email" aria-label="Email à rechercher" />
                <input value={telephone} onChange={(event) => { setTelephone(event.target.value); setLookup(null); }} disabled={Boolean(reference.trim())} className={inputClass} placeholder="Téléphone 06… ou +212…" aria-label="Téléphone à rechercher" />
                <input value={reference} onChange={(event) => { setReference(event.target.value); setLookup(null); }} className={inputClass} placeholder="Référence contact (ex. 42)" aria-label="Référence du contact à rechercher" maxLength={20} inputMode="numeric" />
                <button type="button" onClick={performLookup} disabled={isLookingUp || (!email.trim() && !telephone.trim() && !reference.trim())} className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Search className="h-4 w-4" />{isLookingUp ? 'Recherche…' : 'Rechercher'}</button>
              </div>
              {lookupMessage && <p className={`mt-3 rounded-md p-3 text-sm ${blockedState ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>{lookupMessage}</p>}
            </section>

            {lookup && !blockedState && (
              <>
                <section>
                  <h3 className="mb-3 font-semibold text-gray-900">2. Identité et métier</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-gray-700">Prénom *<input required value={prenom} onChange={(event) => setPrenom(event.target.value)} disabled={existingArtisan} className={`mt-1 ${inputClass}`} maxLength={100} /></label>
                    <label className="text-sm font-medium text-gray-700">Nom *<input required value={nom} onChange={(event) => setNom(event.target.value)} disabled={existingArtisan} className={`mt-1 ${inputClass}`} maxLength={100} /></label>
                    {/* Verrouillés quand ils proviennent de la recherche ; saisissables si la fiche trouvée par référence ne les renseigne pas. */}
                    <label className="text-sm font-medium text-gray-700">Email *<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={Boolean(lookup?.contact?.email)} className={`mt-1 ${inputClass}`} maxLength={255} /></label>
                    <label className="text-sm font-medium text-gray-700">Téléphone *<input required value={telephone} onChange={(event) => setTelephone(event.target.value)} disabled={Boolean(lookup?.contact?.telephone)} className={`mt-1 ${inputClass}`} placeholder="06… ou +212…" /></label>
                    <label className="text-sm font-medium text-gray-700 sm:col-span-2">Catégorie Maalem active *
                      <select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={categoriesLoading} className={`mt-1 ${inputClass}`}>
                        <option value="">Sélectionner une catégorie</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.nom}</option>)}
                      </select>
                    </label>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 font-semibold text-gray-900">3. Informations professionnelles KAN-5</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-gray-700">Compétences<input value={skills} onChange={(event) => setSkills(event.target.value)} className={`mt-1 ${inputClass}`} placeholder="Plomberie, installation, dépannage" /></label>
                    <label className="text-sm font-medium text-gray-700">Ville<input value={city} onChange={(event) => setCity(event.target.value)} className={`mt-1 ${inputClass}`} maxLength={100} /></label>
                    <label className="text-sm font-medium text-gray-700">Zones d’intervention<input value={areas} onChange={(event) => setAreas(event.target.value)} className={`mt-1 ${inputClass}`} placeholder="Tanger, Tétouan" /></label>
                    <label className="text-sm font-medium text-gray-700">Années d’expérience<input type="number" min={0} max={70} value={experienceYears} onChange={(event) => setExperienceYears(event.target.value)} className={`mt-1 ${inputClass}`} /></label>
                    <label className="text-sm font-medium text-gray-700">Disponibilité<select value={availability || ''} onChange={(event) => setAvailability((event.target.value || null) as MaalemProfessionalData['availability'])} className={`mt-1 ${inputClass}`}><option value="">À compléter</option><option value="immediate">Immédiate</option><option value="weekdays">En semaine</option><option value="weekends">Week-ends</option><option value="evenings">Soirs</option><option value="on_request">Sur demande</option></select></label>
                    <label className="text-sm font-medium text-gray-700 sm:col-span-2">Description professionnelle<textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} maxLength={2000} className={`mt-1 ${inputClass}`} /></label>
                    <label className="text-sm font-medium text-gray-700 sm:col-span-2">Expériences et références<textarea value={experiences} onChange={(event) => setExperiences(event.target.value)} rows={3} maxLength={5000} className={`mt-1 ${inputClass}`} /></label>
                    <label className="text-sm font-medium text-gray-700 sm:col-span-2">Autres informations<textarea value={otherInformation} onChange={(event) => setOtherInformation(event.target.value)} rows={2} maxLength={2000} className={`mt-1 ${inputClass}`} /></label>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 font-semibold text-gray-900">4. Documents</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-700"><span className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4" />CV PDF (5 Mo max.)</span><input type="file" accept="application/pdf" onChange={(event) => setCv(event.target.files?.[0] || null)} className="mt-3 block w-full text-xs" /></label>
                    <label className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-700"><span className="flex items-center gap-2 font-medium"><Upload className="h-4 w-4" />Réalisations (8 max.)</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => setRealizations(Array.from(event.target.files || []).slice(0, 8))} className="mt-3 block w-full text-xs" /></label>
                  </div>
                </section>
              </>
            )}

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
              <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Annuler</button>
              <button type="submit" disabled={!lookup || Boolean(blockedState) || isCreating || isUploading} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Plus className="h-4 w-4" />{isCreating || isUploading ? 'Création en cours…' : 'Créer le dossier Maalem'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const STATUS_META: Record<MaalemProfileStatus, { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'border-gray-200 bg-gray-100 text-gray-700' },
  submitted: { label: 'À examiner', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  under_review: { label: 'En vérification', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  approved: { label: 'Validé', className: 'border-green-200 bg-green-50 text-green-700' },
  rejected: { label: 'Refusé', className: 'border-red-200 bg-red-50 text-red-700' },
  suspended: { label: 'Suspendu', className: 'border-violet-200 bg-violet-50 text-violet-700' },
};

const STATUS_RAILS: Record<MaalemProfileStatus, string> = {
  draft: 'border-l-gray-300', submitted: 'border-l-blue-600', under_review: 'border-l-amber-500',
  approved: 'border-l-green-600', rejected: 'border-l-red-600', suspended: 'border-l-violet-600',
};

const ORIGIN_LABELS: Record<MaalemProfileOrigin, string> = {
  NEW_REGISTRATION: 'Nouvelle inscription',
  ARTISAN_CONVERSION: 'Artisan existant',
  TEAM_CREATED: 'Créé par l’équipe',
  SELF_SERVICE: 'Auto-inscription (ancien)',
};

const AVAILABILITY_LABELS: Record<string, string> = {
  immediate: 'Immédiate', weekdays: 'En semaine', weekends: 'Week-ends', evenings: 'Soirs', on_request: 'Sur demande',
};

const NEXT_STATUSES: Partial<Record<MaalemProfileStatus, MaalemProfileStatus[]>> = {
  submitted: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: ['suspended'],
};

const formatDate = (value?: string | null, includeTime = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date);
};

const queueAge = (profile: AdminMaalemProfile) => {
  if (!['submitted', 'under_review'].includes(profile.status)) return null;
  const since = new Date(profile.submitted_at || profile.created_at).getTime();
  if (Number.isNaN(since)) return null;
  const days = Math.max(0, Math.floor((Date.now() - since) / 86_400_000));
  return { days, label: days === 0 ? 'Aujourd’hui' : `${days} j en file`, urgent: days >= 7 };
};

const StatusBadge = ({ status }: { status: MaalemProfileStatus }) => (
  <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${STATUS_META[status].className}`}>
    {STATUS_META[status].label}
  </span>
);

const AVATAR_INITIALS_PALETTE = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-amber-100 text-amber-700', 'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700'];

const getInitials = (name?: string | null) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const AvatarThumb = ({ name, avatarUrl, size = 'md' }: { name?: string | null; avatarUrl?: string | null; size?: 'sm' | 'md' | 'lg' }) => {
  const dimensions = size === 'lg' ? 'h-16 w-16 text-lg' : size === 'sm' ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm';
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name || 'Photo de profil'} className={`${dimensions} shrink-0 rounded-full object-cover ring-1 ring-gray-200`} />;
  }
  const paletteIndex = (name || '').length % AVATAR_INITIALS_PALETTE.length;
  return (
    <span className={`${dimensions} flex shrink-0 items-center justify-center rounded-full font-bold ${AVATAR_INITIALS_PALETTE[paletteIndex]}`}>
      {getInitials(name)}
    </span>
  );
};

const FieldBlock = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={className}>
    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="mt-1 text-sm leading-6 text-gray-800">{children || '—'}</dd>
  </div>
);

const DocumentPreviewModal: React.FC<{
  profileId: number;
  document: { id: number; name: string; mimeType: string };
  onClose: () => void;
}> = ({ profileId, document: doc, onClose }) => {
  const dialogRef = useAccessibleDialog(onClose);
  const [downloadDocument] = useDownloadAdminMaalemDocumentMutation();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const blob = await downloadDocument({ profileId, documentId: doc.id }).unwrap();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      } catch (fetchError) {
        if (!cancelled) setError(apiErrorMessage(fetchError));
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, doc.id]);

  const isImage = doc.mimeType.startsWith('image/');

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950/80 p-4" role="presentation">
      <div ref={dialogRef as React.RefObject<HTMLDivElement>} tabIndex={-1} className="mx-auto flex h-full w-full max-w-5xl flex-col outline-none" role="dialog" aria-modal="true" aria-label={`Aperçu de ${doc.name}`}>
        <div className="flex shrink-0 items-center justify-between rounded-t-xl bg-white px-4 py-3">
          <p className="truncate text-sm font-semibold text-gray-900">{doc.name}</p>
          <button data-dialog-initial-focus type="button" onClick={onClose} className="ml-4 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Fermer l’aperçu"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-auto rounded-b-xl bg-gray-100">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-gray-600"><AlertCircle className="h-6 w-6 text-red-500" />{error}</div>
          ) : !objectUrl ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Chargement de l’aperçu…</div>
          ) : isImage ? (
            <div className="flex h-full items-center justify-center p-4"><img src={objectUrl} alt={doc.name} className="max-h-full max-w-full object-contain" /></div>
          ) : (
            <iframe src={objectUrl} title={doc.name} className="h-full w-full border-0" />
          )}
        </div>
      </div>
    </div>
  );
};

const DossierDrawer: React.FC<{ profileId: number; onClose: () => void }> = ({ profileId, onClose }) => {
  const dialogRef = useAccessibleDialog(onClose);
  const { data, isLoading, isError, refetch } = useGetAdminMaalemProfileDetailsQuery(profileId);
  const { data: categories = [] } = useGetActiveMaalemCategoriesQuery();
  const [updateStatus, { isLoading: isUpdatingStatus }] = useUpdateAdminMaalemStatusMutation();
  const { isPDG, isLoading: isUpdatingPublication, togglePublication } = useMaalemPublication();
  const [submitDraft, { isLoading: isSubmittingDraft }] = useSubmitAdminMaalemProfileMutation();
  const [updateCategory, { isLoading: isUpdatingCategory }] = useUpdateAdminMaalemCategoryMutation();
  const [updateProfessionalData, { isLoading: isSavingProfessionalData }] = useUpdateAdminMaalemProfessionalDataMutation();
  const [addNote, { isLoading: isAddingNote }] = useAddAdminMaalemNoteMutation();
  const [downloadDocument, { isLoading: isDownloading }] = useDownloadAdminMaalemDocumentMutation();
  const [uploadAvatar, { isLoading: isUploadingAvatar }] = useUploadAdminMaalemAvatarMutation();
  const [retryNotification, { isLoading: isRetryingNotification }] = useRetryAdminMaalemNotificationMutation();
  const [reissueInvitation, { isLoading: isReissuingInvitation }] = useReissueAdminMaalemInvitationMutation();
  const [pendingStatus, setPendingStatus] = useState<MaalemProfileStatus | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [publicDecisionReason, setPublicDecisionReason] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [categoryNote, setCategoryNote] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [isEditingProfessional, setIsEditingProfessional] = useState(false);
  const [professionalDraft, setProfessionalDraft] = useState<MaalemProfessionalData>(EMPTY_PROFESSIONAL_DATA);
  const [previewDocument, setPreviewDocument] = useState<{ id: number; name: string; mimeType: string } | null>(null);
  const profile = data?.profile;
  const professional = profile?.professional_data;
  const canChangeCategory = profile ? ['draft', 'submitted', 'under_review', 'rejected'].includes(profile.status) : false;
  const decisionHistory = data?.history.filter((entry) => entry.event_type !== 'INTERNAL_NOTE') || [];

  useEffect(() => setSelectedCategoryId(profile?.category_id ? String(profile.category_id) : ''), [profile?.category_id]);
  useEffect(() => { setIsEditingProfessional(false); }, [profileId]);

  const startEditingProfessional = () => {
    setProfessionalDraft({ ...EMPTY_PROFESSIONAL_DATA, ...(professional || {}) });
    setIsEditingProfessional(true);
  };

  const cancelEditingProfessional = () => setIsEditingProfessional(false);

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await uploadAvatar({ profileId, file }).unwrap();
      await showSuccess('Photo de profil mise à jour');
    } catch (error) { await showError(apiErrorMessage(error)); }
  };

  const submitProfessionalData = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateProfessionalData({ id: profileId, professional_data: professionalDraft }).unwrap();
      setIsEditingProfessional(false);
      await showSuccess('Dossier professionnel mis à jour');
    } catch (error) { await showError(apiErrorMessage(error)); }
  };
  const submitStatus = async () => {
    if (!pendingStatus) return;
    const requiresReason = pendingStatus === 'rejected' || pendingStatus === 'suspended';
    if (requiresReason && !decisionReason.trim()) {
      await showError('Un motif est obligatoire pour refuser ou suspendre un Maalem.');
      return;
    }
    try {
      await updateStatus({
        id: profileId,
        status: pendingStatus,
        internal_reason: decisionReason.trim() || undefined,
        public_reason: publicDecisionReason.trim() || undefined,
      }).unwrap();
      const label = STATUS_META[pendingStatus].label;
      setPendingStatus(null);
      setDecisionReason('');
      setPublicDecisionReason('');
      await showSuccess(`Dossier passé au statut « ${label} »`);
    } catch (error) { await showError(apiErrorMessage(error)); }
  };

  const submitDraftForReview = async () => {
    try {
      await submitDraft({ id: profileId }).unwrap();
      await showSuccess('Dossier soumis pour révision');
    } catch (error) { await showError(apiErrorMessage(error)); }
  };

  const submitCategory = async () => {
    const category_id = Number(selectedCategoryId);
    if (!Number.isSafeInteger(category_id) || category_id <= 0) return;
    try {
      await updateCategory({ id: profileId, category_id, note: categoryNote.trim() || undefined }).unwrap();
      setCategoryNote('');
      await showSuccess('Catégorie Maalem corrigée');
    } catch (error) { await showError(apiErrorMessage(error)); }
  };

  const submitNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!internalNote.trim()) return;
    try {
      await addNote({ id: profileId, note: internalNote.trim() }).unwrap();
      setInternalNote('');
      await showSuccess('Note interne ajoutée');
    } catch (error) { await showError(apiErrorMessage(error)); }
  };

  const handleDownload = async (documentId: number, name: string) => {
    try {
      const blob = await downloadDocument({ profileId, documentId }).unwrap();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) { await showError(apiErrorMessage(error)); }
  };

  const handleRetryNotification = async (notificationId: number) => {
    try {
      await retryNotification({ profileId, notificationId }).unwrap();
      await showSuccess('Nouvelle tentative de notification enregistrée');
    } catch (error) { await showError(apiErrorMessage(error)); }
  };

  const handleReissueInvitation = async () => {
    try {
      const invitation = await reissueInvitation({ profileId }).unwrap();
      if (invitation?.activation_url) await navigator.clipboard?.writeText(invitation.activation_url);
      await showSuccess(invitation?.activation_url
        ? 'Invitation renouvelée. Le nouveau lien a été copié.'
        : 'Invitation renouvelée.');
    } catch (error) { await showError(apiErrorMessage(error)); }
  };

  const nextStatuses = profile ? NEXT_STATUSES[profile.status] || [] : [];

  return (
    <div className="fixed inset-0 z-40" role="presentation">
      <button type="button" aria-label="Fermer le dossier" onClick={onClose} className="absolute inset-0 bg-gray-950/40" />
      <aside ref={dialogRef} tabIndex={-1} className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-white shadow-2xl outline-none" role="dialog" aria-modal="true" aria-labelledby="dossier-title">
        <header className="flex shrink-0 items-start justify-between border-b border-gray-200 px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Dossier #{profileId}</p>{profile && <><StatusBadge status={profile.status} /><PublicationBadge isPublic={profile.is_public} />{isPDG && <button type="button" disabled={isUpdatingPublication || (!profile.is_public && profile.status !== 'approved')} title={!profile.is_public && profile.status !== 'approved' ? PUBLICATION_REQUIREMENT : undefined} onClick={() => void togglePublication(profile)} className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-40">{profile.is_public ? 'Retirer du public' : 'Publier'}</button>}</>}</div>
            <h2 id="dossier-title" className="mt-1 truncate text-xl font-bold text-gray-950">{profile?.user?.nom_complet || (isLoading ? 'Chargement…' : 'Candidature Maalem')}</h2>
          </div>
          <button data-dialog-initial-focus type="button" onClick={onClose} className="ml-4 rounded-md p-2 text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Fermer"><X className="h-5 w-5" /></button>
        </header>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Chargement du dossier…</div>
        ) : isError || !profile ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><AlertCircle className="h-8 w-8 text-red-500" /><p className="mt-3 font-medium text-gray-900">Impossible de charger ce dossier.</p><button type="button" onClick={() => refetch()} className="mt-3 text-sm font-semibold text-blue-700">Réessayer</button></div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <section className="border-b border-gray-200 bg-slate-50 px-5 py-4 sm:px-7">
              <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><p><strong>Compte Artisan conservé.</strong> La décision ne supprime ni le compte e-commerce, ni ses commandes, son historique ou ses remises.</p></div>
              {profile.status === 'approved' && <p className="mt-2 text-xs font-medium text-gray-600">L’approbation valide uniquement le dossier KAN-7. L’accès technique aux fonctions Maalem relève de KAN-8.</p>}
            </section>

            <div className="space-y-8 px-5 py-6 sm:px-7">
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-900">Identité & contact</h3>
                <div className="mt-4 flex items-center gap-4">
                  <AvatarThumb name={profile.user?.nom_complet} avatarUrl={profile.user?.avatar_url} size="lg" />
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50">
                    <Upload className="h-4 w-4" />{isUploadingAvatar ? 'Envoi…' : profile.user?.avatar_url ? 'Changer la photo' : 'Ajouter une photo'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} disabled={isUploadingAvatar} className="sr-only" />
                  </label>
                </div>
                <dl className="mt-4 grid gap-4 border-l-2 border-blue-600 pl-4 sm:grid-cols-2">
                  <FieldBlock label="Nom complet">{profile.user?.nom_complet}</FieldBlock>
                  <FieldBlock label="Type de compte">{profile.user?.type_compte || 'Artisan e-commerce'}</FieldBlock>
                  <FieldBlock label="Téléphone"><span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-gray-400" />{profile.user?.telephone || professional?.contact_phone || '—'}</span></FieldBlock>
                  <FieldBlock label="Email"><span className="inline-flex items-center gap-1.5 break-all"><Mail className="h-3.5 w-3.5 text-gray-400" />{profile.user?.email || '—'}</span></FieldBlock>
                  <FieldBlock label="Ville"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gray-400" />{professional?.city || '—'}</span></FieldBlock>
                  <FieldBlock label="Origine">{ORIGIN_LABELS[profile.origin] || ORIGIN_LABELS.SELF_SERVICE}</FieldBlock>
                </dl>
              </section>

              <section className="border-y border-gray-200 py-5">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold uppercase tracking-wide text-gray-900">Catégorie métier</h3><p className="mt-1 text-xs text-gray-500">Seules les catégories actives peuvent être attribuées.</p></div>{profile.category && !profile.category.is_active && <span className="text-xs font-semibold text-red-700">Catégorie inactive</span>}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)} disabled={!canChangeCategory} className={inputClass} aria-label="Corriger la catégorie Maalem"><option value="">Sélectionner une catégorie active</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nom}</option>)}</select>
                  <button type="button" onClick={submitCategory} disabled={!canChangeCategory || isUpdatingCategory || !selectedCategoryId || Number(selectedCategoryId) === profile.category_id} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50">{isUpdatingCategory ? 'Enregistrement…' : 'Confirmer'}</button>
                </div>
                {!canChangeCategory && <p className="mt-2 text-xs text-gray-500">La catégorie est verrouillée pour un dossier validé ou suspendu.</p>}
                {selectedCategoryId && Number(selectedCategoryId) !== profile.category_id && <label className="mt-2 block text-xs font-semibold text-gray-700">Note de correction <span className="font-normal text-gray-500">(facultative)</span><input value={categoryNote} onChange={(event) => setCategoryNote(event.target.value)} className={`mt-1 ${inputClass}`} maxLength={500} placeholder="Préciser la raison du changement" /></label>}
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-gray-900">Dossier professionnel</h3>
                  {!isEditingProfessional && canChangeCategory && <button type="button" onClick={startEditingProfessional} className="text-sm font-semibold text-blue-700 hover:text-blue-900">Modifier</button>}
                </div>
                {!canChangeCategory && <p className="mt-1 text-xs text-gray-500">Verrouillé pour un dossier validé ou suspendu.</p>}

                {isEditingProfessional ? (
                  <form onSubmit={submitProfessionalData} className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-gray-700 sm:col-span-2">Compétences <span className="font-normal text-gray-500">(séparées par des virgules)</span><input value={professionalDraft.skills.join(', ')} onChange={(event) => setProfessionalDraft((draft) => ({ ...draft, skills: splitList(event.target.value) }))} className={`mt-1 ${inputClass}`} placeholder="Plomberie, installation, dépannage" /></label>
                    <label className="text-sm font-medium text-gray-700">Ville<input value={professionalDraft.city || ''} onChange={(event) => setProfessionalDraft((draft) => ({ ...draft, city: event.target.value || null }))} className={`mt-1 ${inputClass}`} maxLength={100} /></label>
                    <label className="text-sm font-medium text-gray-700">Téléphone de contact<input value={professionalDraft.contact_phone || ''} onChange={(event) => setProfessionalDraft((draft) => ({ ...draft, contact_phone: event.target.value || null }))} className={`mt-1 ${inputClass}`} placeholder="06… ou +212…" /></label>
                    <label className="text-sm font-medium text-gray-700 sm:col-span-2">Zones d’intervention <span className="font-normal text-gray-500">(séparées par des virgules)</span><input value={professionalDraft.intervention_areas.join(', ')} onChange={(event) => setProfessionalDraft((draft) => ({ ...draft, intervention_areas: splitList(event.target.value) }))} className={`mt-1 ${inputClass}`} placeholder="Tanger, Tétouan" /></label>
                    <label className="text-sm font-medium text-gray-700">Années d’expérience<input type="number" min={0} max={70} value={professionalDraft.experience_years ?? ''} onChange={(event) => setProfessionalDraft((draft) => ({ ...draft, experience_years: event.target.value === '' ? null : Number(event.target.value) }))} className={`mt-1 ${inputClass}`} /></label>
                    <label className="text-sm font-medium text-gray-700">Disponibilité<select value={professionalDraft.availability || ''} onChange={(event) => setProfessionalDraft((draft) => ({ ...draft, availability: (event.target.value || null) as MaalemProfessionalData['availability'] }))} className={`mt-1 ${inputClass}`}><option value="">À compléter</option><option value="immediate">Immédiate</option><option value="weekdays">En semaine</option><option value="weekends">Week-ends</option><option value="evenings">Soirs</option><option value="on_request">Sur demande</option></select></label>
                    <label className="text-sm font-medium text-gray-700 sm:col-span-2">Présentation<textarea value={professionalDraft.professional_summary || ''} onChange={(event) => setProfessionalDraft((draft) => ({ ...draft, professional_summary: event.target.value || null }))} rows={3} maxLength={2000} className={`mt-1 ${inputClass}`} /></label>
                    <label className="text-sm font-medium text-gray-700 sm:col-span-2">Expériences & références<textarea value={professionalDraft.experiences || ''} onChange={(event) => setProfessionalDraft((draft) => ({ ...draft, experiences: event.target.value || null }))} rows={3} maxLength={5000} className={`mt-1 ${inputClass}`} /></label>
                    <label className="text-sm font-medium text-gray-700 sm:col-span-2">Autres informations<textarea value={professionalDraft.other_information || ''} onChange={(event) => setProfessionalDraft((draft) => ({ ...draft, other_information: event.target.value || null }))} rows={2} maxLength={2000} className={`mt-1 ${inputClass}`} /></label>
                    <div className="flex justify-end gap-2 sm:col-span-2">
                      <button type="button" onClick={cancelEditingProfessional} className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Annuler</button>
                      <button type="submit" disabled={isSavingProfessionalData} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{isSavingProfessionalData ? 'Enregistrement…' : 'Enregistrer'}</button>
                    </div>
                  </form>
                ) : (
                  <dl className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                    <FieldBlock label="Compétences" className="sm:col-span-2">{professional?.skills?.length ? <div className="flex flex-wrap gap-1.5">{professional.skills.map((skill) => <span key={skill} className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium">{skill}</span>)}</div> : '—'}</FieldBlock>
                    <FieldBlock label="Expérience">{professional?.experience_years == null ? '—' : `${professional.experience_years} an${professional.experience_years > 1 ? 's' : ''}`}</FieldBlock>
                    <FieldBlock label="Disponibilité">{professional?.availability ? AVAILABILITY_LABELS[professional.availability] : '—'}</FieldBlock>
                    <FieldBlock label="Zones d’intervention" className="sm:col-span-2">{professional?.intervention_areas?.join(' · ') || '—'}</FieldBlock>
                    <FieldBlock label="Présentation" className="sm:col-span-2"><span className="whitespace-pre-wrap">{professional?.professional_summary || '—'}</span></FieldBlock>
                    <FieldBlock label="Expériences & références" className="sm:col-span-2"><span className="whitespace-pre-wrap">{professional?.experiences || '—'}</span></FieldBlock>
                    <FieldBlock label="Autres informations" className="sm:col-span-2"><span className="whitespace-pre-wrap">{professional?.other_information || '—'}</span></FieldBlock>
                  </dl>
                )}
              </section>

              <section className="border-t border-gray-200 pt-6">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-900"><FileText className="h-4 w-4" />Documents privés</h3><p className="mt-1 text-xs text-gray-500">Téléchargement protégé, réservé au Back-office.</p>
                {!data.documents.length ? <p className="mt-3 text-sm text-gray-500">Aucun document joint.</p> : <ul className="mt-3 divide-y divide-gray-100 border-y border-gray-200">{data.documents.map((item) => { const previewable = item.mime_type === 'application/pdf' || item.mime_type.startsWith('image/'); return <li key={item.id} className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3">{item.kind === 'cv' ? <FileText className="h-5 w-5 shrink-0 text-blue-600" /> : <FileImage className="h-5 w-5 shrink-0 text-gray-500" />}<div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{item.original_name}</p><p className="text-xs text-gray-500">{item.kind === 'cv' ? 'CV' : 'Document professionnel'} · {Math.max(1, Math.round(item.file_size / 1024))} Ko</p></div></div><div className="flex shrink-0 items-center gap-1">{previewable && <button type="button" disabled={isDownloading} onClick={() => setPreviewDocument({ id: item.id, name: item.original_name, mimeType: item.mime_type })} className="rounded-md p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50" aria-label={`Visualiser ${item.original_name}`}><Eye className="h-4 w-4" /></button>}<button type="button" disabled={isDownloading} onClick={() => handleDownload(item.id, item.original_name)} className="rounded-md p-2 text-blue-700 hover:bg-blue-50 disabled:opacity-50" aria-label={`Télécharger ${item.original_name}`}><Download className="h-4 w-4" /></button></div></li>; })}</ul>}
              </section>

              <section className="border-t border-gray-200 pt-6">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-900"><MessageSquareText className="h-4 w-4" />Notes internes</h3>
                <form onSubmit={submitNote} className="mt-3"><label className="block text-xs font-semibold text-gray-700">Nouvelle note<textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} rows={3} maxLength={2000} className={`mt-1 ${inputClass}`} placeholder="Observation visible uniquement par l’équipe…" /></label><div className="mt-2 flex justify-end"><button type="submit" disabled={isAddingNote || !internalNote.trim()} className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-700 focus-visible:ring-offset-2 disabled:opacity-50">{isAddingNote ? 'Ajout…' : 'Ajouter la note'}</button></div></form>
                {!data.notes.length ? <p className="mt-4 text-sm text-gray-500">Aucune note interne.</p> : <ol className="mt-4 space-y-3">{data.notes.map((note) => <li key={note.id} className="border-l-2 border-gray-200 pl-4"><p className="whitespace-pre-wrap text-sm text-gray-800">{note.note}</p><p className="mt-1 text-xs text-gray-500">{note.actor?.nom_complet || note.actor_name || 'Utilisateur Back-office'} · {formatDate(note.created_at, true)}</p></li>)}</ol>}
              </section>

              <section className="border-t border-gray-200 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-900"><Mail className="h-4 w-4" />Historique des notifications</h3>
                    <p className="mt-1 text-xs text-gray-500">Journal durable des messages applicatifs et WhatsApp. Aucun email ou SMS n’est simulé.</p>
                  </div>
                  {profile.origin === 'TEAM_CREATED' && (
                    <button type="button" onClick={handleReissueInvitation} disabled={isReissuingInvitation} className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50">
                      <RefreshCw className={`h-3.5 w-3.5 ${isReissuingInvitation ? 'animate-spin' : ''}`} />
                      Renouveler l’invitation
                    </button>
                  )}
                </div>
                {!data.notifications?.length ? (
                  <p className="mt-3 text-sm text-gray-500">Aucune notification enregistrée.</p>
                ) : (
                  <ol className="mt-4 space-y-3">
                    {data.notifications.map((notification) => {
                      const canRetry = notification.channel === 'WHATSAPP'
                        && notification.status === 'failed'
                        && notification.notification_type !== 'MaalemAccountCreatedByTeam';
                      return (
                        <li key={notification.id} className="rounded-md border border-gray-200 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{notification.title}</p>
                              <p className="mt-0.5 text-xs text-gray-500">{notification.channel === 'IN_APP' ? 'Application' : 'WhatsApp'} · {formatDate(notification.created_at, true)} · {notification.attempts} tentative(s)</p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${notification.status === 'sent' ? 'bg-green-100 text-green-800' : notification.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>{notification.status}</span>
                          </div>
                          {notification.last_error && <p className="mt-2 text-xs text-red-700">Erreur : {notification.last_error}</p>}
                          {canRetry && <button type="button" onClick={() => handleRetryNotification(notification.id)} disabled={isRetryingNotification} className="mt-2 text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50">Relancer l’envoi</button>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <section className="border-t border-gray-200 pt-6">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-900"><History className="h-4 w-4" />Historique des décisions</h3>
                {!decisionHistory.length ? <p className="mt-3 text-sm text-gray-500">Aucune décision enregistrée.</p> : <ol className="relative mt-4 space-y-5 border-l border-gray-300 pl-5">{decisionHistory.map((entry) => <li key={entry.id} className="relative"><span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-600 ring-1 ring-gray-300" />{entry.event_type === 'STATUS_CHANGED' && entry.new_status ? <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-gray-900">{entry.old_status ? STATUS_META[entry.old_status].label : 'Création'}</span><ArrowRight className="h-3.5 w-3.5 text-gray-400" /><span className="font-semibold text-gray-900">{STATUS_META[entry.new_status].label}</span></div> : <p className="text-sm font-semibold text-gray-900">Catégorie : {entry.old_category_name || 'Non renseignée'} → {entry.new_category_name || 'Nouvelle catégorie'}</p>}{entry.note && <p className="mt-1 text-sm text-gray-700">{entry.note}</p>}<p className="mt-1 text-xs text-gray-500">{entry.actor?.nom_complet || entry.actor_name || 'Système'} · {formatDate(entry.created_at, true)}</p></li>)}</ol>}
              </section>

              <section className="border-t border-gray-200 pt-6"><dl className="grid grid-cols-2 gap-4 text-xs text-gray-500 sm:grid-cols-4"><FieldBlock label="Créé le">{formatDate(profile.created_at, true)}</FieldBlock><FieldBlock label="Soumis le">{formatDate(profile.submitted_at, true)}</FieldBlock><FieldBlock label="Dernière revue">{formatDate(profile.reviewed_at, true)}</FieldBlock><FieldBlock label="Mis à jour">{formatDate(profile.updated_at, true)}</FieldBlock></dl></section>
            </div>
          </div>
        )}

        {profile && (
          <footer className="shrink-0 border-t border-gray-200 bg-white px-5 py-4 sm:px-7">
            {pendingStatus ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-900">Confirmer : {STATUS_META[pendingStatus].label}</p>
                  <button type="button" onClick={() => { setPendingStatus(null); setDecisionReason(''); setPublicDecisionReason(''); }} className="text-xs font-medium text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Annuler</button>
                </div>
                {pendingStatus === 'approved' && (
                  <div className="flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p><strong>Limite KAN-8 :</strong> cette approbation valide le dossier uniquement. Elle n’active pas encore les fonctionnalités techniques Maalem.</p>
                  </div>
                )}
                <label className="block text-xs font-semibold text-gray-700">
                  {pendingStatus === 'rejected' || pendingStatus === 'suspended' ? 'Motif interne *' : 'Note interne (facultative)'}
                  <textarea value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} rows={2} maxLength={500} className={`mt-1 ${inputClass}`} placeholder="Visible uniquement par l’équipe…" autoFocus />
                </label>
                {(pendingStatus === 'rejected' || pendingStatus === 'suspended') && (
                  <label className="block text-xs font-semibold text-gray-700">
                    Motif communicable au Maalem <span className="font-normal text-gray-500">(facultatif)</span>
                    <textarea value={publicDecisionReason} onChange={(event) => setPublicDecisionReason(event.target.value)} rows={2} maxLength={500} className={`mt-1 ${inputClass}`} placeholder="Seul ce texte peut apparaître dans la notification…" />
                  </label>
                )}
                <button type="button" onClick={submitStatus} disabled={isUpdatingStatus || ((pendingStatus === 'rejected' || pendingStatus === 'suspended') && !decisionReason.trim())} className={`w-full rounded-md px-4 py-2.5 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${pendingStatus === 'rejected' || pendingStatus === 'suspended' ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-600' : pendingStatus === 'approved' ? 'bg-green-700 hover:bg-green-800 focus-visible:ring-green-600' : 'bg-blue-700 hover:bg-blue-800 focus-visible:ring-blue-600'}`}>
                  {isUpdatingStatus ? 'Enregistrement de la décision…' : 'Confirmer la décision'}
                </button>
              </div>
            ) : nextStatuses.length ? (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Prochaine décision autorisée</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {nextStatuses.map((status) => <button key={status} type="button" onClick={() => setPendingStatus(status)} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${status === 'rejected' || status === 'suspended' ? 'border-red-300 text-red-700 hover:bg-red-50 focus-visible:ring-red-500' : status === 'approved' ? 'border-green-700 bg-green-700 text-white hover:bg-green-800 focus-visible:ring-green-600' : 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800 focus-visible:ring-blue-600'}`}>{status === 'approved' ? <CheckCircle2 className="h-4 w-4" /> : status === 'rejected' || status === 'suspended' ? <XCircle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}{STATUS_META[status].label}</button>)}
                </div>
              </div>
            ) : profile.status === 'draft' ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm text-gray-600"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Brouillon non soumis : aucune décision Back-office tant que le dossier n’est pas soumis.</p></div>
                <button type="button" onClick={submitDraftForReview} disabled={isSubmittingDraft} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-blue-700 bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-50"><Clock3 className="h-4 w-4" />{isSubmittingDraft ? 'Soumission…' : 'Soumettre pour révision'}</button>
                <p className="text-xs text-gray-500">Soumet le dossier au nom du candidat : catégorie, informations professionnelles et téléphone doivent déjà être complets.</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-sm text-gray-600"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Aucune transition Back-office disponible pour ce statut.</p></div>
            )}
          </footer>
        )}
      </aside>
      {previewDocument && <DocumentPreviewModal profileId={profileId} document={previewDocument} onClose={() => setPreviewDocument(null)} />}
    </div>
  );
};

// La publication expose le profil dans l'annuaire public : réservée au PDG et
// conditionnée au statut approuvé, comme la vérification d'éligibilité du back-end.
const PUBLICATION_REQUIREMENT = 'Seuls les dossiers approuvés peuvent être publiés.';

function useMaalemPublication() {
  const role = useAppSelector((state) => state.auth.user?.role);
  const isPDG = role === 'PDG';
  const [updatePublication, { isLoading }] = useUpdateAdminMaalemPublicationMutation();

  const togglePublication = async (profile: Pick<AdminMaalemProfile, 'id' | 'is_public' | 'status'> & { user?: { nom_complet: string } }) => {
    if (!isPDG) return;
    const nextPublic = !profile.is_public;
    if (nextPublic && profile.status !== 'approved') {
      await showError(PUBLICATION_REQUIREMENT);
      return;
    }
    const name = profile.user?.nom_complet || `le dossier #${profile.id}`;
    const confirmation = await showConfirmation(
      nextPublic
        ? `${name} apparaîtra dans l'annuaire public des Maalems, avec son nom, sa catégorie et ses statistiques vérifiées.`
        : `${name} sera retiré de l'annuaire public. Le dossier et le compte restent inchangés.`,
      nextPublic ? 'Publier ce Maalem ?' : `Retirer de l'annuaire public ?`,
      nextPublic ? 'Publier' : 'Retirer',
    );
    if (!confirmation.isConfirmed) return;
    try {
      await updatePublication({ id: profile.id, is_public: nextPublic }).unwrap();
      await showSuccess(nextPublic ? `Maalem publié dans l'annuaire public.` : `Maalem retiré de l'annuaire public.`);
    } catch (error) { await showError(apiErrorMessage(error)); }
  };

  return { isPDG, isLoading, togglePublication };
}

const PublicationBadge = ({ isPublic }: { isPublic: boolean }) => (
  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
    {isPublic ? 'Public' : 'Non publié'}
  </span>
);

const ProfileRow = ({ profile, onOpen }: { profile: AdminMaalemProfile; onOpen: () => void }) => {
  const { isPDG, isLoading, togglePublication } = useMaalemPublication();
  const canPublish = profile.is_public || profile.status === 'approved';
  return (
  <tr className="group hover:bg-blue-50/40">
    <td className={`border-l-4 px-4 py-3.5 ${STATUS_RAILS[profile.status]}`}><div className="flex items-center gap-3"><AvatarThumb name={profile.user?.nom_complet} avatarUrl={profile.user?.avatar_url} size="sm" /><div className="min-w-0"><p className="truncate font-semibold text-gray-950">{profile.user?.nom_complet || `Contact #${profile.contact_id}`}</p><p className="mt-0.5 truncate text-xs text-gray-500">{profile.user?.email || 'Sans email'}</p></div></div></td>
    <td className="px-4 py-3.5 text-sm text-gray-700">{profile.category?.nom || <span className="text-amber-700">À compléter</span>}</td>
    <td className="px-4 py-3.5 text-sm text-gray-700">{profile.professional_data?.city || '—'}</td>
    <td className="px-4 py-3.5 text-sm text-gray-700">{profile.user?.telephone || profile.professional_data?.contact_phone || '—'}</td>
    <td className="px-4 py-3.5 text-sm text-gray-600"><span className="block">{formatDate(profile.submitted_at || profile.created_at)}</span>{queueAge(profile) && <span className={`mt-0.5 block text-[11px] font-semibold ${queueAge(profile)!.urgent ? 'text-red-700' : 'text-blue-700'}`}>{queueAge(profile)!.label}</span>}</td>
    <td className="px-4 py-3.5 text-xs font-medium text-gray-600">{ORIGIN_LABELS[profile.origin] || ORIGIN_LABELS.SELF_SERVICE}</td>
    <td className="px-4 py-3.5"><StatusBadge status={profile.status} /></td>
    <td className="px-4 py-3.5"><div className="flex flex-col items-start gap-1"><PublicationBadge isPublic={profile.is_public} />{isPDG && <button type="button" disabled={isLoading || !canPublish} title={canPublish ? undefined : PUBLICATION_REQUIREMENT} onClick={() => void togglePublication(profile)} className="rounded-md border border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">{profile.is_public ? 'Retirer' : 'Publier'}</button>}</div></td>
    <td className="px-4 py-3.5 text-right"><button type="button" onClick={onOpen} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500">Examiner<ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></button></td>
  </tr>
  );
};

const MaalemsPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<'' | MaalemProfileStatus>('');
  const [origin, setOrigin] = useState<'' | MaalemProfileOrigin>('');
  const [categoryId, setCategoryId] = useState('');
  const [city, setCity] = useState('');
  const { data: categories = [] } = useGetActiveMaalemCategoriesQuery();
  const filters = useMemo<AdminMaalemFilters>(() => ({
    ...(deferredSearch ? { q: deferredSearch } : {}),
    ...(status ? { status } : {}),
    ...(origin ? { origin } : {}),
    ...(categoryId ? { category_id: Number(categoryId) } : {}),
    ...(city.trim() ? { city: city.trim() } : {}),
  }), [categoryId, city, deferredSearch, origin, status]);
  const { data, isLoading, isFetching, isError, refetch } = useGetAdminMaalemProfilesQuery(filters);
  const profiles = data?.profiles || [];
  const counts = data?.counts;
  const hasFilters = Boolean(search || status || origin || categoryId || city);

  const resetFilters = () => { setSearch(''); setStatus(''); setOrigin(''); setCategoryId(''); setCity(''); };
  const counters = [
    { label: 'À examiner', value: counts?.submitted || 0, icon: FileText, tone: 'border-blue-200 text-blue-700', status: 'submitted' as MaalemProfileStatus },
    { label: 'En vérification', value: counts?.under_review || 0, icon: Clock3, tone: 'border-amber-200 text-amber-700', status: 'under_review' as MaalemProfileStatus },
    { label: 'Validés', value: counts?.approved || 0, icon: CheckCircle2, tone: 'border-green-200 text-green-700', status: 'approved' as MaalemProfileStatus },
    { label: 'Refusés', value: counts?.rejected || 0, icon: XCircle, tone: 'border-red-200 text-red-700', status: 'rejected' as MaalemProfileStatus },
    { label: 'Suspendus', value: counts?.suspended || 0, icon: ShieldCheck, tone: 'border-violet-200 text-violet-700', status: 'suspended' as MaalemProfileStatus },
  ];

  return (
    <main className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-col justify-between gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-end">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Back-office · candidatures</p><div className="mt-1 flex items-center gap-2"><BriefcaseBusiness className="h-7 w-7 text-blue-700" /><h1 className="text-2xl font-bold tracking-tight text-gray-950">Centre Maalem</h1></div><p className="mt-1 max-w-2xl text-sm text-gray-600">Recevoir, vérifier et décider sur chaque dossier, quelle que soit son origine.</p></div>
        <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"><Plus className="h-4 w-4" />Ajouter un Maalem</button>
      </header>

      <section aria-label="Résumé des statuts" className="grid grid-cols-2 divide-x divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white sm:grid-cols-5 sm:divide-y-0">
        {counters.map(({ label, value, icon: Icon, tone, status: counterStatus }) => <button key={label} type="button" onClick={() => setStatus(counterStatus)} className="flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"><span className={`flex h-8 w-8 items-center justify-center rounded-md border bg-white ${tone}`}><Icon className="h-4 w-4" /></span><span><strong className="block text-xl leading-none text-gray-950">{value}</strong><span className="mt-1 block text-xs font-medium text-gray-600">{label}</span></span></button>)}
      </section>

      <section aria-label="Recherche et filtres" className="border-y border-gray-200 bg-white py-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1.6fr)_repeat(4,minmax(130px,1fr))_auto]">
          <label className="relative sm:col-span-2 lg:col-span-1"><span className="sr-only">Rechercher</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} pl-9`} placeholder="Nom, email ou téléphone…" maxLength={100} /></label>
          <label><span className="sr-only">Statut</span><select value={status} onChange={(event) => setStatus(event.target.value as '' | MaalemProfileStatus)} className={inputClass}><option value="">Tous les statuts</option>{Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
          <label><span className="sr-only">Origine</span><select value={origin} onChange={(event) => setOrigin(event.target.value as '' | MaalemProfileOrigin)} className={inputClass}><option value="">Toutes les origines</option>{Object.entries(ORIGIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="sr-only">Catégorie</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={inputClass}><option value="">Toutes les catégories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nom}</option>)}</select></label>
          <label><span className="sr-only">Ville</span><input value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} placeholder="Ville" maxLength={100} /></label>
          <button type="button" onClick={resetFilters} disabled={!hasFilters} className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-40"><X className="h-4 w-4" />Effacer</button>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500"><span className="inline-flex items-center gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" />{profiles.length} dossier{profiles.length > 1 ? 's' : ''} affiché{profiles.length > 1 ? 's' : ''}</span>{isFetching && !isLoading && <span className="inline-flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Actualisation…</span>}</div>
      </section>

      <section className="overflow-hidden border border-gray-200 bg-white" aria-label="Liste des dossiers Maalem">
        {isLoading ? <div className="flex min-h-64 items-center justify-center text-sm text-gray-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Chargement des candidatures…</div>
          : isError ? <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><AlertCircle className="h-8 w-8 text-red-500" /><p className="mt-3 font-semibold text-gray-900">Impossible de charger les dossiers Maalem.</p><button type="button" onClick={() => refetch()} className="mt-3 rounded-md px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">Réessayer</button></div>
            : profiles.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><BriefcaseBusiness className="h-9 w-9 text-gray-300" /><p className="mt-3 font-semibold text-gray-900">Aucun dossier ne correspond.</p><p className="mt-1 text-sm text-gray-500">Modifiez les filtres ou ajoutez un Maalem depuis le Back-office.</p>{hasFilters && <button type="button" onClick={resetFilters} className="mt-4 text-sm font-semibold text-blue-700">Effacer tous les filtres</button>}</div>
              : <><div className="hidden overflow-x-auto md:block"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-slate-50"><tr>{['Candidat', 'Catégorie', 'Ville', 'Contact', 'Demande', 'Origine', 'Statut', 'Annuaire', ''].map((heading) => <th key={heading || 'actions'} className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{profiles.map((profile) => <ProfileRow key={profile.id} profile={profile} onOpen={() => setSelectedProfileId(profile.id)} />)}</tbody></table></div><ul className="divide-y divide-gray-200 md:hidden">{profiles.map((profile) => <li key={profile.id}><button type="button" onClick={() => setSelectedProfileId(profile.id)} className="w-full p-4 text-left hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><AvatarThumb name={profile.user?.nom_complet} avatarUrl={profile.user?.avatar_url} size="sm" /><div className="min-w-0"><p className="truncate font-bold text-gray-950">{profile.user?.nom_complet || `Contact #${profile.contact_id}`}</p><p className="mt-1 truncate text-sm text-gray-600">{profile.category?.nom || 'Catégorie à compléter'} · {profile.professional_data?.city || 'Ville inconnue'}</p></div></div><ChevronRight className="mt-1 h-5 w-5 shrink-0 text-gray-400" /></div><div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status={profile.status} /><PublicationBadge isPublic={profile.is_public} /><span className="text-xs text-gray-500">{ORIGIN_LABELS[profile.origin] || ORIGIN_LABELS.SELF_SERVICE}</span><span className="text-xs text-gray-400">· {formatDate(profile.submitted_at || profile.created_at)}</span></div><p className="mt-2 text-xs text-gray-500">{profile.user?.telephone || profile.professional_data?.contact_phone || 'Contact non renseigné'}</p></button></li>)}</ul></>}
      </section>

      {selectedProfileId !== null && <DossierDrawer profileId={selectedProfileId} onClose={() => setSelectedProfileId(null)} />}
      {modalOpen && <CreateMaalemModal onClose={() => setModalOpen(false)} onCreated={() => refetch()} />}
    </main>
  );
};

export default MaalemsPage;
