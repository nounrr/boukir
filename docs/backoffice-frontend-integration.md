# Backoffice + Frontend Integration — Orders, Remise, Solde Ledger

This document consolidates **orders**, **remise (loyalty)**, and **contact solde ledger** workflows for frontend and backoffice integration. It complements the existing docs:
- [docs/ecommerce-orders-api-documentation.md](docs/ecommerce-orders-api-documentation.md)
- [docs/ecommerce-remise-workflow.md](docs/ecommerce-remise-workflow.md)
- [docs/ecommerce-checkout-payments-solde-pickup.md](docs/ecommerce-checkout-payments-solde-pickup.md)
- [docs/ecommerce-delivery-method.md](docs/ecommerce-delivery-method.md)
- [docs/ecommerce-solde-order-fields.md](docs/ecommerce-solde-order-fields.md)

---

## 1) Key Concepts (Quick Summary)

### Orders
- Created via `POST /api/ecommerce/orders`
- Start with `status = pending` and `payment_status = pending`
- Stock is **reduced on creation**
- Cancelled orders restore stock

### Remise (Loyalty)
- Earned **only when** the order is **confirmed** and **paid**
- Earned value comes from product fields:
  - `products.remise_client`
  - `products.remise_artisan`
- Stored in:
  - `ecommerce_orders.remise_earned_amount`
  - `ecommerce_order_items.remise_amount`
  - `contacts.remise_balance`

### Solde (Buy Now Pay Later)
- Only allowed for authenticated users with `contacts.is_solde = 1`
- Orders using `payment_method = solde` create **debt** in `contact_solde_ledger` **only after confirmation**
- Ledger entries track `debit` and `credit`

Also for legacy/backoffice reporting, solde orders store:
- `ecommerce_orders.is_solde` (0/1)
- `ecommerce_orders.solde_amount` (remaining amount after remise)

These fields are computed server-side; frontend should just read them from the API responses.

---

## 2) Frontend Checkout Flow (E-commerce)

### Step A — Product listing
- Frontend can show remise hints using:
  - `remise_client`
  - `remise_artisan`

### Step B — Cart (optional)
- The checkout can use cart or direct items

### Step C — Create order
`POST /api/ecommerce/orders`

Required:
- `customer_name`, `customer_email`, `shipping_address_line1`, `shipping_city`

Optional:
- `delivery_method = delivery | pickup`
- `pickup_location_id` (only for pickup)
- `payment_method = cash_on_delivery | card | solde | pay_in_store`

Rules:
- `pickup + cash_on_delivery` is **not allowed**
- `payment_method = solde` requires authenticated user with `is_solde = 1` (only when there is remaining amount to pay after remise)

Order result (important fields):
- `status: pending`
- `payment_status: pending`
- `delivery_method`
- `pickup_location_id`
- If `payment_method=solde`: `is_solde`, `solde_amount`

---

## 3) Backoffice Workflow (Admin Actions)

### Step 1 — Order Review
- Backoffice reads orders via:
  - `GET /api/ecommerce/orders`
  - `GET /api/ecommerce/orders/:id`

### Step 2 — Confirm order
`PUT /api/ecommerce/orders/:id/status`

Payload:
- `status = confirmed`

Effects:
- Sets `confirmed_at`
- Adds status history record
- For **solde** orders, **creates debt entry** in `contact_solde_ledger`

### Step 3 — Mark order as paid
`PUT /api/ecommerce/orders/:id/status`

Payload:
- `payment_status = paid`

Effects:
- If already confirmed:
  - Remise is computed
  - Remise is added to `contacts.remise_balance`
  - `remise_earned_amount` is stored in order

### Step 4 — Ship / Deliver
Optional transitions:
- `status = shipped`
- `status = delivered`

### Step 5 — Cancel
`POST /api/ecommerce/orders/:id/cancel`

Rules:
- Cannot cancel if `shipped`, `delivered`, `cancelled`
- Restores stock
- If remise was used on the order, it is returned to balance
- If solde debt exists, cancellation inserts credit to reverse remaining debt

---

## 4) Remise Workflow (Loyalty)

### Conditions to earn remise
Remise is applied only when:
- Order has `confirmed_at`
- `payment_status = paid`
- `user_id IS NOT NULL`
- `remise_earned_at IS NULL`

### Calculation
For each item:
- Client: uses `products.remise_client`
- Artisan: uses `products.remise_artisan`

Example:
- Product remise_client = 50 DH
- Qty = 2
- Earned remise = 100 DH

### Where it is stored
- `ecommerce_order_items.remise_amount`
- `ecommerce_orders.remise_earned_amount`
- `contacts.remise_balance`

---

## 5) Solde Ledger Workflow (Debt)

### When a solde debt is created
- Only after **admin confirmation** of a `payment_method = solde` order
- At confirmation, backend inserts a **debit** in `contact_solde_ledger`

### Ledger fields (important)
- `contact_id`
- `order_id`
- `entry_type` = `debit` or `credit`
- `amount`
- `description`
- `created_at`

### When debt is reduced
- If backoffice records a payment, a **credit** entry is added
- If order is cancelled after confirmation, a reversing credit is added

---

## 6) Integration Checklist (Frontend + Backoffice)

### Frontend (Checkout)
- [ ] Provide delivery selector (`delivery` vs `pickup`)
- [ ] If pickup, hide shipping fields and set `pickup_location_id`
- [ ] Block pickup + COD
- [ ] If solde, ensure user is authenticated

### Backoffice
- [ ] Confirm order before marking paid
- [ ] If payment is received, set `payment_status = paid`
- [ ] For solde orders, confirm triggers ledger debt
- [ ] For loyalty, confirm+paid triggers remise

---

## 7) API Endpoints Summary

### Orders
- `POST /api/ecommerce/orders` — Create
- `GET /api/ecommerce/orders` — List
- `GET /api/ecommerce/orders/:id` — Details
- `PUT /api/ecommerce/orders/:id/status` — Admin update
- `POST /api/ecommerce/orders/:id/cancel` — Cancel

### Pickup locations
- `GET /api/ecommerce/pickup-locations` (public)

---

## 8) Important Notes

- Remise is **not earned** for guest orders.
- Solde is only for authenticated users with `is_solde = 1`.
- Remise earned depends on product configuration (`remise_client > 0`).
- Confirming an order is a backoffice decision; it controls ledger + remise.

---

## 9) Related Docs

- [docs/ecommerce-checkout-payments-solde-pickup.md](docs/ecommerce-checkout-payments-solde-pickup.md)
- [docs/ecommerce-orders-api-documentation.md](docs/ecommerce-orders-api-documentation.md)
- [docs/ecommerce-remise-workflow.md](docs/ecommerce-remise-workflow.md)
- [docs/ecommerce-remise-balance-payments.md](docs/ecommerce-remise-balance-payments.md)
- [docs/ecommerce-delivery-method.md](docs/ecommerce-delivery-method.md)
- [docs/ecommerce-solde-workflow-1.md](docs/ecommerce-solde-workflow-1.md)
