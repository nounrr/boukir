# Ecommerce Promo Codes

This document describes the promo code flow and API.

## Table
- `ecommerce_promo_codes`: stores code metadata.
  - `code` (unique), `type` (`percentage`|`fixed`), `value`
  - Optional: `max_discount_amount`, `min_order_amount`, `max_redemptions`
  - `redeemed_count`, `active`, `start_date`, `end_date`

## Public Validation Endpoint
- POST `/api/ecommerce/promo/validate`
- Rate-limited and returns minimal info to prevent scraping.
- Request:
```json
{
  "code": "NEWYEAR25",
  "subtotal": 1434.70
}
```
- Response (success):
```json
{
  "valid": true,
  "message": "Code promo valide",
  "code_masked": "NEW***",
  "discount_type": "percentage",
  "discount_value": 25,
  "discount_amount": 358.68
}
```
- Response (error): `{ "valid": false, "message": "..." }`

## Checkout Usage
- Add `promo_code` to the checkout request body.
- Backend validates the code within the order transaction and stores:
  - `promo_code` and `promo_discount_amount` in `ecommerce_orders`.
  - Increments `redeemed_count` atomically on success.
- Cancellation decrements `redeemed_count` to free usage.

### Example Checkout Request (excerpt)
```json
{
  "customer_name": "John",
  "customer_email": "john@example.com",
  "shipping_address_line1": "123 Rue Exemple",
  "shipping_city": "Casablanca",
  "use_cart": true,
  "promo_code": "NEWYEAR25"
}
```

### Notes
- No public listing endpoint is provided; only direct code validation.
- Admin management endpoints can be added later (create/update/deactivate) behind authentication.
- Implementation: see `backend/routes/ecommerce/promo.js` and `backend/routes/ecommerce/orders.js`.
