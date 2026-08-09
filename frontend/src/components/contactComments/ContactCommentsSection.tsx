import React, { useMemo, useState } from 'react';
import { ChevronDown, Filter, MessageSquare, Pin, Plus, Search } from 'lucide-react';
import {
  useCreateContactCommentMutation,
  useDeleteContactCommentMutation,
  useGetContactCommentCountsQuery,
  useGetContactCommentsQuery,
  useUpdateContactCommentMutation,
  type ContactCommentColor,
} from '../../store/api/contactCommentsApi';
import { showConfirmation, showError } from '../../utils/notifications';
import CommentCard from './CommentCard';
import CommentComposer from './CommentComposer';
import { COMMENT_COLORS, formatRelativeDate } from './commentStyles';
import { useGetMyClientCollaborationPermissionsQuery } from '../../store/api/clientCollaborationPermissionsApi';

interface ContactCommentsSectionProps {
  contactId: number;
  /** Accordéon fermé par défaut : on n'affiche que le dernier message dans l'en-tête */
  defaultOpen?: boolean;
}

const ContactCommentsSection: React.FC<ContactCommentsSectionProps> = ({ contactId, defaultOpen = false }) => {
  const isValidContact = Number.isFinite(contactId) && contactId > 0;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { data: permissions, isLoading: permissionsLoading } = useGetMyClientCollaborationPermissionsQuery(undefined, {
    pollingInterval: 5000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const canUseComments = permissions?.commentaires_clients === true;

  // Aperçu léger (dernier message + compteurs) tant que l'accordéon est fermé.
  const { data: counts } = useGetContactCommentCountsQuery(
    useMemo(() => [contactId], [contactId]),
    { skip: !isValidContact || !canUseComments }
  );
  const summary = counts?.[contactId];

  // La liste complète n'est chargée qu'une fois l'accordéon ouvert.
  const { data: comments = [], isLoading, isFetching } = useGetContactCommentsQuery(contactId, {
    skip: !isValidContact || !isOpen || !canUseComments,
  });
  const [createComment, { isLoading: isCreating }] = useCreateContactCommentMutation();
  const [updateComment] = useUpdateContactCommentMutation();
  const [deleteComment] = useDeleteContactCommentMutation();

  const [draft, setDraft] = useState('');
  const [draftColor, setDraftColor] = useState<ContactCommentColor>('default');
  const [draftEpingle, setDraftEpingle] = useState(false);
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState<ContactCommentColor | 'all'>('all');
  const [onlyPinned, setOnlyPinned] = useState(false);

  // Une fois ouverte, la liste chargée fait autorité ; sinon on s'appuie sur l'aperçu.
  const totalCount = isOpen && comments.length > 0 ? comments.length : (summary?.total ?? 0);
  const pinnedCount = useMemo(
    () => (isOpen && comments.length > 0 ? comments.filter((c) => c.epingle).length : (summary?.epingles ?? 0)),
    [isOpen, comments, summary]
  );
  const lastMessage = summary?.dernier_contenu ?? comments[0]?.contenu ?? null;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return comments.filter((c) => {
      if (onlyPinned && !c.epingle) return false;
      if (colorFilter !== 'all' && c.couleur !== colorFilter) return false;
      if (!needle) return true;
      return (
        c.contenu.toLowerCase().includes(needle) ||
        String(c.created_by_nom ?? '').toLowerCase().includes(needle)
      );
    });
  }, [comments, search, colorFilter, onlyPinned]);

  const hasFilters = search.trim() !== '' || colorFilter !== 'all' || onlyPinned;

  const resetDraft = () => {
    setDraft('');
    setDraftColor('default');
    setDraftEpingle(false);
  };

  const handleCreate = async () => {
    if (!canUseComments) return;
    const contenu = draft.trim();
    if (!contenu) return;
    try {
      await createComment({ contact_id: contactId, contenu, couleur: draftColor, epingle: draftEpingle }).unwrap();
      resetDraft();
    } catch (error: any) {
      showError(error?.data?.error || "Impossible d'ajouter le commentaire");
    }
  };

  const handleUpdate = async (
    id: number,
    payload: { contenu?: string; couleur?: ContactCommentColor; epingle?: boolean }
  ) => {
    if (!canUseComments) return;
    try {
      await updateComment({ id, contact_id: contactId, ...payload }).unwrap();
    } catch (error: any) {
      showError(error?.data?.error || 'Impossible de modifier le commentaire');
    }
  };

  const handleDelete = async (id: number) => {
    if (!canUseComments) return;
    const result = await showConfirmation(
      'Cette action est définitive.',
      'Supprimer ce commentaire ?',
      'Supprimer',
      'Annuler'
    );
    if (!result.isConfirmed) return;
    try {
      await deleteComment({ id, contact_id: contactId }).unwrap();
    } catch (error: any) {
      showError(error?.data?.error || 'Impossible de supprimer le commentaire');
    }
  };

  if (permissionsLoading || !canUseComments) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* En-tête repliable */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100">
            <MessageSquare className="h-4 w-4 text-indigo-600" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">Commentaires</h2>
              {totalCount > 0 && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-600">
                  {totalCount}
                </span>
              )}
              {pinnedCount > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600">
                  <Pin className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                  {pinnedCount}
                </span>
              )}
            </div>

            {/* Replié : aperçu du dernier message. Ouvert : simple décompte. */}
            {!isOpen && lastMessage ? (
              <p className="mt-0.5 truncate text-xs text-gray-500">
                <span className="text-gray-400">Dernier :</span> {lastMessage}
                {summary?.dernier_at && (
                  <span className="text-gray-400"> · {formatRelativeDate(summary.dernier_at)}</span>
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-gray-500">
                {isOpen && isLoading
                  ? 'Chargement…'
                  : totalCount === 0
                    ? 'Aucune note pour ce client'
                    : `${totalCount} note${totalCount > 1 ? 's' : ''}`}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="text-xs font-medium text-gray-400">{isOpen ? 'Réduire' : 'Afficher'}</span>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          <CommentComposer
            value={draft}
            onChange={setDraft}
            couleur={draftColor}
            onCouleurChange={setDraftColor}
            epingle={draftEpingle}
            onEpingleChange={setDraftEpingle}
            onSubmit={handleCreate}
            isSubmitting={isCreating}
          />

          {/* Filtres — n'apparaissent que quand ils servent */}
          {comments.length > 2 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher dans les notes…"
                  className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <button
                type="button"
                onClick={() => setOnlyPinned((v) => !v)}
                aria-pressed={onlyPinned}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  onlyPinned
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Pin className={`h-3.5 w-3.5 ${onlyPinned ? 'fill-amber-500 text-amber-500' : ''}`} />
                Épinglés
              </button>

              <div className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5">
                <Filter className="h-3.5 w-3.5 text-gray-400" />
                <button
                  type="button"
                  onClick={() => setColorFilter('all')}
                  title="Toutes les couleurs"
                  className={`h-4 w-4 rounded-full border border-dashed border-gray-400 transition-transform hover:scale-110 ${
                    colorFilter === 'all' ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-60'
                  }`}
                />
                {COMMENT_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setColorFilter(colorFilter === c.key ? 'all' : c.key)}
                    title={c.label}
                    aria-label={`Filtrer : ${c.label}`}
                    className={`h-4 w-4 rounded-full ${c.swatch} transition-transform hover:scale-110 ${
                      colorFilter === c.key ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'opacity-50'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Liste */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-10 text-center">
              <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                {hasFilters ? (
                  <Search className="h-5 w-5 text-gray-300" />
                ) : (
                  <Plus className="h-5 w-5 text-gray-300" />
                )}
              </span>
              <p className="text-sm text-gray-500">
                {hasFilters ? 'Aucune note ne correspond à ces filtres' : 'Aucun commentaire pour le moment'}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {hasFilters
                  ? 'Modifiez la recherche ou les filtres.'
                  : 'Notez ici les échanges, accords et points de vigilance.'}
              </p>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setColorFilter('all');
                    setOnlyPinned(false);
                  }}
                  className="mt-2 text-xs font-medium text-blue-600 hover:underline"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <div className={`space-y-2 ${isFetching ? 'opacity-60 transition-opacity' : ''}`}>
              {filtered.map((comment) => (
                <CommentCard
                  key={comment.id}
                  comment={comment}
                  onUpdate={(payload) => handleUpdate(comment.id, payload)}
                  onDelete={() => handleDelete(comment.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default ContactCommentsSection;
