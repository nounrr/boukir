# E‑commerce Solde + Plafond (Credit Limit) — API Contract & Workflow (Feb 2026)

This document explains the **platform updates** needed to support a controllable & secure **Solde** (Buy Now Pay Later) feature with a **Plafond** (credit limit) for e‑commerce users.

It covers:

- What changed in the backend
- The **requests and responses** (JSON shapes)
- The recommended **frontend workflow**
- Error handling rules

---

## 0) Concepts

### 0.1 Fields (Contacts)

In e‑commerce, users are stored in the same `contacts` table.

- `contacts.is_solde` (0/1)
  - Backoffice-controlled flag: user is allowed to use Solde.
- `contacts.plafond` (decimal, nullable)
  - Credit limit in DH (MAD). When `NULL` or `<= 0`, the limit is treated as **not enforced**.

### 0.2 Fields (Orders)

- `ecommerce_orders.payment_method` includes `solde`.
- `ecommerce_orders.is_solde` (0/1)
- `ecommerce_orders.solde_amount` (decimal)
  - Amount that becomes debt (remaining amount after applying optional remise).

### 0.3 What “solde debt” means in this system

Solde debt is computed from the same rules used by the backoffice contacts balance calculation:

- E‑commerce debt includes only orders where `is_solde = 1`
- Excludes orders with status `cancelled` or `refunded`

There is **no separate solde ledger table** required for this enforcement. The debt is derived from orders.

---

## 1) API: Get current user profile

### Endpoint

- `GET /api/users/auth/me`

### Auth

- `Authorization: Bearer <JWT>`

### Success response (200)

The response includes the usual user fields plus new Solde control fields:

```json
{
  "user": {
    "id": 123,
    "prenom": "Ahmed",
    "nom": "Benali",
    "nom_complet": "Ahmed Benali",

    "email": "ahmed@example.com",
    "telephone": "0612345678",

    "is_solde": true,
    "remise_balance": 120.5,

    "plafond": 1500,
    "solde_cumule": 600,
    "solde_available": 900
  }
}
```

### Meaning of the new fields

- `plafond`: number|null
  - User credit limit in DH.
- `solde_cumule`: number
  - Current computed cumulative balance/debt used for plafond checks.
- `solde_available`: number|null
  - Remaining allowed solde capacity. Returned only when `plafond > 0`.

Recommended frontend usage:

- Show `solde_available` in checkout when user selects `payment_method = solde`.
- If `solde_available !== null` and `solde_available < amount_to_pay_by_solde`, prevent submission and show a clear UI message.

---

## 2) API: Create order (checkout)

### Endpoint

- `POST /api/ecommerce/orders`

### Auth

- Optional for normal payment methods
- **Required** for `payment_method = solde`

### Request body (minimum for Solde)

Below is a simplified payload. Your actual checkout may include promo/remise/delivery fields.

```json
{
  "customer_name": "Ahmed Benali",
  "customer_email": "ahmed@example.com",
  "customer_phone": "0612345678",

  "delivery_method": "delivery",
  "shipping_address_line1": "Rue ...",
  "shipping_city": "Casablanca",

  "payment_method": "solde",

  "use_cart": true
}
```

### Optional: Remise + Solde combined

Remise is applied first (if enabled) and Solde covers the remaining amount.

```json
{
  "customer_name": "Ahmed Benali",
  "customer_email": "ahmed@example.com",
  "customer_phone": "0612345678",

  "delivery_method": "delivery",
  "shipping_address_line1": "Rue ...",
  "shipping_city": "Casablanca",

  "payment_method": "solde",

  "use_remise_balance": true,
  "remise_to_use": 200,

  "use_cart": true
}
```

### Success response (201)

```json
{
  "message": "Commande créée avec succès",
  "order": {
    "id": 456,
    "order_number": "ORD-...",
    "total_amount": 1200,
    "remise_used_amount": 200,

    "status": "pending",
    "payment_status": "pending",
    "payment_method": "solde",

    "is_solde": 1,
    "solde_amount": 1000,

    "delivery_method": "delivery",
    "pickup_location_id": null,
    "items_count": 3
  }
}
```

Notes:

- `solde_amount` is computed server‑side as:
  - `max(0, total_amount - remise_used_amount)` rounded to 2 decimals.
- If `remise_used_amount` covers the full total, then `solde_amount = 0` and the order is considered paid by remise.

---

## 3) Solde enforcement rules (backend)

When `payment_method = solde` and `solde_amount > 0`:

1) User must be authenticated
   - Else error `SOLDE_AUTH_REQUIRED`
2) User must be enabled for solde (`contacts.is_solde = 1`)
   - Else error `SOLDE_NOT_ALLOWED`
3) If user has a positive plafond (`contacts.plafond > 0`), the backend enforces:

$$
(\text{solde\_cumule} + \text{solde\_amount}) \le \text{plafond}
$$

Implementation details:

- The backend locks the `contacts` row (`FOR UPDATE`) to avoid race conditions where multiple checkouts could exceed the plafond.

---

## 4) Error responses to handle in frontend

### 4.1 Solde requires auth (401)

```json
{
  "message": "Authentification requise pour payer en solde",
  "error_type": "SOLDE_AUTH_REQUIRED"
}
```

Frontend action:

- Redirect to login
- After login, fetch `/api/users/auth/me` then retry checkout

### 4.2 Solde not allowed for this user (403)

```json
{
  "message": "Votre compte n'est pas autorisé à payer en solde",
  "error_type": "SOLDE_NOT_ALLOWED"
}
```

Frontend action:

- Hide/disable the solde payment method
- Suggest alternate payment method

### 4.3 Plafond exceeded (403)

```json
{
  "message": "Plafond solde dépassé",
  "error_type": "SOLDE_PLAFOND_EXCEEDED",
  "plafond": 1500,
  "solde_cumule": 600,
  "solde_amount": 1000,
  "solde_projected": 1600
}
```

Frontend action:

- Show a clear message: user exceeded credit limit
- Suggest:
  - Reduce cart amount
  - Use a different payment method
  - Or ask backoffice to increase plafond / mark debt as paid

Recommended UI copy example:

- “Votre plafond solde est de 1500 DH. Solde actuel: 600 DH. Cette commande ajouterait 1000 DH (total 1600 DH) → plafond dépassé.”

---

## 4.4 API: Solde statement / timeline

This endpoint is meant to display a **timeline/table** similar to the backoffice contact “solde cumulé” view, but **e‑commerce safe** (no profit/benefit fields).

It supports two views:

- `view=statement` (default): **statement/timeline** built from a single `UNION ALL` query (high performance)
- `view=orders`: legacy view that lists only e‑commerce solde orders (optionally with items)

### Endpoint

- `GET /api/ecommerce/orders/solde`

### Auth

- `Authorization: Bearer <JWT>`

### Query params

- `view` (optional): `statement` | `orders`
  - Default: `statement`

#### Statement view params

- `limit` (optional): default `500`, max `2000`
- `offset` (optional): default `0`
- `from` (optional): ISO date/datetime lower bound (applied to timeline rows)
- `to` (optional): ISO date/datetime upper bound (applied to timeline rows)

Statement includes only these 5 sources:

- `BON_ECOMMERCE` (e‑commerce solde orders)
- `AVOIR_ECOMMERCE`
- `BON_SORTIE`
- `AVOIR_CLIENT`
- `PAYMENT`

#### Orders view params

- `include_items` (optional): by default items are included
  - Set `include_items=0` or `include_items=false` to return orders without items
- `contact_id` (optional): backoffice-only helper
  - If provided, only users with a backoffice `role` can fetch another contact’s timeline

### Success response (200) — `view=statement` (default)

Notes:

- The timeline starts with an initial row `SOLDE_INITIAL` equal to `contacts.solde`.
- Each row has `debit` (adds debt), `credit` (reduces debt) and `delta = debit - credit`.
- `solde_cumule` is the running cumulative starting from `SOLDE_INITIAL`.

```json
{
  "view": "statement",
  "contact": {
    "id": 123,
    "nom_complet": "Ahmed Benali",
    "email": "ahmed@example.com",
    "telephone": "0612345678",
    "is_solde": true,
    "plafond": 1500
  },
  "summary": {
    "initial_solde": 100,
    "debit_total": 650,
    "credit_total": 200,
    "final_solde": 550,
    "returned": 42,
    "limit": 500,
    "offset": 0
  },
  "timeline": [
    {
      "source": "SOLDE_INITIAL",
      "doc_id": null,
      "ref": null,
      "date": null,
      "statut": null,
      "debit": 0,
      "credit": 0,
      "delta": 0,
      "solde_cumule": 100,
      "linked_id": null,
      "mode_paiement": null
    },
    {
      "source": "BON_ECOMMERCE",
      "doc_id": 10,
      "ref": "ORD-...",
      "date": "2026-02-01T12:00:00.000Z",
      "statut": "pending",
      "debit": 500,
      "credit": 0,
      "delta": 500,
      "solde_cumule": 600,
      "linked_id": null,
      "mode_paiement": null
    },
    {
      "source": "PAYMENT",
      "doc_id": 22,
      "ref": "22",
      "date": "2026-02-02T09:00:00.000Z",
      "statut": "Validé",
      "debit": 0,
      "credit": 200,
      "delta": -200,
      "solde_cumule": 400,
      "linked_id": null,
      "mode_paiement": "Espèces"
    }
  ]
}
```

### Success response (200) — `view=orders`

```json
{
  "view": "orders",
  "contact": {
    "id": 123,
    "nom_complet": "Ahmed Benali",
    "email": "ahmed@example.com",
    "telephone": "0612345678",
    "is_solde": true,
    "plafond": 1500
  },
  "summary": {
    "orders_count": 2,
    "solde_total": 650
  },
  "orders": [
    {
      "id": 10,
      "order_number": "ORD-...",
      "created_at": "2026-02-01T12:00:00.000Z",
      "status": "pending",
      "payment_status": "pending",
      "payment_method": "solde",
      "total_amount": 500,
      "remise_used_amount": 0,
      "is_solde": 1,
      "solde_amount": 500,
      "solde_cumule": 500,
      "delivery_method": "delivery",
      "pickup_location_id": null,
      "items": [
        {
          "product_id": 1,
          "product_name": "...",
          "unit_price": 100,
          "quantity": 5,
          "subtotal": 500,
          "discount_amount": 0
        }
      ]
    }
  ]
}
```

---

## 5) Recommended e‑commerce workflow

### 5.1 After login (or app start if token exists)

1) Call `GET /api/users/auth/me`
2) Store in frontend auth state:
   - `is_solde`
   - `plafond`
   - `solde_available`
   - `remise_balance`

### 5.2 On checkout page

1) Show payment methods
2) If `user.is_solde === true`, show “Solde” option
3) If `user.solde_available !== null`, display it:
   - “Plafond solde restant: {solde_available} DH”
4) On submit:
   - Call `POST /api/ecommerce/orders`
   - If backend returns `SOLDE_PLAFOND_EXCEEDED`, refresh `/api/users/auth/me` and update UI

### 5.3 Important: don’t trust frontend checks

Even if the UI blocks the user, the backend remains the final authority:

- Users can open multiple tabs
- Balances can change
- So the platform must enforce plafond inside the checkout transaction

---

## 6) Related docs

These existing docs describe checkout and solde/remise in more detail:

- `docs/ecommerce-checkout-payments-solde-pickup.md`
- `docs/ecommerce-remise-balance-payments.md`
- `docs/ecommerce-solde-workflow-1.md`
- `docs/ecommerce-solde-order-fields.md`
