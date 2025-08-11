import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Product } from '../../types';
import type { RootState } from '../index';

interface ProductsState {
  products: Product[];
}

// Chargement initial: sans données factices
const getInitialState = (): ProductsState => {
  try {
    const storedProducts = localStorage.getItem('bpukir_products');
    return {
      products: storedProducts ? JSON.parse(storedProducts) : [],
    };
  } catch (e) {
    console.error('Erreur lors du chargement des produits', e);
    return { products: [] };
  }
};

const productsSlice = createSlice({
  name: 'products',
  initialState: getInitialState(),
  reducers: {
    // Ajouter un nouveau produit
    addProduct: (state, action: PayloadAction<Product>) => {
      state.products.push(action.payload);
      // Sauvegarde dans localStorage
      localStorage.setItem('bpukir_products', JSON.stringify(state.products));
    },
    // Mettre à jour un produit existant
    updateProduct: (state, action: PayloadAction<Product>) => {
      const index = state.products.findIndex(p => p.id === action.payload.id);
      if (index !== -1) {
        state.products[index] = action.payload;
        // Sauvegarde dans localStorage
        localStorage.setItem('bpukir_products', JSON.stringify(state.products));
      }
    },
    // Supprimer un produit
    deleteProduct: (state, action: PayloadAction<number>) => {
      state.products = state.products.filter(p => p.id !== action.payload);
      // Sauvegarde dans localStorage
      localStorage.setItem('bpukir_products', JSON.stringify(state.products));
    },
  },
});

export const { addProduct, updateProduct, deleteProduct } = productsSlice.actions;

export const selectProducts = (state: RootState) => state.products?.products || [];

export default productsSlice.reducer;
