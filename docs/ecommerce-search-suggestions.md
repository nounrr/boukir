# Ecommerce Search Suggestions API

This endpoint powers a **smart search dropdown** (typeahead) in ecommerce: it returns matching **products**, **categories**, and **brands** (with images), and also returns an `intent` section that attempts to detect the most likely **brand** and/or **category** from the user query.

## Endpoint

`GET /api/ecommerce/search/suggestions`

- Public endpoint (no auth required).
- Accepts optional `Authorization: Bearer <token>` (the backend uses `optionalAuth`, but current response does not depend on auth).

## Query Parameters

| Parameter          |    Type |    Default | Description                                                                                   |
| ------------------ | ------: | ---------: | --------------------------------------------------------------------------------------------- |
| `q`                |  string | (required) | User query string.                                                                            |
| `limit_products`   |  number |       `10` | Max number of product suggestions. Min `0`, max `50`.                                         |
| `limit_categories` |  number |        `6` | Max number of category suggestions. Min `0`, max `50`.                                        |
| `limit_brands`     |  number |        `6` | Max number of brand suggestions. Min `0`, max `50`.                                           |
| `in_stock_only`    | boolean |     `true` | If `true`, suggests only items that are in stock (considers product stock and variant stock). |

## What “Smart” Means Here

The endpoint will:

1. Search for matching categories/brands by `LIKE` across name fields.
2. Score candidates against the normalized query.
3. If it detects a category, it expands the search scope to include **all descendant categories** using a recursive CTE.
4. It removes detected brand/category phrases from the query to produce `remaining_query` and uses that for the product search.

## Request Examples

### Basic

`GET /api/ecommerce/search/suggestions?q=iphone`

### With limits

`GET /api/ecommerce/search/suggestions?q=samsung%20tv&limit_products=8&limit_categories=8&limit_brands=8`

### Include out-of-stock

`GET /api/ecommerce/search/suggestions?q=table%20rouge&in_stock_only=false`

## Response

### Top-Level Shape

```json
{
  "query": "string",
  "normalized_query": "string",
  "intent": {
    "detected_category": {
      "id": 1,
      "nom": "string",
      "nom_ar": "string|null",
      "nom_en": "string|null",
      "nom_zh": "string|null",
      "parent_id": 0,
      "image_url": "string|null",
      "category_ids_scope": [1, 2, 3]
    },
    "detected_brand": {
      "id": 1,
      "nom": "string",
      "image_url": "string|null"
    },
    "remaining_query": "string"
  },
  "categories": [
    {
      "id": 1,
      "nom": "string",
      "nom_ar": "string|null",
      "nom_en": "string|null",
      "nom_zh": "string|null",
      "parent_id": null,
      "image_url": "string|null"
    }
  ],
  "brands": [
    {
      "id": 1,
      "nom": "string",
      "image_url": "string|null"
    }
  ],
  "products": [
    {
      "id": 1,
      "designation": "string",
      "designation_ar": "string|null",
      "designation_en": "string|null",
      "designation_zh": "string|null",
      "prix_vente": 199.99,
      "prix_promo": 149.99,
      "pourcentage_promo": 25,
      "has_promo": true,
      "image_url": "string|null",
      "in_stock": true,
      "brand": {
        "id": 1,
        "nom": "string",
        "image_url": "string|null"
      },
      "categorie": {
        "id": 1,
        "nom": "string",
        "nom_ar": "string|null",
        "nom_en": "string|null",
        "nom_zh": "string|null",
        "parent_id": null,
        "image_url": "string|null"
      }
    }
  ]
}
```

### Notes on Fields

- `products[].image_url` is chosen as:
  1. first `product_images` image (lowest position), else
  2. `products.image_url`, else `null`.

- `intent.detected_category.category_ids_scope` is provided only when a category is confidently detected. It includes the detected category and all descendants.

- `intent.remaining_query` is the normalized query after removing detected brand/category words. It may be empty.

## Example Response

Request:

`GET /api/ecommerce/search/suggestions?q=Samsung%20TV`

Response (example):

```json
{
  "query": "Samsung TV",
  "normalized_query": "samsung tv",
  "intent": {
    "detected_category": null,
    "detected_brand": {
      "id": 3,
      "nom": "Samsung",
      "image_url": "https://..."
    },
    "remaining_query": "tv"
  },
  "categories": [],
  "brands": [
    {
      "id": 3,
      "nom": "Samsung",
      "image_url": "https://..."
    }
  ],
  "products": [
    {
      "id": 120,
      "designation": "Smart TV 55\"",
      "designation_ar": null,
      "designation_en": null,
      "designation_zh": null,
      "prix_vente": 4999,
      "prix_promo": null,
      "pourcentage_promo": 0,
      "has_promo": false,
      "image_url": "https://...",
      "in_stock": true,
      "brand": {
        "id": 3,
        "nom": "Samsung",
        "image_url": "https://..."
      },
      "categorie": {
        "id": 8,
        "nom": "TV",
        "nom_ar": null,
        "nom_en": null,
        "nom_zh": null,
        "parent_id": null,
        "image_url": "https://..."
      }
    }
  ]
}
```

## Errors

- `200 OK` with empty arrays when `q` is empty.
- Standard JSON error response on server errors (consistent with the rest of the API), for example `500` with `{ "message": "..." }`.
