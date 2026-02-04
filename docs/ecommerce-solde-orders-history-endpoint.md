# E‑commerce — Solde Orders History / Statement Endpoint

This document describes **only** the e‑commerce endpoint that returns the user’s **solde history** as either a **statement/timeline** or a **solde orders list**.

---

## Endpoint

- `GET /api/ecommerce/orders/solde`

## Auth

- Required: `Authorization: Bearer <JWT>`

## Access rules

- By default, the endpoint returns the authenticated user’s data.
- Optional `contact_id` is supported for **backoffice roles only**.

---

## Query params

### Common

- `view` (optional): `statement` | `orders`
  - Default: `statement`
- `contact_id` (optional): number
  - Backoffice-only helper (e-commerce users cannot request another contact)

### `view=statement` (default)

High-performance statement built from a single `UNION ALL` query, limited to exactly these **5 sources**:

1. `BON_ECOMMERCE` (e-commerce **solde** orders)
2. `AVOIR_ECOMMERCE`
3. `BON_SORTIE`
4. `AVOIR_CLIENT`
5. `PAYMENT`

Additional params:

- `limit` (optional): default `500`, max `2000`
- `offset` (optional): default `0`
- `from` (optional): ISO date/datetime lower bound (filters timeline rows)
- `to` (optional): ISO date/datetime upper bound (filters timeline rows)

### `view=orders`

Returns only e-commerce solde orders (legacy response).

Additional params:

- `include_items` (optional): by default items are included
  - Set `include_items=0` or `include_items=false` to return orders without items

---

## What it includes

### Statement (`view=statement`)

- Timeline begins with `SOLDE_INITIAL` equal to `contacts.solde`.
- Each row contains:
  - `debit`: increases debt
  - `credit`: reduces debt
  - `delta = debit - credit`
  - `solde_cumule`: running cumulative starting from `SOLDE_INITIAL`
- Source meanings:
  - `BON_ECOMMERCE`: `debit = ecommerce_orders.solde_amount` (solde-financed part)
  - `AVOIR_ECOMMERCE`: `credit = avoirs_ecommerce.montant_total`
  - `BON_SORTIE`: `debit = bons_sortie.montant_total`
  - `AVOIR_CLIENT`: `credit = avoirs_client.montant_total`
  - `PAYMENT`: `credit = payments.montant_total`

Important notes:

- E-commerce orders considered: `COALESCE(is_solde,0)=1` and `status NOT IN ('cancelled','refunded')`.
- `AVOIR_ECOMMERCE` is linked by `ecommerce_order_id` → `ecommerce_orders.id` and also supports phone matching by last 9 digits when needed.
- Output is e-commerce safe: no profit/benefit/internal backoffice fields.

### Orders list (`view=orders`)

- Returns each solde order with a running cumulative computed from `solde_amount` (orders only).
- Optionally includes `ecommerce_order_items`.

---

## Response — `view=statement` (default)

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

---

## Response — `view=orders`

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
      "items": []
    }
  ]
}
```
