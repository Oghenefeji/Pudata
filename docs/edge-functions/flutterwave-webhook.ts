import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const env = (key: string) => Deno.env.get(key) ?? "";
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const hash = req.headers.get("verif-hash") || "";
  if (!hash || hash !== env("FLW_SECRET_HASH")) return json({ error: "Invalid webhook signature" }, 401);
  try {
    const event = await req.json();
    const item = event?.data || event;
    const txRef = String(item?.tx_ref || item?.txRef || "");
    if (!txRef) return json({ ok: true, ignored: true });
    const db = admin();
    const verifiedResponse = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, { headers: { Authorization: `Bearer ${env("FLW_SECRET_KEY")}`, Accept: "application/json" } });
    const verifiedPayload = await verifiedResponse.json();
    const verified = verifiedResponse.ok && verifiedPayload?.status === "success" && verifiedPayload?.data?.status === "successful" && verifiedPayload?.data?.currency === "NGN" && verifiedPayload?.data?.tx_ref === txRef;
    if (!verified) return json({ ok: false, ignored: true }, 200);
    const { data: transaction } = await db.from("transactions").select("id,user_id,amount,status,payment_tx_ref").eq("payment_tx_ref", txRef).maybeSingle();
    if (!transaction) return json({ ok: true, ignored: true });
    if (transaction.status !== "pending" || transaction.payment_tx_ref === txRef && transaction.status === "success") return json({ ok: true, idempotent: true });
    await db.from("transactions").update({ response_payload: { flutterwave: { status: verifiedPayload.data.status, amount: verifiedPayload.data.amount, currency: verifiedPayload.data.currency, tx_ref: txRef } } }).eq("id", transaction.id);
    return json({ ok: true, verified: true, transaction_id: transaction.id });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500); }
});
