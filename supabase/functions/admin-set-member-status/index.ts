// Approves/rejects a member AND, for a rejection, revokes their ability to
// sign in — "stripped of credentials," not just a status flag. This has to
// run server-side: banning a user requires the service-role key, which must
// never be shipped to the browser (it bypasses every RLS policy on the
// database). Supabase injects SUPABASE_URL, SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY into every Edge Function automatically — no
// manual secret configuration needed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Supabase Edge Functions don't add CORS headers on their own; without
// these, the browser blocks the response before this site's JS ever sees it.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Who is calling? Resolved from their own JWT, not trusted from the body.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();
    if (callerErr || !caller) return json({ error: "Invalid session" }, 401);

    // Service-role client: bypasses RLS, only used after we've confirmed the
    // caller is an approved admin.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role, status")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "admin" || callerProfile.status !== "approved") {
      return json({ error: "Admins only" }, 403);
    }

    const { userId, status } = await req.json();
    if (!userId || !["pending", "approved", "rejected"].includes(status)) {
      return json({ error: "userId and a valid status ('pending' | 'approved' | 'rejected') are required" }, 400);
    }
    if (userId === caller.id) {
      return json({ error: "You can't change your own account status here." }, 400);
    }

    const { error: updateError } = await adminClient.from("profiles").update({ status }).eq("id", userId);
    if (updateError) return json({ error: updateError.message }, 500);

    // Reject -> ban (effectively permanent). Anything else -> lift any
    // existing ban, so re-approving a previously rejected member restores
    // their ability to sign in.
    const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: status === "rejected" ? "876000h" : "none",
    });
    if (banError) return json({ error: banError.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
