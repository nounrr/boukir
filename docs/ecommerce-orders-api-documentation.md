# E-commerce Orders API Documentation

This document describes the Orders flow and all related endpoints implemented in the backend.

- Base Path: `/api/ecommerce/orders`
- Formats: JSON request/response
- Auth: Bearer token for authenticated users. Guests can operate where noted (using `customer_email`).

## Overview

- Checkout supports two modes:
  - From cart (authenticated users): `use_cart=true`
  - Direct items (guest or user): provide `items[]`
- Order creation snapshots prices and promo at checkout time into `ecommerce_order_items`.
- Stock is decremented on order creation and restored if the order is cancelled.
- Status changes are recorded in `ecommerce_order_status_history`.

Statuses used:
- `status`: `pending` → `confirmed` → `shipped` → `delivered` (or `cancelled`)
- `payment_status`: typically `pending` → `paid` (extendable: `failed`, `refunded`)

## Data Model (summary)

- `ecommerce_orders` (one per order)
  - identity: `id`, `order_number`
  - customer: `user_id?` (NULL for guest), `customer_name`, `customer_email`, `customer_phone`
  - shipping: `shipping_address_line1/line2`, `shipping_city`, `shipping_state`, `shipping_postal_code`, `shipping_country`
  - totals: `subtotal`, `tax_amount`, `shipping_cost`, `discount_amount`, `total_amount`
  - status: `status`, `payment_status`, `payment_method`, `customer_notes`, `admin_notes`
  - timestamps: `created_at`, `updated_at`, `confirmed_at`, `shipped_at`, `delivered_at`, `cancelled_at`

- `ecommerce_order_items` (many per order)
  - identity: `id`, `order_id`
  - product snapshot: `product_id`, `variant_id?`, `unit_id?`, `product_name`, `product_name_ar`, `variant_name`, `variant_type`, `unit_name`
  - price snapshot: `unit_price`, `quantity`, `subtotal`, `discount_percentage`, `discount_amount`

- `ecommerce_order_status_history` (audit log)
  - `order_id`, `old_status`, `new_status`, `changed_by_type` (`customer`|`admin`), `notes`, `created_at`

## Endpoint: Create Order (Checkout)

POST `/api/ecommerce/orders`

Creates an order either from the user’s cart or from an explicit list of items.

Request body:
- Required customer fields:
  - `customer_name` (string)
  - `customer_email` (string)
  - `customer_phone` (string, optional but recommended)
- Required shipping fields:
  - `shipping_address_line1`, `shipping_city`
  - Optional: `shipping_address_line2`, `shipping_state`, `shipping_postal_code`, `shipping_country` (default `Morocco`)
- Order details:
  - `payment_method`: `cash_on_delivery` | `card` | `bank_transfer` (default `cash_on_delivery`)
  - `customer_notes` (string, optional)
- Item source:
  - `use_cart` (bool, default `true`). If `true`, uses authenticated user’s cart items.
  - If `use_cart=false`, provide `items: [{ product_id, variant_id?, unit_id?, quantity }]`.

Business rules:
- Product must be e-commerce published and not deleted.
- Effective unit price = product base price, overridden by variant price or unit price if provided.
- Promo (`pourcentage_promo`) is applied to compute `unit_price` snapshot.
- Stock check:
  - If `variant_id` present → `product_variants.stock_quantity`
  - Else → `products.stock_partage_ecom_qty`
- On success:
  - Inserts into `ecommerce_orders` and `ecommerce_order_items`.
  - Decrements stock (variant or product shared stock).
  - Adds initial history record: `(NULL → 'pending', changed_by_type='customer')`.
  - If from cart, clears that user’s cart.

Response 201:
  

Common errors:
- 400 `Panier vide` (using cart with no items)
- 400 `Aucun article fourni` (when `use_cart=false` but no items passed)
- 400 `Produit introuvable: <id>`
- 400 `Produit non disponible: <designation>` (not published or deleted)
- 400 `Stock insuffisant` with `available` and `requested`

Examples:
- Authenticated (cart):
```bash
curl -X POST http://localhost:3000/api/ecommerce/orders \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{
    "customer_name":"John Doe",
    "customer_email":"john@example.com",
    "customer_phone":"+212600000000",
    "shipping_address_line1":"123 Rue",
    "shipping_city":"Casablanca",
    "payment_method":"cash_on_delivery",
    "use_cart": true
  }'
```
- Guest (direct items):
```bash
curl -X POST http://localhost:3000/api/ecommerce/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name":"Guest User",
    "customer_email":"guest@example.com",
    "customer_phone":"+212600000001",
    "shipping_address_line1":"456 Avenue",
    "shipping_city":"Rabat",
    "payment_method":"card",
    "use_cart": false,
    "items": [
      {"product_id":5304, "variant_id":142, "quantity":2},
      {"product_id":5288, "quantity":1}
    ]
  }'
```

## Endpoint: List Orders (User or Guest)

GET `/api/ecommerce/orders`

- Authenticated user: returns their orders by `user_id`.
- Guest: pass `?email=<customer_email>` to list orders by email.

Response:
```json
{
  "orders": [
    {
      "id": 123,
      "order_number": "ORD-...",
      "customer_name": "John Doe",
      "customer_email": "john@example.com",
      "total_amount": 999.99,
      "status": "pending",
      "payment_status": "pending",
      "payment_method": "cash_on_delivery",
      "items_count": 2,
      "created_at": "2025-12-20T10:00:00Z",
      "confirmed_at": null,
      "shipped_at": null,
      "delivered_at": null
    }
  ],
  "total": 1
}
```

Errors:
- 401 `Authentification requise ou email nécessaire`

Examples:
```bash
# Authenticated
curl "http://localhost:3000/api/ecommerce/orders" -H "Authorization: Bearer <token>"
# Guest by email
curl "http://localhost:3000/api/ecommerce/orders?email=guest@example.com"
```

## Endpoint: Get Single Order (with Items & History)

GET `/api/ecommerce/orders/:id`

Ownership checks:
- If authenticated: `order.user_id` must match `req.user.id`.
- If guest: must provide `?email=<customer_email>` matching the order.

Response:
```json
{
  "order": {
    "id": 123,
    "order_number": "ORD-...",
    "customer_name": "...",
    "customer_email": "...",
    "customer_phone": "...",
    "shipping_address": {"line1":"...","city":"...", "country":"Morocco"},
    "subtotal": 100.0,
    "tax_amount": 0.0,
    "shipping_cost": 0.0,
    "discount_amount": 10.0,
    "total_amount": 90.0,
    "status": "pending",
    "payment_status": "pending",
    "payment_method": "cash_on_delivery",
    "customer_notes": null,
    "admin_notes": null,
    "created_at":"...",
    "confirmed_at": null,
    "shipped_at": null,
    "delivered_at": null,
    "cancelled_at": null,
    "items": [
      {
        "id":1,
        "product_id":5304,
        "variant_id":142,
        "unit_id": null,
        "product_name":"...",
        "variant_name":"...",
        "unit_name": null,
        "unit_price": 45.0,
        "quantity": 2,
        "subtotal": 90.0,
        "discount_percentage": 10,
        "discount_amount": 10.0
      }
    ],
    "status_history": [
      {"old_status": null, "new_status":"pending", "changed_by":"customer", "notes":"Order created", "timestamp":"..."}
    ]
  }
}
```

Errors:
- 404 `Commande introuvable`
- 403 `Accès non autorisé` (ownership mismatch)
- 401 `Authentification requise` (no auth and no email)

Example:
```bash
curl "http://localhost:3000/api/ecommerce/orders/123?email=guest@example.com"
```

## Endpoint: Update Order Status (Admin/System)

PUT `/api/ecommerce/orders/:id/status`

Body:
- `status` (optional): one of `pending`, `confirmed`, `shipped`, `delivered`, `cancelled`
- `payment_status` (optional): e.g., `pending`, `paid`
- `admin_notes` (optional)

Effects:
- Updates timestamps depending on `status`:
  - `confirmed` → sets `confirmed_at=NOW()`
  - `shipped` → sets `shipped_at=NOW()`
  - `delivered` → sets `delivered_at=NOW()`
  - `cancelled` → sets `cancelled_at=NOW()`
- Writes a status history record for a `status` change (changed_by_type=`admin`).

Responses:
- 200 on success with the resulting `status` and `payment_status`.
- 400 `Aucune mise à jour fournie` (when nothing to update)
- 404 `Commande introuvable`

Example:
```bash
curl -X PUT http://localhost:3000/api/ecommerce/orders/123/status \
  -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" \
  -d '{"status":"confirmed","payment_status":"paid","admin_notes":"Paid online"}'
```

## Endpoint: Cancel Order (Customer)

POST `/api/ecommerce/orders/:id/cancel`

Body:
- For guest: `email` must match `order.customer_email`
- Optional: `reason`

Rules:
- Cannot cancel if `status` in `['shipped','delivered','cancelled']`.
- Restores stock for each order item (variant stock or product shared stock).
- Sets `status='cancelled'`, updates `cancelled_at`, and adds history (changed_by=`customer`).

Responses:
- 200 with `order_id` and `order_number`.
- 404 `Commande introuvable`
- 403 `Accès non autorisé` (ownership mismatch)
- 400 `Impossible d'annuler une commande <status>`

Example:
```bash
curl -X POST http://localhost:3000/api/ecommerce/orders/123/cancel \
  -H "Content-Type: application/json" \
  -d '{"email":"guest@example.com","reason":"Changed mind"}'
```

## Pricing & Promo Snapshot

At checkout, the effective unit price is computed from base/variant/unit price with promo applied and persisted into `ecommerce_order_items`. This ensures order totals remain stable even if catalog prices change later.

## Stock Handling

- On order creation: decrement product/variant stock by ordered quantity.
- On cancellation: increment back by the item quantity.

## Access Control

- Authenticated users: identified via `user_id`.
- Guests: identify via `customer_email` using `?email=...` on list/get or in cancel body.
- Single order access is strictly verified.

## Extensibility Notes

- Taxes/Shipping: placeholders exist; integrate rules to fill `tax_amount` and `shipping_cost`.
- Payments: extend `payment_status` handling and integrate PSP webhooks to transition `pending → paid`.
- Status rules: you may enforce allowed transitions in `PUT /:id/status` (e.g., disallow `delivered → pending`).
- Notifications: emit events/emails on status changes (`pending → confirmed`, `shipped`, etc.).