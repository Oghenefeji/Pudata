import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const env = (key: string) => Deno.env.get(key) ?? "";
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

async function currentUser(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await client.auth.getUser();
  return data.user || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { tx_ref, expected_amount, transaction_id, purpose } = await req.json();
    if (!tx_ref) return json({ error: "tx_ref is required" }, 400);
    const user = await currentUser(req);
    const amountExpected = Number(expected_amount);
    const walletFunding = purpose === "wallet_funding";
    if (walletFunding) {
      if (!user) return json({ error: "Login required for wallet funding" }, 401);
      const prefix = `FUND_${user.id}_`;
      if (!String(tx_ref).startsWith(prefix)) return json({ error: "Wallet tx_ref must be FUND_<logged-in-user-UUID>_<random-string>" }, 400);
    }
    const response = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(String(tx_ref))}`, { headers: { Authorization: `Bearer ${env("FLW_SECRET_KEY")}`, Accept: "application/json" } });
    const payload = await response.json();
    const item = payload?.data;
    const amountOk = Number.isFinite(amountExpected) && Number(item?.amount) === amountExpected;
    const verified = response.ok && payload?.status === "success" && item?.status === "successful" && item?.currency === "NGN" && item?.tx_ref === tx_ref && amountOk;
    if (!verified) return json({ verified: false, tx_ref, status: item?.status || "failed" });
    const db = admin();
    if (walletFunding) {
      const { data: existing } = await db.from("transactions").select("id,status,client_reference").eq("payment_tx_ref", String(tx_ref)).maybeSingle();
      if (existing?.status === "success") return json({ verified: true, credited: true, idempotent: true, tx_ref, amount: item.amount, currency: item.currency });
      const clientReference = `FUNDING_${String(tx_ref).slice(5, 21)}_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const transactionId = existing?.id || (await db.from("transactions").insert({ user_id: user.id, client_reference: clientReference, tx_ref: String(tx_ref), payment_tx_ref: String(tx_ref), service_type: "wallet_funding", status: "pending", amount: amountExpected, cost_amount: 0, margin_amount: 0, currency: "NGN", payment_provider: "flutterwave", response_payload: { flutterwave: { status: item.status, amount: item.amount, currency: item.currency, tx_ref: item.tx_ref } } }).select("id").single()).data?.id;
      if (!transactionId) return json({ error: "Could not create wallet funding record" }, 500);
      const { error: creditError } = await db.rpc("credit_wallet", { p_user_id: user.id, p_amount: amountExpected, p_note: `Flutterwave funding ${tx_ref}`, p_idempotency_key: `fund:${tx_ref}`, p_transaction_id: transactionId });
      if (creditError) return json({ error: "Wallet credit failed", verified: true }, 500);
      await db.from("transactions").update({ status: "success", updated_at: new Date().toISOString() }).eq("id", transactionId);
      return json({ verified: true, credited: true, tx_ref, amount: item.amount, currency: item.currency });
    }
    if (transaction_id) await db.from("transactions").update({ payment_tx_ref: String(tx_ref), response_payload: { flutterwave_verification: { status: item.status, currency: item.currency, amount: item.amount, tx_ref: item.tx_ref } } }).eq("id", transaction_id).is("payment_tx_ref", null);
    return json({ verified: true, tx_ref, status: "successful", amount: item.amount, currency: item.currency });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500); }
});
