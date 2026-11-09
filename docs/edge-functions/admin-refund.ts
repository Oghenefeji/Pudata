import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const env = (key: string) => Deno.env.get(key) ?? "";
async function adminFor(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data } = await db.auth.getUser(token);
  if (!data.user) throw new Error("Invalid session");
  const { data: profile } = await db.from("profiles").select("role,suspended").eq("id", data.user.id).single();
  if (!profile || profile.suspended || profile.role !== "admin") throw new Error("Admin access required");
  return db;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { reference, reason, flutterwave_transaction_id } = await req.json();
    const db = await adminFor(req);
    const { data: tx } = await db.from("transactions").select("id,user_id,amount,status,payment_tx_ref").eq("client_reference", String(reference)).single();
    if (!tx) return json({ error: "Transaction not found" }, 404);
    if (!["failed", "reversed"].includes(tx.status)) return json({ error: "Only clearly failed or reversed transactions can be refunded" }, 409);
    let refund = null;
    if (flutterwave_transaction_id) {
      const response = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(flutterwave_transaction_id))}/refund`, { method: "POST", headers: { Authorization: `Bearer ${env("FLW_SECRET_KEY")}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ amount: tx.amount }) });
      refund = await response.json().catch(() => ({}));
      if (!response.ok || refund?.status !== "success") return json({ error: "Flutterwave refund was not confirmed" }, 502);
    }
    if (tx.user_id && !tx.payment_tx_ref) await db.rpc("credit_wallet", { p_user_id: tx.user_id, p_amount: tx.amount, p_note: reason || `Refund ${reference}`, p_idempotency_key: `refund:${reference}`, p_transaction_id: tx.id });
    await db.from("transactions").update({ status: "refunded", failure_reason: reason || "Admin refund" }).eq("id", tx.id);
    return json({ ok: true, reference, status: "refunded", flutterwave: refund ? { status: refund.status, id: refund.data?.id || null } : null });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 401); }
});
