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
- [x] A service tile is active only when at least one active catalogue product of that type has selling_price greater than zero; otherwise it shows Coming soon.
- [x] Airtime supports network, phone number, and an amount from ₦50.
- [x] Data supports network, plan, and phone number.
- [x] Cable supports provider, smart-card number verification through verify-customer, and plan.
- [x] Education and data/recharge card pins support quantity 1–5 or 10.
- [x] Customer pages query selling prices only and never query product_costs.
- [x] Electricity is active when electricity products exist; customers choose distribution company and a Prepaid/Postpaid product, enter a meter number, verify it first, confirm the customer name, enter ₦500–₦100,000, and pay.
- [x] Electricity calls create-purchase with only `parameters.meter_number` and `parameters.amount`.
- [x] Successful electricity receipts render returned service details and copyable tokens; guests can retrieve them through guest-receipt using reference plus email.

## Profile and sessions
- [x] The profile page edits full name and phone number.
- [x] Profile pictures accept JPG, PNG, and WEBP files up to 2MB and upload to `avatars/{userId}/avatar.<ext>`.
- [x] Profile picture public URLs are saved to profiles.avatar_url and can be removed.
- [x] The header avatar and greeting use the profile data.
- [x] Log out is visible in More and in the admin header.

## Admin price management
- [x] Admin price management shows product name with service/network, admin-only PulseFlow cost from product_costs, selling price, profit, and Active toggle.
- [x] Selling prices support inline Save, search, service/network filtering, and pagination.
- [x] Zero or negative profit is shown in red.
- [x] Apply margin supports percentage or fixed ₦ amount for filtered products.
- [x] SYNC PULSEFLOW PRICES calls refresh-catalogue, reports result/error text, preserves selling prices, and refreshes cost/new-product data.
- [x] The frontend does not modify supabase/functions or store PulseFlow credentials.
