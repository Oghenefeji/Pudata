import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const env = (key: string) => Deno.env.get(key) ?? "";
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { tx_ref, expected_amount, transaction_id } = await req.json();
    if (!tx_ref) return json({ error: "tx_ref is required" }, 400);
    const response = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(String(tx_ref))}`, { headers: { Authorization: `Bearer ${env("FLW_SECRET_KEY")}`, Accept: "application/json" } });
    const payload = await response.json();
    const item = payload?.data;
    const amountOk = expected_amount == null || Number(item?.amount) >= Number(expected_amount);
    const verified = response.ok && payload?.status === "success" && item?.status === "successful" && item?.currency === "NGN" && item?.tx_ref === tx_ref && amountOk;
    if (transaction_id) await admin().from("transactions").update({ payment_tx_ref: String(tx_ref), response_payload: { flutterwave_verification: { status: item?.status, currency: item?.currency, amount: item?.amount, tx_ref: item?.tx_ref } } }).eq("id", transaction_id).is("payment_tx_ref", null);
    return json({ verified, tx_ref, status: verified ? "successful" : item?.status || "failed", amount: verified ? item.amount : null, currency: verified ? item.currency : null });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500); }
});
