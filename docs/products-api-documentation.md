# Products API Documentation

Complete API reference for Products endpoints and schema.

---

## Product Schema

### Main Product Table (`products`)

```typescript
interface Product {
  // Core Fields
  id: number;
  reference: string; // Derived from id, always String(id)
  designation: string;
  
  // Multilingual Designation
  designation_ar?: string | null;
  designation_en?: string | null;
  designation_zh?: string | null;
  
  // Categories (Many-to-Many)
  categorie_id: number | string; // JSON string array of category IDs in DB
  categorie?: { id: number; nom: string }; // First category for backward compatibility
  categories: Array<{ id: number; nom: string }>; // All categories
  
  // Brand
  brand_id?: number | null;
  brand?: {
    id: number;
    nom: string;
    image_url?: string | null;
  };
  
  // Stock & Quantity
  quantite: number; // Main stock quantity
  kg?: number | null; // Weight in kilograms
  
  // Pricing
  prix_achat: number; // Purchase price (base)
  
  cout_revient_pourcentage: number; // Cost return percentage
  cout_revient: number; // Calculated: prix_achat * (1 + cout_revient_pourcentage/100)
  
  prix_gros_pourcentage: number; // Wholesale percentage
  prix_gros: number; // Calculated: prix_achat * (1 + prix_gros_pourcentage/100)
  
  prix_vente_pourcentage: number; // Retail percentage
  prix_vente: number; // Calculated: prix_achat * (1 + prix_vente_pourcentage/100)
  
  // Service Flag
  est_service: boolean; // Is service (not physical product)
  
  // Images & Files
  image_url?: string | null; // Product image path
  
  // Technical Specifications
  fiche_technique?: string | null;
  fiche_technique_ar?: string | null;
  fiche_technique_en?: string | null;
  fiche_technique_zh?: string | null;
  
  // Description
  description?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  description_zh?: string | null;
  
  // E-commerce
  pourcentage_promo: number; // Promotion percentage
  ecom_published: boolean; // Published on e-commerce
  stock_partage_ecom: boolean; // Share stock with e-commerce
  stock_partage_ecom_qty: number; // Quantity shared with e-commerce
  
  // Variants & Units
  has_variants: boolean; // Product has variants
  base_unit: string; // Base unit (default: 'u')
  variants: ProductVariant[];
  units: ProductUnit[];
  
  // Metadata
  is_deleted: boolean; // Soft delete flag
  created_by?: number | null;
  updated_by?: number | null;
  created_at: Date;
  updated_at: Date;
}
```

### Product Variant (`product_variants`)

```typescript
interface ProductVariant {
  id: number;
  product_id: number;
  variant_name: string;
  variant_type: string; // Default: 'Autre'
  reference?: string | null;
  
  // Pricing (same structure as main product)
  prix_achat: number;
  cout_revient: number;
  cout_revient_pourcentage: number;
  prix_gros: number;
  prix_gros_pourcentage: number;
  prix_vente_pourcentage: number;
  prix_vente: number;
  
  stock_quantity: number;
  created_at: Date;
  updated_at: Date;
}
```

### Product Unit (`product_units`)

```typescript
interface ProductUnit {
  id: number;
  product_id: number;
  unit_name: string;
  conversion_factor: number; // Default: 1.0
  prix_vente?: number | null;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}
```

### Product Categories Junction (`product_categories`)

```typescript
interface ProductCategory {
  product_id: number;
  category_id: number;
  position: number; // Order position
}
```

---

## API Endpoints

### Base URL
```
/api/products
```

---

## 1. Get All Products

**GET** `/api/products`

Returns all non-deleted products with categories, variants, and units.

### Response
```typescript
Product[] // Array of Product objects
```

### Example Response
```json
[
  {
    "id": 1,
    "reference": "1",
    "designation": "Product Name",
    "designation_ar": null,
    "designation_en": null,
    "designation_zh": null,
    "categorie_id": 5,
    "categorie": { "id": 5, "nom": "Category Name" },
    "categories": [
      { "id": 5, "nom": "Category Name" },
      { "id": 8, "nom": "Secondary Category" }
    ],
    "brand_id": 2,
    "brand": {
      "id": 2,
      "nom": "Brand Name",
      "image_url": "/uploads/brands/image.jpg"
    },
    "quantite": 100,
    "kg": 5.5,
    "prix_achat": 100,
    "cout_revient_pourcentage": 10,
    "cout_revient": 110,
    "prix_gros_pourcentage": 20,
    "prix_gros": 120,
    "prix_vente_pourcentage": 30,
    "prix_vente": 130,
    "est_service": false,
    "image_url": "/uploads/products/image.jpg",
    "fiche_technique": "Technical specs",
    "description": "Product description",
    "pourcentage_promo": 0,
    "ecom_published": true,
    "stock_partage_ecom": true,
    "stock_partage_ecom_qty": 50,
    "has_variants": true,
    "base_unit": "u",
    "variants": [
      {
        "id": 1,
        "variant_name": "Small",
        "variant_type": "Size",
        "reference": "P1-S",
        "prix_achat": 100,
        "prix_vente": 130,
        "stock_quantity": 50
      }
    ],
    "units": [
      {
        "id": 1,
        "unit_name": "Carton",
        "conversion_factor": 12,
        "prix_vente": 1440,
        "is_default": false
      }
    ],
    "created_by": 1,
    "updated_by": 1,
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z"
  }
]
```

---

## 2. Get Single Product

**GET** `/api/products/:id`

Returns a single product by ID with all related data.

### Parameters
- `id` (number) - Product ID

### Response
```typescript
Product
```

### Error Responses
- `404` - Product not found

---

## 3. Get Archived Products

**GET** `/api/products/archived/list`

Returns soft-deleted products (simplified data).

### Response
```typescript
Array<{
  id: number;
  reference: string;
  designation: string;
  categorie_id: number;
  categorie: undefined;
  updated_at: Date;
}>
```

---

## 4. Create Product

**POST** `/api/products`

Creates a new product with optional variants, units, and categories.

### Content-Type
`multipart/form-data` (supports file upload)

### Request Body

```typescript
interface CreateProductRequest {
  // Required
  designation: string;
  
  // Optional - Multilingual
  designation_ar?: string;
  designation_en?: string;
  designation_zh?: string;
  
  // Optional - Categories
  categorie_id?: number; // Legacy single category
  categories?: string | number[]; // JSON string or array of category IDs
  
  // Optional - Brand
  brand_id?: number;
  
  // Optional - Stock
  quantite?: number; // Default: 0
  kg?: number;
  
  // Optional - Pricing
  prix_achat?: number; // Default: 0
  cout_revient_pourcentage?: number; // Default: 0
  prix_gros_pourcentage?: number; // Default: 0
  prix_vente_pourcentage?: number; // Default: 0
  
  // Optional - Flags
  est_service?: boolean | string; // 'true', true, '1', 1
  ecom_published?: boolean | string;
  stock_partage_ecom?: boolean | string;
  stock_partage_ecom_qty?: number; // Default: 0
  
  // Optional - Files
  image?: File; // Multer field
  
  // Optional - Text
  fiche_technique?: string;
  fiche_technique_ar?: string;
  fiche_technique_en?: string;
  fiche_technique_zh?: string;
  description?: string;
  description_ar?: string;
  description_en?: string;
  description_zh?: string;
  
  // Optional - Promo
  pourcentage_promo?: number; // Default: 0
  
  // Optional - Variants & Units
  has_variants?: boolean | string;
  base_unit?: string; // Default: 'u'
  variants?: string | ProductVariant[]; // JSON string or array
  units?: string | ProductUnit[]; // JSON string or array
  
  // Metadata
  created_by?: number;
}
```

### Validation Rules
- `stock_partage_ecom_qty` must not exceed `quantite`
- Prices are calculated: `prix = prix_achat * (1 + pourcentage/100)`
- If `est_service` is true, `quantite` is set to 0

### Response
```typescript
Product // Created product with ID
```

### Status Codes
- `201` - Created successfully
- `400` - Validation error

---

## 5. Update Product

**PUT** `/api/products/:id`

Updates an existing product. All fields are optional.

### Content-Type
`multipart/form-data`

### Parameters
- `id` (number) - Product ID

### Request Body
Same as Create Product (all fields optional)

### Validation Rules
- `stock_partage_ecom_qty` must not exceed `quantite`
- Prices recalculated if `prix_achat` or percentage fields change

### Response
```typescript
Product // Updated product
```

### Error Responses
- `404` - Product not found
- `400` - Validation error

---

## 6. Delete Product (Soft Delete)

**DELETE** `/api/products/:id`

Soft deletes a product by setting `is_deleted = 1`.

### Parameters
- `id` (number) - Product ID

### Response
- `204` No Content

---

## 7. Restore Product

**POST** `/api/products/:id/restore`

Restores a soft-deleted product.

### Parameters
- `id` (number) - Product ID

### Response
```typescript
Product // Restored product
```

### Error Responses
- `404` - Archived product not found

---

## 8. Update Stock Only

**PATCH** `/api/products/:id/stock`

Updates only the stock quantity (faster endpoint for stock operations).

### Parameters
- `id` (number) - Product ID

### Request Body
```typescript
{
  quantite: number;
  updated_by?: number;
}
```

### Response
```typescript
Product
```

### Error Responses
- `404` - Product not found

---

## Related Tables

### Categories (`categories`)
Referenced by products via `product_categories` junction table.

### Brands (`brands`)
```typescript
interface Brand {
  id: number;
  nom: string;
  description?: string | null;
  image_url?: string | null;
  created_at: Date;
  updated_at: Date;
}
```

---

## File Uploads

### Image Upload
- **Field name**: `image`
- **Destination**: `backend/uploads/products/`
- **Accessible at**: `/uploads/products/{filename}`
- **Format**: `{timestamp}-{random}.{ext}`

---

## Price Calculation Formula

All prices are derived from `prix_achat` and percentage fields:

```javascript
cout_revient = prix_achat * (1 + cout_revient_pourcentage / 100)
prix_gros = prix_achat * (1 + prix_gros_pourcentage / 100)
prix_vente = prix_achat * (1 + prix_vente_pourcentage / 100)
```

**Example:**
- `prix_achat` = 100
- `prix_vente_pourcentage` = 30
- `prix_vente` = 100 * (1 + 30/100) = 130

---

## Frontend Integration Notes

### Important Behaviors

1. **Reference Field**: Always use `String(id)` - never sent in POST/PUT
2. **Boolean Fields**: Accept multiple formats (`true`, `'true'`, `1`, `'1'`)
3. **Categories**: 
   - Use `categories` array for multi-select
   - `categorie_id` is maintained for backward compatibility
   - DB stores JSON array in `categorie_id` column
4. **Variants/Units**: Can send as JSON string or array
5. **Soft Delete**: Deleted products have `is_deleted = 1`
6. **Service Products**: Automatically set `quantite = 0`
7. **Stock Sharing**: `stock_partage_ecom_qty` validated against `quantite`

### Recommended Frontend Types

```typescript
// For forms
type ProductFormData = Omit<Product, 'id' | 'reference' | 'created_at' | 'updated_at' | 'variants' | 'units' | 'categories'> & {
  categories?: number[];
  variants?: ProductVariant[];
  units?: ProductUnit[];
  image?: File;
};

// For API responses
type ProductResponse = Product;

// For lists (optimized)
type ProductListItem = Pick<Product, 
  'id' | 'reference' | 'designation' | 'categorie' | 'brand' | 
  'quantite' | 'prix_achat' | 'prix_vente' | 'image_url' | 
  'ecom_published' | 'stock_partage_ecom'
>;
```

---

## RTK Query Example

```typescript
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const productsApi = createApi({
  reducerPath: 'productsApi',
  baseQuery: fetchBaseQuery({ 
    baseUrl: '/api',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['Product'],
  endpoints: (builder) => ({
    getProducts: builder.query<Product[], void>({
      query: () => '/products',
      providesTags: ['Product'],
    }),
    getProduct: builder.query<Product, number>({
      query: (id) => `/products/${id}`,
      providesTags: (result, error, id) => [{ type: 'Product', id }],
    }),
    getArchivedProducts: builder.query<ProductListItem[], void>({
      query: () => '/products/archived/list',
    }),
    createProduct: builder.mutation<Product, FormData>({
      query: (formData) => ({
        url: '/products',
        method: 'POST',
        body: formData,
      }),
      invalidatesTags: ['Product'],
    }),
    updateProduct: builder.mutation<Product, { id: number; data: FormData }>({
      query: ({ id, data }) => ({
        url: `/products/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Product', id }, 'Product'],
    }),
    deleteProduct: builder.mutation<void, number>({
      query: (id) => ({
        url: `/products/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Product'],
    }),
    restoreProduct: builder.mutation<Product, number>({
      query: (id) => ({
        url: `/products/${id}/restore`,
        method: 'POST',
      }),
      invalidatesTags: ['Product'],
    }),
    updateStock: builder.mutation<Product, { id: number; quantite: number; updated_by?: number }>({
      query: ({ id, quantite, updated_by }) => ({
        url: `/products/${id}/stock`,
        method: 'PATCH',
        body: { quantite, updated_by },
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Product', id }],
    }),
  }),
});

export const {
  useGetProductsQuery,
  useGetProductQuery,
  useGetArchivedProductsQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useRestoreProductMutation,
  useUpdateStockMutation,
} = productsApi;
```

---

## Notes

- All numeric fields are coerced to `Number()` on the backend
- Timestamps are managed automatically
- Foreign keys cascade on delete for junction tables
- Images are stored in filesystem, not database
- Multilingual fields support Arabic, English, Chinese, and French (default)
