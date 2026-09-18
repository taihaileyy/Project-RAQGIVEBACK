# RaqGiveback Setup

This site is a static GitHub Pages site (no server), so it uses
[Supabase](https://supabase.com) — free tier — for accounts, the database, and
file storage. Supabase gives every table Row Level Security (RLS), so "only
admins can see spending" is enforced by the database itself, not just by
hiding a menu item in the browser.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account/project.
2. Wait for the project to finish provisioning (a couple of minutes).

## 2. Run the database schema

1. In your Supabase project, open **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and run it.
   This creates every table (profiles, expenses, people_assisted,
   assistance_records, operations, events, announcements), the `is_admin()`
   helper, and the RLS policies that lock financial/personal data to admins
   only.

## 3. Create the file storage bucket (for receipts & invoices)

1. Go to **Storage** → **New bucket**.
2. Name it exactly `raqgiveback-files`.
3. Leave **Public bucket** unchecked (it must stay private).
4. Back in the SQL Editor, uncomment and run the two `storage.objects`
   policies at the bottom of `supabase/schema.sql` (section 7) so only admins
   can read/write files in that bucket.

## 4. Connect the site to your project

1. In Supabase: **Project Settings** → **API**.
2. Copy the **Project URL** and the **anon public** key (not the service role key).
3. Open `assets/js/config.js` in this repo and paste them in:

   ```js
   export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```

4. Commit and push — GitHub Pages will pick it up automatically.

These two values are meant to be public (they ship to every visitor's
browser); real protection comes from the RLS policies in step 2, not from
keeping this key secret.

## 5. Turn off "Confirm email" (optional, for faster testing)

By default Supabase requires email confirmation before a new account can sign
in. For local testing you can turn this off under **Authentication** →
**Providers** → **Email** → disable "Confirm email". For a real launch, leave
it on.

## 6. Make yourself the first admin

1. On the live site, sign up normally (pick any role).
2. In Supabase, go to **Authentication** → **Users** and copy your user's UUID.
3. In the SQL Editor, run:

   ```sql
   update public.profiles
   set role = 'admin', status = 'approved'
   where id = 'paste-your-uuid-here';
   ```

4. Sign in again — you'll now see **Admin Dashboard** in your sidebar, with
   expense tracking, the community assistance log, operations, and member
   approvals. No other role can reach or query that data; it's blocked at the
   database level even if someone edits the page's JavaScript.

## Approving members

Every new signup (kid, mentor, partner, ambassador) starts as **pending**.
Go to Admin → **Members** → **Pending** to approve or reject applications.
Members see a "your application is under review" banner on their dashboard
until you approve them.

## Important: minors and legal review

Kid/mentee signup collects date of birth and requires parent/guardian
consent before the account can be used, and mentors are flagged with a
`background_check_status` field for you to track screening. This is a
starting point, not legal advice — **have an attorney familiar with
youth-serving organizations in your state (Louisiana requirements around
minor online accounts, background checks, and mandatory reporting were
specifically mentioned) review your consent forms and youth-safety policy
before enrolling real kids.**

## What's included vs. what's still a placeholder

- Home, sign up, sign in, member dashboard, and admin dashboard are fully
  wired to Supabase.
- The public homepage "Impact" numbers come from a live database view
  (`public_impact_stats`) — no manual typing required.
- Pages referenced in the original brand outline that aren't built yet
  (separate Mentorship / Events / Partners / Become an Ambassador pages) are
  currently anchors on the homepage (`#mission`, `#who`, `#impact`) — ask if
  you'd like those split into their own pages.
