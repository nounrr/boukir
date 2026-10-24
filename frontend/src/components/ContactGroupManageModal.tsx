import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Contact, ContactGroup } from '../types';
import { useGetAllChargeClientsQuery, useGetAllClientsQuery, useGetAllFournisseursQuery } from '../store/api/contactsApi';
import { useAssignContactsToGroupMutation, useGetContactGroupsQuery, useUnassignContactsFromGroupMutation } from '../store/api/contactGroupsApi';
import { showError, showSuccess } from '../utils/notifications';

type ContactKind = 'client' | 'fournisseur' | 'charge';
const EMPTY_CONTACTS: Contact[] = [];
const EMPTY_GROUPS: ContactGroup[] = [];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contactKind: ContactKind;
  initialGroupId?: number | null;
}

const ContactGroupManageModal: React.FC<Props> = ({ isOpen, onClose, contactKind, initialGroupId }) => {
  const { data: groups = EMPTY_GROUPS, isLoading: groupsLoading } = useGetContactGroupsQuery(undefined, { skip: !isOpen });
  const { data: clientsData, isLoading: clientsLoading } = useGetAllClientsQuery(undefined, { skip: !isOpen || contactKind !== 'client' });
  const { data: fournisseursData, isLoading: fournisseursLoading } = useGetAllFournisseursQuery(undefined, { skip: !isOpen || contactKind !== 'fournisseur' });
  const { data: chargesData, isLoading: chargesLoading } = useGetAllChargeClientsQuery(undefined, { skip: !isOpen || contactKind !== 'charge' });
  const clients = clientsData ?? EMPTY_CONTACTS;
  const fournisseurs = fournisseursData ?? EMPTY_CONTACTS;
  const charges = chargesData ?? EMPTY_CONTACTS;
  const [assignContacts, { isLoading: assigning }] = useAssignContactsToGroupMutation();
  const [unassignContacts, { isLoading: unassigning }] = useUnassignContactsFromGroupMutation();
  const [groupId, setGroupId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const contacts: Contact[] = contactKind === 'client' ? clients : contactKind === 'fournisseur' ? fournisseurs : charges;
  const loading = groupsLoading || (contactKind === 'client' ? clientsLoading : contactKind === 'fournisseur' ? fournisseursLoading : chargesLoading);

  useEffect(() => {
    if (isOpen) return;
    // Réinitialiser à la fermeture, pas à chaque rendu d'une requête ignorée.
    setGroupId(null);
    setSelectedIds(prev => prev.size === 0 ? prev : new Set());
    setSearch('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (groups.length && groupId === null) setGroupId(groups.some(group => group.id === initialGroupId) ? initialGroupId! : groups[0].id);
  }, [isOpen, groups, groupId, initialGroupId]);

  useEffect(() => {
    if (!isOpen || groupId === null) return;
    setSelectedIds(new Set(contacts.filter(contact => Number(contact.group_id) === groupId).map(contact => Number(contact.id))));
  }, [isOpen, groupId, contacts]);

  const shownContacts = useMemo(() => contacts.filter(contact => `${contact.nom_complet} ${contact.societe || ''} ${contact.reference || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [contacts, search]);
  if (!isOpen) return null;

  const save = async () => {
    if (groupId === null || loading) return;
    const currentIds = new Set(contacts.filter(contact => Number(contact.group_id) === groupId).map(contact => Number(contact.id)));
    const add = [...selectedIds].filter(id => !currentIds.has(id));
    const remove = [...currentIds].filter(id => !selectedIds.has(id));
    try {
      if (add.length) await assignContacts({ groupId, contactIds: add }).unwrap();
      if (remove.length) await unassignContacts({ contactIds: remove }).unwrap();
      showSuccess('Membres du groupe mis à jour');
      onClose();
    } catch (error: any) {
      showError(error?.data?.error || 'Impossible de modifier les membres du groupe');
    }
  };

  const busy = assigning || unassigning;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-3" role="presentation" onMouseDown={onClose}>
    <div className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="manage-contact-group-title" onMouseDown={event => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4"><div><h2 id="manage-contact-group-title" className="text-lg font-bold text-slate-900">Gérer les membres du groupe</h2><p className="mt-1 text-sm text-slate-600">Cochez les {contactKind === 'client' ? 'clients' : contactKind === 'charge' ? 'charges' : 'fournisseurs'} à ajouter ; décochez ceux à retirer.</p></div><button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><X size={20} /></button></div>
      <div className="space-y-3 border-b border-slate-100 p-4">
        <label className="block text-sm font-medium text-slate-700">Groupe<select value={groupId ?? ''} onChange={event => setGroupId(Number(event.target.value))} disabled={!groups.length || busy} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base">{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher un membre" aria-label="Rechercher un membre" className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" />
        <p className="text-sm text-slate-600">{selectedIds.size} membre{selectedIds.size !== 1 ? 's' : ''} sélectionné{selectedIds.size !== 1 ? 's' : ''}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!groups.length && !groupsLoading ? <p className="text-sm text-slate-600">Créez d’abord un groupe.</p> : loading ? <p className="text-sm text-slate-600">Chargement des contacts...</p> : shownContacts.length === 0 ? <p className="text-sm text-slate-600">Aucun contact trouvé.</p> : <div className="space-y-2">{shownContacts.map(contact => <label key={contact.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"><input type="checkbox" checked={selectedIds.has(Number(contact.id))} disabled={busy} onChange={() => setSelectedIds(prev => { const next = new Set(prev); const id = Number(contact.id); if (next.has(id)) next.delete(id); else next.add(id); return next; })} className="h-5 w-5 shrink-0 accent-blue-600" /><span className="min-w-0 break-words text-sm font-medium text-slate-800">{contact.nom_complet || contact.societe || `Contact #${contact.id}`}{contact.group_id && Number(contact.group_id) !== groupId && <span className="block text-xs font-normal text-slate-500">Groupe actuel : {contact.group_name || `#${contact.group_id}`}</span>}</span></label>)}</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-white p-4"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-slate-300 px-4 text-slate-700">Annuler</button><button type="button" onClick={save} disabled={groupId === null || loading || busy} className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">{busy ? 'Enregistrement...' : 'Enregistrer les membres'}</button></div>
    </div>
  </div>;
};

export default ContactGroupManageModal;
