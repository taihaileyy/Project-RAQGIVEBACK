import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabaseConfigured =
  SUPABASE_URL && !SUPABASE_URL.startsWith("YOUR_") && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("YOUR_");

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Shows a friendly banner on any page instead of a blank/broken screen
// when /assets/js/config.js hasn't been filled in yet.
export function warnIfNotConfigured() {
  if (supabaseConfigured) return;
  const bar = document.createElement("div");
  bar.className = "config-warning";
  bar.innerHTML =
    'RaqGiveback isn\'t connected to a database yet. Add your Supabase project URL and anon key to ' +
    '<code>assets/js/config.js</code> — see <code>SETUP.md</code> for the 10-minute setup.';
  document.body.prepend(bar);
}
