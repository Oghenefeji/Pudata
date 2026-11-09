# pudata implementation plan

## Scope
Build a mobile-first Nigerian VTU storefront called **pudata**. The first deliverable is a polished, functional front-end prototype backed by clear Supabase/Flutterwave/PulseFlow integration seams and complete handoff docs. The UI must make guest purchase possible, communicate active vs coming-soon services, and make the wallet/admin architecture obvious without exposing credentials.

## Implementation approach
- Use a dependency-light static web app served by a tiny Node HTTP server so Preview works immediately and the UI can be published as a static build later.
- Keep browser code provider-agnostic: all real PulseFlow and Flutterwave operations are described as server-side Edge Function calls in `docs/EDGE_FUNCTIONS.md`; demo mode uses local sample catalogue and receipt states.
- Keep Supabase schema and security rules in one fresh-project SQL script under `docs/supabase-schema.sql`.
- Use inline SVG illustrations for service tiles, avoiding plain icon-only cards while keeping the app fast, crisp, and self-contained.
- Keep route declarations in `public/manus-routes.json`; the main route is `/` and all panels are app states rather than fake separate pages.

## Design direction

### Considered styles
- **Lemon Ledger** (0.07): bright finance utility with soft yellow surfaces and precise card hierarchy.
- **Lagos Utility Studio** (0.05): warm civic-tech energy with bold typography and compact mobile navigation.
- **Quiet Commerce** (0.03): calm editorial utility with off-white space and restrained accent color.

### Chosen style: Lemon Ledger

- **Design Movement:** contemporary fintech utility design with editorial spacing and tactile rounded surfaces.
- **Core Principles:** make the next action obvious; use lemon sparingly as a signal; show trust through legible transaction detail; keep the experience thumb-friendly.
- **Color Philosophy:** white and warm ink do the heavy lifting, while lemon marks action, success, and focus. Soft butter tints separate service categories without making the page feel childish.
- **Layout Paradigm:** a left-aligned editorial dashboard with a wide balance rail, asymmetric service mosaic, and a persistent bottom action bar on small screens.
- **Signature Elements:** lemon corner tabs, miniature illustrated utility scenes, and transaction reference chips.
- **Interaction Philosophy:** every tap either starts a service, reveals a clear next step, or explains why a service is unavailable. Modal flows stay short and show the exact customer input required.
- **Animation:** use short 160–220ms ease-out rises for cards and drawers; pulse the active status dot once on load; avoid decorative looping animation that competes with payment tasks.
- **Typography System:** use `Manrope` for display and `DM Sans` for body/UI copy, with generous numeric tracking for balances and references.
- **Brand Essence:** a dependable everyday payment rail for Nigeria—fast, clear, and human. Personality: grounded, bright, capable.
- **Brand Voice:** direct and reassuring. Example lines: “Power the next thing.” and “Your payment is moving safely.”
- **Wordmark & Logo:** a lowercase wordmark with a small lemon “u” underline and a square corner notch; the mark is recreated in CSS/SVG so it stays crisp at any size.
- **Signature Brand Color:** `#F4E85B`, a warm lemon yellow that reads as optimistic without overpowering the mostly-white interface.

## Project structure
- `public/index.html`: dashboard shell, modals, service tile markup, and accessible landmarks.
- `public/styles.css`: responsive visual system, mobile bottom nav, cards, drawers, modal states, illustrations.
- `public/app.js`: demo catalogue state, navigation, purchase/funding interactions, receipt state, and integration placeholders.
- `public/manus-routes.json`: route manifest for Preview/publication.
- `server.mjs`: no-dependency local server with SPA/static fallback and health route.
- `docs/supabase-schema.sql`: fresh-project database schema, RLS, wallet functions, triggers, and admin setup.
- `docs/EDGE_FUNCTIONS.md`: secure function boundaries, deploy commands, webhook/redirect settings.
- `docs/ENVIRONMENT.md`: complete safe/public and server-only variable list.
- `docs/TEST_CHECKLIST.md`: end-to-end acceptance checklist for guest, wallet, catalogue, admin, pending, and failed cases.

## Delivery shape
Preview should run with `npm start` on port 3000. The front-end uses demo data until Supabase and provider secrets are entered. Once connected, replace the `demoApi` methods in `public/app.js` with calls to the listed Supabase Edge Functions; no provider key should ever be added to browser code.
