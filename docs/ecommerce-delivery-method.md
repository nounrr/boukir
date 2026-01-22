# E-commerce Delivery Method (delivery vs pickup)

This document defines a **simple** and scalable structure to support both:

- Home delivery
- Store pickup (customer goes to the boutique)

without mixing those concerns into `payment_method`.

---

## 1) New fields

### 1.1 `delivery_method`

Stored on `ecommerce_orders.delivery_method`.

Allowed values:

- `delivery` (default)
- `pickup`

### 1.2 `pickup_location_id`

Stored on `ecommerce_orders.pickup_location_id`.

- Only relevant when `delivery_method = 'pickup'`.
- The backend ships with **one default pickup location** inserted by migration.

---

## 2) Checkout API changes

Endpoint:

- `POST /api/ecommerce/orders`

### 2.1 Request fields (frontend)

Add these optional fields:

- `delivery_method?: "delivery" | "pickup"` (default: `delivery`)
- `pickup_location_id?: number` (optional)

Rules:

- If `delivery_method = "delivery"`:
  - Frontend must send the shipping fields as usual.
- If `delivery_method = "pickup"`:
  - Frontend does **not** need to send shipping address fields.
  - Backend will load the pickup location and fill the order shipping fields automatically.

Recommended payment methods for pickup:

- `payment_method = "pay_in_store"` (customer pays at boutique)
- `payment_method = "card"` (optional)
- `payment_method = "solde"` (optional for approved clients)

### 2.2 Response fields

Orders will include:

- `delivery_method`
- `pickup_location_id`

---

## 3) Frontend UI suggestion

### 3.1 Checkout screen

Add a selector:

- Delivery method:
  - “Livraison à domicile” → `delivery_method = "delivery"`
  - “Retrait en boutique” → `delivery_method = "pickup"`

When the user selects pickup:

- Hide the shipping address form.
- Show pickup info (name + city) from your configuration or by fetching from backend (future).
- Default `payment_method` to `pay_in_store`.

### 3.2 Order confirmation screen

If `delivery_method = "pickup"`:

- Show:
  - “Retrait en boutique”
  - Pickup location name
  - Payment method (ex: “Paiement en boutique”)

---

## 4) Migration

Run:

- Recommended (apply only this migration):
  - `npm run db:migrate:one -- 2026-01-21-add-delivery-method-and-pickup-location.sql`

- Or apply all pending migrations:
  - `npm run db:migrate`

Migration added:

- `backend/migrations/2026-01-21-add-delivery-method-and-pickup-location.sql`

It creates:

- `ecommerce_pickup_locations`
- Adds `delivery_method` and `pickup_location_id` to `ecommerce_orders`
- Seeds one default pickup location
