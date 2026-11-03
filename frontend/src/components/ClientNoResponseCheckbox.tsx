import type { Contact } from '../types';
import { useAuth } from '../hooks/redux';
import { useUpdateContactMutation } from '../store/api/contactsApi';
import { showError } from '../utils/notifications';

export default function ClientNoResponseCheckbox({ client, showLabel = false }: {
  client: Contact;
  showLabel?: boolean;
}) {
  const { user } = useAuth();
  const [updateContact, { isLoading }] = useUpdateContactMutation();
  return <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-xs font-medium text-orange-800"
    onClick={event => event.stopPropagation()}>
    <input type="checkbox"
      checked={Boolean(Number(client.ne_repond_pas ?? 0))}
      disabled={isLoading}
      aria-label={`Ne répond pas : ${client.nom_complet || client.societe || `client ${client.id}`}`}
      title="Ne répond pas"
      className="h-4 w-4 rounded border-orange-300 text-orange-600 focus:ring-orange-500 disabled:opacity-50"
      onChange={async event => {
        try {
          await updateContact({ id: client.id, ne_repond_pas: event.target.checked, updated_by: user?.id }).unwrap();
        } catch {
          showError('Impossible d’enregistrer le statut « Ne répond pas ».');
        }
      }}
    />
    {showLabel && 'Ne répond pas'}
  </label>;
}
