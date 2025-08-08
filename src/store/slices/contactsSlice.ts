import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Contact } from '../../types';
import { mockContacts } from '../../data/mockData';
import type { RootState } from '../index';

interface ContactsState {
  contacts: Contact[];
}

// Chargement initial depuis localStorage ou mock data
const getInitialState = (): ContactsState => {
  try {
    const storedContacts = localStorage.getItem('bpukir_contacts');
    return {
      contacts: storedContacts ? JSON.parse(storedContacts) : mockContacts,
    };
  } catch (e) {
    console.error('Erreur lors du chargement des contacts', e);
    return { contacts: mockContacts };
  }
};

const contactsSlice = createSlice({
  name: 'contacts',
  initialState: getInitialState(),
  reducers: {
    // Ajouter un nouveau contact
    addContact: (state, action: PayloadAction<Contact>) => {
      state.contacts.push(action.payload);
      // Sauvegarde dans localStorage
      localStorage.setItem('bpukir_contacts', JSON.stringify(state.contacts));
    },
    
    // Mettre à jour un contact existant
    updateContact: (state, action: PayloadAction<Contact>) => {
      const index = state.contacts.findIndex(c => c.id === action.payload.id);
      if (index !== -1) {
        state.contacts[index] = action.payload;
        // Sauvegarde dans localStorage
        localStorage.setItem('bpukir_contacts', JSON.stringify(state.contacts));
      }
    },
    
    // Supprimer un contact
    deleteContact: (state, action: PayloadAction<number>) => {
      state.contacts = state.contacts.filter(c => c.id !== action.payload);
      // Sauvegarde dans localStorage
      localStorage.setItem('bpukir_contacts', JSON.stringify(state.contacts));
    },
    // Réinitialiser les contacts avec les données de test
    seedContacts: (state) => {
      state.contacts = mockContacts;
      localStorage.setItem('bpukir_contacts', JSON.stringify(state.contacts));
    },
  },
});

export const { addContact, updateContact, deleteContact, seedContacts } = contactsSlice.actions;

export const selectContacts = (state: RootState) => state.contacts?.contacts || [];
export const selectClients = (state: RootState) => 
  (state.contacts?.contacts || []).filter(contact => contact.type === 'Client');
export const selectFournisseurs = (state: RootState) => 
  (state.contacts?.contacts || []).filter(contact => contact.type === 'Fournisseur');

export default contactsSlice.reducer;
