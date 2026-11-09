import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const env = (key: string) => Deno.env.get(key) ?? "";
const db = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
const ref = () => `PUD-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

async function pulse(path: string, init: RequestInit = {}) {
  const base = (env("PULSEFLOW_BASE_URL") || "https://pulseflow.com.ng/api/v1").replace(/\/+$/, "");
  return fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, { ...init, headers: { Authorization: `Bearer ${env("PULSEFLOW_API_KEY")}`, Accept: "application/json", "Content-Type": "application/json", ...(init.headers || {}) } });
}
async function userFrom(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await client.auth.getUser();
  return data.user || null;
}
async function verifyFlutterwave(txRef: string, expected: number) {
  const response = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, { headers: { Authorization: `Bearer ${env("FLW_SECRET_KEY")}`, Accept: "application/json" } });
  const payload = await response.json();
  const item = payload?.data;
  const ok = response.ok && payload?.status === "success" && item?.status === "successful" && item?.currency === "NGN" && Number(item?.amount) >= expected && item?.tx_ref === txRef;
  return { ok, payload };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const input = await req.json();
    const productId = String(input.product_id || "");
    const parameters = input.parameters || {};
    const paymentTxRef = input.payment_tx_ref ? String(input.payment_tx_ref) : "";
    const user = await userFrom(req);
    const admin = db();
    const { data: product } = await admin.from("catalogue_products").select("*").eq("id", productId).eq("active", true).single();
    if (!product) return json({ error: "Product is not available" }, 400);
    const amount = Number(product.selling_price);
    if (!Number.isFinite(amount) || amount < 0) return json({ error: "Invalid product price" }, 400);
    const type = String(product.product_type);
    if (type === "airtime" && (!parameters.phone_number || Number(parameters.amount) < 50)) return json({ error: "Airtime requires parameters.phone_number and parameters.amount >= 50" }, 400);
    if (type === "data" && !parameters.phone_number) return json({ error: "Data requires parameters.phone_number" }, 400);
    if (type === "tv" && !parameters.smart_card_number) return json({ error: "TV requires parameters.smart_card_number" }, 400);
    if (["education", "data_card", "recharge_card"].includes(type) && (![1, 2, 3, 4, 5, 10].includes(Number(parameters.quantity)))) return json({ error: "Pin products require parameters.quantity of 1-5 or 10" }, 400);
    if (!user && !paymentTxRef) return json({ error: "Guest checkout requires a verified Flutterwave tx_ref" }, 400);
    if (!user && paymentTxRef) {
      const verified = await verifyFlutterwave(paymentTxRef, amount);
      if (!verified.ok) return json({ error: "Flutterwave payment could not be verified" }, 402);
      const { data: existing } = await admin.from("transactions").select("id,client_reference,status,pulseflow_ref,amount,pin_payload").eq("payment_tx_ref", paymentTxRef).eq("guest_email", String(input.email || "").trim().toLowerCase()).maybeSingle();
      if (existing) return json({ ok: existing.status !== "failed", status: existing.status, reference: existing.client_reference, pulseflow_ref: existing.pulseflow_ref, amount: existing.amount, details: existing.pin_payload ? { pins: existing.pin_payload } : undefined }, existing.status === "success" ? 200 : 202);
    }
    const clientReference = ref();
    const { data: transaction, error: insertError } = await admin.from("transactions").insert({ user_id: user?.id || null, guest_email: user ? null : String(input.email || "").trim().toLowerCase(), client_reference: clientReference, payment_tx_ref: paymentTxRef || null, product_id: product.id, service_type: product.product_type, status: "pending", amount, cost_amount: product.pulseflow_cost, margin_amount: amount - Number(product.pulseflow_cost), currency: "NGN", payment_provider: user ? "wallet" : "flutterwave", customer_phone: parameters.phone_number || null, customer_identifier: parameters.smart_card_number || parameters.meter_number || null, request_payload: { product_id: product.id, parameters } }).select("id").single();
    if (insertError) throw insertError;
    if (user) await admin.rpc("debit_wallet", { p_user_id: user.id, p_amount: amount, p_note: `Purchase ${clientReference}`, p_idempotency_key: `debit:${clientReference}`, p_transaction_id: transaction.id });
    const providerBody = { pin: env("PULSEFLOW_TRANSACTION_PIN"), parameters: { ...parameters, reference: clientReference } };
    const providerResponse = await pulse(`/transactions/purchase/${encodeURIComponent(product.id)}`, { method: "POST", body: JSON.stringify(providerBody) });
    const providerPayload = await providerResponse.json().catch(() => ({}));
    const providerStatus = String(providerPayload?.status || providerPayload?.data?.status || "").toLowerCase();
    const pending = providerResponse.status === 202 || providerStatus === "pending" || !providerResponse.ok && providerResponse.status >= 500;
    const success = providerResponse.status === 201 && providerStatus === "success";
    const finalStatus = pending ? "pending" : success ? "success" : "failed";
    const pulseRef = providerPayload?.data?.ref || providerPayload?.data?.id || null;
    await admin.from("transactions").update({ status: finalStatus, pulseflow_ref: pulseRef, response_payload: providerPayload, pin_payload: success ? providerPayload?.data?.details?.pins || null : null, failure_reason: finalStatus === "failed" ? providerPayload?.data?.details?.message || providerPayload?.message || "PulseFlow failure" : null }).eq("id", transaction.id);
    return json({ ok: finalStatus !== "failed", status: finalStatus, reference: clientReference, pulseflow_ref: pulseRef, amount, details: success ? { pins: providerPayload?.data?.details?.pins || null } : undefined }, success ? 201 : pending ? 202 : 502);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
