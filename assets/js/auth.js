import { supabase } from "./supabaseClient.js";

export const ROLE_LABELS = {
  kid: "Kid / Mentee",
  mentor: "Mentor",
  partner: "Partner",
  ambassador: "Ambassador",
  admin: "Admin",
};

// Returns { user, profile } or { user: null, profile: null } if signed out.
export async function getCurrentProfile() {
  if (!supabase) return { user: null, profile: null };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { user: null, profile: null };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) console.error("Failed to load profile:", error);
  return { user: session.user, profile: profile || null };
}

// Call at the top of any page that requires sign-in. Redirects to signin.html
// if there's no session, and returns { user, profile } otherwise.
export async function requireAuth() {
  const { user, profile } = await getCurrentProfile();
  if (!user) {
    window.location.href = "signin.html";
    return null;
  }
  return { user, profile };
}

// Call at the top of admin.html. Redirects non-admins away.
// This is a UX convenience only — the actual data protection is enforced
// by Postgres Row Level Security policies in supabase/schema.sql, so even
// a modified/bypassed client can't read admin-only tables.
export async function requireAdmin() {
  const result = await requireAuth();
  if (!result) return null;
  const { profile } = result;
  if (!profile || profile.role !== "admin" || profile.status !== "approved") {
    window.location.href = "dashboard.html";
    return null;
  }
  return result;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.href = "index.html";
}

export function wireSignOutButtons() {
  document.querySelectorAll("[data-sign-out]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      signOut();
    });
  });
}
