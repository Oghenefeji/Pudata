# pudata Edge Functions — phone setup

The folder `docs/edge-functions/` contains one complete TypeScript file per function. Each file includes its own imports, CORS handling, environment-variable reads, and `Deno.serve` entry point. You can paste each file into the Supabase Dashboard without using the CLI.

## Before pasting

1. Run `docs/supabase-schema.sql` once in Supabase Dashboard → **SQL Editor**.
2. Add the private values from `docs/ENVIRONMENT.md` in Supabase Dashboard → **Project Settings → Edge Functions → Secrets**.
3. In Supabase Dashboard, open **Edge Functions** and choose **Create a new function**.
4. Name the function exactly as the filename without `.ts`.
5. Open the function editor, replace the starter code with the matching file contents, and choose **Deploy**.
6. Repeat for all eight files.

## Function/file mapping

| Dashboard function name | Paste this file |
| --- | --- |
| `refresh-catalogue` | `docs/edge-functions/refresh-catalogue.ts` |
| `create-purchase` | `docs/edge-functions/create-purchase.ts` |
| `flutterwave-verify` | `docs/edge-functions/flutterwave-verify.ts` |
| `flutterwave-webhook` | `docs/edge-functions/flutterwave-webhook.ts` |
| `verify-customer` | `docs/edge-functions/verify-customer.ts` |
| `guest-receipt` | `docs/edge-functions/guest-receipt.ts` |
| `recheck-transaction` | `docs/edge-functions/recheck-transaction.ts` |
| `admin-refund` | `docs/edge-functions/admin-refund.ts` |

## JWT settings

Keep JWT verification enabled for `refresh-catalogue`, `create-purchase`, `flutterwave-verify`, `verify-customer`, `recheck-transaction`, and `admin-refund`. The code performs an additional role check for admin operations.

For `flutterwave-webhook` and `guest-receipt`, the dashboard may require public invocation because Flutterwave and guests do not have a Supabase login token. If you disable JWT verification for either function, keep the code’s own protection: `flutterwave-webhook` requires the `verif-hash` header, and `guest-receipt` requires both the exact reference and matching email. Add rate limiting in front of the guest endpoint before production traffic.

## Important provider note

`refresh-catalogue` calls the single candidate product path `/services/{service_id}/categories/{category_id}/products`. If PulseFlow returns 404, the function stops and returns the attempted path; it does not silently try another undocumented path. Confirm the exact product endpoint with PulseFlow before changing it.

`create-purchase` sends the transaction PIN only from the Edge Function secret and always creates a new unique client reference for a new purchase. Do not call it a second time for an unclear result. Use `recheck-transaction` with the original reference instead.

## Safe test order

Test in Flutterwave/PulseFlow test mode first: deploy and invoke `flutterwave-verify`, then `guest-receipt` with a known test record, then a small airtime purchase. Test pending and failure handling before enabling live checkout. Do not paste secret values into the function source editor; use Edge Function Secrets instead.
