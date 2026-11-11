import { Archive, ArchiveRestore } from 'lucide-react';
import { useSetContactArchiveMutation } from '../store/api/contactsApi';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';

export default function ContactArchiveButton({ id, name, restore = false, compact = true }: {
  id: number;
  name: string;
  restore?: boolean;
  compact?: boolean;
}) {
  const [setContactArchive, { isLoading }] = useSetContactArchiveMutation();
  const label = restore ? 'Restaurer' : 'Archiver';
  const Icon = restore ? ArchiveRestore : Archive;

  return (
    <button
      type="button"
      title={label}
      aria-label={`${label} ${name}`}
      disabled={isLoading}
      className={compact
        ? 'rounded-md p-2 text-amber-700 hover:bg-amber-100 disabled:opacity-50'
        : 'inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-200 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50'}
      onClick={async event => {
        event.stopPropagation();
        const result = await showConfirmation(`${label} « ${name} » ?`, `${label} le contact`, label);
        if (!result.isConfirmed) return;
        try {
          await setContactArchive({ id, archived: !restore }).unwrap();
          showSuccess(restore ? 'Contact restauré.' : 'Contact archivé.');
        } catch (error) {
          showError((error as { data?: { message?: string } })?.data?.message || 'Impossible de modifier l’archivage.');
        }
      }}
    >
      <Icon size={16} aria-hidden="true" />
      {!compact && label}
    </button>
  );
}
