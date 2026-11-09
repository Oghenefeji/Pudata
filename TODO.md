# pudata delivery checklist

## Dashboard and navigation
- [ ] Visitors land on the dashboard without signing in.
- [ ] Header includes pudata wordmark, menu control, and Login / Sign up when logged out.
- [ ] Logged-in users see wallet balance and Add funds; guests see a clear invitation to fund after signing in.
- [ ] Our Services is a three-column grid with the requested nine services, soft pastel tints, and real illustrations rather than plain icons.
- [ ] A tile is active only when matching PulseFlow catalogue data exists; otherwise it shows Coming soon.
- [ ] Bottom navigation exposes Home, Fund wallet, Help, and More.
- [ ] No prepaid meter token banner is shown.

## Guest and member purchase experience
- [ ] Guest purchase supports active airtime, data, TV, education-pin, and data/recharge-pin service paths with phone/card/email inputs as appropriate.
- [ ] Guest checkout is designed for Flutterwave card, transfer, and USSD, with server-side verification by status, amount, currency, and tx_ref before PulseFlow purchase.
- [ ] Webhook backup is idempotent and validates the Flutterwave secret hash.
- [ ] Receipt includes a transaction reference and pin results where applicable; guest lookup requires reference plus email.
- [ ] Member wallet funding and member purchases are represented as atomic server operations.
- [ ] Pending transactions are shown as Processing and are not automatically refunded or retried with a new reference.

## Catalogue and provider rules
- [ ] Services, categories, and products are cached in Supabase and exposed through an admin Refresh catalogue action.
- [ ] TV and electricity verification use the documented verification endpoint before payment.
- [ ] Electricity remains Coming soon until its product-specific purchase body is confirmed by the owner.
- [ ] Every purchase uses a unique client reference and server-held PulseFlow PIN.
- [ ] Clear PulseFlow failures are refund candidates; unclear/timeouts remain Pending.

## Admin and security
- [ ] Admin overview covers users, sales, profit, provider wallet balance when available, users, transactions, pricing, pending/failed operations, catalogue refresh, announcements, and WhatsApp support.
- [ ] Admin access is role-based through profiles.role or user_roles, not client-side flags.
- [ ] RLS applies to every table; users only read their own wallets and transactions.
- [ ] Guest receipt lookup goes through an Edge Function that checks reference plus email.
- [ ] Service role, provider API keys, transaction PIN, webhook secrets, and payment secrets remain in Edge Function secrets only.

## Handoff and operations
- [ ] Complete environment-variable and secret list is in `docs/ENVIRONMENT.md`.
- [ ] Fresh-project SQL with constraints, indexes, RLS, wallet functions, and signup profile trigger is in `docs/supabase-schema.sql`.
- [ ] Edge Functions, deploy commands, webhook URL, and redirect guidance are in `docs/EDGE_FUNCTIONS.md`.
- [ ] Test checklist covers guest airtime, wallet funding, data, TV verification, education pin, admin pricing, failed, and pending cases.
