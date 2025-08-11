import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Category } from '../../types';
import type { RootState } from '../index';

interface CategoriesState {
  categories: Category[];
}

// Chargement initial: sans données factices
const getInitialState = (): CategoriesState => {
  try {
    const storedCategories = localStorage.getItem('bpukir_categories');
    return {
      categories: storedCategories ? JSON.parse(storedCategories) : [],
    };
  } catch (e) {
    console.error('Erreur lors du chargement des catégories', e);
    return { categories: [] };
  }
};

const categoriesSlice = createSlice({
  name: 'categories',
  initialState: getInitialState(),
  reducers: {
    // Ajouter une nouvelle catégorie
    addCategory: (state, action: PayloadAction<Category>) => {
      state.categories.push(action.payload);
      // Sauvegarde dans localStorage
      localStorage.setItem('bpukir_categories', JSON.stringify(state.categories));
    },
    // Mettre à jour une catégorie existante
    updateCategory: (state, action: PayloadAction<Category>) => {
      const index = state.categories.findIndex(c => c.id === action.payload.id);
      if (index !== -1) {
        state.categories[index] = action.payload;
        // Sauvegarde dans localStorage
        localStorage.setItem('bpukir_categories', JSON.stringify(state.categories));
      }
    },
    // Supprimer une catégorie
    deleteCategory: (state, action: PayloadAction<number>) => {
      state.categories = state.categories.filter(c => c.id !== action.payload);
      // Sauvegarde dans localStorage
      localStorage.setItem('bpukir_categories', JSON.stringify(state.categories));
    },
  },
});

export const { addCategory, updateCategory, deleteCategory } = categoriesSlice.actions;

export const selectCategories = (state: RootState) => state.categories?.categories || [];

export default categoriesSlice.reducer;
