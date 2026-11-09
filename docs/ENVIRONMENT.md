# pudata environment variables and secrets

This guide contains names and locations only. No real secret values are included.

## 1. Frontend variables — public/safe

These values may be included in the browser bundle because Supabase Row Level Security must protect all database access. They are not passwords.

| Name | What it is | Exact value/source | Where to add it in Manus |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | The Supabase project URL used by the frontend. | Copy **Project URL** from Supabase Dashboard → **Project Settings → API**. It normally looks like `https://YOUR_PROJECT_REF.supabase.co`. | Manus project Dashboard → **Environment / Variables** → add as a frontend/build variable for the environment you use. |
| `VITE_SUPABASE_ANON_KEY` | The browser-safe Supabase anon/public key. | Copy ** anon public** from Supabase Dashboard → **Project Settings → API**. | Manus project Dashboard → **Environment / Variables** → add as a frontend/build variable. |
| `VITE_FLUTTERWAVE_PUBLIC_KEY` | Flutterwave public key used to open checkout. | Flutterwave Dashboard → **Settings → API** → Public key. | Manus project Dashboard → **Environment / Variables** → add as a frontend/build variable. |
| `VITE_APP_URL` | Public pudata origin used for redirect/receipt links. | Your published pudata URL or connected custom domain. | Manus project Dashboard → **Environment / Variables** → add as a frontend/build variable. |
| `VITE_SUPPORT_WHATSAPP_URL` | Public click-to-chat support URL. | Your WhatsApp Business click-to-chat URL, for example `https://wa.me/234...`. | Manus project Dashboard → **Environment / Variables** → add as a frontend/build variable. |

### The exact two Supabase values the frontend needs

Use these exact variable names:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_KEY
```

Do not use the Supabase `service_role` key in either variable. The URL is the **Project URL**, not the dashboard URL. The key is the **anon public** key, not the service-role key.

## 2. Supabase Edge Function secrets — private/server-only

Add these as Supabase Edge Function secrets. They must never be placed in `public/`, a `VITE_` variable, browser code, a screenshot, or a client response.

| Name | What it is | Where to get it |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase project URL available to functions. | Supabase Dashboard → Project Settings → API → Project URL. |
| `SUPABASE_ANON_KEY` | Anon key used when a function needs to create a user-scoped client. | Supabase Dashboard → Project Settings → API → anon public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server key used only by trusted functions. | Supabase Dashboard → Project Settings → API → service_role key. Never expose it. |
| `PULSEFLOW_BASE_URL` | PulseFlow base URL, without a trailing slash. | Use exactly `https://pulseflow.com.ng/api/v1`. |
| `PULSEFLOW_API_KEY` | PulseFlow bearer token/customer API key. | PulseFlow Affiliate API account credentials. |
| `PULSEFLOW_SECRET_KEY` | Optional PulseFlow account secret. Current documented requests do not use it. | PulseFlow account. Store only if supplied; do not send it unless PulseFlow documents a use. |
| `PULSEFLOW_TRANSACTION_PIN` | PulseFlow transaction PIN sent in purchase bodies. | PulseFlow account owner. |
| `FLW_SECRET_KEY` | Flutterwave server secret for verification/refunds. | Flutterwave Dashboard → Settings → API → Secret key. |
| `FLW_SECRET_HASH` | Flutterwave webhook hash used to verify `verif-hash`. | Flutterwave Dashboard → Settings → Webhooks → Secret hash. |
| `FLW_PUBLIC_KEY` | Optional server-side copy of the Flutterwave public key. | Flutterwave Dashboard → Settings → API → Public key. |
| `PUDATA_APP_URL` | Canonical published pudata URL. | Your published pudata URL or connected custom domain. |
| `PUDATA_ADMIN_EMAIL` | Optional owner/admin notification email. | Your chosen admin email address. |

## Where to add secrets

For the Edge Functions, add the private names in Supabase Dashboard → **Project Settings → Edge Functions → Secrets** (the dashboard may label this **Secrets** under Edge Functions). Paste only the name and your real value there. Do not paste private values into the Manus chat or into frontend environment variables.

For Manus, add only the frontend-safe `VITE_...` values in the pudata project’s **Environment / Variables** panel. If Manus shows separate Development and Production scopes, add the appropriate values to both scopes. After changing frontend build variables, restart/rebuild Preview so the Vite-prefixed values are embedded in the frontend build.

## Flutterwave URLs

Webhook:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/flutterwave-webhook
```

Redirect:

```text
https://YOUR_PUBLISHED_PUDATA_DOMAIN/?payment=complete
```

The redirect is not trusted by itself. The frontend must call `flutterwave-verify`, and that function must verify the transaction server-side.
