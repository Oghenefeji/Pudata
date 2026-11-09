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
  if (!profile || profile.suspended || !["admin", "support"].includes(profile.role)) throw new Error("Admin access required");
  return db;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { reference } = await req.json();
    const db = await adminFor(req);
    const { data: tx } = await db.from("transactions").select("id,client_reference,status").eq("client_reference", String(reference)).single();
    if (!tx) return json({ error: "Transaction not found" }, 404);
    const base = (env("PULSEFLOW_BASE_URL") || "https://pulseflow.com.ng/api/v1").replace(/\/+$/, "");
    const response = await fetch(`${base}/customers/accounts?page=1`, { headers: { Authorization: `Bearer ${env("PULSEFLOW_API_KEY")}`, Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: "PulseFlow ledger request failed", provider_status: response.status }, 502);
    const entries = Array.isArray(payload) ? payload : (payload.data || payload.accounts || []);
    const match = entries.find((entry: any) => String(entry.ref || entry.reference || entry.client_reference || "") === String(reference));
    if (!match) return json({ ok: true, reference, status: "pending", message: "No matching provider ledger entry found; transaction remains pending" });
    const providerStatus = Number(match.status);
    const next = providerStatus === 1 ? "success" : providerStatus === 2 ? "reversed" : providerStatus === 0 ? "failed" : "pending";
    await db.from("transactions").update({ status: next, response_payload: { ledger_match: match } }).eq("id", tx.id);
    return json({ ok: true, reference, status: next, provider_entry: { id: match.id || null, ref: match.ref || null, status: providerStatus } });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 401); }
});
