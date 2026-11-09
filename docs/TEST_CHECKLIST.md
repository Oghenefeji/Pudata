# pudata test checklist

Run these tests in a dedicated Supabase/Flutterwave test project. Do not delete shared production data while testing.

## Guest airtime purchase

1. Open the dashboard while logged out and confirm the service grid is visible without a login gate.
2. Open Buy Airtime, choose a network, enter a valid phone number, enter an email, and confirm an amount below ₦50 is rejected.
3. Start Flutterwave checkout with card, transfer, and USSD test methods.
4. Confirm the server verifies status, amount, currency, and exact unique `tx_ref` before calling PulseFlow.
5. Confirm a clear PulseFlow success shows a receipt with client reference and PulseFlow reference.
6. Use reference + email in guest receipt lookup and confirm the receipt is returned without exposing secrets.

## Wallet funding

1. Create an email/password account and confirm the signup trigger creates a profile and wallet.
2. Start funding with a known amount and confirm the server verifies the Flutterwave payment before crediting the wallet.
3. Replay the same webhook and confirm the unique `tx_ref` makes the credit idempotent.
4. Confirm the wallet ledger records the payment and the balance never goes negative.

## Data purchase

1. Refresh the catalogue and confirm services, categories, and products are cached.
2. Pick a data product and confirm the selling price uses the product cost plus the configured margin.
3. Confirm the wallet debit and transaction creation occur atomically before PulseFlow is called.
4. Confirm a successful purchase stores PulseFlow id/ref/status and appears in member history.

## TV verification

1. Choose DSTV or GOtv and enter a valid smart card number.
2. Confirm `verify-customer` calls PulseFlow and returns the customer name and subscription details.
3. Confirm the customer name is shown for confirmation before payment.
4. Complete a test payment and confirm the purchase body uses `smart_card_number` and the same reference.

## Education pin

1. Choose WAEC or NECO and quantities 1–5 or 10.
2. Confirm quantities 6–9 are not offered by default.
3. Complete a successful purchase and confirm `data.details.pins` is stored securely and shown on the receipt.

## Admin pricing and catalogue

1. Confirm a non-admin cannot open or call admin operations.
2. As admin, change a product/category/service margin from percentage to fixed and refresh the catalogue.
3. Confirm new selling prices are recalculated while historical transaction amounts remain unchanged.
4. Confirm the admin can see users, sales, profit, PulseFlow refs, and pending/failed filters.

## Failure and pending cases

1. Simulate a clear PulseFlow failure after a verified guest payment. Confirm the transaction is marked failed and becomes a refund candidate; do not claim success.
2. Simulate a timeout or PulseFlow `Pending`. Confirm the transaction stays pending, the customer sees Processing, and no new PulseFlow purchase is sent.
3. Confirm an admin can Re-check using the original reference and then Mark success or Mark failed + refund after checking provider evidence.
4. Confirm no pending transaction is auto-refunded.
