# E-Commerce API Endpoints Documentation

## Base URL
```
/api/ecommerce/products
```

All endpoints are **public** (no authentication required).

---

## 📋 **1. GET All Products (With Filters & Pagination)**

### Endpoint
```
GET /api/ecommerce/products
```

### Description
Retrieve a paginated list of published products with comprehensive filtering capabilities, variants, units, and filter metadata.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | Integer | `1` | Page number (starts from 1) |
| `per_page` | Integer | `50` | Items per page (alternative: `limit`) |
| `limit` | Integer | `50` | Items per page |
| `category_id` | String/Array | - | Single category ID or comma-separated IDs (e.g., `5` or `5,8,12`). Includes subcategories automatically |
| `brand_id` | String/Array | - | Single brand ID or comma-separated IDs (e.g., `2` or `2,3,7`) |
| `color` | String/Array | - | Single color or comma-separated colors (e.g., `Rouge` or `Rouge,Bleu,Vert`) |
| `unit` | String/Array | - | Single unit or comma-separated units (e.g., `Kg` or `Kg,L,m`) |
| `search` | String | - | Search term (searches in designation, designation_ar, designation_en, description) |
| `min_price` | Number | - | Minimum price filter |
| `max_price` | Number | - | Maximum price filter |
| `in_stock_only` | Boolean | `true` | Show only in-stock products (`true` or `false`) |
| `sort` | String | `newest` | Sort order: `newest`, `price_asc`, `price_desc`, `promo`, `popular` |

### Request Examples

**Basic request:**
```http
GET /api/ecommerce/products?page=1&per_page=20
```

**With filters:**
```http
GET /api/ecommerce/products?category_id=5,8&brand_id=2,3&color=Rouge,Bleu&min_price=100&max_price=5000&sort=price_asc&page=1&per_page=20
```

**With search:**
```http
GET /api/ecommerce/products?search=Peinture&in_stock_only=true&page=1
```

**Multiple units:**
```http
GET /api/ecommerce/products?unit=Kg,L,m&page=1
```

### Response Structure

```json
{
  "products": [
    {
      "id": 123,
      "designation": "Peinture Acrylique Blanche Premium",
      "designation_ar": "طلاء أبيض",
      "designation_en": "White Acrylic Paint",
      "designation_zh": "白色丙烯酸漆",
      "prix_vente": 289.99,
      "prix_promo": 231.99,
      "pourcentage_promo": 20,
      "remise_client": 5,
      "remise_artisan": 10,
      "has_promo": true,
      "image_url": "https://example.com/products/paint.jpg",
      "gallery": [
        {
          "id": 1,
          "image_url": "https://example.com/gallery/paint-1.jpg",
          "position": 0
        },
        {
          "id": 2,
          "image_url": "https://example.com/gallery/paint-2.jpg",
          "position": 1
        }
      ],
      "quantite_disponible": 50,
      "has_variants": true,
      "base_unit": "L",
      "categorie_base": "Professionel",
      "variants": {
        "all": [
          {
            "id": 456,
            "name": "Rouge",
            "type": "Couleur",
            "prix_vente": 289.99,
            "remise_client": 5,
            "remise_artisan": 10,
            "stock_quantity": 25,
            "available": true,
            "image_url": "https://example.com/variants/red.jpg"
          },
          {
            "id": 457,
            "name": "2.5L",
            "type": "Taille",
            "prix_vente": 289.99,
            "remise_client": 5,
            "remise_artisan": 10,
            "stock_quantity": 15,
            "available": true,
            "image_url": null
          }
        ],
        "colors": [
          {
            "id": 456,
            "name": "Rouge",
            "image_url": "https://example.com/variants/red.jpg",
            "available": true
          },
          {
            "id": 458,
            "name": "Bleu",
            "image_url": "https://example.com/variants/blue.jpg",
            "available": true
          }
        ],
        "sizes": [
          {
            "id": 457,
            "name": "2.5L",
            "available": true
          },
          {
            "id": 459,
            "name": "5L",
            "available": false
          }
        ],
        "other": null
      },
      "units": [
        {
          "id": 1,
          "name": "L",
          "conversion_factor": 1,
          "prix_vente": 289.99,
          "is_default": true
        },
        {
          "id": 2,
          "name": "ml",
          "conversion_factor": 0.001,
          "prix_vente": 0.29,
          "is_default": false
        }
      ],
      "brand": {
        "id": 2,
        "nom": "Premium Paint Co.",
        "image_url": "https://example.com/brands/premium.jpg"
      },
      "categorie": {
        "id": 5,
        "nom": "Peinture"
      }
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_items": 156,
    "total_pages": 8,
    "has_previous": false,
    "has_next": true,
    "from": 1,
    "to": 20
  },
  "filters": {
    "categories": [
      {
        "id": 1,
        "nom": "Vêtements",
        "parent_id": null,
        "children": [
          {
            "id": 2,
            "nom": "T-Shirts",
            "parent_id": 1,
            "children": [
              {
                "id": 3,
                "nom": "T-Shirts Homme",
                "parent_id": 2,
                "children": []
              }
            ]
          }
        ]
      },
      {
        "id": 4,
        "nom": "Chaussures",
        "parent_id": null,
        "children": []
      }
    ],
    "colors": [
      "Beige",
      "Blanc",
      "Bleu",
      "Gris",
      "Jaune",
      "Marron",
      "Noir",
      "Rose",
      "Rouge",
      "Vert",
      "Violet"
    ],
    "units": [
      "cm",
      "g",
      "Kg",
      "L",
      "Lot",
      "m",
      "m²",
      "m³",
      "ml",
      "Pièce",
      "u",
      "Unité"
    ],
    "brands": [
      {
        "id": 1,
        "nom": "Nike",
        "image_url": "https://example.com/brands/nike.jpg"
      },
      {
        "id": 2,
        "nom": "Adidas",
        "image_url": "https://example.com/brands/adidas.jpg"
      }
    ],
    "price_range": {
      "min": 10,
      "max": 10000
    }
  }
}
```

### Response Fields Explanation

#### Product Object
- **id**: Product unique identifier
- **designation**: Product name (French - default)
- **designation_ar/en/zh**: Multilingual product names
- **prix_vente**: Original selling price
- **prix_promo**: Promotional price (null if no promo)
- **pourcentage_promo**: Promotion percentage (0 if no promo)
- **remise_client**: Client discount percentage
- **remise_artisan**: Artisan/Professional discount percentage
- **has_promo**: Boolean indicating if product has active promotion
- **image_url**: Main product image
- **gallery**: Array of additional product images (max 3 in list view)
- **quantite_disponible**: Available stock quantity for e-commerce
- **has_variants**: Boolean indicating if product has variants
- **base_unit**: Default unit (e.g., "L", "Kg", "u")
- **categorie_base**: Product category base ("Professionel" or "Maison")

#### Variants Object
- **all**: Complete list of all variants
- **colors**: Variants of type "Couleur" (null if none)
- **sizes**: Variants of type "Taille" or "Dimension" (null if none)
- **other**: Variants of other types (null if none)

Each variant includes:
- **id**: Variant identifier
- **name**: Variant name
- **type**: Variant type
- **prix_vente**: Variant price
- **remise_client/remise_artisan**: Discount percentages
- **stock_quantity**: Available stock
- **available**: Boolean stock availability
- **image_url**: Variant-specific image (optional)

#### Units Array
- **id**: Unit identifier
- **name**: Unit name (e.g., "Kg", "L", "m")
- **conversion_factor**: Conversion factor relative to base unit
- **prix_vente**: Price for this unit (null if calculated from conversion)
- **is_default**: Boolean indicating default unit

#### Pagination Object
- **current_page**: Current page number
- **per_page**: Items per page
- **total_items**: Total number of products matching filters
- **total_pages**: Total number of pages
- **has_previous**: Can navigate to previous page
- **has_next**: Can navigate to next page
- **from**: First item number on current page
- **to**: Last item number on current page

#### Filters Object
- **categories**: Hierarchical category tree with children
- **colors**: Array of available color names
- **units**: Array of available unit names
- **brands**: Array of brand objects with id, nom, image_url
- **price_range**: Min and max prices across all products

---

## 🔍 **2. GET Single Product**

### Endpoint
```
GET /api/ecommerce/products/:id
```

### Description
Retrieve complete details for a single product including full gallery, all variants with their galleries, units, and similar products.

### URL Parameters
- **id** (required): Product ID

### Request Example
```http
GET /api/ecommerce/products/123
```

### Response Structure

```json
{
  "id": 123,
  "designation": "Peinture Acrylique Blanche Premium",
  "designation_ar": "طلاء أبيض",
  "designation_en": "White Acrylic Paint",
  "designation_zh": "白色丙烯酸漆",
  "prix_vente": 289.99,
  "prix_promo": 231.99,
  "pourcentage_promo": 20,
  "remise_client": 5,
  "remise_artisan": 10,
  "has_promo": true,
  "quantite_disponible": 50,
  "in_stock": true,
  "image_url": "https://example.com/products/paint.jpg",
  "gallery": [
    {
      "id": 1,
      "image_url": "https://example.com/gallery/1.jpg",
      "position": 0
    },
    {
      "id": 2,
      "image_url": "https://example.com/gallery/2.jpg",
      "position": 1
    },
    {
      "id": 3,
      "image_url": "https://example.com/gallery/3.jpg",
      "position": 2
    }
  ],
  "description": "Peinture acrylique de haute qualité...",
  "description_ar": "طلاء أكريليك عالي الجودة...",
  "description_en": "High quality acrylic paint...",
  "description_zh": "高品质丙烯酸漆...",
  "fiche_technique": "Application: Intérieur/Extérieur\nSéchage: 4h...",
  "fiche_technique_ar": "التطبيق: داخلي/خارجي...",
  "fiche_technique_en": "Application: Interior/Exterior...",
  "fiche_technique_zh": "应用：室内/室外...",
  "kg": 2.5,
  "est_service": false,
  "base_unit": "L",
  "categorie_base": "Professionel",
  "brand": {
    "id": 2,
    "nom": "Premium Paint Co.",
    "description": "Leading manufacturer of professional paints",
    "image_url": "https://example.com/brands/premium.jpg"
  },
  "categorie": {
    "id": 5,
    "nom": "Peinture",
    "parent_id": 1
  },
  "has_variants": true,
  "variants": [
    {
      "id": 456,
      "variant_name": "Rouge",
      "variant_type": "Couleur",
      "reference": "PAINT-RED-001",
      "prix_vente": 289.99,
      "remise_client": 5,
      "remise_artisan": 10,
      "stock_quantity": 25,
      "available": true,
      "image_url": "https://example.com/variants/red.jpg",
      "gallery": [
        {
          "id": 10,
          "image_url": "https://example.com/variants/red-1.jpg",
          "position": 0
        },
        {
          "id": 11,
          "image_url": "https://example.com/variants/red-2.jpg",
          "position": 1
        }
      ]
    },
    {
      "id": 457,
      "variant_name": "Bleu",
      "variant_type": "Couleur",
      "reference": "PAINT-BLUE-001",
      "prix_vente": 289.99,
      "remise_client": 5,
      "remise_artisan": 10,
      "stock_quantity": 30,
      "available": true,
      "image_url": "https://example.com/variants/blue.jpg",
      "gallery": []
    }
  ],
  "units": [
    {
      "id": 1,
      "unit_name": "L",
      "conversion_factor": 1,
      "prix_vente": 289.99,
      "is_default": true
    },
    {
      "id": 2,
      "unit_name": "ml",
      "conversion_factor": 0.001,
      "prix_vente": null,
      "is_default": false
    }
  ],
  "similar_products": [
    {
      "id": 124,
      "designation": "Peinture Acrylique Grise",
      "designation_ar": "طلاء رمادي",
      "designation_en": "Grey Acrylic Paint",
      "designation_zh": "灰色丙烯酸漆",
      "prix_vente": 279.99,
      "prix_promo": null,
      "pourcentage_promo": 0,
      "remise_client": 5,
      "remise_artisan": 10,
      "has_promo": false,
      "image_url": "https://example.com/products/grey-paint.jpg",
      "quantite_disponible": 40
    }
  ],
  "created_at": "2024-12-01T10:30:00.000Z",
  "updated_at": "2024-12-15T14:22:00.000Z"
}
```

### Response Fields (Additional to GET All)
- **in_stock**: Boolean stock availability
- **description/description_ar/en/zh**: Full product descriptions
- **fiche_technique/fiche_technique_ar/en/zh**: Technical specifications
- **kg**: Product weight in kilograms (null if not applicable)
- **est_service**: Boolean indicating if product is a service
- **brand.description**: Full brand description
- **categorie.parent_id**: Parent category ID
- **variants**: Full array with variant details and galleries
- **variants[].reference**: Variant reference code
- **variants[].gallery**: Full variant image gallery
- **similar_products**: Array of up to 8 similar products from same category
- **created_at**: Product creation date
- **updated_at**: Last update date

### Error Response (404)
```json
{
  "message": "Produit introuvable ou non disponible"
}
```

---

## 🔥 **3. GET Featured Promo Products**

### Endpoint
```
GET /api/ecommerce/products/featured/promo
```

### Description
Retrieve products with active promotions, sorted by promotion percentage (highest first).

### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | Integer | `12` | Maximum number of products to return |

### Request Example
```http
GET /api/ecommerce/products/featured/promo?limit=12
```

### Response Structure

```json
[
  {
    "id": 123,
    "designation": "Peinture Acrylique Blanche Premium",
    "designation_ar": "طلاء أبيض",
    "designation_en": "White Acrylic Paint",
    "designation_zh": "白色丙烯酸漆",
    "prix_vente": 289.99,
    "prix_promo": 231.99,
    "pourcentage_promo": 20,
    "remise_client": 5,
    "remise_artisan": 10,
    "image_url": "https://example.com/products/paint.jpg",
    "gallery": [
      {
        "id": 1,
        "image_url": "https://example.com/gallery/1.jpg",
        "position": 0
      },
      {
        "id": 2,
        "image_url": "https://example.com/gallery/2.jpg",
        "position": 1
      }
    ],
    "quantite_disponible": 50,
    "has_variants": true,
    "brand_nom": "Premium Paint Co."
  }
]
```

### Response Fields
- Same as GET All Products, but returns array directly (no pagination/filters)
- **gallery**: Limited to first 2 images
- **brand_nom**: Brand name (string, not object)

---

## 🆕 **4. GET New Arrivals**

### Endpoint
```
GET /api/ecommerce/products/featured/new
```

### Description
Retrieve newest products, sorted by creation date (most recent first).

### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | Integer | `12` | Maximum number of products to return |

### Request Example
```http
GET /api/ecommerce/products/featured/new?limit=12
```

### Response Structure

```json
[
  {
    "id": 125,
    "designation": "Ciment Gris CEM II 42.5N",
    "designation_ar": "إسمنت رمادي",
    "designation_en": "Grey Cement CEM II 42.5N",
    "designation_zh": "灰色水泥",
    "prix_vente": 85.00,
    "prix_promo": null,
    "pourcentage_promo": 0,
    "remise_client": 0,
    "remise_artisan": 5,
    "has_promo": false,
    "image_url": "https://example.com/products/cement.jpg",
    "gallery": [
      {
        "id": 15,
        "image_url": "https://example.com/gallery/cement-1.jpg",
        "position": 0
      }
    ],
    "quantite_disponible": 100,
    "has_variants": true,
    "brand_nom": "LafargeHolcim"
  }
]
```

### Response Fields
- Same as Featured Promo endpoint
- **prix_promo**: Can be null if no promotion
- **has_promo**: Boolean indicating if product has promotion

---

## 📊 **Use Cases & Examples**

### Filter by Category and Subcategories
```http
GET /api/ecommerce/products?category_id=1
```
Returns products from category 1 and all its subcategories.

### Multiple Filters Combined
```http
GET /api/ecommerce/products?category_id=5,8&brand_id=2&color=Rouge,Bleu&min_price=100&max_price=1000&sort=price_asc
```
Returns products from categories 5 or 8, brand 2, with red or blue color variants, priced between 100-1000 MAD, sorted by price ascending.

### Search with Filters
```http
GET /api/ecommerce/products?search=peinture&category_id=5&in_stock_only=true&page=1&per_page=20
```
Search for "peinture" in category 5, only in-stock items, paginated.

### Price Range with Sort
```http
GET /api/ecommerce/products?min_price=500&max_price=2000&sort=promo
```
Products between 500-2000 MAD, sorted by best promotions first.

### Show All Products (Including Out of Stock)
```http
GET /api/ecommerce/products?in_stock_only=false
```
Returns all published products regardless of stock status.

---

## 🚨 **Important Notes**

1. **Authentication**: All endpoints are public and don't require authentication.

2. **Stock Filtering**: By default, only in-stock products are shown (`in_stock_only=true`). Set to `false` to show all products.

3. **Category Hierarchy**: When filtering by category, all subcategories are automatically included.

4. **Multiple Values**: Filters support both comma-separated strings and arrays:
   - `?color=Rouge,Bleu` 
   - `?color[]=Rouge&color[]=Bleu`

5. **Pagination**: Use either `limit` or `per_page` (same functionality). Default is 50 items per page.

6. **Sorting**: Default sort is `newest`. Always use explicit sort parameter for predictable results.

7. **Price Calculations**:
   - `prix_promo` = `prix_vente` * (1 - `pourcentage_promo` / 100)
   - Additional discounts (`remise_client`, `remise_artisan`) are provided separately

8. **Multilingual Support**: All text fields are available in French (default), Arabic, English, and Chinese.

9. **Images**: 
   - List view: Up to 3 gallery images per product
   - Detail view: All gallery images
   - Featured endpoints: Up to 2 gallery images

10. **Variants**:
    - Grouped by type for easy frontend rendering
    - Each variant has its own gallery in detail view
    - Color variants include image_url
    - Size variants typically don't have images

---

## 📈 **Performance Considerations**

- Use pagination to avoid loading too many products at once
- Filter by category/brand before applying other filters
- Use `in_stock_only=true` to reduce dataset size
- Limit gallery images in list views (3 max)
- Cache filter metadata (categories, colors, units, brands) as they change infrequently
