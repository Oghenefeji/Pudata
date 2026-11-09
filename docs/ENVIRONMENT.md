# pudata environment variables and secrets

This project deliberately keeps provider credentials out of browser code. The browser may know the Supabase project URL, the Supabase anon key, the public Flutterwave key, and the public app URL. PulseFlow credentials, the transaction PIN, the Flutterwave secret material, and the Supabase service-role key belong only in Supabase Edge Function secrets.

## Frontend-safe variables

| Name | What it is | Where to get it |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public URL for the Supabase project used by the browser client. | Supabase Dashboard → Project Settings → API → Project URL. |
| `VITE_SUPABASE_ANON_KEY` | Browser-safe Supabase anon/public key. RLS must remain enabled. | Supabase Dashboard → Project Settings → API → anon public key. |
| `VITE_FLUTTERWAVE_PUBLIC_KEY` | Flutterwave public key used to open checkout. It cannot authorize fulfilment. | Flutterwave Dashboard → Settings → API. Use the live or test public key that matches the environment. |
| `VITE_APP_URL` | Public pudata origin, used to build redirect URLs and receipt links. | The published pudata URL or the custom domain you connect. |
| `VITE_SUPPORT_WHATSAPP_URL` | Public WhatsApp support link, for example `https://wa.me/2348000000000`. | Create or obtain the business WhatsApp click-to-chat link. |

Do not place `PULSEFLOW_API_KEY`, `PULSEFLOW_TRANSACTION_PIN`, `FLW_SECRET_KEY`, `FLW_SECRET_HASH`, or `SUPABASE_SERVICE_ROLE_KEY` in any `VITE_` variable.

## Supabase Edge Function secrets

| Name | What it is | Where to get it |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase project URL available to Edge Functions. | Supabase Dashboard → Project Settings → API → Project URL. |
| `SUPABASE_ANON_KEY` | Supabase anon key for user-token validation when a function needs it. | Supabase Dashboard → Project Settings → API → anon public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used by trusted functions to write provider results and run privileged operations. | Supabase Dashboard → Project Settings → API → service_role key. Never return it or log it. |
| `PULSEFLOW_BASE_URL` | PulseFlow API base URL. Set exactly to `https://pulseflow.com.ng/api/v1` with no trailing slash. | PulseFlow Affiliate API documentation/account. |
| `PULSEFLOW_API_KEY` | PulseFlow bearer token named `customer_api_key` in the docs. | PulseFlow account/API credentials. |
| `PULSEFLOW_SECRET_KEY` | Optional PulseFlow account secret. The captured docs do not use it. Store only if provided, but do not send it unless PulseFlow later documents a use. | PulseFlow account. |
| `PULSEFLOW_TRANSACTION_PIN` | Transaction PIN sent only in the purchase body. | The PulseFlow account owner. |
| `FLW_SECRET_KEY` | Flutterwave server secret used to verify transactions and optionally issue refunds. | Flutterwave Dashboard → Settings → API → Secret Key. |
| `FLW_SECRET_HASH` | Webhook secret hash used to validate the `verif-hash` header. | Flutterwave Dashboard → Settings → Webhooks → Secret hash. |
| `FLW_PUBLIC_KEY` | Server-side copy of the Flutterwave public key for receipt/config checks when needed. | Flutterwave Dashboard → Settings → API. The browser should use the Vite copy only. |
| `PUDATA_APP_URL` | Canonical public site URL for redirect and receipt links. | The published pudata URL or custom domain. |
| `PUDATA_ADMIN_EMAIL` | Optional owner email used by an admin setup script or notification path. | The account owner; keep it out of client code. |

## Example setup commands

From the Supabase project directory, set secrets with the Supabase CLI. Replace values locally; never commit the resulting `.env` file:

```bash
supabase secrets set \
  SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co" \
  SUPABASE_ANON_KEY="YOUR_ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
  PULSEFLOW_BASE_URL="https://pulseflow.com.ng/api/v1" \
  PULSEFLOW_API_KEY="YOUR_PULSEFLOW_API_KEY" \
  PULSEFLOW_TRANSACTION_PIN="YOUR_PULSEFLOW_TRANSACTION_PIN" \
  FLW_SECRET_KEY="FLWSECK_TEST-..." \
  FLW_SECRET_HASH="YOUR_WEBHOOK_SECRET_HASH" \
  PUDATA_APP_URL="https://YOUR_PUBLISHED_PUDATA_DOMAIN"
```

For test mode, use test Flutterwave credentials and a test PulseFlow account/catalogue if PulseFlow provides one. Keep test and production projects/secrets separate.
