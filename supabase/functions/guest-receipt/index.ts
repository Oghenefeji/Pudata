import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const env = (key: string) => Deno.env.get(key) ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { reference, email } = await req.json();
    if (!reference || !email) return json({ error: "reference and email are required" }, 400);
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: tx, error } = await db.from("transactions").select("client_reference,status,service_type,amount,currency,pulseflow_ref,guest_email,pin_payload,created_at,updated_at").eq("client_reference", String(reference)).eq("guest_email", String(email).trim().toLowerCase()).is("user_id", null).maybeSingle();
    if (error || !tx) return json({ error: "Receipt not found" }, 404);
    return json({ reference: tx.client_reference, status: tx.status, service: tx.service_type, amount: tx.amount, currency: tx.currency, pulseflow_ref: tx.pulseflow_ref, pins: tx.pin_payload, created_at: tx.created_at, updated_at: tx.updated_at });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500); }
});
