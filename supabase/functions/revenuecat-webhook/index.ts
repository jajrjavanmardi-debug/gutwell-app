import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * RevenueCat webhook receiver.
 *
 * The only thing that writes public.user_entitlements, which is in turn the
 * only trusted answer to "is this account Premium?". Everything the client
 * says about its own subscription is UX and is never consulted by the server.
 *
 * ── Authentication ──────────────────────────────────────────────────────────
 * RevenueCat sends whatever value is configured as the webhook's Authorization
 * header. That shared secret is the entire authentication mechanism, so a
 * request without it is rejected before the body is read: an unauthenticated
 * caller must not be able to make us parse arbitrary JSON, let alone move a
 * user to Premium.
 *
 * The comparison is length-safe and constant-time-ish rather than `===`, so a
 * caller cannot learn the secret one character at a time from timing.
 *
 * ── Deploy note ─────────────────────────────────────────────────────────────
 * Must be deployed with --no-verify-jwt: RevenueCat is not a Supabase user and
 * cannot present a Supabase JWT. Authentication is the shared secret above.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

/** The entitlement this app sells. Events for anything else are ignored. */
const ENTITLEMENT_ID = "premium";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Comparison whose duration does not depend on where the first difference is. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Which events grant access, and which remove it.
 *
 * CANCELLATION is deliberately absent from both lists. In RevenueCat it means
 * "auto-renew turned off", not "access ends now" — the user has paid through
 * the current period and must keep Premium until expires_at. Treating it as a
 * revocation would cut off paying customers early.
 *
 * BILLING_ISSUE is likewise not a revocation: it opens a grace period, and
 * RevenueCat sends EXPIRATION if it is never resolved.
 */
const GRANTING = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);
const REVOKING = new Set(["EXPIRATION", "REFUND", "SUBSCRIPTION_PAUSED"]);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  }

  // Fail closed on misconfiguration. Without the secret we cannot tell
  // RevenueCat from anyone else, and without the service key we cannot write.
  if (!WEBHOOK_SECRET || !SERVICE_ROLE_KEY) {
    console.error("Webhook misconfigured", {
      hasSecret: Boolean(WEBHOOK_SECRET),
      hasServiceKey: Boolean(SERVICE_ROLE_KEY),
    });
    return json({ code: "SERVER_MISCONFIGURED" }, 500);
  }

  // Authenticate BEFORE reading the body.
  if (!secretMatches(req.headers.get("authorization"), WEBHOOK_SECRET)) {
    return json({ code: "UNAUTHORIZED" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ code: "BAD_REQUEST" }, 400);
  }

  const event = (payload?.event ?? {}) as Record<string, unknown>;
  const type = typeof event.type === "string" ? event.type : "";

  // RevenueCat's App User ID is the Supabase user id, set by
  // Purchases.logIn(userId). `original_app_user_id` is preferred because it
  // survives aliasing; app_user_id is the fallback for older payload shapes.
  const rawUser =
    (typeof event.original_app_user_id === "string" && event.original_app_user_id) ||
    (typeof event.app_user_id === "string" && event.app_user_id) ||
    "";
  // Anonymous RevenueCat ids ($RCAnonymousID:...) belong to a device that never
  // signed in. There is no account to grant, so they are acknowledged and
  // dropped rather than treated as an error RevenueCat should retry.
  if (!UUID_RE.test(rawUser)) {
    return json({ ok: true, ignored: "no_mapped_user" });
  }

  const entitlementIds = Array.isArray(event.entitlement_ids)
    ? (event.entitlement_ids as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const mentionsPremium =
    entitlementIds.length === 0 ||
    entitlementIds.includes(ENTITLEMENT_ID) ||
    event.entitlement_id === ENTITLEMENT_ID;

  // TRANSFER moves a subscription between App User IDs. The account losing it
  // must stop being Premium; the account gaining it is covered by the
  // accompanying grant event.
  const isTransferAway = type === "TRANSFER";

  let isActive: boolean;
  if (GRANTING.has(type) && mentionsPremium) isActive = true;
  else if (REVOKING.has(type) || isTransferAway) isActive = false;
  else return json({ ok: true, ignored: type || "unknown_event" });

  const expiresAtMs =
    typeof event.expiration_at_ms === "number" ? event.expiration_at_ms : null;
  const eventAtMs =
    typeof event.event_timestamp_ms === "number" ? event.event_timestamp_ms : null;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("apply_entitlement_event", {
    p_user_id: rawUser,
    p_is_active: isActive,
    p_expires_at: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
    p_product_id: typeof event.product_id === "string" ? event.product_id.slice(0, 120) : null,
    p_store: typeof event.store === "string" ? event.store.slice(0, 40) : null,
    p_event_id: typeof event.id === "string" ? event.id.slice(0, 120) : null,
    p_event_at: eventAtMs ? new Date(eventAtMs).toISOString() : null,
  });

  if (error) {
    // Only the database's own message — never the payload, which carries
    // purchase and identity data.
    console.error("Entitlement write failed", { type, detail: error.message });
    // 500 so RevenueCat retries; the write is idempotent, so a retry is safe.
    return json({ code: "WRITE_FAILED" }, 500);
  }

  // Event type and outcome only. The payload is never logged: it contains
  // transaction identifiers and store account data we have no reason to keep.
  console.log("Entitlement event", { type, active: isActive, result: data?.reason ?? "applied" });
  return json({ ok: true });
});
