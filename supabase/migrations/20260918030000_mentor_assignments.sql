-- Lets mentors see the kids they mentor, and kids see who their mentor is.
-- Admin assigns/manages these; everyone else's visibility follows from it.

create table if not exists public.mentor_assignments (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles (id) on delete cascade,
  kid_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  notes text,
  assigned_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Only one active assignment per mentor/kid pair at a time; a past (ended)
-- assignment can still exist in history alongside a new active one.
create unique index if not exists mentor_assignments_active_pair_idx
  on public.mentor_assignments (mentor_id, kid_id)
  where status = 'active';

alter table public.mentor_assignments enable row level security;

create policy "mentor_assignments_admin_all" on public.mentor_assignments
  for all using (public.is_admin()) with check (public.is_admin());

create policy "mentor_assignments_mentor_select" on public.mentor_assignments
  for select using (auth.uid() = mentor_id);

create policy "mentor_assignments_kid_select" on public.mentor_assignments
  for select using (auth.uid() = kid_id);

-- Extra read access on profiles, additive to the existing "own row or admin"
-- policy: a mentor may view the profile of a kid they're actively assigned
-- to, and a kid may view the profile of their actively assigned mentor.
create policy "mentors_view_assigned_kids" on public.profiles
  for select using (
    exists (
      select 1 from public.mentor_assignments ma
      where ma.kid_id = profiles.id
        and ma.mentor_id = auth.uid()
        and ma.status = 'active'
    )
  );

create policy "kids_view_assigned_mentor" on public.profiles
  for select using (
    exists (
      select 1 from public.mentor_assignments ma
      where ma.mentor_id = profiles.id
        and ma.kid_id = auth.uid()
        and ma.status = 'active'
    )
  );
