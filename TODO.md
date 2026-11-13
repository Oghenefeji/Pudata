# pudata delivery checklist

## Dashboard and navigation
- [x] Visitors land on the dashboard without signing in.
- [x] Existing black-and-white dashboard design is preserved.
- [x] Service icons use round tinted circles with bold dark phone, Wi-Fi, TV, lightning, and matching extra-service icons; labels remain bold.
- [x] Electricity remains Coming soon.

## Wallet funding
- [x] Wallet funding validates a minimum amount of ₦200.
- [x] Funding presets are ₦500, ₦1,000, ₦2,000, and ₦5,000, with a custom amount field.
- [x] Funding shows Amount + flat ₦20 fee = Total and charges the total in Flutterwave.
- [x] Wallet references remain `FUND_<logged-in-user-UUID>_<random>`; the frontend never credits the wallet and passes the wallet credit amount separately for managed server verification.

## Services
- [x] A service tile is active when at least one active catalogue product of that type exists. Data, TV, education, data-card, and recharge-card additionally require selling_price greater than zero; airtime and electricity do not because customers enter the amount.
- [x] Airtime supports network, phone number, and an amount from ₦50.
- [x] Data supports network, plan, and phone number.
- [x] Cable supports provider, smart-card number verification through verify-customer, and plan.
- [x] Education and data/recharge card pins support quantity 1–5 or 10.
- [x] Customer pages query selling prices only and never query product_costs.
- [x] Electricity is active when electricity products exist; customers choose distribution company and a Prepaid/Postpaid product, enter a meter number, verify it first, confirm the customer name, enter ₦500–₦100,000, and pay.
- [x] Electricity calls create-purchase with only `parameters.meter_number` and `parameters.amount`.
- [x] Successful electricity receipts render returned service details and copyable tokens; guests can retrieve them through guest-receipt using reference plus email.
- [x] Airtime and data detect MTN, Airtel, Glo, and 9mobile from the typed phone prefix, show the matching catalogue category logo inside the phone field, and allow a manual carrier override for ported numbers.
- [x] Airtime automatically selects the detected network's active VTU product; data shows only the detected network's plans.
- [x] Payment buttons lock after the first tap until the request responds, preventing duplicate submissions.
- [x] Receipts show success only for server status exactly `success`; pending payments show the do-not-pay-again message, use Supabase Realtime for logged-in users, and poll guest receipts every 10 seconds for up to 10 minutes.
- [x] Airtime and Data open as dedicated `/airtime` and `/data` pages with black-and-white layouts, back arrows, cross-links, titles, subtitles, logo-first phone rows, digit-only phone state, and catalogue-driven network logos with fallback initials.
- [x] Airtime uses ₦50, ₦100, ₦200, ₦500, ₦1,000, and ₦2,000 tiles plus a ₦50–₦50,000 custom amount; the chosen network uses its active VTU product when available, otherwise its first active product.
- [x] Data shows active selling-price plans for the selected network in a vertical price-sorted list, uses `metadata.valid_for`, and opens a wallet/guest confirmation bottom sheet with network, number, plan, validity, and price.
- [x] Customer Airtime/Data pages never query product costs; receipts and history show service, network, number, plan or amount, and reference.

## Profile and sessions
- [x] The profile page edits full name and phone number.
- [x] Profile pictures accept JPG, PNG, and WEBP files up to 2MB and upload to `avatars/{userId}/avatar.<ext>`.
- [x] Profile picture public URLs are saved to profiles.avatar_url and can be removed.
- [x] The header avatar and greeting use the profile data.
- [x] Log out is visible in More and in the admin header.

## Admin price management
- [x] Admin price management shows product name with service/network, Supplier (CheapDataHub for `cdh-` product IDs), admin-only Supplier cost from product_costs, selling price, profit, and Active toggle.
- [x] Selling prices support inline Save, search, service/network filtering, and pagination.
- [x] Zero or negative profit is shown in red.
- [x] Apply margin supports percentage or fixed ₦ amount for filtered products.
- [x] SYNC LIVE PRICES calls refresh-catalogue, reports services, categories, products, new products, problems, and error text, preserves selling prices, and refreshes cost/new-product data.
- [x] The frontend does not modify supabase/functions or store supplier credentials.
