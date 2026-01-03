# E-commerce Wishlist API Documentation

## Overview
This API manages wishlist operations for e-commerce users, allowing them to save products for later, check product availability, and move items to cart.

**Base Path:** `/api/ecommerce/wishlist`

**Authentication:** All endpoints require user authentication via JWT token.

---

## Endpoints

### 1. Get User Wishlist
**GET** `/api/ecommerce/wishlist`

Retrieves the current user's complete wishlist with all items, including product details, pricing, and stock availability.

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
      "product": {
        "designation": "Product Name",
        "designation_ar": "اسم المنتج",
        "designation_en": "Product Name",
        "designation_zh": "产品名称",
        "image_url": "https://example.com/image.jpg",
        "has_variants": true,
        "base_unit": "piece",
        "is_available": true
      },
      "variant": {
        "id": 45,
        "name": "Red - Large",
        "type": "color-size",
        "image_url": "https://example.com/variant-image.jpg"
      },
      "pricing": {
        "base_price": 100.00,
        "effective_price": 100.00,
        "promo_percentage": 10,
        "price_after_promo": 90.00,
        "remise_client": 5.00,
        "remise_artisan": 3.00,
        "has_promo": true
      },
      "stock": {
        "available": 50,
        "in_stock": true
      },
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "summary": {
    "total_items": 5,
    "available_items": 4,
    "in_stock_items": 3,
    "unavailable_items": 1
  }
}
```

#### Response Fields

**Item Fields:**
- `id` - Wishlist item ID
- `product_id` - Product ID
- `variant_id` - Product variant ID (null if no variant)

**Product Object:**
- `designation` - Product name (default language)
- `designation_ar` - Product name in Arabic
- `designation_en` - Product name in English
- `designation_zh` - Product name in Chinese
- `image_url` - Product or variant image URL
- `has_variants` - Whether product has variants
- `base_unit` - Base unit of measurement
- `is_available` - Whether product is published and not deleted

**Variant Object** (null if no variant selected):
- `id` - Variant ID
- `name` - Variant name (e.g., "Red - Large")
- `type` - Variant type (e.g., "color-size")
- `image_url` - Variant-specific image

**Pricing Object:**
- `base_price` - Base product price
- `effective_price` - Actual price (variant price if applicable)
- `promo_percentage` - Promotional discount percentage
- `price_after_promo` - Price after promotional discount
- `remise_client` - Client-specific discount
- `remise_artisan` - Artisan-specific discount
- `has_promo` - Whether product has active promotion

**Stock Object:**
- `available` - Available stock quantity
- `in_stock` - Whether item is currently in stock (quantity > 0)

**Summary Object:**
- `total_items` - Total number of items in wishlist
- `available_items` - Number of items that are still published/available
- `in_stock_items` - Number of items currently in stock
- `unavailable_items` - Number of items that are no longer available

#### Error Responses

**401 Unauthorized**
```json
{
  "message": "Authentification requise"
}
```

---

### 2. Add Item to Wishlist
**POST** `/api/ecommerce/wishlist/items`

Adds a product (with optional variant) to the user's wishlist.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### Request Body
```json
{
  "product_id": 123,
  "variant_id": 45
}
```

#### Request Fields
- `product_id` - **Required.** Product ID to add
- `variant_id` - **Optional.** Variant ID (null for base product)

#### Response (Success)
**Status:** `201 Created`

```json
{
  "message": "Article ajouté à la liste de souhaits",
  "wishlist_item_id": 456
}
```

#### Response Fields
- `message` - Success message
- `wishlist_item_id` - Created wishlist item ID

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

**409 Conflict - Already in wishlist**
```json
{
  "message": "Cet article est déjà dans votre liste de souhaits",
  "wishlist_item_id": 456
}
```

---

### 3. Remove Item from Wishlist
**DELETE** `/api/ecommerce/wishlist/items/:id`

Removes a specific item from the wishlist by wishlist item ID.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### URL Parameters
- `id` - Wishlist item ID to remove

#### Request
No body required.

#### Response
**Status:** `200 OK`

```json
{
  "message": "Article retiré de la liste de souhaits",
  "wishlist_item_id": 456
}
```

#### Response Fields
- `message` - Success message
- `wishlist_item_id` - ID of removed item

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
  "message": "Article non trouvé dans la liste de souhaits"
}
```

---

### 4. Remove Item by Product
**DELETE** `/api/ecommerce/wishlist/products/:productId`

Removes a wishlist item by product ID (and optional variant ID). Useful when you know the product/variant but not the wishlist item ID.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### URL Parameters
- `productId` - Product ID to remove

#### Query Parameters
- `variant_id` - **Optional.** Variant ID to remove (if product has variants)

#### Request
No body required.

#### Response
**Status:** `200 OK`

```json
{
  "message": "Article retiré de la liste de souhaits",
  "product_id": 123,
  "variant_id": 45
}
```

#### Response Fields
- `message` - Success message
- `product_id` - Product ID removed
- `variant_id` - Variant ID removed (null if no variant)

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
  "message": "Article non trouvé dans la liste de souhaits"
}
```

#### Example Usage
```bash
# Remove base product from wishlist
DELETE /api/ecommerce/wishlist/products/123
Authorization: Bearer <token>

# Remove specific variant from wishlist
DELETE /api/ecommerce/wishlist/products/123?variant_id=45
Authorization: Bearer <token>
```

---

### 5. Clear Wishlist
**DELETE** `/api/ecommerce/wishlist`

Removes all items from the user's wishlist.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### Request
No parameters required.

#### Response
**Status:** `200 OK`

```json
{
  "message": "Liste de souhaits vidée",
  "items_removed": 5
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

### 6. Check if Product in Wishlist
**GET** `/api/ecommerce/wishlist/check/:productId`

Checks if a specific product (with optional variant) is in the user's wishlist. Useful for displaying wishlist heart icon state.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### URL Parameters
- `productId` - Product ID to check

#### Query Parameters
- `variant_id` - **Optional.** Variant ID to check (if product has variants)

#### Request
No body required.

#### Response
**Status:** `200 OK`

```json
{
  "in_wishlist": true,
  "wishlist_item_id": 456
}
```

#### Response Fields
- `in_wishlist` - Boolean indicating if item is in wishlist
- `wishlist_item_id` - Wishlist item ID if in wishlist, null otherwise

#### Error Responses

**401 Unauthorized**
```json
{
  "message": "Authentification requise"
}
```

#### Example Usage
```bash
# Check base product
GET /api/ecommerce/wishlist/check/123
Authorization: Bearer <token>

# Check specific variant
GET /api/ecommerce/wishlist/check/123?variant_id=45
Authorization: Bearer <token>
```

---

### 7. Move Item to Cart
**POST** `/api/ecommerce/wishlist/items/:id/move-to-cart`

Moves a wishlist item to the shopping cart and removes it from the wishlist. Optionally specify quantity and unit.

#### Authentication
- **Required:** Yes
- **Type:** JWT Bearer Token

#### URL Parameters
- `id` - Wishlist item ID to move

#### Request Body
```json
{
  "quantity": 2,
  "unit_id": 3
}
```

#### Request Fields
- `quantity` - **Optional.** Quantity to add to cart (default: 1, minimum: 1)
- `unit_id` - **Optional.** Unit ID for the cart item (null for base unit)

#### Response (New Cart Item)
**Status:** `201 Created`

```json
{
  "message": "Article ajouté au panier et retiré de la liste de souhaits",
  "cart_item_id": 789,
  "quantity": 2,
  "action": "added"
}
```

#### Response (Existing Cart Item Updated)
**Status:** `200 OK`

```json
{
  "message": "Article ajouté au panier et retiré de la liste de souhaits",
  "cart_item_id": 789,
  "quantity": 5,
  "action": "updated"
}
```

#### Response Fields
- `message` - Success message
- `cart_item_id` - Cart item ID (new or existing)
- `quantity` - Final quantity in cart
- `action` - "added" or "updated"

#### Error Responses

**400 Bad Request - Product not available**
```json
{
  "message": "Ce produit n'est plus disponible"
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

**400 Bad Request - Total quantity exceeds stock**
```json
{
  "message": "Quantité totale non disponible en stock",
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
  "message": "Article non trouvé dans la liste de souhaits"
}
```

---

## Business Rules

### Product Availability
- Products must have `ecom_published = 1` to be added to wishlist
- Products with `is_deleted = 1` cannot be added to wishlist
- Existing wishlist items show availability status in GET requests
- Unavailable products can remain in wishlist but cannot be moved to cart

### Wishlist Item Uniqueness
A wishlist item is uniquely identified by the combination of:
- `user_id`
- `product_id`
- `variant_id` (can be null)

Attempting to add a duplicate combination returns a 409 Conflict error.

### Stock Checking
- Stock availability is shown for wishlist items
- Stock validation occurs when moving items to cart
- Items can be in wishlist even when out of stock
- Moving to cart checks stock at time of operation

### Moving to Cart
- Successfully moving an item to cart removes it from wishlist
- If item already exists in cart, quantities are combined
- Stock validation ensures total cart quantity doesn't exceed availability
- Operation is atomic - both cart addition and wishlist removal succeed or fail together

---

## Data Models

### Wishlist Item
```sql
CREATE TABLE wishlist_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT NULL,
  created_at DATETIME,
  UNIQUE KEY unique_wishlist_item (user_id, product_id, variant_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (variant_id) REFERENCES product_variants(id)
);
```

**Key Features:**
- Simple structure with just user, product, and variant references
- No quantity field (unlike cart) - wishlists just track interest
- Unique constraint prevents duplicates
- Timestamps track when items were added

---

## Example Usage Flow

### 1. Add Product to Wishlist
```bash
POST /api/ecommerce/wishlist/items
Content-Type: application/json
Authorization: Bearer <token>

{
  "product_id": 123
}
```

### 2. Add Product with Variant to Wishlist
```bash
POST /api/ecommerce/wishlist/items
Content-Type: application/json
Authorization: Bearer <token>

{
  "product_id": 123,
  "variant_id": 45
}
```

### 3. Check if Product in Wishlist
```bash
GET /api/ecommerce/wishlist/check/123?variant_id=45
Authorization: Bearer <token>
```

### 4. Get Full Wishlist
```bash
GET /api/ecommerce/wishlist
Authorization: Bearer <token>
```

### 5. Move Item to Cart
```bash
POST /api/ecommerce/wishlist/items/456/move-to-cart
Content-Type: application/json
Authorization: Bearer <token>

{
  "quantity": 2
}
```

### 6. Remove Item from Wishlist (by ID)
```bash
DELETE /api/ecommerce/wishlist/items/456
Authorization: Bearer <token>
```

### 7. Remove Item from Wishlist (by Product)
```bash
DELETE /api/ecommerce/wishlist/products/123?variant_id=45
Authorization: Bearer <token>
```

### 8. Clear Wishlist
```bash
DELETE /api/ecommerce/wishlist
Authorization: Bearer <token>
```

---

## Integration with Cart

The wishlist system integrates seamlessly with the cart:

1. **Add to Cart from Wishlist:** Use the move-to-cart endpoint
2. **Keep in Wishlist:** Manually add to cart via cart API while keeping wishlist item
3. **Stock Sync:** Both systems check the same stock columns
4. **Product Variants:** Both support the same variant system
5. **Authentication:** Same JWT token works for both systems

### Integration with Product Endpoints

All product endpoints automatically include wishlist status:

**For authenticated users:**
- Products include `is_wishlisted: true/false` field
- Use this to display filled/empty heart icons
- Works on: product listing, single product, featured products, new arrivals, similar products

**For non-authenticated users:**
- `is_wishlisted` field is `null`
- Display heart icon but prompt login on click

**Example Response:**
```json
{
  "id": 123,
  "designation": "Product Name",
  "prix_vente": 100.00,
  "is_wishlisted": true,
  ...
}
```

---

## UI/UX Recommendations

### Wishlist Heart Icon
```javascript
// Check if product is in wishlist
const response = await fetch(`/api/ecommerce/wishlist/check/${productId}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { in_wishlist } = await response.json();
// Show filled heart if in_wishlist === true
```

### Toggle Wishlist
```javascript
// Add or remove based on current state
if (in_wishlist) {
  await fetch(`/api/ecommerce/wishlist/products/${productId}?variant_id=${variantId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
} else {
  await fetch('/api/ecommerce/wishlist/items', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ product_id: productId, variant_id: variantId })
  });
}
```

### Display Availability Status
```javascript
// Show badge for unavailable items
items.forEach(item => {
  if (!item.product.is_available) {
    showBadge('No longer available');
  } else if (!item.stock.in_stock) {
    showBadge('Out of stock');
  }
});
```

---

## Notes

- All monetary values are returned as numbers (not strings)
- All quantities and stock values are returned as numbers
- Timestamps are in ISO 8601 format
- The API supports multi-language product names (Arabic, English, Chinese)
- Wishlist operations are user-specific and require authentication
- Wishlist items persist across sessions
- No quantity limits on wishlist (unlike cart stock validation)
- Items can remain in wishlist even when product is unavailable/out of stock
- Use the check endpoint frequently to maintain accurate heart icon states

---

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200` - Successful operation
- `201` - Resource created successfully
- `400` - Bad request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `404` - Resource not found
- `409` - Conflict (duplicate item)
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

---

## Comparison: Wishlist vs Cart

| Feature | Wishlist | Cart |
|---------|----------|------|
| Purpose | Save for later | Ready to purchase |
| Quantity | Not stored (implicit 1) | User-specified quantity |
| Stock Validation | Info only, not blocking | Blocking - can't exceed stock |
| Units | Not supported | Full unit support |
| Persistence | Long-term | Session-based (typically) |
| Availability Check | Shown but not blocking | Must be available to add |
| Duplicate Items | Prevented (409 error) | Quantity incremented |
| Move Between | Can move to cart | N/A |
