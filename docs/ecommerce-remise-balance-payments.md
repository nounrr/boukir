# E‑commerce Remise Balance Payments

This document explains how the remise (loyalty) balance can be used as a payment method in combination with the normal payment methods (cash on delivery, card, bank transfer).

It is intended for the frontend team implementing the checkout and order details screens.

---

## 1. Concepts & Fields

### 1.1 User remise balance

- Stored on the authenticated user in the `contacts` table as:
  - `remise_balance: number` (decimal, 2 digits).
- Exposed by auth endpoints:
  - `POST /api/users/auth/login`
  - `GET /api/users/auth/me`
- The frontend should treat this as **loyalty points in DH**.

### 1.2 Order-level remise fields

On each ecommerce order (`ecommerce_orders`):

- `total_amount: number`
  - The full order total **after** product promos and promo codes, but **before** applying remise balance.
- `remise_used_amount: number`
  - New field.
  - The amount (in DH) of the customer remise balance that was actually spent on this order.
  - Always `0` for guests or orders where the customer chose not to use remise.

**Important:**

- What the customer still has to pay via the main payment method is:

  $$ amount\_to\_pay = total\_amount - remise\_used\_amount $$

---

## 2. Supported payment methods

Checkout supports the following `payment_method` values:

- `cash_on_delivery`
- `card`

The remise balance is **not** a new value for `payment_method`. It is an **additional partial payment** that reduces what remains to pay with the chosen method above.

Example:

- `total_amount = 1000`
- `remise_used_amount = 300`
- `payment_method = "cash_on_delivery"`
- Amount to collect on delivery: `700`.

---

## 3. Checkout API

### 3.1 Endpoint

- `POST /api/ecommerce/orders`
- Auth:
  - Works for both guests and authenticated users.
  - **Remise balance usage is only available for authenticated users** (requires a logged-in user with `remise_balance`).

### 3.2 Relevant request fields

Existing fields (already in use):

- `payment_method: "cash_on_delivery" | "card"`
- All other existing checkout fields (customer, shipping, cart/items, promo_code, etc.) remain unchanged.

New/updated fields for remise usage:

- `remise_to_use?: number`
  - Optional.
  - Amount (in DH) of remise the user wants to spend on this order.
  - If not provided but `use_remise_balance` is true, the backend will try to use the **maximum** possible amount.
- `use_remise_balance?: boolean | string`
  - Optional.
  - If `true` (or string `'true'`), it indicates the user wants to use remise for this order.
  - If both `use_remise_balance` is true and `remise_to_use` is **not** provided, the backend uses as much remise as possible.

### 3.3 Backend rules

For **authenticated users only**:

- The backend runs everything inside a DB transaction.
- It first computes the normal order total (`total_amount`) from items, promos, shipping, tax, etc.
- Then, if the user requested remise usage:
  1. It locks the user row: `SELECT remise_balance FROM contacts WHERE id = ? FOR UPDATE`.
  2. Reads the current `remise_balance`.
  3. Calculates `remiseUsedAmount`:
     - Start from:
       - `requested = remise_to_use` if provided and > 0,
       - otherwise, `requested = current remise_balance`.
     - Clamp to:
       - `remiseUsedAmount <= current remise_balance`, and
       - `remiseUsedAmount <= total_amount`.
     - Round down to 2 decimals.
  4. If `remiseUsedAmount > 0`, it runs a guarded update:
     - `UPDATE contacts SET remise_balance = remise_balance - ? WHERE id = ? AND remise_balance >= ?`.
     - If this update does **not** affect 1 row, checkout fails with a `409` error (see below).

For **guests** (no authenticated user):

- Any remise-related fields in the request are ignored.
- `remise_used_amount` will always be `0`.

### 3.4 Success response

On success, the endpoint still returns `201 Created` with:

```json
{
  "message": "Commande créée avec succès",
  "order": {
    "id": 123,
    "order_number": "ORD-XXXX",
    "total_amount": 1000,
    "remise_used_amount": 300,
    "status": "pending",
    "payment_status": "pending",
    "payment_method": "cash_on_delivery",
    "items_count": 5
  }
}
```

Frontend can compute:

- `amount_to_pay = order.total_amount - order.remise_used_amount`.

### 3.5 Error cases

Most errors remain unchanged. New relevant error:

#### 3.5.1 Remise balance changed / insufficient

If someone else or another session changed the user remise balance between the page load and checkout submit, the guarded update will fail and the backend responds:

```json
{
  "message": "Solde de remise insuffisant ou mis à jour, veuillez réessayer.",
  "error_type": "REMISE_BALANCE_CHANGED"
}
```

Frontend behaviour suggestions:

- Re-fetch the user via `GET /api/users/auth/me`.
- Refresh the displayed `remise_balance`.
- Ask the user to confirm again how much remise to use and resubmit.

---

## 4. Order listing & details

### 4.1 Get current user orders

- `GET /api/ecommerce/orders`
- Accepts:
  - `Authorization: Bearer <token>` **or** `?email=...` for guests.

Each order in the response now includes:

```json
{
  "id": 123,
  "order_number": "ORD-XXXX",
  "customer_name": "...",
  "customer_email": "...",
  "customer_phone": "...",
  "total_amount": 1000,
  "remise_used_amount": 300,
  "status": "pending",
  "payment_status": "pending",
  "payment_method": "cash_on_delivery",
  "created_at": "...",
  "confirmed_at": null,
  "remise_applied": false,
  "remise_earned_amount": 0,
  "shipped_at": null,
  "delivered_at": null,
  "shipping_address": { ... },
  "items": [ ... ],
  "items_count": 5
}
```

Frontend can display for each order:

- `total_amount` (order total)
- `remise_used_amount` (how much was paid using remise)
- `amount_to_pay` or `amount_paid_by_method` = `total_amount - remise_used_amount`
- `payment_method`

### 4.2 Get single order

- `GET /api/ecommerce/orders/:id`

The `order` object now includes the same field:

```json
{
  "order": {
    "id": 123,
    "order_number": "ORD-XXXX",
    "subtotal": 950,
    "tax_amount": 0,
    "shipping_cost": 50,
    "discount_amount": 0,
    "total_amount": 1000,
    "remise_used_amount": 300,
    "status": "pending",
    "payment_status": "pending",
    "payment_method": "cash_on_delivery",
    "remise_applied": false,
    "remise_earned_amount": 0,
    "items": [ ... ],
    "status_history": [ ... ]
  }
}
```

Again:

- `amount_to_pay = total_amount - remise_used_amount`.

---

## 5. Cancellations and refunds of remise

### 5.1 Cancel order endpoint

- `POST /api/ecommerce/orders/:id/cancel`
- Behaviour (summary):
  - Validates user/email ownership.
  - Refuses cancellation for orders that are already `shipped`, `delivered` or `cancelled`.
  - Restores product/variant stock quantities.
  - Decrements promo code `redeemed_count` if a promo was used.
  - **New:** If `remise_used_amount > 0` and the order has a `user_id`, it **refunds that amount back** to `contacts.remise_balance`.

This means:

- Remise used to pay for an order is **never lost** if the order is cancelled.

### 5.2 Interaction with remise earned on order

- The previous system for **earning** remise (`remise_earned_amount`, calculated when an order becomes `confirmed` and `paid`) remains unchanged.
- When the order is updated to a confirmed + paid state, the backend:
  - Computes `remise_earned_amount` from the products and their remise percentages.
  - Stores it on the order.
  - Credits that amount to `contacts.remise_balance` **once** (idempotent).

So for an authenticated user, the remit balance flow over time is:

1. **Before checkout**: has some `remise_balance`.
2. **On checkout**: can spend part of that as `remise_used_amount`.
3. **When order is confirmed + paid**: earns new remise (`remise_earned_amount`) on top.
4. **If order is cancelled**: any `remise_used_amount` is refunded.

---

## 6. Frontend integration guidelines

### 6.1 On checkout page

1. Fetch current user via `GET /api/users/auth/me` after login.
2. Read `remise_balance` from the response.
3. Show a UI section like:
   - "Votre solde remise: 300 DH"
   - Input `remise_to_use` (number) or a toggle "Utiliser le maximum".
4. On submit:
   - Include `payment_method` as before.
   - If user chose to use remise:
     - Set `use_remise_balance: true`.
     - Set `remise_to_use` to the amount they selected (optional if using max).

### 6.2 Displaying order confirmation / details

- Always show both:
  - `total_amount`
  - `remise_used_amount`
- Show the breakdown:
  - "Total commande: 1000 DH"
  - "Payé avec remise: 300 DH"
  - "À payer par [COD/Carte/Virement]: 700 DH"

### 6.3 Handling errors

- If you receive `error_type: "REMISE_BALANCE_CHANGED"` on checkout:
  - Re-fetch `/api/users/auth/me`.
  - Update displayed `remise_balance`.
  - Inform user that their balance changed and ask them to confirm again.

---

## 7. Summary

- Remise balance can now be used as a **partial payment** source in addition to existing payment methods.
- Backend tracks per-order how much remise was used via `remise_used_amount`.
- Orders and order details endpoints expose this field.
- Cancellation automatically refunds any used remise to the user balance.
- Frontend mainly needs to:
  - Add UI to choose how much remise to use.
  - Send `use_remise_balance` / `remise_to_use` on checkout.
  - Display the breakdown using `total_amount` and `remise_used_amount`.