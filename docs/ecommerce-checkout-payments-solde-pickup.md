# E-commerce Checkout, Payments, Solde, Pickup — Implementation Notes (Jan 2026)

This document describes what was implemented in the backend + database for:

- **Checkout + orders**
- **Remise** (loyalty in DH)
- **Solde** (buy now, pay later) with a **ledger**
- **Pickup (retrait en boutique)** and **pay-in-store** payment method

It also clarifies the **current checkout page workflow**.

---

## 1) Current Checkout Page Workflow (Frontend UX)

Your current checkout is a typical 3-step flow (as shown in the screenshots):

1) **Livraison / Informations**
   - User enters personal details (name, email, phone)
   - User enters shipping details (address, city, postal code, etc.)

2) **Paiement / Méthode**
   - User optionally applies **remise** (use balance to pay part/all)
   - User selects a **payment method** (ex: cash on delivery, card, solde)
   - User can add a note

3) **Confirmation**
   - User reviews and confirms order

### What changes with Pickup?

With the new backend support for pickup, the checkout **can** be simplified like this:

- In step 1, add a toggle: `delivery_method = delivery | pickup`
- If `pickup` is selected:
  - Hide shipping address fields (because the backend will auto-fill them from the pickup location)
  - Optionally show the boutique address summary

Even if your UI still asks for address fields, the backend will still handle pickup correctly, but UX is better if you hide them.

---

## 1.1 Frontend → Backend Contract (What the frontend must send)

### Endpoint

- `POST /api/ecommerce/orders`

### Pickup locations (to display in UI)

- `GET /api/ecommerce/pickup-locations`
  - Public endpoint (no auth required)
  - Returns the active pickup locations to show in the “Retrait en boutique” UI

#### Response shape

```json
{
  "pickup_locations": [
    {
      "id": 1,
      "name": "Boukir", 
      "address_line1": "Boukir Boutique",
      "address_line2": null,
      "city": "Casablanca",
      "state": null,
      "postal_code": null,
      "country": "Morocco"
    }
  ]
}
```

#### Frontend example (Axios)

```ts
import axios from 'axios';

export type PickupLocation = {
  id: number;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string;
  state: string | null;
  postal_code: string | null;
  country: string;
};

export async function fetchPickupLocations(baseURL: string) {
  const res = await axios.get<{ pickup_locations: PickupLocation[] }>(
    `${baseURL}/api/ecommerce/pickup-locations`
  );
  return res.data.pickup_locations;
}
```

#### Frontend example (React usage)

```ts
const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
const [pickupLocationId, setPickupLocationId] = useState<number | null>(1);

useEffect(() => {
  // Only needed when user chooses pickup
  if (deliveryMethod !== 'pickup') return;

  fetchPickupLocations(import.meta.env.VITE_API_URL)
    .then((rows) => {
      setPickupLocations(rows);
      // Minimal setup: if only 1 location, auto-select it.
      if (rows.length === 1) setPickupLocationId(rows[0].id);
    })
    .catch(() => {
      // If endpoint fails, you can hide pickup option.
      setPickupLocations([]);
    });
}, [deliveryMethod]);
```

### Headers

- `Content-Type: application/json`
- If the user is logged in: `Authorization: Bearer <JWT>`
  - Required for `payment_method = solde`
  - Recommended when `use_cart = true` (uses the user cart)

### Payload shape (high-level)

The backend expects a single JSON body with:

- Customer fields: `customer_name`, `customer_email`, `customer_phone`
- Delivery fields:
  - `delivery_method`: `"delivery" | "pickup"` (default `delivery`)
  - `pickup_location_id` (optional; defaults to `1` when pickup)
- Shipping fields (required only for delivery):
  - `shipping_address_line1`, `shipping_address_line2?`, `shipping_city`, `shipping_state?`, `shipping_postal_code?`, `shipping_country?`
- Payment fields:
  - `payment_method`: `"cash_on_delivery" | "card" | "solde" | "pay_in_store"`
  - Optional: `customer_notes`
- Optional promo:
  - `promo_code`
- Optional remise usage:
  - `use_remise_balance` (boolean)
  - `remise_to_use` (number, DH)
- Items source:
  - `use_cart` (boolean, default `true`)
  - `items` (array) when `use_cart = false`

### Important validation rules (backend-enforced)

- If `delivery_method = "pickup"`, then **cash on delivery is rejected**:
  - `payment_method = "cash_on_delivery"` is not allowed for pickup.
- If `payment_method = "solde"`:
  - user must be authenticated
  - and `contacts.is_solde = 1`
- If `delivery_method = "pickup"`:
  - shipping fields can be omitted
  - backend loads the pickup location and auto-fills shipping columns in DB

---

## 1.2 How the checkout UI maps to the request (step-by-step)

Your UI is 3 steps. The backend only needs **one final POST** at the end, but it helps to think of the payload as being filled across steps:

### Step 1 — Livraison / Informations

Frontend collects:

- `customer_name` (often `prenom + nom`)
- `customer_email`
- `customer_phone`
- Delivery choice:
  - `delivery_method = "delivery"` or `"pickup"`

If `delivery_method = "delivery"`, collect shipping fields:

- `shipping_address_line1`
- `shipping_city`
- optional: `shipping_address_line2`, `shipping_state`, `shipping_postal_code`, `shipping_country`

If `delivery_method = "pickup"`:

- You can skip the shipping form entirely
- Fetch pickup locations from `GET /api/ecommerce/pickup-locations`
- Let user pick one (in our simplified setup there is only one)
- Send `pickup_location_id` (or omit it; backend defaults to `1`)

Recommended frontend behavior:

- Fetch pickup locations once at checkout load (or app boot)
- Cache them in state (Redux/query cache) for the session
- If API returns empty list, hide pickup option

Minimal UX option (since you have one boutique):

- Don’t show a dropdown.
- When user selects “Retrait en boutique”, set `pickup_location_id = 1`.
- Still keep the GET endpoint for future (if later you add more pickup points).

### Step 2 — Paiement / Méthode

Frontend collects:

- Remise usage (optional):
  - If “use remise” toggle is ON: send `use_remise_balance: true`
  - Optionally send `remise_to_use` (DH). If omitted, backend uses the maximum allowed by rules.
- `payment_method` choice:
  - For pickup, recommended default: `pay_in_store`
  - For solde users: allow `solde`
- Optional `customer_notes`
- Optional `promo_code`

### Step 3 — Confirmation

Frontend submits the final payload to `POST /api/ecommerce/orders`.

After success, backend returns `order.id` and `order.order_number`. Use those in the confirmation UI.

---

## 2) Key Business Rules Implemented

### 2.1 Remise rules (important)

- `products.remise_client` and `products.remise_artisan` are treated as **fixed DH per unit** (not a %).
- Remise is stored as a balance: `contacts.remise_balance`.

Two different moments exist:

1) **Remise used at checkout**
   - Customer can pay part/all of the order using their current balance.
   - The amount used is stored on the order: `ecommerce_orders.remise_used_amount`.

2) **Remise earned from an order**
   - Earned remise is credited to `contacts.remise_balance` **only when**:
     - `status = confirmed`
     - and `payment_status = paid`
   - This prevents earning remise for unpaid/solde orders until the money is actually collected.

### 2.2 Solde rules

Solde means: customer places an order now, and pays later.

- Only authenticated users with `contacts.is_solde = 1` can use `payment_method = solde`.
- Solde debt is **booked on admin confirmation**, not at checkout.
  - This matches the workflow: admin reviews and approves before committing the debt.

### 2.3 Pickup + payment compatibility

- Added `delivery_method` with values: `delivery` or `pickup`.
- Added `payment_method = pay_in_store` for “order now, pay at boutique”.
- Kept things simple and safe:
  - `delivery_method = pickup` **cannot** be combined with `payment_method = cash_on_delivery`.

---

## 3) Database Changes

### 3.1 Solde fields + ledger

Migration: `backend/migrations/2026-01-20-add-is-solde-to-contacts-and-solde-ledger.sql`

Adds:

- `contacts.is_solde` (0/1)
- `contact_solde_ledger` table
  - stores movements as `debit` / `credit`
  - enables accurate tracking of what the customer owes, per order and overall

### 3.2 Delivery method + pickup location

Migration: `backend/migrations/2026-01-21-add-delivery-method-and-pickup-location.sql`

Adds:

- Table `ecommerce_pickup_locations`
- Seeds **one** default location (minimal complexity)
- Columns on `ecommerce_orders`:
  - `delivery_method ENUM('delivery','pickup') DEFAULT 'delivery'`
  - `pickup_location_id INT NULL`

Recommended command (safe, applies only this migration):

- `npm run db:migrate:one -- 2026-01-21-add-delivery-method-and-pickup-location.sql`

---

## 4) Backend Changes (What was implemented)

Primary file:

- `backend/routes/ecommerce/orders.js`

### 4.1 Checkout (`POST /api/ecommerce/orders`)

Added/implemented:

- Validate `payment_method` against allowed set:
  - `cash_on_delivery`, `card`, `solde`, `pay_in_store`
- Validate `delivery_method`:
  - `delivery`, `pickup`
- Restrict solde usage:
  - requires authenticated user
  - requires `contacts.is_solde = 1`
- Pickup behavior:
  - shipping fields become optional
  - backend loads pickup location and **auto-fills shipping address columns** for the order
  - defaults to `pickup_location_id = 1` if not provided

### 4.2 Order history (`GET /api/ecommerce/orders`)

- Now includes:
  - `delivery_method`
  - `pickup_location_id`

### 4.3 Order details (`GET /api/ecommerce/orders/:id`)

- Now includes:
  - `delivery_method`
  - `pickup_location_id`
  - `pickup_location` object (name + address) when `delivery_method = pickup`

### 4.4 Admin status update (`PUT /api/ecommerce/orders/:id/status`)

Solde ledger integration:

- When a solde order transitions to `status = confirmed`, the system inserts a **ledger debit**:

  - `debit_amount = max(0, total_amount - remise_used_amount)`

- Insert is **idempotent** (won’t duplicate debit if called twice).

Remise earning rule (kept consistent):

- Earned remise is credited only when the order becomes `confirmed` and `payment_status = paid`.

### 4.5 Cancellation (`POST /api/ecommerce/orders/:id/cancel`)

- If the order used remise, the used amount is refunded to `contacts.remise_balance`.
- If the order is solde and a debit exists, a reversing **ledger credit** is inserted for the remaining debt.

---

## 5) API Payload Expectations (Frontend ↔ Backend)

### 5.1 Delivery order example

Send:

- customer fields: `customer_name`, `customer_email`, `customer_phone`
- shipping fields: `shipping_address_line1`, `shipping_city`, etc.
- `delivery_method = delivery`
- `payment_method` any allowed method

Example payload:

```json
{
  "customer_name": "Testing Github",
  "customer_email": "advancedgit@gmail.com",
  "customer_phone": "+2126233445623",
  "delivery_method": "delivery",
  "shipping_address_line1": "asdfasdf",
  "shipping_city": "Tangier",
  "shipping_postal_code": "200000",
  "payment_method": "cash_on_delivery",
  "use_cart": true,
  "use_remise_balance": true,
  "customer_notes": "Appelez-moi 30 min avant"
}
```

### 5.2 Pickup order example (recommended frontend)

Send:

- customer fields
- `delivery_method = pickup`
- `pickup_location_id = 1` (optional; backend defaults to 1)
- `payment_method = pay_in_store` (recommended) or `card` / `solde`

You can omit shipping fields; backend fills them using the pickup location.

Example payload:

```json
{
  "customer_name": "Testing Github",
  "customer_email": "advancedgit@gmail.com",
  "customer_phone": "+2126233445623",
  "delivery_method": "pickup",
  "pickup_location_id": 1,
  "payment_method": "pay_in_store",
  "use_cart": true
}
```

### 5.3 Guest checkout (no auth) using direct `items`

If the user is not logged in, the frontend must send `use_cart: false` and provide items.

```json
{
  "customer_name": "Guest Customer",
  "customer_email": "guest@example.com",
  "customer_phone": "+212600000000",
  "delivery_method": "delivery",
  "shipping_address_line1": "Rue ...",
  "shipping_city": "Casablanca",
  "payment_method": "card",
  "use_cart": false,
  "items": [
    { "product_id": 123, "variant_id": 456, "unit_id": 1, "quantity": 2 }
  ]
}
```

Notes:

- Guest cannot use `solde` (requires auth).
- Guest can still use promo codes.

---

## 6) How Solde Works End-to-End (Operational Workflow)

1) Customer places an order with:
   - `payment_method = solde`
   - `payment_status = pending`
   - `status = pending`

2) Admin reviews order

3) Admin confirms the order (`status = confirmed`)
   - System books debt by inserting a ledger `debit`
   - Nothing is earned yet (remise earning requires `paid`)

4) Later, when the customer pays (in boutique / by transfer / etc.)
   - Admin updates `payment_status = paid`
   - Since order is already confirmed, the system can credit earned remise (idempotently)

5) If order is cancelled
   - Remise used is refunded
   - Solde ledger debt is reversed via a `credit`

---

## 7) Notes / Recommended Next Improvements

- **Access control**: ensure `PUT /api/ecommerce/orders/:id/status` is restricted to admin/employee roles only (not any authenticated user).
- **Frontend pickup UX**:
  - Move the pickup toggle into step 1 (Livraison)
  - Hide shipping address form when pickup is chosen
  - In step 2, show `pay_in_store` as the default payment method for pickup

---

## 8) Related Docs

- `docs/ecommerce-delivery-method.md` (pickup UX + migration)
- Any existing solde/remise documentation in `docs/` (if present)
