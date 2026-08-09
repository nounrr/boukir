import React, { useState } from 'react';
import { MessageSquare, MessageSquarePlus, X } from 'lucide-react';
import {
  useCreateContactCommentMutation,
  useDeleteContactCommentMutation,
  useGetContactCommentsQuery,
  useUpdateContactCommentMutation,
  type ContactCommentColor,
} from '../../store/api/contactCommentsApi';
import { showConfirmation, showError } from '../../utils/notifications';
import CommentCard from './CommentCard';
import CommentComposer from './CommentComposer';
import { useGetMyClientCollaborationPermissionsQuery } from '../../store/api/clientCollaborationPermissionsApi';

interface ContactCommentsRowProps {
  contactId: number;
  contactName?: string;
  /** Nombre de colonnes du tableau, pour le colSpan */
  colSpan: number;
  onClose: () => void;
}

/**
 * Panneau de commentaires affiché dans une ligne dépliée sous le client,
 * sans quitter la liste ni ouvrir le détail client.
 */
const ContactCommentsRow: React.FC<ContactCommentsRowProps> = ({
  contactId,
  contactName,
  colSpan,
  onClose,
}) => {
  const { data: permissions, isLoading: permissionsLoading } = useGetMyClientCollaborationPermissionsQuery(undefined, {
    pollingInterval: 5000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const canUseComments = permissions?.commentaires_clients === true;
  const { data: comments = [], isLoading } = useGetContactCommentsQuery(contactId, { skip: !canUseComments });
  const [createComment, { isLoading: isCreating }] = useCreateContactCommentMutation();
  const [updateComment] = useUpdateContactCommentMutation();
  const [deleteComment] = useDeleteContactCommentMutation();

  const [draft, setDraft] = useState('');
  const [draftColor, setDraftColor] = useState<ContactCommentColor>('default');
  const [draftEpingle, setDraftEpingle] = useState(false);

  const handleCreate = async () => {
    if (!canUseComments) return;
    const contenu = draft.trim();
    if (!contenu) return;
    try {
      await createComment({ contact_id: contactId, contenu, couleur: draftColor, epingle: draftEpingle }).unwrap();
      setDraft('');
      setDraftColor('default');
      setDraftEpingle(false);
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
    <tr className="bg-indigo-50/40">
      <td colSpan={colSpan} className="p-0">
        {/* Liseré d'accent : rattache visuellement le panneau à sa ligne client */}
        <div className="border-l-4 border-indigo-400 px-4 py-3">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-900">
                Commentaires
                {contactName && <span className="font-normal text-gray-500"> — {contactName}</span>}
              </h3>
              {comments.length > 0 && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                  {comments.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              title="Fermer"
              aria-label="Fermer les commentaires"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-white hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
              Fermer
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
            {/* Liste des notes */}
            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-0.5">
              {isLoading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-white/70" />
                ))
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-white/60 py-8 text-center">
                  <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50">
                    <MessageSquarePlus className="h-4 w-4 text-indigo-300" />
                  </span>
                  <p className="text-xs text-gray-500">Aucun commentaire pour ce client</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    Notez ici les échanges, accords et points de vigilance.
                  </p>
                </div>
              ) : (
                comments.map((comment) => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    onUpdate={(payload) => handleUpdate(comment.id, payload)}
                    onDelete={() => handleDelete(comment.id)}
                    dense
                  />
                ))
              )}
            </div>

            {/* Rédaction */}
            <CommentComposer
              value={draft}
              onChange={setDraft}
              couleur={draftColor}
              onCouleurChange={setDraftColor}
              epingle={draftEpingle}
              onEpingleChange={setDraftEpingle}
              onSubmit={handleCreate}
              isSubmitting={isCreating}
              compact
              placeholder="Écrire une note sur ce client…"
              submitLabel="Ajouter"
            />
          </div>
        </div>
      </td>
    </tr>
  );
};

export default ContactCommentsRow;
