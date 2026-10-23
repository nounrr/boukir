import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAssignContactsToGroupMutation, useCreateContactGroupMutation } from '../store/api/contactGroupsApi';
import { showError, showSuccess } from '../utils/notifications';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: number[];
  contactLabel: string;
  onCreated: (groupId: number) => void;
}

const ContactGroupCreateModal: React.FC<Props> = ({ isOpen, onClose, selectedIds, contactLabel, onCreated }) => {
  const [name, setName] = useState('');
  const [createGroup, { isLoading: creating }] = useCreateContactGroupMutation();
  const [assignContacts, { isLoading: assigning }] = useAssignContactsToGroupMutation();
  useEffect(() => { if (isOpen) setName(''); }, [isOpen]);
  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    try {
      const group = await createGroup({ name: cleanName }).unwrap();
      if (selectedIds.length) {
        try {
          await assignContacts({ groupId: group.id, contactIds: selectedIds }).unwrap();
        } catch (error: any) {
          showError(error?.data?.error || 'Le groupe a été créé, mais les contacts n’ont pas pu être ajoutés.');
          onCreated(group.id);
          onClose();
          return;
        }
      }
      showSuccess(selectedIds.length ? `Groupe créé avec ${selectedIds.length} ${contactLabel}(s)` : 'Groupe créé');
      onCreated(group.id);
      onClose();
    } catch (error: any) {
      showError(error?.data?.error || 'Impossible de créer le groupe');
    }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4" role="presentation" onMouseDown={onClose}>
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="create-contact-group-title" onMouseDown={event => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="create-contact-group-title" className="text-lg font-bold text-slate-900">Créer un groupe</h2><p className="mt-1 text-sm text-slate-600">{selectedIds.length ? `${selectedIds.length} ${contactLabel}(s) sélectionné(s) seront ajoutés.` : `Après création, choisissez les membres du groupe.`}</p></div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><X size={20} /></button>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-sm font-medium text-slate-700">Nom du groupe<input autoFocus value={name} maxLength={120} onChange={event => setName(event.target.value)} placeholder="Nom du groupe" className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-500" /></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-slate-300 px-4 text-slate-700">Annuler</button><button type="submit" disabled={!name.trim() || creating || assigning} className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">{creating || assigning ? 'Enregistrement...' : 'Créer le groupe'}</button></div>
      </form>
    </div>
  </div>;
};

export default ContactGroupCreateModal;
