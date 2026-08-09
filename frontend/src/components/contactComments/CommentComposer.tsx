import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Pin, Send, X } from 'lucide-react';
import type { ContactCommentColor } from '../../store/api/contactCommentsApi';
import { COMMENT_COLORS, MAX_COMMENT_LENGTH, getCommentTheme } from './commentStyles';

interface CommentComposerProps {
  value: string;
  onChange: (value: string) => void;
  couleur: ContactCommentColor;
  onCouleurChange: (couleur: ContactCommentColor) => void;
  epingle: boolean;
  onEpingleChange: (epingle: boolean) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  submitLabel?: string;
  compact?: boolean;
}

const CommentComposer: React.FC<CommentComposerProps> = ({
  value,
  onChange,
  couleur,
  onCouleurChange,
  epingle,
  onEpingleChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
  autoFocus = false,
  placeholder = 'Ajouter un commentaire sur ce client…',
  submitLabel = 'Publier',
  compact = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  // Hauteur auto (le champ grandit avec le texte, sans scrollbar interne)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, compact ? 140 : 220)}px`;
  }, [value, compact]);

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_COMMENT_LENGTH && !isSubmitting;
  const remaining = MAX_COMMENT_LENGTH - value.length;
  const theme = getCommentTheme(couleur);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className={`rounded-xl border transition-all ${
        isFocused ? 'border-blue-300 ring-2 ring-blue-100 bg-white' : 'border-gray-200 bg-gray-50/60'
      }`}
    >
      <div className="flex gap-2 p-2.5">
        <span className={`w-1 rounded-full flex-shrink-0 ${theme.accent}`} aria-hidden />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          rows={compact ? 2 : 3}
          placeholder={placeholder}
          className="flex-1 resize-none bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none leading-relaxed"
        />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap border-t border-gray-100 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          {COMMENT_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onCouleurChange(c.key)}
              title={c.label}
              aria-label={`Couleur : ${c.label}`}
              aria-pressed={couleur === c.key}
              className={`w-5 h-5 rounded-full ${c.swatch} transition-transform hover:scale-110 ${
                couleur === c.key ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'opacity-60 hover:opacity-100'
              }`}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-gray-200" aria-hidden />
          <button
            type="button"
            onClick={() => onEpingleChange(!epingle)}
            title={epingle ? 'Ne plus épingler' : 'Épingler en haut'}
            aria-pressed={epingle}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              epingle ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
          >
            <Pin className={`w-3.5 h-3.5 ${epingle ? 'fill-amber-500 text-amber-500' : ''}`} />
            Épingler
          </button>
        </div>

        <div className="flex items-center gap-2">
          {remaining < 200 && (
            <span className={`text-xs ${remaining < 0 ? 'text-red-500' : 'text-gray-400'}`}>{remaining}</span>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Annuler
            </button>
          )}
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {submitLabel}
          </button>
        </div>
      </div>

      <p className="px-3 pb-2 text-[11px] text-gray-400">
        <kbd className="rounded border border-gray-200 bg-white px-1">Ctrl</kbd> +{' '}
        <kbd className="rounded border border-gray-200 bg-white px-1">Entrée</kbd> pour publier
      </p>
    </div>
  );
};

export default CommentComposer;
