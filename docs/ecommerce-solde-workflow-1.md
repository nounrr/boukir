# E-commerce Solde (Buy Now, Pay Later) — Workflow, Rules, and Data Model

This document defines the **Solde** workflow: a customer can place orders **without paying now**, and the backoffice/admin can **review + confirm** before shipping.

Solde is designed to be **controlled and auditable**:

- Only customers explicitly approved (`contacts.is_solde = 1`) can use it.
- Every “credit purchase” creates a **ledger debit** entry.
- Every later payment creates a **ledger credit** entry.
- Admin can see and process solde orders as a separate queue.

---

## 1) Goals

- Allow approved customers to order on credit (Solde).
- Ensure the backoffice can:
  - see solde orders,
  - approve/confirm them before shipping,
  - track outstanding amounts per customer,
  - record payments later.
- Keep financial integrity (idempotent operations, transactional updates).

---

## 2) Database Architecture

### 2.1 Contacts (feature flag)

A customer is eligible if:

- `contacts.is_solde = 1`

This flag is intentionally simple:

- Registration sets it to `0`.
- Admin/backoffice toggles it to `1` for trusted customers.

### 2.2 Orders (how we represent a solde order)

A Solde order is an order whose:

- `ecommerce_orders.payment_method = 'solde'`

Other fields remain the same:

- `status`: `pending` → `confirmed` → `shipped` → `delivered` (or `cancelled`)
- `payment_status`: `pending` until the customer settles later (then `paid`)

### 2.3 Solde ledger (auditing debits/credits)

Table: `contact_solde_ledger`

- `entry_type`:
  - `debit`: the customer owes money (created when admin confirms a solde order)
  - `credit`: the customer paid back money (created when admin records a payment)

**Outstanding solde balance** for a customer:

$$\text{solde_outstanding} = \sum(debits) - \sum(credits)$$

**Key idea:** the ledger is the source of truth. Don’t “guess” solde from orders.

### 2.4 Recommended integrity improvements (high-quality)

These are recommended for production-grade integrity (even if applied later):

- Foreign keys (if your schema uses them elsewhere):
  - `contact_solde_ledger.contact_id → contacts.id`
  - `contact_solde_ledger.order_id → ecommerce_orders.id`
- Idempotency constraint to prevent double-debiting the same order:
  - Unique key on `(contact_id, order_id, entry_type)`
- Indexes:
  - `(contact_id, created_at)` to compute history quickly

---

## 3) Business Rules

### 3.1 Who can use Solde

Solde checkout is only allowed if:

- user is authenticated (`ecommerce_orders.user_id IS NOT NULL`), and
- `contacts.is_solde = 1`, and
- account is active (not blocked), and
- order total is valid (> 0)

Guests can never place solde orders.

### 3.2 When the customer owes money

A solde order becomes a real “debt” only after admin approval.

- When the customer submits checkout, the order is created, but **no debt is booked yet**.
- When the admin confirms the order (`status = confirmed`), the system books the debt:
  - Create a `contact_solde_ledger` **debit** entry for that order.

This prevents customers from creating unlimited “debt” orders that were never accepted.

### 3.3 Amount owed on solde

Base formula:

$$\text{solde_amount} = \max(0, total\_amount - remise\_used\_amount)$$

This keeps Solde compatible with the existing remise system:

- If you allow remise on solde orders, the customer’s remise reduces what they owe.
- If you want “pure solde” only (no remise), enforce `remise_used_amount = 0` for solde.

**Recommended (practical):** allow remise usage (it is real value) and debit only the remaining amount.

### 3.4 Payment status for solde orders

- New solde orders should start with:
  - `status = 'pending'`
  - `payment_status = 'pending'`

- When the customer later pays:
  - Create a `credit` ledger entry (can be partial).
  - If total credits for this order (or for the customer) cover the debt, set:
    - `payment_status = 'paid'`

### 3.5 Shipping policy

Typical policy:

- Only ship solde orders after an admin confirms:
  - `status = confirmed`

Optionally:

- allow shipment even when `payment_status = pending` (this is the essence of solde).

---

## 4) End-to-End Workflow

### Step 0 — Admin enables Solde for a customer

- Admin/backoffice sets `contacts.is_solde = 1`.

### Step 1 — Customer places a solde order (checkout)

Customer calls:

- `POST /api/ecommerce/orders`

With:

- `payment_method = "solde"`

System actions (transactional):

- Validate `contacts.is_solde = 1`.
- Create `ecommerce_orders` and `ecommerce_order_items`.
- Decrement stock.
- Set order to:
  - `status = 'pending'`
  - `payment_status = 'pending'`
- Add status history: `pending`.

Important:

- No ledger entry is created yet.

### Step 2 — Admin reviews “Solde Orders” queue

Backoffice filters orders by:

- `payment_method = 'solde'` and `status = 'pending'`

Admin reviews:

- customer identity (contact)
- shipping address
- order amount
- any risk criteria (optional future: limits)

### Step 3 — Admin confirms order (approval)

Admin calls:

- `PUT /api/ecommerce/orders/:id/status`

With:

- `status = 'confirmed'`

System actions (in a transaction):

- Update status timestamps (`confirmed_at`).
- Write history entry.
- Create **one** ledger `debit` entry:
  - `contact_id = order.user_id`
  - `order_id = order.id`
  - `amount = solde_amount`
  - `entry_type = 'debit'`
  - `description = 'Solde order confirmed'`

### Step 4 — Fulfillment

Normal process:

- `confirmed` → `shipped` → `delivered`

Solde does not change shipping lifecycle.

### Step 5 — Customer pays later (full or partial)

Admin records payment(s) as ledger credits.

Recommended pattern:

- Create one `credit` row per payment received.
- If the customer fully repays the order:
  - set `payment_status = 'paid'`

---

## 5) Cancellation Rules

Solde orders must handle cancellation carefully.

### 5.1 Cancel before confirmation

If admin never confirmed:

- No ledger `debit` exists.
- Cancellation behaves like normal cancellation:
  - restore stock
  - reduce promo redeemed count (if used)
  - refund remise_used_amount (if used)

### 5.2 Cancel after confirmation (debit exists)

If a debit exists, cancellation must also reverse debt:

- Create a compensating `credit` entry:
  - `entry_type = 'credit'`
  - `amount = same as debit`
  - `description = 'Solde order cancelled (reversal)'`

This keeps the ledger consistent.

---

## 6) API Contract (Frontend Usage)

### 6.1 Checkout request

Use the existing checkout endpoint and fields.

Add/choose:

- `payment_method: "solde"`

Optional (if allowed):

- `use_remise_balance` / `remise_to_use` (works the same)

Example:

```json
{
  "customer_name": "Client Solde",
  "customer_email": "client@example.com",
  "customer_phone": "+212600000000",
  "shipping_address_line1": "Rue ...",
  "shipping_city": "Casablanca",

  "payment_method": "solde",

  "use_remise_balance": false,
  "use_cart": true
}
```

### 6.2 Checkout response (how to display amounts)

The order response already includes:

- `total_amount`
- `remise_used_amount`
- `payment_status`
- `payment_method`

Frontend can compute:

- `solde_amount = total_amount - remise_used_amount`

And display:

- “À payer plus tard (Solde): X DH”

### 6.3 Order history and details

No new endpoints required.

Filter client-side:

- `payment_method === 'solde'`

Show:

- order is “Solde”
- `payment_status` is usually `pending` until paid later

---

## 7) Admin / Backoffice Expectations

Admin needs:

- A list view filtered on `payment_method = 'solde'`.
- A “Confirm” action that sets `status = confirmed`.
- A “Record Payment” action that:
  - adds ledger credits
  - sets `payment_status = paid` when appropriate

Optional (high quality):

- Show customer’s outstanding solde in the UI:
  - computed from the ledger.

---

## 8) Observability & Audit

- Always record status changes in `ecommerce_order_status_history`.
- Always record solde financial moves in `contact_solde_ledger`.
- Keep all solde writes transactional and idempotent.

---

## 9) Future Enhancements (recommended)

- Credit limits:
  - `contacts.solde_limit` (DECIMAL) and enforce: outstanding + new_debit <= limit
- Partial payments per order:
  - add `payment_reference` or `transaction_id` to ledger credits
- Dedicated admin endpoints:
  - list solde customers + outstanding
  - toggle `is_solde`
  - attach employee ID to credits/debits
