import type { Contact } from '../types';

export function bonContactSearchLabel(contact: Contact) {
  return [contact.nom_complet, contact.reference || contact.id, contact.societe, contact.telephone]
    .filter(Boolean)
    .join(' - ');
}
