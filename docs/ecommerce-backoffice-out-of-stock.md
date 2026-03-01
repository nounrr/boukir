# Ecommerce (Frontend) — Out-of-stock products are orderable

This note documents the behavior added to the e-commerce API so that **any product** can still be added to cart and ordered even when computed stock is `0`.

Key points:

- Products can be returned by the API even if stock is `0`.
- Cart and checkout do **not** fail on insufficient stock.
- Stock is never decremented below `0` (partial/capped decrement), and items can be marked `is_indisponible`.

## 1) Product listing

### Endpoint

- `GET /api/ecommerce/products`

### Default behavior

- `in_stock_only` now defaults to **false** (out-of-stock products can be returned).

### Optional strict filter

If the frontend wants the old behavior (only show in-stock products), it can call:

- `GET /api/ecommerce/products?in_stock_only=true`

### Explicit override

You can always force the behavior with the query param:

- `in_stock_only=true` → only products that have stock
- `in_stock_only=false` → include products with stock `0`

Example (staff/admin view):

- `GET /api/ecommerce/products?in_stock_only=false`

## 2) Filters metadata and “include out-of-stock”

The filters metadata (colors/units/utility types/price range) is computed consistently with the same `in_stock_only` behavior.

- If `in_stock_only=true`: metadata is restricted to what is currently in-stock.
- If `in_stock_only=false`: metadata is not restricted by stock.

## 3) Checkout flow (orders do not fail on insufficient stock)

### Endpoints

- `POST /api/ecommerce/orders/quote`
- `POST /api/ecommerce/orders`

### How the API behaves

The API treats insufficient stock as **non-blocking**.

Employee tokens are obtained via:

- `POST /api/auth/login`

### What changes

- **Quote** (`/quote`) will not return `400 Stock insuffisant`.
- **Checkout** (`POST /api/ecommerce/orders`) will not return `400 Stock insuffisant`.
- Order items that exceed available stock are saved with:
  - `ecommerce_order_items.is_indisponible = 1`

### Stock accounting rules (no negative stock)

Even in staff mode, the backend never decrements below zero:

- If snapshots are enabled (`product_snapshot` exists):
  - Stock is consumed FIFO, but **only up to what exists**.
  - Remaining quantity is effectively a “backorder/manual fulfillment” quantity.

- If snapshots are not enabled (legacy stock columns):
  - Stock decrement is capped to the available stock.

### Frontend recommendation

- For the normal shop UI: keep blocking checkout if items are not available (your current UX).
- For a staff/admin “sell anyway” UI:
  - Display a clear warning when `is_indisponible=1` exists.
  - Allow creating the order anyway (backend accepts it in staff mode).

## 4) Cart behavior (important limitation)

`/api/ecommerce/cart/*` is designed for **e-commerce customer accounts** (contacts) and requires an authenticated user id that exists in `contacts`.

Cart add/update/validate do not block on stock, so customers can add products even when stock is `0`.

- Employee tokens (`/api/auth/login`) contain `role` + `cin` and are treated as staff.
- Those employee ids are **not** contact ids, so cart endpoints may reject them as `USER_NOT_FOUND`.

### Recommendation for staff/admin ordering

Use direct items checkout instead of cart:

- `POST /api/ecommerce/orders`
  - send `use_cart=false`
  - send `items: [{ product_id, variant_id?, unit_id?, quantity }]`
  - include employee Bearer token

## 5) Summary: keep shop “normal”, add staff capabilities

- Shop (customer/public): keep current calls → only in-stock products shown, stock enforcement stays strict.
- Staff/admin view: pass employee token (role) and/or set `in_stock_only=false` → can view out-of-stock and create backorders.

---

If you want, I can also add a short section documenting a suggested UI label/wording for `is_indisponible` (FR/AR/EN), but I did not change any frontend UX in code.
