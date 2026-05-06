# E-Commerce Products API Documentation

Public API endpoints for the e-commerce frontend. No authentication required.

---

## Base URL
```
/api/ecommerce/products
```

---

## Product Schema (E-Commerce)

### Lightweight Product (List View)
```typescript
interface ProductListItem {
  id: number;
  designation: string;
  designation_ar?: string | null;
  designation_en?: string | null;
  designation_zh?: string | null;
  prix_vente: number; // Original price
  prix_promo: number | null; // Discounted price (null if no promo)
  pourcentage_promo: number; // Promotion percentage (0 if no promo)
  has_promo: boolean;
  image_url?: string | null;
  quantite_disponible: number; // Available stock for e-commerce
  has_variants: boolean;
  base_unit: string;
  brand: {
    id: number;
    nom: string;
    image_url?: string | null;
  } | null;
  categories: Array<{
    id: number;
    nom: string;
  }>;
}
```

### Full Product Details (Single View)
```typescript
interface ProductDetails {
  id: number;
  designation: string;
  designation_ar?: string | null;
  designation_en?: string | null;
  designation_zh?: string | null;
  
  // Pricing
  prix_vente: number;
  prix_promo: number | null;
  pourcentage_promo: number;
  has_promo: boolean;
  
  // Stock
  quantite_disponible: number;
  in_stock: boolean;
  
  // Images & Media
  image_url?: string | null;
  
  // Descriptions
  description?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  description_zh?: string | null;
  
  // Technical Specifications
  fiche_technique?: string | null;
  fiche_technique_ar?: string | null;
  fiche_technique_en?: string | null;
  fiche_technique_zh?: string | null;
  
  // Product Specs
  kg?: number | null;
  est_service: boolean;
  base_unit: string;
  
  // Brand
  brand: {
    id: number;
    nom: string;
    description?: string | null;
    image_url?: string | null;
  } | null;
  
  // Categories
  categories: Array<{
    id: number;
    nom: string;
    parent_id?: number | null;
  }>;
  
  // Variants & Units
  has_variants: boolean;
  variants: ProductVariant[];
  units: ProductUnit[];
  
  // Similar Products
  similar_products: ProductListItem[];
  
  // Metadata
  created_at: Date;
  updated_at: Date;
}

interface ProductVariant {
  id: number;
  variant_name: string;
  variant_type: string;
  reference?: string | null;
  prix_vente: number;
  stock_quantity: number;
  available: boolean;
}

interface ProductUnit {
  id: number;
  unit_name: string;
  conversion_factor: number;
  prix_vente?: number | null;
  is_default: boolean;
}
```

---

## API Endpoints

### 1. Get All Published Products

**GET** `/api/ecommerce/products`

Returns paginated list of published products with lightweight data.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category_id` | number | - | Filter by category ID |
| `brand_id` | number | - | Filter by brand ID |
| `search` | string | - | Search in designation and description |
| `min_price` | number | - | Minimum price filter |
| `max_price` | number | - | Maximum price filter |
| `categorie_base` | string | - | Utility type filter (comma-separated): `Professionel`, `Maison` |
| `utility_type` | string | - | Alias for `categorie_base` (accepts common FR/EN values like `professional`, `home`) |
| `sort` | string | `newest` | Sort order: `newest`, `price_asc`, `price_desc`, `popular`, `promo` |
| `limit` | number | `50` | Number of products per page |
| `offset` | number | `0` | Pagination offset |

#### Response
```typescript
{
  products: ProductListItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  filters?: {
    // ... existing filter metadata
    utility_types?: string[]; // e.g. ['Professionel', 'Maison']
  };
}
```

#### Example Request
```
GET /api/ecommerce/products?category_id=5&sort=price_asc&limit=20&offset=0
```

#### Example Response
```json
{
  "products": [
    {
      "id": 1,
      "designation": "Product Name",
      "designation_ar": "اسم المنتج",
      "designation_en": "Product Name",
      "designation_zh": null,
      "prix_vente": 100.00,
      "prix_promo": 80.00,
      "pourcentage_promo": 20,
      "has_promo": true,
      "image_url": "/uploads/products/image.jpg",
      "quantite_disponible": 50,
      "has_variants": false,
      "base_unit": "u",
      "brand": {
        "id": 2,
        "nom": "Brand Name",
        "image_url": "/uploads/brands/logo.jpg"
      },
      "categories": [
        { "id": 5, "nom": "Category 1" },
        { "id": 8, "nom": "Category 2" }
      ]
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

#### Features
- ✅ Only returns published products (`ecom_published = 1`)
- ✅ Excludes deleted products
- ✅ Only shows products with available stock (`stock_partage_ecom_qty > 0`)
- ✅ Supports category, brand, price, and text search filters
- ✅ Multiple sort options
- ✅ Pagination support
- ✅ Automatic promo price calculation

---

### 2. Get Single Product

**GET** `/api/ecommerce/products/:id`

Returns complete product details with variants, units, and similar products.

#### Parameters
- `id` (number) - Product ID

#### Response
```typescript
ProductDetails
```

#### Example Request
```
GET /api/ecommerce/products/1
```

#### Example Response
```json
{
  "id": 1,
  "designation": "Product Name",
  "designation_ar": "اسم المنتج",
  "designation_en": "Product Name",
  "designation_zh": null,
  "prix_vente": 100.00,
  "prix_promo": 80.00,
  "pourcentage_promo": 20,
  "has_promo": true,
  "quantite_disponible": 50,
  "in_stock": true,
  "image_url": "/uploads/products/image.jpg",
  "description": "Full product description",
  "description_ar": "وصف كامل للمنتج",
  "description_en": "Full product description",
  "description_zh": null,
  "fiche_technique": "Technical specifications...",
  "fiche_technique_ar": null,
  "fiche_technique_en": null,
  "fiche_technique_zh": null,
  "kg": 5.5,
  "est_service": false,
  "base_unit": "u",
  "brand": {
    "id": 2,
    "nom": "Brand Name",
    "description": "Brand description",
    "image_url": "/uploads/brands/logo.jpg"
  },
  "categories": [
    { "id": 5, "nom": "Category 1", "parent_id": 1 },
    { "id": 8, "nom": "Category 2", "parent_id": 1 }
  ],
  "has_variants": true,
  "variants": [
    {
      "id": 1,
      "variant_name": "Small",
      "variant_type": "Size",
      "reference": "P1-S",
      "prix_vente": 100.00,
      "stock_quantity": 20,
      "available": true
    },
    {
      "id": 2,
      "variant_name": "Medium",
      "variant_type": "Size",
      "reference": "P1-M",
      "prix_vente": 120.00,
      "stock_quantity": 30,
      "available": true
    }
  ],
  "units": [
    {
      "id": 1,
      "unit_name": "Carton",
      "conversion_factor": 12,
      "prix_vente": 1440.00,
      "is_default": false
    },
    {
      "id": 2,
      "unit_name": "Unité",
      "conversion_factor": 1,
      "prix_vente": null,
      "is_default": true
    }
  ],
  "similar_products": [
    {
      "id": 2,
      "designation": "Similar Product",
      "prix_vente": 95.00,
      "prix_promo": null,
      "pourcentage_promo": 0,
      "has_promo": false,
      "image_url": "/uploads/products/similar.jpg",
      "quantite_disponible": 30
    }
  ],
  "created_at": "2025-01-01T00:00:00.000Z",
  "updated_at": "2025-01-01T00:00:00.000Z"
}
```

#### Features
- ✅ Complete product information
- ✅ All multilingual fields
- ✅ Full descriptions and technical specifications
- ✅ Product variants with availability
- ✅ Product units with conversion factors
- ✅ Brand details
- ✅ Category hierarchy
- ✅ Similar products (up to 8) based on shared categories
- ✅ Similar products sorted by relevance (most shared categories first)

#### Error Responses
- `404` - Product not found or not published

---

### 3. Get Featured Promo Products

**GET** `/api/ecommerce/products/featured/promo`

Returns products with active promotions, sorted by highest discount.

#### Query Parameters
- `limit` (number, default: 12) - Maximum number of products

#### Response
```typescript
ProductListItem[] // Array of products with promotions
```

#### Example Request
```
GET /api/ecommerce/products/featured/promo?limit=8
```

#### Features
- ✅ Only products with `pourcentage_promo > 0`
- ✅ Sorted by highest promotion percentage
- ✅ Published and in-stock products only

---

### 4. Get New Arrivals

**GET** `/api/ecommerce/products/featured/new`

Returns newest published products.

#### Query Parameters
- `limit` (number, default: 12) - Maximum number of products

#### Response
```typescript
ProductListItem[] // Array of newest products
```

#### Example Request
```
GET /api/ecommerce/products/featured/new?limit=8
```

#### Features
- ✅ Sorted by creation date (newest first)
- ✅ Published and in-stock products only

---

## Business Rules

### Product Visibility
Products are visible on e-commerce if:
- `ecom_published = 1`
- `is_deleted = 0`
- `stock_partage_ecom_qty > 0`

### Stock Management
- E-commerce displays `stock_partage_ecom_qty` as available stock
- This is separate from backoffice total stock (`quantite`)
- Products with 0 available stock are hidden from listings

### Pricing
- `prix_vente`: Original retail price
- `prix_promo`: Calculated as `prix_vente * (1 - pourcentage_promo/100)`
- `has_promo`: Boolean flag for easy filtering

### Similar Products
- Based on shared categories
- Excludes current product
- Maximum 8 products
- Sorted by number of shared categories (descending)
- Then by newest first

---

## Frontend Integration (RTK Query)

```typescript
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const ecommerceProductsApi = createApi({
  reducerPath: 'ecommerceProductsApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/ecommerce' }),
  tagTypes: ['EcomProduct'],
  endpoints: (builder) => ({
    // Get all products with filters
    getProducts: builder.query<
      { products: ProductListItem[]; pagination: Pagination },
      ProductFilters
    >({
      query: (filters) => ({
        url: '/products',
        params: filters,
      }),
      providesTags: ['EcomProduct'],
    }),

    // Get single product
    getProduct: builder.query<ProductDetails, number>({
      query: (id) => `/products/${id}`,
      providesTags: (result, error, id) => [{ type: 'EcomProduct', id }],
    }),

    // Get promo products
    getPromoProducts: builder.query<ProductListItem[], number | void>({
      query: (limit = 12) => `/products/featured/promo?limit=${limit}`,
      providesTags: ['EcomProduct'],
    }),

    // Get new arrivals
    getNewProducts: builder.query<ProductListItem[], number | void>({
      query: (limit = 12) => `/products/featured/new?limit=${limit}`,
      providesTags: ['EcomProduct'],
    }),
  }),
});

export const {
  useGetProductsQuery,
  useGetProductQuery,
  useGetPromoProductsQuery,
  useGetNewProductsQuery,
} = ecommerceProductsApi;

// Types
interface ProductFilters {
  category_id?: number;
  brand_id?: number;
  search?: string;
  min_price?: number;
  max_price?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'promo';
  limit?: number;
  offset?: number;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}


## Performance Considerations

- List endpoint returns lightweight data (no descriptions, specs)
- Single product endpoint includes everything
- Similar products query is optimized with shared category count
- Pagination prevents large data transfers
- Indexes on `ecom_published`, `is_deleted`, `stock_partage_ecom_qty` recommended

---

## Multilingual Support

All endpoints support 4 languages:
- French (default): `designation`, `description`, `fiche_technique`
- Arabic: `designation_ar`, `description_ar`, `fiche_technique_ar`
- English: `designation_en`, `description_en`, `fiche_technique_en`
- Chinese: `designation_zh`, `description_zh`, `fiche_technique_zh`

Frontend should select appropriate field based on user's locale.

---

## Security

- ✅ No authentication required (public endpoints)
- ✅ Read-only access (GET only)
- ✅ Only published products visible
- ✅ Pricing information is public
- ✅ Stock quantities limited to e-commerce allocation
