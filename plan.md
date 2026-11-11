# pudata implementation plan

## Scope
Build a mobile-first Nigerian VTU storefront called **pudata**. The application uses live Supabase data, Supabase Edge Functions, Flutterwave, and PulseFlow. It supports guest purchases, live wallet/history data, role-gated administration, clear service availability, and legal/support pages without exposing credentials.

## Implementation approach
- Use a static Vite web app; no production Node server is required.
- Keep all PulseFlow and Flutterwave operations behind server-side Edge Functions in `supabase/functions/` and `docs/EDGE_FUNCTIONS.md`.
- Read profiles, wallets, transactions, catalogue, pricing, announcements, and support settings from Supabase.
- Keep route declarations in `public/manus-routes.json` for `/`, `/admin`, `/terms`, and `/privacy`.
- Keep the fresh-project schema in `supabase/supabase-schema.sql` and the paste-ready function sources in `docs/edge-functions/`.

## Design direction
### Chosen style: Monochrome Utility
- **Design Movement:** contemporary fintech utility design with editorial spacing and tactile rounded surfaces.
- **Core Principles:** make the next action obvious; use neutral contrast for hierarchy; show trust through legible transaction detail; keep the experience thumb-friendly.
- **Color Philosophy:** pure white, black, and neutral greys keep the financial interface quiet and accessible. Dark cards provide focus without decorative colour.
- **Layout Paradigm:** a mobile-first dashboard with a date/greeting header, wallet focus card, service grid, live history, and floating bottom navigation.
- **Signature Elements:** circular service icons, black wallet card, and transaction reference chips.
- **Interaction Philosophy:** every tap either starts a service, reveals a clear next step, or explains why a service is unavailable. Modal flows show the exact customer input required.
- **Animation:** use short ease-out rises for cards and drawers; avoid decorative looping animation that competes with payment tasks.
- **Typography System:** use `Manrope` for display and `DM Sans` for body/UI copy, with clear numeric balances and references.
- **Brand Essence:** a dependable everyday payment rail for Nigeria—clear, capable, and human.
- **Brand Voice:** direct and reassuring. Example lines: “Welcome to pudata.” and “Your payment is moving safely.”
- **Wordmark & Logo:** a lowercase wordmark with a compact black mark and rounded corner notch.
- **Signature Brand Color:** `#111111`, a high-contrast black that makes the wallet and primary actions unmistakable.

## Project structure
- `index.html`: dashboard shell, route containers, footer, navigation, and accessible landmarks.
- `public/styles.css`: monochrome responsive visual system, mobile bottom nav, cards, drawers, and modal states.
- `src/app.js`: live Supabase session, catalogue, wallet, transaction, guest checkout, legal pages, help, and role-gated admin views.
- `public/manus-routes.json`: route manifest for dashboard, admin, terms, and privacy.
- `vercel.json`: static SPA rewrite for direct route refreshes.
- `supabase/functions/`: eight deployable Edge Functions.
- `supabase/supabase-schema.sql`: tables, RLS, triggers, and atomic wallet functions.
- `docs/`: handoff, environment, policy, and acceptance documentation.

## Delivery shape
Build with `npm run build` and publish `dist/`. The frontend references only browser-safe Vite variables; private provider credentials remain in Supabase Edge Function Secrets.
