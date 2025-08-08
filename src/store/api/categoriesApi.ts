import { apiSlice } from './apiSlice';
import type { Category, CreateCategoryData } from '../../types';
import { mockCategories } from '../../data/mockData';

// Store local simulé pour les catégories avec localStorage
const loadCategoriesFromStorage = (): Category[] => {
  try {
    const stored = localStorage.getItem('bpukir_categories');
    return stored ? JSON.parse(stored) : mockCategories;
  } catch {
    return mockCategories;
  }
};

const saveCategoriestoStorage = (categories: Category[]) => {
  try {
    localStorage.setItem('bpukir_categories', JSON.stringify(categories));
  } catch (error) {
    console.warn('Erreur lors de la sauvegarde dans localStorage:', error);
  }
};

let categories: Category[] = Array.from(loadCategoriesFromStorage());

const getNextId = (items: any[]) => Math.max(...items.map(item => item.id), 0) + 1;

export const categoriesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getCategories: builder.query<Category[], void>({
      queryFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { data: categories };
      },
      providesTags: ['Category'],
    }),
    
    getCategoryById: builder.query<Category, number>({
      queryFn: async (id) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        const category = categories.find((cat) => cat.id === id);
        
        if (!category) {
          return {
            error: {
              status: 404,
              data: { message: 'Catégorie introuvable' },
            },
          };
        }

        return { data: category };
      },
      providesTags: (_result, _error, id) => [{ type: 'Category', id }],
    }),
    
    createCategory: builder.mutation<Category, CreateCategoryData & { created_by: number }>({
      queryFn: async (categoryData) => {
        await new Promise((resolve) => setTimeout(resolve, 300));

        const newCategory: Category = {
          id: getNextId(categories),
          nom: categoryData.nom,
          description: categoryData.description,
          created_by: categoryData.created_by,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Créer un nouveau tableau avec le nouvel élément
        categories = Array.from([...categories, newCategory]);
        saveCategoriestoStorage(categories);
        
        return { data: newCategory };
      },
      invalidatesTags: ['Category'],
    }),
    
    updateCategory: builder.mutation<Category, Partial<Category> & { id: number; updated_by: number }>({
      queryFn: async (categoryData) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const index = categories.findIndex((cat) => cat.id === categoryData.id);
        
        if (index === -1) {
          return {
            error: {
              status: 404,
              data: { message: 'Catégorie introuvable' },
            },
          };
        }

        const updatedCategory: Category = {
          ...categories[index],
          ...categoryData,
          updated_by: categoryData.updated_by,
          updated_at: new Date().toISOString(),
        };

        // Créer un nouveau tableau avec l'élément mis à jour
        categories = Array.from(categories.map((cat, i) => i === index ? updatedCategory : cat));
        saveCategoriestoStorage(categories);
        
        return { data: updatedCategory };
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Category', id }],
    }),
    
    deleteCategory: builder.mutation<{ success: boolean; id: number }, { id: number; updated_by: number }>({
      queryFn: async ({ id }) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const index = categories.findIndex((cat) => cat.id === id);
        
        if (index === -1) {
          return {
            error: {
              status: 404,
              data: { message: 'Catégorie introuvable' },
            },
          };
        }

        // Créer un nouveau tableau sans l'élément supprimé
        categories = Array.from(categories.filter((cat) => cat.id !== id));
        saveCategoriestoStorage(categories);
        
        return { data: { success: true, id } };
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Category', id }],
    }),
  }),
});

export const {
  useGetCategoriesQuery,
  useGetCategoryByIdQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
} = categoriesApi;
