import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const env = (key: string) => Deno.env.get(key) ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { service_id, category_id, id_number, product_id, amount } = await req.json();
    if (!service_id || !category_id || !id_number || !product_id) return json({ error: "service_id, category_id, id_number and product_id are required" }, 400);
    const base = (env("PULSEFLOW_BASE_URL") || "https://pulseflow.com.ng/api/v1").replace(/\/+$/, "");
    const path = `/services/${encodeURIComponent(service_id)}/categories/${encodeURIComponent(category_id)}/verify/${encodeURIComponent(id_number)}?product_id=${encodeURIComponent(product_id)}&amount=${encodeURIComponent(amount || "")}`;
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${env("PULSEFLOW_API_KEY")}`, Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: "Customer verification failed", provider_status: response.status }, 502);
    const details = payload?.data || payload;
    return json({ verified: true, customer_name: details.customer_name || details.name || null, subscription_status: details.subscription_status || null, current_plan: details.current_plan || null, details });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500); }
});
