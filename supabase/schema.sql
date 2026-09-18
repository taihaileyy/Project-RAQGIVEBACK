-- RaqGiveback database schema
-- Run this once in your Supabase project's SQL Editor (Project > SQL Editor > New query).
-- This creates every table the site needs and locks financial / personal-assistance
-- data down with Row Level Security (RLS) so it is enforced by Postgres itself,
-- not just hidden in the UI.

-- ============================================================================
-- 1. PROFILES  (one row per member: kid, mentor, partner, ambassador, admin)
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('kid', 'mentor', 'partner', 'ambassador', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now(),

  -- Mentor-specific
  mentor_area text,
  background_check_status text default 'pending' check (background_check_status in ('pending', 'cleared', 'flagged')),

  -- Partner-specific
  org_name text,
  partnership_type text,

  -- Kid / Mentee-specific (minor safety fields)
  dob date,
  school text,
  grade text,
  interests text,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  guardian_relationship text,
  guardian_consent boolean default false,
  photo_consent boolean default false,
  emergency_contact_name text,
  emergency_contact_phone text
);

alter table public.profiles enable row level security;

-- Helper: is the currently-authenticated user an approved admin?
-- SECURITY DEFINER so it can read profiles even though callers may not have
-- direct SELECT rights on other people's rows.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  );
$$;

-- A member can see and update only their own profile; admins can see/update everyone.
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own_or_admin" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- ============================================================================
-- 2. EXPENSES  (Food / Clothing / Events spend) — admin-only, ever
-- ============================================================================

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  category text not null check (category in ('Food', 'Clothing', 'Events', 'Other')),
  description text,
  amount numeric(10, 2) not null check (amount >= 0),
  vendor text,
  receipt_url text,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

create policy "expenses_admin_only" on public.expenses
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 3. PEOPLE ASSISTED  +  ASSISTANCE RECORDS  ("GiveBack Log") — admin-only
-- ============================================================================

create table if not exists public.people_assisted (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  first_helped_date date not null default current_date,
  referred_by text,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.people_assisted enable row level security;

create policy "people_assisted_admin_only" on public.people_assisted
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.assistance_records (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people_assisted (id) on delete cascade,
  assistance_type text not null check (
    assistance_type in ('Job', 'Shelter', 'Food', 'Clothing', 'Transportation', 'Education', 'Mentorship', 'Other')
  ),
  date date not null default current_date,
  what_provided text,
  outcome text,
  status text default 'Ongoing' check (status in ('Ongoing', 'Completed')),
  estimated_cost numeric(10, 2),
  follow_up_needed boolean default false,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.assistance_records enable row level security;

create policy "assistance_records_admin_only" on public.assistance_records
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 4. OPERATIONS  (in-house vs. outsourced work) — admin-only
-- ============================================================================

create table if not exists public.operations (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  work_type text not null check (work_type in ('In-House', 'Outsourced')),
  vendor_or_person text,
  cost numeric(10, 2) default 0,
  date date not null default current_date,
  reason_outsourced text,
  status text default 'In Progress' check (status in ('In Progress', 'Completed')),
  invoice_url text,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.operations enable row level security;

create policy "operations_admin_only" on public.operations
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 5. EVENTS + ANNOUNCEMENTS — visible to any approved member; admin manages
-- ============================================================================

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date,
  location text,
  is_public boolean default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "events_select_public_or_member" on public.events
  for select using (
    is_public = true
    or exists (select 1 from public.profiles where id = auth.uid() and status = 'approved')
  );

create policy "events_admin_write" on public.events
  for insert with check (public.is_admin());
create policy "events_admin_update" on public.events
  for update using (public.is_admin());
create policy "events_admin_delete" on public.events
  for delete using (public.is_admin());

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

create policy "announcements_select_member" on public.announcements
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and status = 'approved')
  );

create policy "announcements_admin_write" on public.announcements
  for insert with check (public.is_admin());
create policy "announcements_admin_update" on public.announcements
  for update using (public.is_admin());
create policy "announcements_admin_delete" on public.announcements
  for delete using (public.is_admin());

-- ============================================================================
-- 6. PUBLIC IMPACT COUNTERS  — aggregate-only view, safe for the homepage.
--    No names, no dollar amounts, no PII — just counts.
-- ============================================================================

create or replace view public.public_impact_stats
with (security_invoker = false) as
select
  (select count(*) from public.profiles where role = 'kid' and status = 'approved') as kids_mentored,
  (select count(*) from public.profiles where role = 'mentor' and status = 'approved') as mentors,
  (select count(*) from public.profiles where role = 'ambassador' and status = 'approved') as ambassadors,
  (select count(*) from public.profiles where role = 'partner' and status = 'approved') as community_partners,
  (select count(*) from public.people_assisted) as people_assisted,
  (select count(*) from public.assistance_records) as services_provided;

grant select on public.public_impact_stats to anon, authenticated;

-- ============================================================================
-- 7. STORAGE — a private bucket for expense receipts / invoices.
--    Create the bucket "raqgiveback-files" from the Storage tab (uncheck
--    "Public bucket"), then run the policies below in the SQL editor.
-- ============================================================================

-- create policy "receipts_admin_read" on storage.objects
--   for select using (bucket_id = 'raqgiveback-files' and public.is_admin());
-- create policy "receipts_admin_write" on storage.objects
--   for insert with check (bucket_id = 'raqgiveback-files' and public.is_admin());

-- ============================================================================
-- 8. YOUR FIRST ADMIN
--    Sign up normally on the site once (any role), then run this with your
--    own user id (find it in Authentication > Users) to promote yourself:
-- ============================================================================

-- update public.profiles set role = 'admin', status = 'approved' where id = 'PASTE-YOUR-AUTH-USER-UUID-HERE';
