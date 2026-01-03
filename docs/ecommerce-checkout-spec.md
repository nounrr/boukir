# Ecommerce Checkout & Promo Integration Spec

This document defines the frontend integration for cart, promo codes, and checkout. It references the backend routes implemented in:
- [backend/routes/ecommerce/cart.js](backend/routes/ecommerce/cart.js)
- [backend/routes/ecommerce/promo.js](backend/routes/ecommerce/promo.js)
- [backend/routes/ecommerce/orders.js](backend/routes/ecommerce/orders.js)

## Overview
- **Auth**: Cart endpoints require an authenticated user (Bearer JWT). Checkout supports guest or authenticated.
- **Currency**: MAD.
- **Totals**: Backend calculates item promos, optional promo code discount, and totals. Tax and shipping are currently `0`.
- **Variants/Units**: Items can specify `variant_id` and/or `unit_id`.

## Cart API
- **List Cart**: GET `/api/ecommerce/cart`
  - Returns `items[]` with pricing (promo already applied per product) and `summary{subtotal,total_items}`.
- **Summary**: GET `/api/ecommerce/cart/summary`
  - Lightweight counts.
- **Add Item**: POST `/api/ecommerce/cart/items`
  - Body: `{ product_id, variant_id?, unit_id?, quantity }`.
  - Validates stock; merges quantities if item exists.
- **Update Item**: PUT `/api/ecommerce/cart/items/:id`
  - Body: `{ quantity }` (>=1). Validates stock.
- **Remove Item**: DELETE `/api/ecommerce/cart/items/:id`
- **Clear Cart**: DELETE `/api/ecommerce/cart`
- **Suggestions**: GET `/api/ecommerce/cart/suggestions?limit=4`
- **Validate Before Checkout**: POST `/api/ecommerce/cart/validate`
  - Returns `valid` and `issues[]` (e.g., `insufficient_stock`).

## Promo Code API
- **Validate Code**: POST `/api/ecommerce/promo/validate`
  - Body: `{ code, subtotal }` where `subtotal` is cart subtotal before promo code.
  - Success: `{ valid:true, code_masked, discount_type, discount_value, discount_amount }`.
  - Errors include inactive/expired, usage limit reached, and minimum order not met.
- **Security**: Endpoint is public but rate-limited and returns minimal info (masked code).

## Checkout API
- **Create Order**: POST `/api/ecommerce/orders`
  - Auth: Optional. If authenticated and `use_cart:true`, items are taken from cart. Otherwise provide `items[]`.
  - Required fields (always): `customer_name`, `customer_email`, `shipping_address_line1`, `shipping_city`.
  - Optional: `customer_phone`, `shipping_address_line2`, `shipping_state`, `shipping_postal_code`, `shipping_country` (default `Morocco`).
  - Optional order details: `payment_method` (default `cash_on_delivery`), `customer_notes`, `promo_code`.
  - Items when `use_cart:false`: `items:[{ product_id, variant_id?, unit_id?, quantity }]`.
  - Backend validations:
    - Product availability (`ecom_published` and not deleted).
    - Stock sufficiency on main product or variant.
    - Per-product promo percentage applied automatically.
    - Promo code rules (active, date window, min order, usage cap) and discount capped by `max_discount_amount`.
  - Response: `{ order:{ id, order_number, total_amount, status:'pending', payment_status:'pending', payment_method, items_count } }`.
  - Side-effects: Inserts items; reduces stock; clears cart for the user if `use_cart:true`.
- **Get My Orders**: GET `/api/ecommerce/orders`
  - Auth users: list by `user_id`. Guests can pass `?email=` to fetch their orders.
- **Get Order Details**: GET `/api/ecommerce/orders/:id`
  - Includes shipping info, totals, items, and `status_history[]`.
- **Cancel Order**: POST `/api/ecommerce/orders/:id/cancel`
  - Auth or `email` must match. Not allowed after `shipped`/`delivered`/`cancelled`.
  - Restores stock and appends status history.

## Payment Flow
- **Methods**: `cash_on_delivery` (default), `card`, `bank_transfer`.
- **Status Update**: PUT `/api/ecommerce/orders/:id/status` to set `status` (`confirmed`/`shipped`/`delivered`/`cancelled`) and `payment_status` (`paid`/`pending`). Frontend should not call this for card payments; use a secure webhook from gateway.

## Client-Side Flow
1. **Auth**: If user is logged in, send `Authorization: Bearer <token>` on cart endpoints.
2. **Cart**:
   - Add/update/remove items via cart endpoints.
   - Show prices after product promo (from cart GET response).
3. **Promo**:
   - Capture promo input; call `/promo/validate` with current cart subtotal.
   - Display computed `discount_amount`. If invalid, show returned message.
4. **Preflight**: Call `/cart/validate`. If `issues.length>0`, prompt user to adjust quantities.
5. **Checkout**:
   - Authenticated users: send `{ use_cart:true, customer fields, payment_method, promo_code? }`.
   - Guests: send `{ use_cart:false, items[], customer fields, payment_method, promo_code? }`.
6. **Order Confirmation**: Use the returned `order_number`. Frontend shows summary from the response.
7. **Order History**:
   - Auth users: GET `/orders` without query.
   - Guests: GET `/orders?email=<customer_email>` or GET `/orders/:id?email=<customer_email>`.

## Request Examples
### Validate Promo
```json
POST /api/ecommerce/promo/validate
{
  "code": "NEWYEAR25",
  "subtotal": 1434.70
}
```

### Checkout (use cart, authenticated)
```json
POST /api/ecommerce/orders
{
  "customer_name": "Test Buyer",
  "customer_email": "buyer@example.com",
  "customer_phone": "+212612345678",
  "shipping_address_line1": "123 Rue Exemple",
  "shipping_city": "Casablanca",
  "payment_method": "cash_on_delivery",
  "promo_code": "NEWYEAR25",
  "use_cart": true
}
```

### Checkout (guest, direct items)
```json
POST /api/ecommerce/orders
{
  "customer_name": "Test Buyer",
  "customer_email": "buyer@example.com",
  "shipping_address_line1": "123 Rue Exemple",
  "shipping_city": "Casablanca",
  "payment_method": "cash_on_delivery",
  "promo_code": "NEWYEAR25",
  "use_cart": false,
  "items": [
    { "product_id": 101, "quantity": 2 }
  ]
}
```

## Error Handling
- **401**: Missing auth on cart endpoints.
- **400**: Validation errors (empty cart, insufficient stock, missing required checkout fields, invalid promo).
- **403/404**: Ownership or not found.
- Error messages are provided in French for consistency with backend.

## Notes for Frontend
- **Min Order Subtotal**: Global minimum is not enforced; promo codes may specify `min_order_amount` and the backend enforces it during validation.
- **Stock**: Trust backend checks; do not compute stock client-side.
- **Totals Display**: Use cart GET response for line subtotals; use order creation response for final `total_amount` (includes promo code discount).
- **Security**: Do not call order status updates for card payments; those are handled by backend webhooks.
