# E-commerce Shipping: Checkout Flow & Pricing Rules

This document explains the **frontend checkout flow** (3 steps UI) and how the **shipping price** should be computed and displayed.

It is written to match the current backend implementation in:

- [backend/routes/ecommerce/orders.js](../backend/routes/ecommerce/orders.js)
- [backend/utils/ecommerceShipping.js](../backend/utils/ecommerceShipping.js)
- [backend/utils/mouvementCalc.js](../backend/utils/mouvementCalc.js)

---

## 1) What the backend computes today

### 1.1 Shipping is computed server-side at order creation

- The backend computes and stores `ecommerce_orders.shipping_cost` inside `POST /api/ecommerce/orders`.
- The frontend **should not** hardcode shipping rules client-side.

### 1.2 Phase 1 rule (non-KG orders): based on profit (marge/bénéfice)

For orders **without KG items**:

- If order **profit >= 200 MAD** → shipping is **free** (`shipping_cost = 0`).
- If order **profit < 200 MAD** → shipping is **30 MAD** (`shipping_cost = 30`).
- If `delivery_method = pickup` → shipping is always **0**.

#### Profit formula (aligned with backoffice “mouvement”)

The profit used by shipping is computed like the backoffice movement calculation:

$$ profit = \sum\limits\_{items} ( (prix_unitaire - cost) \times quantite ) $$

Where:

- `prix_unitaire` is the effective selling unit price (product/variant price, adjusted by unit conversion, then promo applied).
- `cost` is the best available cost value:
  - `cout_revient` if present, otherwise `prix_achat`.
  - variant cost is preferred when `variant_id` exists.

> Note: In e-commerce checkout we use type `Ecommerce` so **no remise subtraction** is applied in `computeMouvementCalc()`.

### 1.3 KG products (Phase 2 + Phase 3 implemented)

If the cart contains any item where `kg > 0`:

- Phase 1 (profit >= 200) **does not apply**.
- The backend uses **total KG bands** (Phase 2) to decide free shipping.
- If KG rules do not grant free shipping, the backend uses **distance-based pricing** (Phase 3) using the `distance_km` computed from the submitted coordinates.

#### Phase 2 (KG) free-shipping rules

- If `total_kg > 5000` → shipping is **free**.
- If `total_kg <= 2000` → shipping is **free** if `profit >= 500 MAD`.
- If `2000 < total_kg <= 5000` → shipping is **free** if `profit >= 1000 MAD`.

#### Phase 3 (Distance) pricing rules (when KG is NOT free)

The backend charges a **per-km rate** based on the total distance tier:

```
0-2km    => 25 DH / km
2-4km    => 20 DH / km
4-6km    => 17 DH / km
>= 6km   => 12 DH / km
```

Formula:

$$ shipping\_cost = distance\_km \times rate\_per\_km $$

Example: if `distance_km = 3.807` → rate is `20 DH/km` → shipping is `76.14 DH`.

---

## 2) Checkout UI/UX (3 steps) and where shipping fits

Your UI has 3 steps:

1. **Step 1**: Delivery method + customer personal & address details
2. **Step 2**: Payment method (and remise/solde options)
3. **Step 3**: Confirmation

### Goal

The user must see the shipping price **before confirming**.

Because shipping depends on server-side rules and real product costs, the frontend should request a **shipping quote** from the backend when the user selects:

- `delivery_method` (delivery vs pickup)
- potentially after cart changes (quantity/variant/unit)

---

## 3) Recommended API flow (professional approach)

### 3.1 Why you should call an API on Step 1

Yes — when the user selects `Livraison à domicile`, you should call the backend to get the shipping price.

Reasons:

- Shipping rules are server-owned.
- Profit calculation requires product cost (`cout_revient` / `prix_achat`) which should not be exposed to the public frontend.
- Prevents discrepancies and fraud.

### 3.2 Quote endpoint (implemented)

To support the UX cleanly, add a dedicated endpoint:

- `POST /api/ecommerce/orders/quote`

It should:

- Accept the same `delivery_method` and item source (`use_cart` / `items[]`) as checkout.
- Run the same validations/pricing rules as checkout (without writing an order).
- Return:
  - `subtotal`
  - `shipping_cost`
  - `discount_amount`
  - `promo_discount_amount`
  - `total_amount`
  - `delivery_method`

**Important:** it must NOT return sensitive internal fields (like cost or profit).

### 3.3 Frontend request timing (Step 2 - transition from Step 1)

**When**: The user clicks "Next" on Step 1 (after filling address and choosing delivery method).
**Why**: We need the user's shipping location (address or map coordinates) to compute distance-based shipping if required.

Call `POST /api/ecommerce/orders/quote` with the collected details:

- `shipping_location`: `{ lat: number, lng: number }` (from map)
- `shipping_city`: (optional, for future city-based rules)
- `delivery_method`: "delivery"
- items (cart or array)

Update the summary panel with:

- `Frais de livraison`: `Gratuit` or computed cost (e.g. `30.00 MAD`).
- `Total TTC`

### 3.4 Step 2 (Payment) and Step 3 (Confirmation)

- Step 2: payment method selection should NOT recalculate shipping.
- Step 3: confirmation uses the last quote shown.

On final submit:

- Call `POST /api/ecommerce/orders` with all details, **including the coordinates** (`shipping_location`) captured in Step 1.
- Always trust server response; the backend will compute and persist shipping again.

---

## 4) Current state vs what to implement next

### Current backend behavior

- Shipping is only computed during `POST /api/ecommerce/orders`.
- There is no dedicated quote endpoint yet.

### Next implementation step (needed for your UX)

Add `POST /api/ecommerce/orders/quote` to return the totals (including `shipping_cost`) **without creating** the order.

This will let Step 1 display shipping correctly as soon as the user chooses “Livraison à domicile”.

---

## 5) Payload examples

### Quote (authenticated user, use cart)

```json
POST /api/ecommerce/orders/quote
{
  "use_cart": true,
  "delivery_method": "delivery",
  "promo_code": "NEWYEAR25",
  "shipping_location": { "lat": 35.7591, "lng": -5.8339 }
}
```

#### Quote response (success)

```json
200 OK
{
  "delivery_method": "delivery",
  "currency": "MAD",
  "totals": {
    "subtotal": 254.0,
    "tax_amount": 0.0,
    "shipping_cost": 0.0,
    "discount_amount": 0.0,
    "promo_code": "NEWYEAR25",
    "promo_discount_amount": 0.0,
    "total_amount": 254.0
  },
  "summary": {
    "items_count": 1,
    "shipping_label": "Gratuit",
    "contains_kg": false,
    "total_kg": 0,
    "shipping_reason": "profit_threshold_met",
    "distance_km": 1.234,
    "store_location": { "lat": 35.7532036, "lng": -5.8421462 }
  }
}
```

#### Quote response (common errors)

```json
400 Bad Request
{
  "message": "Panier vide"
}
```

```json
400 Bad Request
{
  "message": "Aucun article fourni"
}
```

```json
400 Bad Request
{
  "message": "Code promo invalide ou inactif"
}
```

### Quote (guest/direct items)

```json
POST /api/ecommerce/orders/quote
{
  "use_cart": false,
  "delivery_method": "delivery",
  "items": [
    { "product_id": 101, "variant_id": null, "unit_id": null, "quantity": 2 }
  ]
}
```

#### Quote response (guest, success)

```json
200 OK
{
  "delivery_method": "delivery",
  "currency": "MAD",
  "totals": {
    "subtotal": 120.0,
    "tax_amount": 0.0,
    "shipping_cost": 30.0,
    "discount_amount": 0.0,
    "promo_code": null,
    "promo_discount_amount": 0.0,
    "total_amount": 150.0
  },
  "summary": {
    "items_count": 1,
    "shipping_label": "30.00 MAD"
  }
}
```

### Quote (Requesting Distance)

To get the distance (`distance_km`) calculated in the summary, simply include `shipping_location` in your body.

```json
POST /api/ecommerce/orders/quote
{
  "use_cart": true,
  "delivery_method": "delivery",
  "shipping_location": {
    "lat": 35.7721,
    "lng": -5.8034
  }
}
```

#### Quote response (with distance)

```json
200 OK
{
  "delivery_method": "delivery",
  "currency": "MAD",
  "totals": {
    "subtotal": 3321,
    "shipping_cost": 0,
    "total_amount": 3321
  },
  "summary": {
    "items_count": 2,
    "shipping_label": "Gratuit",
    "contains_kg": true,
    "total_kg": 500,
    "shipping_reason": "kg_profit_band1_met",
    "distance_km": 4.512,
    "store_location": {
      "lat": 35.7532036,
      "lng": -5.8421462
    }
  }
}
```

### Checkout (final submit)

The final order creation request now supports optional coordinates (`shipping_location` object or `shipping_lat`/`shipping_lng` fields). These are stored in the database for distance calculations.

```json
POST /api/ecommerce/orders
{
  "customer_name": "Test Buyer",
  "customer_email": "buyer@example.com",
  "customer_phone": "+212612345678",
  "shipping_address_line1": "123 Rue Exemple",
  "shipping_city": "Casablanca",
  "shipping_location": {
    "lat": 35.7721,
    "lng": -5.8034
  },
  "delivery_method": "delivery",
  "payment_method": "cash_on_delivery",
  "promo_code": "NEWYEAR25",
  "use_cart": true
}
```

#### Checkout response (success)

```json
201 Created
{
  "message": "Commande créée avec succès",
  "order": {
    "id": 123,
    "order_number": "ORD-ABC123",
    "total_amount": 254.0,
    "remise_used_amount": 0.0,
    "status": "pending",
    "payment_status": "pending",
    "payment_method": "cash_on_delivery",
    "is_solde": 0,
    "solde_amount": 0,
    "delivery_method": "delivery",
    "pickup_location_id": null,
    "items_count": 1
  }
}
```

#### Checkout response (common errors)

```json
400 Bad Request
{
  "message": "Informations requises manquantes",
  "required": ["customer_name", "customer_email", "shipping_address_line1", "shipping_city"]
}
```

```json
400 Bad Request
{
  "message": "Stock insuffisant pour Demo - Peinture #1",
  "available": 2,
  "requested": 3
}
```

```json
400 Bad Request
{
  "message": "Méthode de paiement incompatible avec le retrait en boutique",
  "error_type": "PAYMENT_METHOD_NOT_ALLOWED_FOR_PICKUP"
}
```

---

## 6) Notes & constraints

- **Do not compute profit client-side**: it requires private cost data.
- **Always re-check on final checkout**: shipping in the order is authoritative.
- **KG Phase 2**: as soon as you add KG shipping, Step 1 quote must include the KG logic too.
