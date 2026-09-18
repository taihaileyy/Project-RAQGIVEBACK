-- Fixes "new row violates row-level security policy for table profiles" on
-- signup. Supabase's default "Confirm email" setting means there's no active
-- session (auth.uid() is null) when the browser tries to insert the profile
-- row right after auth.signUp() — so the RLS check correctly rejects it.
--
-- The fix is the standard Supabase pattern: signup.html now passes all the
-- signup form fields as user metadata on auth.signUp({ options: { data } }),
-- which Supabase stores on auth.users immediately regardless of email
-- confirmation status. This trigger reads that metadata and creates the
-- profiles row server-side (as the function/table owner, which bypasses
-- RLS), so the client no longer inserts into profiles directly at all.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, role, status, full_name, phone, email,
    mentor_area,
    org_name, partnership_type,
    dob, school, grade, interests,
    guardian_name, guardian_phone, guardian_email, guardian_relationship,
    guardian_consent, photo_consent,
    emergency_contact_name, emergency_contact_phone
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'kid'),
    'pending',
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    new.email,
    new.raw_user_meta_data ->> 'mentor_area',
    new.raw_user_meta_data ->> 'org_name',
    new.raw_user_meta_data ->> 'partnership_type',
    nullif(new.raw_user_meta_data ->> 'dob', '')::date,
    new.raw_user_meta_data ->> 'school',
    new.raw_user_meta_data ->> 'grade',
    new.raw_user_meta_data ->> 'interests',
    new.raw_user_meta_data ->> 'guardian_name',
    new.raw_user_meta_data ->> 'guardian_phone',
    new.raw_user_meta_data ->> 'guardian_email',
    new.raw_user_meta_data ->> 'guardian_relationship',
    coalesce((new.raw_user_meta_data ->> 'guardian_consent')::boolean, false),
    coalesce((new.raw_user_meta_data ->> 'photo_consent')::boolean, false),
    new.raw_user_meta_data ->> 'emergency_contact_name',
    new.raw_user_meta_data ->> 'emergency_contact_phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
