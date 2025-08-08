import { api } from './apiSlice';
import type { Product, CreateProductData } from '../../types';

// Mock data simulé pour les produits avec les nouvelles spécifications
const mockCategories = [
  { id: 1, nom: "Électronique", description: "Produits électroniques", created_at: "2024-01-01", updated_at: "2024-01-01" },
  { id: 2, nom: "Mobilier", description: "Meubles et mobilier", created_at: "2024-01-01", updated_at: "2024-01-01" },
  { id: 3, nom: "Services", description: "Services divers", created_at: "2024-01-01", updated_at: "2024-01-01" },
];

const calculateDynamicPrices = (prix_achat: number, cout_revient_pct: number, prix_gros_pct: number, prix_vente_pct: number) => ({
  cout_revient: prix_achat * (1 + cout_revient_pct / 100),
  prix_gros: prix_achat * (1 + prix_gros_pct / 100),
  prix_vente: prix_achat * (1 + prix_vente_pct / 100),
});

// Store local simulé pour les produits
let products: Product[] = [
  {
    id: 1,
    reference: "PROD001",
    designation: "Ordinateur portable",
    categorie_id: 1,
    categorie: mockCategories[0],
    quantite: 25,
    prix_achat: 800,
    cout_revient_pourcentage: 2,
    cout_revient: 816,
    prix_gros_pourcentage: 10,
    prix_gros: 880,
    prix_vente_pourcentage: 25,
    prix_vente: 1000,
    est_service: false,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
  {
    id: 2,
    reference: "PROD002",
    designation: "Bureau en bois",
    categorie_id: 2,
    categorie: mockCategories[1],
    quantite: 10,
    prix_achat: 200,
    cout_revient_pourcentage: 2,
    cout_revient: 204,
    prix_gros_pourcentage: 10,
    prix_gros: 220,
    prix_vente_pourcentage: 25,
    prix_vente: 250,
    est_service: false,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
  {
    id: 3,
    reference: "SERV001",
    designation: "Consultation informatique",
    categorie_id: 3,
    categorie: mockCategories[2],
    quantite: 0,
    prix_achat: 50,
    cout_revient_pourcentage: 2,
    cout_revient: 51,
    prix_gros_pourcentage: 10,
    prix_gros: 55,
    prix_vente_pourcentage: 25,
    prix_vente: 62.5,
    est_service: true,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
];

const getNextId = (items: any[]) => Math.max(...items.map(item => item.id), 0) + 1;

const productsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getProducts: builder.query<Product[], void>({
      queryFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { data: products };
      },
      providesTags: ['Product'],
    }),

    getProduct: builder.query<Product, number>({
      queryFn: async (id) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        const product = products.find((prod) => prod.id === id);
        
        if (!product) {
          return {
            error: {
              status: 404,
              data: { message: 'Produit introuvable' },
            },
          };
        }

        return { data: product };
      },
      providesTags: (_result, _error, id) => [{ type: 'Product', id }],
    }),

    createProduct: builder.mutation<Product, CreateProductData & { created_by: number }>({
      queryFn: async (productData) => {
        await new Promise((resolve) => setTimeout(resolve, 500));

        const dynamicPrices = calculateDynamicPrices(
          productData.prix_achat,
          productData.cout_revient_pourcentage,
          productData.prix_gros_pourcentage,
          productData.prix_vente_pourcentage
        );

        const category = mockCategories.find(cat => cat.id === productData.categorie_id);

        const newProduct: Product = {
          id: getNextId(products),
          reference: productData.reference,
          designation: productData.designation,
          categorie_id: productData.categorie_id,
          categorie: category,
          quantite: productData.quantite,
          prix_achat: productData.prix_achat,
          cout_revient_pourcentage: productData.cout_revient_pourcentage,
          cout_revient: dynamicPrices.cout_revient,
          prix_gros_pourcentage: productData.prix_gros_pourcentage,
          prix_gros: dynamicPrices.prix_gros,
          prix_vente_pourcentage: productData.prix_vente_pourcentage,
          prix_vente: dynamicPrices.prix_vente,
          est_service: productData.est_service,
          created_by: productData.created_by,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        products.push(newProduct);
        return { data: newProduct };
      },
      invalidatesTags: ['Product'],
    }),

    updateProduct: builder.mutation<Product, Partial<Product> & { id: number; updated_by: number }>({
      queryFn: async (productData) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        const index = products.findIndex((prod) => prod.id === productData.id);
        
        if (index === -1) {
          return {
            error: {
              status: 404,
              data: { message: 'Produit introuvable' },
            },
          };
        }

        const existingProduct = products[index];
        const prix_achat = productData.prix_achat ?? existingProduct.prix_achat;
        const cout_revient_pct = productData.cout_revient_pourcentage ?? existingProduct.cout_revient_pourcentage;
        const prix_gros_pct = productData.prix_gros_pourcentage ?? existingProduct.prix_gros_pourcentage;
        const prix_vente_pct = productData.prix_vente_pourcentage ?? existingProduct.prix_vente_pourcentage;

        const dynamicPrices = calculateDynamicPrices(prix_achat, cout_revient_pct, prix_gros_pct, prix_vente_pct);
        
        const category = productData.categorie_id 
          ? mockCategories.find(cat => cat.id === productData.categorie_id)
          : existingProduct.categorie;

        const updatedProduct: Product = {
          ...existingProduct,
          ...productData,
          categorie: category,
          cout_revient: dynamicPrices.cout_revient,
          prix_gros: dynamicPrices.prix_gros,
          prix_vente: dynamicPrices.prix_vente,
          updated_by: productData.updated_by,
          updated_at: new Date().toISOString(),
        };

        products[index] = updatedProduct;
        return { data: updatedProduct };
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Product', id }, 'Product'],
    }),

    deleteProduct: builder.mutation<void, { id: number; updated_by: number }>({
      queryFn: async ({ id }) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const index = products.findIndex((prod) => prod.id === id);
        
        if (index === -1) {
          return {
            error: {
              status: 404,
              data: { message: 'Produit introuvable' },
            },
          };
        }

        products.splice(index, 1);
        return { data: undefined };
      },
      invalidatesTags: ['Product'],
    }),

    updateStock: builder.mutation<Product, { id: number; quantite: number; updated_by: number }>({
      queryFn: async ({ id, quantite, updated_by }) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const index = products.findIndex((prod) => prod.id === id);
        
        if (index === -1) {
          return {
            error: {
              status: 404,
              data: { message: 'Produit introuvable' },
            },
          };
        }

        const updatedProduct: Product = {
          ...products[index],
          quantite,
          updated_by,
          updated_at: new Date().toISOString(),
        };

        products[index] = updatedProduct;
        return { data: updatedProduct };
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Product', id }, 'Product'],
    }),
  }),
});

export const {
  useGetProductsQuery,
  useGetProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useUpdateStockMutation,
} = productsApi;
