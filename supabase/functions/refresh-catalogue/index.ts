import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const env = (key: string) => Deno.env.get(key) ?? "";

async function pulse(path: string, init: RequestInit = {}) {
  const base = (env("PULSEFLOW_BASE_URL") || "https://pulseflow.com.ng/api/v1").replace(/\/+$/, "");
  return fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: { Authorization: `Bearer ${env("PULSEFLOW_API_KEY")}`, Accept: "application/json", "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing authorization");
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data } = await admin.auth.getUser(token);
  if (!data.user) throw new Error("Invalid session");
  const { data: profile } = await admin.from("profiles").select("role,suspended").eq("id", data.user.id).single();
  if (!profile || profile.suspended || !["admin", "support"].includes(profile.role)) throw new Error("Admin access required");
  return admin;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = await requireAdmin(req);
    const servicesResponse = await pulse("/services");
    const servicesPayload = await servicesResponse.json();
    if (!servicesResponse.ok) return json({ error: "PulseFlow services request failed", provider_status: servicesResponse.status }, 502);
    const services = Array.isArray(servicesPayload) ? servicesPayload : (servicesPayload.data || servicesPayload.services || []);
    let categoriesCount = 0;
    let productsCount = 0;

    for (const service of services) {
      const serviceId = String(service.id);
      await db.from("catalogue_services").upsert({ id: serviceId, name: service.name || service.title || serviceId, description: service.desc || service.description || null, active: true, synced_at: new Date().toISOString() });
      const categoryResponse = await pulse(`/services/${encodeURIComponent(serviceId)}/categories`);
      if (!categoryResponse.ok) return json({ error: "PulseFlow category request failed", service_id: serviceId, provider_status: categoryResponse.status }, 502);
      const categoryPayload = await categoryResponse.json();
      const categories = Array.isArray(categoryPayload) ? categoryPayload : (categoryPayload.data || categoryPayload.categories || []);
      for (const category of categories) {
        const categoryId = String(category.id);
        categoriesCount++;
        await db.from("catalogue_categories").upsert({ id: categoryId, service_id: serviceId, name: category.name || categoryId, description: category.desc || category.description || null, discount_based: Boolean(category.discount_based), logo: category.logo || null, active: true, synced_at: new Date().toISOString() });
        // This is the single documented candidate path. A 404 is surfaced; no fallback path is guessed.
        const productResponse = await pulse(`/services/${encodeURIComponent(serviceId)}/categories/${encodeURIComponent(categoryId)}/products`);
        if (productResponse.status === 404) return json({ error: "PulseFlow product endpoint returned 404. No alternate path was guessed.", service_id: serviceId, category_id: categoryId, attempted_path: `/services/${serviceId}/categories/${categoryId}/products` }, 502);
        if (!productResponse.ok) return json({ error: "PulseFlow product request failed", service_id: serviceId, category_id: categoryId, provider_status: productResponse.status }, 502);
        const productPayload = await productResponse.json();
        const products = Array.isArray(productPayload) ? productPayload : (productPayload.data || productPayload.products || []);
        for (const product of products) {
          productsCount++;
          const cost = Number(product.amount ?? product.price ?? product.cost ?? 0);
          const { data: existingRule } = await db.from("pricing_rules").select("margin_type,margin_value").eq("product_id", String(product.id)).eq("active", true).maybeSingle();
          const selling = existingRule ? (existingRule.margin_type === "percentage" ? cost * (1 + Number(existingRule.margin_value) / 100) : cost + Number(existingRule.margin_value)) : cost;
          await db.from("catalogue_products").upsert({ id: String(product.id), service_id: serviceId, category_id: categoryId, name: product.name || product.title || String(product.id), description: product.desc || product.description || null, product_type: product.product_type || product.type || "other", pulseflow_cost: cost, selling_price: Math.round(selling * 100) / 100, metadata: product, active: true, synced_at: new Date().toISOString() });
        }
      }
    }
    return json({ ok: true, services: services.length, categories: categoriesCount, products: productsCount, synced_at: new Date().toISOString() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 401);
  }
});
