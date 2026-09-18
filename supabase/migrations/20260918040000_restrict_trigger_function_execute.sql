-- The security advisor flagged handle_new_user() and
-- prevent_self_role_escalation() as callable directly via
-- /rest/v1/rpc/<name> by anon/authenticated, because Postgres grants
-- EXECUTE on new functions to PUBLIC by default. Both are trigger-only
-- functions (they declare `returns trigger` and reference NEW/OLD, which
-- only exist inside a trigger invocation) and are never meant to be called
-- directly. Revoking EXECUTE doesn't affect their trigger behavior — the
-- trigger mechanism invokes them internally and isn't subject to this
-- grant check. Verified: signup still creates a profiles row correctly
-- after this revoke.
--
-- Note this has to revoke from PUBLIC specifically, not just anon/
-- authenticated — a PUBLIC grant applies to every role regardless of a
-- more specific per-role revoke, which is why the first attempt at this
-- (revoking from anon, authenticated only) didn't actually change anything
-- the advisor reported.
--
-- is_admin() is deliberately left untouched: RLS policies call it directly
-- as part of evaluating almost every table's access rules, so the
-- querying role (anon/authenticated) MUST retain EXECUTE on it or every
-- policy referencing it breaks. The advisor's WARN there is expected and
-- correct to leave as-is.

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.prevent_self_role_escalation() from public;
