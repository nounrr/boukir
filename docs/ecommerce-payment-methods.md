# Ecommerce Payment Methods

The checkout API accepts and persists the following payment methods via the `payment_method` field:

- `cash_on_delivery` — default if not provided
- `card`
- `bank_transfer`

## Usage in Checkout
- Endpoint: POST `/api/ecommerce/orders`
- Field: `payment_method` (optional; defaults to `cash_on_delivery`)
- New orders start with `status = "pending"` and `payment_status = "pending"`.

## Operational Flows

### Cash on Delivery (COD)
- Create order with `payment_method = "cash_on_delivery"`.
- When payment is received offline, the backoffice confirms via PUT `/api/ecommerce/orders/:id/status` with:
  - `status = "confirmed"` (or later `delivered`)
  - `payment_status = "paid"`

Example:
```bash
curl -X PUT \
  "/api/ecommerce/orders/123/status" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "confirmed",
    "payment_status": "paid",
    "admin_notes": "COD collected by courier"
  }'
```

### Bank Card
- Frontend initiates payment with the provider (gateway/bank).
- After successful authorization/capture, the provider should notify our backend via a secure server-to-server webhook.
- The webhook updates the order using the same status endpoint to set:
  - `payment_status = "paid"`
  - `status = "confirmed"`
- Avoid relying on the client to call the status update; use signed webhooks (HMAC/shared secret) and verify payloads.

Recommended webhook action (pseudo):
```json
{
  "order_id": 123,
  "transaction_id": "txn_abc123",
  "amount": 1434.70,
  "currency": "MAD",
  "event": "payment_succeeded"
}
```

### Bank Transfer
- Similar to COD: order remains `payment_status = "pending"` until backoffice confirms receipt, then update to `paid` via PUT status endpoint.

## Example Checkout Request
```json
{
  "customer_name": "John",
  "customer_email": "john@example.com",
  "customer_phone": "+212612345678",
  "shipping_address_line1": "123 Rue Exemple",
  "shipping_city": "Casablanca",
  "payment_method": "cash_on_delivery",
  "use_cart": true
}
```

## Notes
- All flows are implemented by the backend in `backend/routes/ecommerce/orders.js`.
- Use PUT `/api/ecommerce/orders/:id/status` to update `status` and/or `payment_status` from backoffice or webhook.