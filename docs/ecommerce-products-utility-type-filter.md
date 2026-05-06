# E-commerce Products: Utility Type Filter (`categorie_base`)

This documents how to filter the product listing by the product utility type stored in `products.categorie_base`.

## Endpoint

**GET** `/api/ecommerce/products`

## Query params

### `categorie_base`

Filter products by utility type.

- Allowed values (DB enum):
  - `Professionel`
  - `Maison`
- Multiple values: comma-separated
  - Example: `categorie_base=Maison,Professionel`

### `utility_type` (alias)

Alias for `categorie_base`.

- Accepts the same values as `categorie_base`
- Also accepts common aliases that the API normalizes:
  - `professional`, `pro` → `Professionel`
  - `home`, `house` → `Maison`

## Example requests

### 1) List only “Maison” products

```http
GET /api/ecommerce/products?categorie_base=Maison&in_stock_only=true&sort=newest&page=1&limit=20
```

### 2) List only “Professionel” products

```http
GET /api/ecommerce/products?categorie_base=Professionel&in_stock_only=true&sort=newest&page=1&limit=20
```

### 3) Multiple values

```http
GET /api/ecommerce/products?categorie_base=Maison,Professionel&in_stock_only=true&sort=newest&page=1&limit=20
```

## Response

The listing response already includes `filters` metadata. This feature adds:

- `filters.utility_types`: available values found in published products (`Professionel`, `Maison`)
- Each returned product item also includes `categorie_base`

### Example response (shape)

```json
{
  "products": [
    {
      "id": 123,
      "reference": "123",
      "designation": "Perceuse",
      "designation_ar": null,
      "designation_en": null,
      "designation_zh": null,
      "prix_vente": 199,
      "prix_promo": null,
      "pourcentage_promo": 0,
      "remise_client": 0,
      "remise_artisan": 0,
      "has_promo": false,
      "image_url": "/uploads/products/perceuse.jpg",
      "gallery": [
        { "id": 1, "image_url": "/uploads/products/perceuse-1.jpg", "position": 1 }
      ],
      "in_stock": true,
      "purchase_limit": 20,
      "has_variants": false,
      "is_obligatoire_variant": false,
      "isObligatoireVariant": false,

      "base_unit": "u",
      "categorie_base": "Maison",

      "variants": { "all": [], "colors": null, "sizes": null, "other": null },
      "units": null,

      "brand": { "id": 8, "nom": "Bosch", "image_url": "/uploads/brands/bosch.png" },
      "categorie": { "id": 5, "nom": "Outillage", "nom_ar": null, "nom_en": null, "nom_zh": null },

      "is_wishlisted": null
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_items": 240,
    "total_pages": 12,
    "has_previous": false,
    "has_next": true,
    "from": 1,
    "to": 20
  },
  "brands": [
    { "id": 8, "nom": "Bosch", "image_url": "/uploads/brands/bosch.png" }
  ],
  "filters": {
    "categories": [],
    "colors": [],
    "units": [],
    "brands": [
      { "id": 8, "nom": "Bosch", "image_url": "/uploads/brands/bosch.png" }
    ],
    "utility_types": ["Professionel", "Maison"],
    "price_range": { "min": 5, "max": 9999 }
  }
}
```
