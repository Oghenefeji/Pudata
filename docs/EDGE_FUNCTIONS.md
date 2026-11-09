# pudata Edge Functions and payment settings

The browser should call Supabase Edge Functions, not PulseFlow or Flutterwave secret endpoints directly. The function layer owns unique references, provider calls, idempotency, wallet debits, status transitions, and safe receipt shaping.

## Functions to deploy

| Function | Purpose | Auth boundary |
| --- | --- | --- |
| `refresh-catalogue` | Calls `GET /services`, then documented category endpoints, then the confirmed product endpoints. Upserts services/categories/products and records a sync timestamp. If the product path returns 404, stop and report it rather than guessing. | Admin JWT only. |
| `create-purchase` | Accepts a service/product and customer input. Validates the product and price from Supabase, creates a unique `client_reference`, verifies/creates the payment intent, atomically debits a member wallet or returns a Flutterwave checkout payload for a guest, then calls `POST /transactions/purchase/{product_id}` with the server-side PIN. | Member JWT for wallet purchases; guest mode uses a signed short-lived checkout intent. |
| `flutterwave-verify` | Verifies Flutterwave by transaction status, amount, currency, and tx_ref before marking the payment as usable. It must be idempotent on `tx_ref` and may trigger PulseFlow once only. | Called by the redirect client, but all trust decisions happen server-side. |
| `flutterwave-webhook` | Validates the `verif-hash` header against `FLW_SECRET_HASH`, re-verifies the transaction with `FLW_SECRET_KEY`, and completes any unhandled payment. A unique tx_ref prevents double fulfilment. | Public webhook endpoint with hash validation. |
| `verify-customer` | Calls the documented PulseFlow verification endpoint for TV and electricity. Show the returned customer name/status; do not fulfil from the browser. | Signed checkout intent or member JWT. |
| `guest-receipt` | Looks up a receipt only when both `reference` and the matching email are provided. Return a safe, redacted receipt and any pin payload required for the customer. | Public endpoint with strict reference + email match and rate limiting. |
| `recheck-transaction` | Reads the PulseFlow account ledger or provider status for an admin-selected pending transaction and applies a deliberate state transition. Never retries with a new reference. | Admin JWT only. |
| `admin-refund` | For a clearly failed PulseFlow result, issues a Flutterwave refund when the original payment is refundable and credits the member wallet only through the atomic SQL function. Never refunds pending automatically. | Admin JWT only. |

## Payment contract implemented by the frontend and functions

Wallet funding creates a Flutterwave `tx_ref` in exactly the form `FUND_<logged-in-user-UUID>_<random-string>`. After Flutterwave succeeds, the frontend calls `flutterwave-verify`; that function checks the authenticated UUID prefix, verifies the exact NGN amount server-side, calls the atomic `credit_wallet` SQL function with an idempotency key derived from the same `tx_ref`, and only then does the frontend refresh `wallets.balance`. The browser never increments the balance.

Guest checkout stores its pending payload before opening Flutterwave. After success it immediately calls `create-purchase` with the same `payment_tx_ref`. If the page closes, reopening the page offers retry with that same `tx_ref`; `create-purchase` returns the existing guest transaction instead of creating a duplicate. The PulseFlow parameter shapes are: airtime `{ phone_number, amount }`, data `{ phone_number }`, TV `{ smart_card_number }`, and education/data-card/recharge-card `{ quantity }`.

## Deploy commands

From a Supabase CLI project containing `supabase/functions`:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy refresh-catalogue --no-verify-jwt=false
supabase functions deploy create-purchase --no-verify-jwt=false
supabase functions deploy flutterwave-verify --no-verify-jwt=false
supabase functions deploy flutterwave-webhook --no-verify-jwt=true
supabase functions deploy verify-customer --no-verify-jwt=false
supabase functions deploy guest-receipt --no-verify-jwt=true
supabase functions deploy recheck-transaction --no-verify-jwt=false
supabase functions deploy admin-refund --no-verify-jwt=false
```

Set secrets before the first live run; the canonical list is in `docs/ENVIRONMENT.md`. Keep CORS limited to the pudata origin and return only customer-safe provider fields.

## Flutterwave dashboard settings

Webhook URL:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/flutterwave-webhook
```

Set the Flutterwave webhook secret hash to the same value as `FLW_SECRET_HASH`. The webhook function must compare the incoming `verif-hash` header in constant time before reading the payload.

Redirect URL:

```text
https://YOUR_PUBLISHED_PUDATA_DOMAIN/?payment=complete
```

For local preview, use the reachable preview origin only in Flutterwave test mode. The redirect page must treat query parameters as a hint and call `flutterwave-verify` with the tx_id/tx_ref; never mark a transaction successful from the URL alone.

Accepted currency should be `NGN`. The server must compare the expected amount with the verified Flutterwave amount and match the exact unique `tx_ref` before calling PulseFlow.

## Provider rules to keep in the implementation

PulseFlow requests use `Authorization: Bearer <PULSEFLOW_API_KEY>` and `Accept: application/json`. The base URL is `https://pulseflow.com.ng/api/v1` without a trailing slash. Call `GET /services` first and cache the catalogue. Every purchase body includes the server-only transaction PIN and a unique client reference. A clear `Success` is successful; `Pending` remains pending; a timeout or unclear response is also pending. Never retry a purchase with a new reference, and never auto-refund pending transactions.

For electricity, keep the UI marked Coming soon until the product details reveal the required purchase parameters and the account owner confirms a test purchase. Do not infer an electricity payload.
