# E-commerce Cart API Documentation

## Overview
This API manages shopping cart operations for e-commerce users, including adding/removing items, updating quantities, and validating carts before checkout.

**Base Path:** `/api/ecommerce/cart`

**Authentication:** All endpoints require user authentication via JWT token.

---

## Endpoints

### 1. Get User Cart
**GET** `/api/ecommerce/cart`

Retrieves the current user's complete cart with all items, including product details, pricing, stock availability, and calculated totals.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### Request
No parameters required.

#### Response
**Status:** `200 OK`

```json
{
  "items": [
    {
      "id": 1,
      "product_id": 123,
      "variant_id": 45,
      "unit_id": 2,
      "quantity": 3,
      "product": {
        "designation": "Product Name",
        "designation_ar": "اسم المنتج",
        "designation_en": "Product Name",
        "designation_zh": "产品名称",
        "image_url": "https://example.com/image.jpg",
        "has_variants": true,
        "base_unit": "piece"
      },
      "variant": {
        "id": 45,
        "name": "Red - Large",
        "type": "color-size",
        "image_url": "https://example.com/variant-image.jpg"
      },
      "unit": {
        "id": 2,
        "name": "Box",
        "conversion_factor": 12
      },
      "pricing": {
        "base_price": 100.00,
        "effective_price": 100.00,
        "promo_percentage": 10,
        "price_after_promo": 90.00,
        "remise_client": 5.00,
        "remise_artisan": 3.00,
        "has_promo": true,
        "subtotal": 270.00
      },
      "stock": {
        "available": 50,
        "is_available": true,
        "max_quantity": 50
      },
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T11:00:00Z"
    }
  ],
  "summary": {
    "total_items": 5,
    "unique_items": 2,
    "subtotal": 450.00,
    "all_items_available": true,
    "unavailable_count": 0
  }
}
```

#### Response Fields

**Item Fields:**
- `id` - Cart item ID
- `product_id` - Product ID
- `variant_id` - Product variant ID (null if no variant)
- `unit_id` - Product unit ID (null if base unit)
- `quantity` - Quantity in cart

**Product Object:**
- `designation` - Product name (default language)
- `designation_ar` - Product name in Arabic
- `designation_en` - Product name in English
- `designation_zh` - Product name in Chinese
- `image_url` - Product or variant image URL
- `has_variants` - Whether product has variants
- `base_unit` - Base unit of measurement

**Variant Object** (null if no variant selected):
- `id` - Variant ID
- `name` - Variant name (e.g., "Red - Large")
- `type` - Variant type (e.g., "color-size")
- `image_url` - Variant-specific image

**Unit Object** (null if base unit):
- `id` - Unit ID
- `name` - Unit name (e.g., "Box", "Carton")
- `conversion_factor` - Conversion factor from base unit

**Pricing Object:**
- `base_price` - Base product price
- `effective_price` - Actual price (variant or unit price if applicable)
- `promo_percentage` - Promotional discount percentage
- `price_after_promo` - Price after promotional discount
- `remise_client` - Client-specific discount
- `remise_artisan` - Artisan-specific discount
- `has_promo` - Whether product has active promotion
- `subtotal` - Total price for this item (quantity × price_after_promo)

**Stock Object:**
- `available` - Available stock quantity
- `is_available` - Whether requested quantity is available
- `max_quantity` - Maximum quantity that can be ordered

**Summary Object:**
- `total_items` - Total quantity of all items
- `unique_items` - Number of unique products in cart
- `subtotal` - Total price of all items
- `all_items_available` - Whether all items have sufficient stock
- `unavailable_count` - Number of items with insufficient stock

#### Error Responses

**401 Unauthorized**
```json
{
  "message": "Authentification requise"
}
```

---

### 2. Get Cart Summary
**GET** `/api/ecommerce/cart/summary`

Retrieves a lightweight summary of the cart (item counts only). Useful for displaying cart badge without loading full cart details.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### Request
No parameters required.

#### Response
**Status:** `200 OK`

```json
{
  "unique_items": 3,
  "total_items": 7
}
```

#### Response Fields
- `unique_items` - Number of unique products in cart
- `total_items` - Total quantity of all items

#### Error Responses

**401 Unauthorized**
```json
{
  "message": "Authentification requise"
}
```

---

### 3. Add Item to Cart
**POST** `/api/ecommerce/cart/items`

Adds a new item to the cart or updates quantity if the same item (product + variant + unit combination) already exists.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### Request Body
```json
{
  "product_id": 123,
  "variant_id": 45,
  "unit_id": 2,
  "quantity": 3
}
```

#### Request Fields
- `product_id` - **Required.** Product ID to add
- `variant_id` - **Optional.** Variant ID (null for base product)
- `unit_id` - **Optional.** Unit ID (null for base unit)
- `quantity` - **Optional.** Quantity to add (default: 1, minimum: 1)

#### Response (New Item Added)
**Status:** `201 Created`

```json
{
  "message": "Article ajouté au panier",
  "cart_item_id": 456,
  "quantity": 3,
  "action": "added"
}
```

#### Response (Existing Item Updated)
**Status:** `200 OK`

```json
{
  "message": "Quantité mise à jour",
  "cart_item_id": 456,
  "quantity": 6,
  "action": "updated"
}
```

#### Response Fields
- `message` - Success message
- `cart_item_id` - Cart item ID
- `quantity` - Final quantity in cart
- `action` - "added" or "updated"

#### Error Responses

**400 Bad Request - Missing product_id**
```json
{
  "message": "product_id est requis"
}
```

**400 Bad Request - Product not available**
```json
{
  "message": "Ce produit n'est pas disponible"
}
```

**400 Bad Request - Invalid variant**
```json
{
  "message": "Variante invalide"
}
```

**400 Bad Request - Invalid unit**
```json
{
  "message": "Unité invalide"
}
```

**400 Bad Request - Insufficient stock**
```json
{
  "message": "Quantité non disponible en stock",
  "available_stock": 10,
  "requested_quantity": 15
}
```

**401 Unauthorized**
```json
{
  "message": "Authentification requise"
}
```

**404 Not Found**
```json
{
  "message": "Produit introuvable"
}
```

---

### 4. Update Cart Item Quantity
**PUT** `/api/ecommerce/cart/items/:id`

Updates the quantity of an existing cart item.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### URL Parameters
- `id` - Cart item ID

#### Request Body
```json
{
  "quantity": 5
}
```

#### Request Fields
- `quantity` - **Required.** New quantity (minimum: 1)

#### Response
**Status:** `200 OK`

```json
{
  "message": "Quantité mise à jour",
  "cart_item_id": 456,
  "old_quantity": 3,
  "new_quantity": 5
}
```

#### Response Fields
- `message` - Success message
- `cart_item_id` - Cart item ID
- `old_quantity` - Previous quantity
- `new_quantity` - Updated quantity

#### Error Responses

**400 Bad Request - Invalid quantity**
```json
{
  "message": "Quantité invalide"
}
```

**400 Bad Request - Insufficient stock**
```json
{
  "message": "Quantité non disponible en stock",
  "available_stock": 10,
  "requested_quantity": 15
}
```

**401 Unauthorized**
```json
{
  "message": "Authentification requise"
}
```

**404 Not Found**
```json
{
  "message": "Article non trouvé dans le panier"
}
```

---

### 5. Remove Item from Cart
**DELETE** `/api/ecommerce/cart/items/:id`

Removes a specific item from the cart.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### URL Parameters
- `id` - Cart item ID to remove

#### Request
No body required.

#### Response
**Status:** `200 OK`

```json
{
  "message": "Article retiré du panier",
  "cart_item_id": 456
}
```

#### Response Fields
- `message` - Success message
- `cart_item_id` - ID of removed item

#### Error Responses

**401 Unauthorized**
```json
{
  "message": "Authentification requise"
}
```

**404 Not Found**
```json
{
  "message": "Article non trouvé dans le panier"
}
```

---

### 6. Clear Cart
**DELETE** `/api/ecommerce/cart`

Removes all items from the user's cart.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### Request
No parameters required.

#### Response
**Status:** `200 OK`

```json
{
  "message": "Panier vidé",
  "items_removed": 3
}
```

#### Response Fields
- `message` - Success message
- `items_removed` - Number of items removed

#### Error Responses

**401 Unauthorized**
```json
{
  "message": "Authentification requise"
}
```

---

### 7. Validate Cart
**POST** `/api/ecommerce/cart/validate`

Validates the cart before checkout, checking product availability and stock levels. This should be called before proceeding to checkout.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### Request
No body required.

#### Response (Valid Cart)
**Status:** `200 OK`

```json
{
  "valid": true,
  "total_items": 3,
  "issues": [],
  "message": "Panier valide"
}
```

#### Response (Invalid Cart)
**Status:** `200 OK`

```json
{
  "valid": false,
  "total_items": 3,
  "issues": [
    {
      "cart_item_id": 456,
      "product_id": 123,
      "variant_id": 45,
      "issue": "insufficient_stock",
      "message": "Product Name (Red - Large): seulement 5 disponible(s)",
      "requested_quantity": 10,
      "available_stock": 5
    },
    {
      "cart_item_id": 789,
      "product_id": 456,
      "issue": "product_unavailable",
      "message": "Another Product n'est plus disponible"
    }
  ],
  "message": "2 problème(s) détecté(s)"
}
```

#### Response Fields
- `valid` - Whether cart is valid for checkout
- `total_items` - Number of items in cart
- `issues` - Array of validation issues (empty if valid)
- `message` - Summary message

**Issue Object:**
- `cart_item_id` - Cart item ID with issue
- `product_id` - Product ID
- `variant_id` - Variant ID (if applicable)
- `issue` - Issue type: "insufficient_stock" or "product_unavailable"
- `message` - Human-readable description
- `requested_quantity` - Requested quantity (for stock issues)
- `available_stock` - Available quantity (for stock issues)

#### Error Responses

**400 Bad Request - Empty cart**
```json
{
  "valid": false,
  "message": "Panier vide"
}
```

**401 Unauthorized**
```json
{
  "message": "Authentification requise"
}
```

---

## Business Rules

### Stock Validation
- Stock is checked based on variant if variant is selected
- Otherwise, stock is checked from `stock_partage_ecom_qty` (shared e-commerce stock)
- Stock validation occurs on:
  - Adding items to cart
  - Updating item quantities
  - Cart validation before checkout

### Product Availability
- Products must have `ecom_published = 1` to be added/kept in cart
- Products with `is_deleted = 1` are filtered out
- Unpublished or deleted products appear as issues in cart validation

### Pricing Logic
1. **Base Price:** Product's base `prix_vente`
2. **Variant Price:** If variant selected and has price, use variant's `prix_vente`
3. **Unit Price:** If unit selected and has custom price, use unit's `prix_vente`
4. **Promotional Discount:** Apply `pourcentage_promo` if set
5. **Client Discounts:** `remise_client` and `remise_artisan` are provided but not automatically applied to price

### Cart Item Uniqueness
A cart item is uniquely identified by the combination of:
- `user_id`
- `product_id`
- `variant_id` (can be null)
- `unit_id` (can be null)

If adding an item with the same combination, the quantity is incremented rather than creating a duplicate entry.

---

## Data Models

### Cart Item
```sql
CREATE TABLE cart_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT NULL,
  unit_id INT NULL,
  quantity INT NOT NULL,
  created_at DATETIME,
  updated_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (variant_id) REFERENCES product_variants(id),
  FOREIGN KEY (unit_id) REFERENCES product_units(id)
);
```

---

## Example Usage Flow

### 1. Add Product to Cart
```bash
POST /api/ecommerce/cart/items
Content-Type: application/json
Authorization: Bearer <token>

{
  "product_id": 123,
  "quantity": 2
}
```

### 2. Add Product with Variant
```bash
POST /api/ecommerce/cart/items
Content-Type: application/json
Authorization: Bearer <token>

{
  "product_id": 123,
  "variant_id": 45,
  "quantity": 1
}
```

### 3. Check Cart Summary
```bash
GET /api/ecommerce/cart/summary
Authorization: Bearer <token>
```

### 4. Get Full Cart
```bash
GET /api/ecommerce/cart
Authorization: Bearer <token>
```

### 5. Update Item Quantity
```bash
PUT /api/ecommerce/cart/items/456
Content-Type: application/json
Authorization: Bearer <token>

{
  "quantity": 5
}
```

### 6. Validate Before Checkout
```bash
POST /api/ecommerce/cart/validate
Authorization: Bearer <token>
```

### 7. Remove Item
```bash
DELETE /api/ecommerce/cart/items/456
Authorization: Bearer <token>
```

### 8. Clear Cart
```bash
DELETE /api/ecommerce/cart
Authorization: Bearer <token>
```

---

## Notes

- All monetary values are returned as numbers (not strings)
- All quantities and stock values are returned as numbers
- Timestamps are in ISO 8601 format
- The API supports multi-language product names (Arabic, English, Chinese)
- Cart operations are user-specific and require authentication
- Cart validation should be performed before proceeding to checkout
- Product variants and units are optional features
- If a product has variants, clients should present variant selection UI
- Stock checks ensure cart items don't exceed available inventory
- **Wishlist Integration:** All product endpoints include `is_wishlisted` field for authenticated users. For non-authenticated users, this field is `null`. Use this to display heart icon states in the frontend.

---

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200` - Successful operation
- `201` - Resource created successfully
- `400` - Bad request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `404` - Resource not found
- `500` - Internal server error

Errors are returned in JSON format with a descriptive message:
```json
{
  "message": "Error description"
}
```

For validation errors with stock issues, additional fields may be included:
```json
{
  "message": "Quantité non disponible en stock",
  "available_stock": 10,
  "requested_quantity": 15
}
```
