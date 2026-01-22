# E-commerce Remise (Points) — Workflow & Data

This document explains how remise ("points") are calculated and applied for authenticated users, and what events/status changes exist from browsing the shop to delivery.

## 1) Concept

- Each product has two remise percentages:
  - `products.remise_client`
  - `products.remise_artisan`
- The authenticated user type comes from `contacts.type_compte`:
  - `Client` → use `products.remise_client`
  - `Artisan/Promoteur` → use `products.remise_artisan`

Remise is **earned only when the order is confirmed AND paid**, and only for **authenticated orders** (`ecommerce_orders.user_id IS NOT NULL`).

## 2) Where remise is stored

### Order-level (idempotency + summary)
In `ecommerce_orders`:
- `remise_earned_at` (timestamp)
  - `NULL` → remise not applied yet
  - non-NULL → remise already applied (idempotency marker)
- `remise_earned_amount` (decimal)
  - total remise earned for the order

### Order-item level (details / exact value applied)
In `ecommerce_order_items`:
- `remise_percent_applied` (decimal)
- `remise_amount` (decimal)

These are **0 by default** while the order is not confirmed/paid.
When remise is applied, each item gets its exact applied values.

### User-level (balance)
In `contacts`:
- `remise_balance` (decimal)

When remise is applied successfully (first time only), the API increases `contacts.remise_balance` by `ecommerce_orders.remise_earned_amount`.

## 3) When remise is applied (the rule)

Remise is applied during the admin/system status update event:

`PUT /api/ecommerce/orders/:id/status`

Condition:
- `ecommerce_orders.user_id` is not null (authenticated)
- `payment_status = 'paid'`
- `confirmed_at IS NOT NULL` (order confirmed)
- `remise_earned_at IS NULL` (not applied yet)

When the condition becomes true, the backend:
1. Computes per-item remise:
   - `remise_percent_applied = (type_compte == 'Artisan/Promoteur') ? products.remise_artisan : products.remise_client`
   - `remise_amount = round(unit_price * quantity * (remise_percent_applied / 100), 2)`
2. Sums items into `remise_earned_amount`.
3. Updates `ecommerce_orders` (`remise_earned_amount`, `remise_earned_at`).
4. Updates each `ecommerce_order_items` row with `remise_percent_applied` and `remise_amount`.
5. Credits `contacts.remise_balance` (only if total amount > 0).

Important:
- This is **idempotent**: it only applies once because of `remise_earned_at`.

## 4) Authenticated user journey (shop → delivered)

### Step A — Browse products
- List products:
  - `GET /api/ecommerce/products`
- View one product:
  - `GET /api/ecommerce/products/:id`

These responses include `remise_client` and `remise_artisan` so the frontend can show potential points.

### Step B — Cart
Typical flow:
- Add items to cart, change qty, etc. (cart routes not listed here).

### Step C — Checkout (create order)
- Create order:
  - `POST /api/ecommerce/orders`

Data stored on checkout is limited to:
- Customer basic info (name/email/phone)
- Shipping address
- Totals + status/payment_status + `payment_method` (example: `cash_on_delivery`, `card`, `bank_transfer`)

Security note:
- This API must never receive or store raw card data (PAN/CVV/expiration). The backend rejects common card fields if they are present.

If the user is authenticated, the created order has `user_id` filled.
If guest, `user_id` is `NULL` (no remise will ever be applied).

Order starts as:
- `status = 'pending'`
- `payment_status = 'pending'`

### Step D — Admin/system order events
The admin/backoffice updates status and payment via:
- `PUT /api/ecommerce/orders/:id/status`

Supported status timeline (typical):
- `pending` → `confirmed` → `shipped` → `delivered`

Payment timeline (typical):
- `pending` → `paid`

Remise application happens as soon as **both** are true:
- status has been set to `confirmed` (sets `confirmed_at`)
- payment_status is set to `paid`

### Step E — Customer views their orders
- List my orders (authenticated):
  - `GET /api/ecommerce/orders`
- Get one order:
  - `GET /api/ecommerce/orders/:id`

Order responses include:
- `remise_applied` (boolean)
- `remise_earned_amount`

Order item responses include:
- `remise_percent_applied`
- `remise_amount`

### Step F — Cancellation event
- Customer cancels (if allowed):
  - `POST /api/ecommerce/orders/:id/cancel`

Note:
- Current implementation restores stock and cancels the order.
- It does **not** automatically reverse remise balance if the order was already confirmed+paid and remise was applied. If you want that behavior, we can add a reversal rule (and decide when it should trigger).

## 5) Notes / guarantees

- Only the **needed** product columns are ensured: `products.remise_client` and `products.remise_artisan`.
- Per-item remise is a **snapshot** of the applied amounts; it becomes non-zero only when the order is confirmed+paid.
- Because schema is auto-ensured at boot, ecommerce endpoints can safely SELECT these columns.
