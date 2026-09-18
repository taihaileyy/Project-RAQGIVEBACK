// Project Settings -> API -> "Project URL" and "Publishable key".
// See /SETUP.md for the full walkthrough. These two values are safe to
// expose in client-side code — real protection comes from the Row Level
// Security policies in /supabase/migrations, not from hiding this key.
//
// This project's Edge Functions gateway only accepts the newer
// sb_publishable_... key format and rejects the legacy JWT-style anon key
// outright (401 INVALID_API_KEY), which is why this uses the publishable
// key rather than the anon key SETUP.md originally pointed at.

export const SUPABASE_URL = "https://kezumpetvblxqmgqmbhz.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_3jvHUmXRgs9yvhdwGv1a-A_TvjJTLd1";
