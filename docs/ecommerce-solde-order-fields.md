# Solde Orders — `is_solde` + `solde_amount` (Frontend Notes)

This note explains how **solde** works in the Orders API and what the frontend should do.

## Goal

Keep the frontend request simple: send the normal checkout payload (including `payment_method: "solde"`) and always read `is_solde` / `solde_amount` from the backend response.

## What the frontend sends

Create order using the normal checkout endpoint:

- `POST /api/ecommerce/orders`
- Include `payment_method: "solde"`
- If the user wants to spend remise:
  - `use_remise_balance: true` and/or `remise_to_use`

The frontend does **not** compute solde values.

### Example payload (delivery)

```json
{
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "+212600000000",
  "shipping_address_line1": "123 Rue",
  "shipping_city": "Casablanca",
  "delivery_method": "delivery",
  "payment_method": "solde",
  "use_remise_balance": true,
  "remise_to_use": 50,
  "use_cart": false,
  "items": [{"product_id": 5304, "quantity": 2}]
}
```

### Example payload (pickup)

```json
{
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "+212600000000",
  "delivery_method": "pickup",
  "pickup_location_id": 1,
  "payment_method": "solde",
  "use_cart": true
}
```

Notes:
- Don’t send raw card fields (card number/CVV/expiry). This API rejects them.
- For pickup, shipping address is filled by the backend using the pickup location.

## What the backend computes

For `payment_method = "solde"`, the backend computes and persists:

- `is_solde` (0/1)
- `solde_amount`

Formula:

$$ solde\_amount = \max(0, round(total\_amount - remise\_used\_amount, 2)) $$

Meaning:
- `solde_amount` is the remaining amount after any `remise_used_amount`.
- `is_solde = 1` only when `solde_amount > 0`.

If remise covers the full amount, the backend sets:
- `payment_status = "paid"`
- `solde_amount = 0.00`
- `is_solde = 0`

### Example response fields to use

After `POST /api/ecommerce/orders`, use:

```json
{
  "order": {
    "id": 46,
    "payment_method": "solde",
    "total_amount": 111.56,
    "remise_used_amount": 50,
    "is_solde": 1,
    "solde_amount": 61.56,
    "status": "pending",
    "payment_status": "pending"
  }
}
```

UI guidance:
- If `payment_method === "solde"` and `solde_amount > 0`: show “À payer en solde: {solde_amount}”.
- If `solde_amount === 0`: treat it as fully paid by remise (no debt).

## Permissions / errors

Solde is only allowed for authenticated users.

- If `payment_method = solde` and `solde_amount > 0`:
  - requires a Bearer token
  - requires `contacts.is_solde = 1`

Common errors:
- `401 SOLDE_AUTH_REQUIRED` — not authenticated
- `403 SOLDE_NOT_ALLOWED` — user not solde-enabled

Important nuance:
- The backend only enforces solde permission when `solde_amount > 0`.
- If remise covers everything (`solde_amount = 0`), there is no debt and the order can be created without using solde credit.

## What the frontend reads

After creating an order, read these fields from the response:

- `order.payment_method`
- `order.remise_used_amount`
- `order.is_solde`
- `order.solde_amount`

For existing orders:
- `GET /api/ecommerce/orders` and `GET /api/ecommerce/orders/:id` return `is_solde` and `solde_amount`.

Note: the details endpoint can auto-correct older rows that were created before these columns were properly persisted.

## Backoffice workflow reminder

- Solde creates **debt** in `contact_solde_ledger` only after the backoffice confirms the order:
  - `PUT /api/ecommerce/orders/:id/status` with `status = "confirmed"`

This is intentional:
- Customer can place a solde order.
- Backoffice confirms it (approval step).
- Only then the system books the debt.
