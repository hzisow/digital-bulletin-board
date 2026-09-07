# MA DECA Chapter Event Board

A shared event board for Massachusetts DECA chapters.

## Who can do what
- **Anyone (no account):** view the whole board, search/filter, map view, open photos, share events.
- **Members (email + password):** everything above, **plus** post events and **edit/delete their own** events.
- **Admin** (small "Admin Sign In" button, bottom-right): edit/delete **any** event, **pin** events to the top, and open the **Instagram Requests** panel (button appears in the toolbar when signed in as admin) to see which chapters asked to be featured and mark them as posted.

## 🔐 Secrets: what belongs in this repo and what doesn't
This repo is public, so treat everything in it as published to the world.

**Safe to commit** (these are designed to be read by the browser and are protected by
Supabase Row Level Security):
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `index.html`
- `GOOGLE_CLIENT_ID` in `index.html`

**Never commit** — keep these only in the Supabase/Google dashboards or a password manager:
- The admin password, or any member password
- The Supabase `service_role` key
- Any Google/Microsoft OAuth **client secret**

Look up or change the admin password in the dashboard (see **Reference** below) — do not
write it down in this repo, in a commit message, or in an issue.

## Status: backend is already set up ✅
The Supabase project, database, photo storage, security rules, member accounts, and the admin account are already created and configured. Keys are in `index.html`.

## ⚠️ One-time SQL to run (multi-day events)
Events can now span several days, which needs one new column. Paste this into
**SQL Editor → New query → Run** (safe to run more than once):
```sql
alter table public.events add column if not exists end_date date;
alter table public.events drop constraint if exists events_end_after_start;
alter table public.events add constraint events_end_after_start
  check (end_date is null or date is null or end_date >= date);
```
Until it's run the board keeps working — the End date field is just ignored on save.

## ⚠️ One setting you must flip (makes member sign-up work 100%)
By default Supabase requires email confirmation, which depends on unreliable free-tier emails. Turn it **off** so members sign up instantly with just email + password (no email sent):

1. Open **https://supabase.com/dashboard/project/esdwajfppazlwzlikuie/auth/providers**
2. Click **Email**
3. Turn **OFF** "Confirm email" (a.k.a. "Enable email confirmations") → **Save**

After that, sign-up and login are instant and can't fail on email delivery.

## Deploy (Vercel, recommended)
The project lives in the GitHub repo **hzisow/digital-bulletin-board**.
1. Go to https://vercel.com/new
2. Import the `digital-bulletin-board` repo
3. Framework Preset: **Other**, leave build settings blank → **Deploy**
4. You get a public URL like `https://digital-bulletin-board.vercel.app`
   If yours is different, update the three absolute `https://digital-bulletin-board.vercel.app` references in the
   `<head>` of `index.html` (`og:url`, `og:image`, `twitter:image`) so shared links show the preview image.

No redirect-URL configuration is needed (we use password auth, not magic links).

## Making changes later
Edit files, then from the project folder:
```bash
git add -A && git commit -m "your change" && git push
```
Vercel auto-redeploys on every push.

## Reference
- Supabase project: `ma-deca-board` (id `esdwajfppazlwzlikuie`)
- Dashboard: https://supabase.com/dashboard/project/esdwajfppazlwzlikuie
- Change admin password: Authentication → Users → `admin@madeca-board.app` → reset password.
- `supabase-setup.sql` documents the base schema (already applied).
