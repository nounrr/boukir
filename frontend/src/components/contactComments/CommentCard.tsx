import React, { useState } from 'react';
import { Check, Loader2, Pencil, Pin, Trash2, X } from 'lucide-react';
import type { ContactComment, ContactCommentColor } from '../../store/api/contactCommentsApi';
import {
  COMMENT_COLORS,
  MAX_COMMENT_LENGTH,
  formatFullDate,
  formatRelativeDate,
  getAuthorInitials,
  getCommentTheme,
} from './commentStyles';

interface CommentCardProps {
  comment: ContactComment;
  onUpdate: (payload: { contenu?: string; couleur?: ContactCommentColor; epingle?: boolean }) => Promise<void>;
  onDelete: () => Promise<void>;
  canEdit?: boolean;
  canDelete?: boolean;
  dense?: boolean;
}

const CommentCard: React.FC<CommentCardProps> = ({
  comment,
  onUpdate,
  onDelete,
  canEdit = true,
  canDelete = true,
  dense = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.contenu);
  const [draftColor, setDraftColor] = useState<ContactCommentColor>(comment.couleur);
  const [isBusy, setIsBusy] = useState(false);

  const theme = getCommentTheme(isEditing ? draftColor : comment.couleur);
  const wasEdited = comment.updated_at && comment.updated_at !== comment.created_at;

  // Trois cas distincts : nom connu, compte existant mais sans nom, compte réellement supprimé.
  const authorLabel = comment.created_by_nom
    ? comment.created_by_nom
    : comment.created_by_exists
      ? `Utilisateur #${comment.created_by ?? '?'}`
      : 'Utilisateur supprimé';

  const startEdit = () => {
    setDraft(comment.contenu);
    setDraftColor(comment.couleur);
    setIsEditing(true);
  };

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await action();
    } finally {
      setIsBusy(false);
    }
  };

  const saveEdit = () =>
    run(async () => {
      const contenu = draft.trim();
      if (!contenu) return;
      await onUpdate({ contenu, couleur: draftColor });
      setIsEditing(false);
    });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void saveEdit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
    }
  };

  return (
    <article
      className={`group relative flex gap-0 overflow-hidden rounded-xl border transition-shadow hover:shadow-sm ${theme.card} ${
        comment.epingle ? 'ring-1 ring-amber-200' : ''
      }`}
    >
      <span className={`w-1 flex-shrink-0 ${theme.accent}`} aria-hidden />

      <div className={`flex-1 min-w-0 ${dense ? 'px-3 py-2' : 'px-3.5 py-3'}`}>
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-900/5 text-[10px] font-bold text-gray-600"
              title={authorLabel}
            >
              {getAuthorInitials(comment.created_by_nom)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-gray-700">{authorLabel}</p>
              <p className="text-[11px] text-gray-400" title={formatFullDate(comment.created_at)}>
                {formatRelativeDate(comment.created_at)}
                {wasEdited ? ' · modifié' : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-0.5">
            {comment.epingle && !isEditing && (
              <Pin className="mr-0.5 h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-label="Épinglé" />
            )}
            {isBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
            ) : (
              !isEditing && (
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => run(() => onUpdate({ epingle: !comment.epingle }))}
                    title={comment.epingle ? 'Détacher' : 'Épingler'}
                    className="rounded p-1 text-gray-400 transition-colors hover:bg-amber-100 hover:text-amber-600"
                  >
                    <Pin className={`h-3.5 w-3.5 ${comment.epingle ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={startEdit}
                      title="Modifier"
                      className="rounded p-1 text-gray-400 transition-colors hover:bg-blue-100 hover:text-blue-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => run(onDelete)}
                      title="Supprimer"
                      className="rounded p-1 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            )}
          </div>
        </header>

        {isEditing ? (
          <div className="mt-2 space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
              onKeyDown={handleKeyDown}
              rows={3}
              className="w-full resize-y rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm leading-relaxed text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                {COMMENT_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setDraftColor(c.key)}
                    title={c.label}
                    aria-label={`Couleur : ${c.label}`}
                    className={`h-4 w-4 rounded-full ${c.swatch} transition-transform hover:scale-110 ${
                      draftColor === c.key ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'opacity-60'
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100"
                >
                  <X className="h-3.5 w-3.5" />
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={!draft.trim() || isBusy}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5" />
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700">
            {comment.contenu}
          </p>
        )}
      </div>
    </article>
  );
};

export default CommentCard;
