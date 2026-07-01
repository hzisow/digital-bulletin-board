# MA DECA Chapter Event Board

A shared event board for Massachusetts DECA chapters.

## Who can do what
- **Anyone (no account):** view the whole board, search/filter, map view, open photos, share events.
- **Members (email + password):** everything above, **plus** post events and **edit/delete their own** events.
- **Admin** (small "Admin Sign In" button, bottom-right, password `Race2Suc3ss68`): edit/delete **any** event, **pin** events to the top, and open the **Instagram Requests** panel (button appears in the toolbar when signed in as admin) to see which chapters asked to be featured and mark them as posted.

## Status: backend is already set up ✅
The Supabase project, database, photo storage, security rules, member accounts, and the admin account are already created and configured. Keys are in `index.html`.

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
