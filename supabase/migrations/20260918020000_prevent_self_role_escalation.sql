-- Security fix: the "update own profile" RLS policy has no WITH CHECK
-- clause, so Postgres reuses its USING expression (auth.uid() = id or
-- is_admin()) for both. Since `id` never changes on a self-update, that
-- check still passes no matter what a non-admin sets `role`/`status` to —
-- meaning any signed-up user could PATCH their own profiles row to
-- role: 'admin', status: 'approved' and grant themselves full admin
-- access (expenses, receipts, the community-assistance log, everything),
-- completely bypassing the approval workflow.
--
-- RLS row policies can't restrict individual columns, so this closes the
-- gap with a trigger: a non-admin's update is rejected outright if it
-- touches role, status, or background_check_status — those stay
-- admin-managed, whatever the client sends.

create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.background_check_status is distinct from old.background_check_status
    then
      raise exception 'Only an admin can change role, status, or background_check_status.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_self_role_escalation_trg on public.profiles;
create trigger prevent_self_role_escalation_trg
  before update on public.profiles
  for each row execute function public.prevent_self_role_escalation();
