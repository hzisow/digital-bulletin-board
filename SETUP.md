# MA DECA Chapter Event Board

A shared event board for Massachusetts DECA chapters. Anyone can post events; an admin can edit/delete any event.

## Status: backend is already set up ✅
The Supabase backend (database, photo storage, security rules, and the admin account) is **already created and configured**. The keys are in `index.html`. You don't need to touch Supabase to use the app.

## How it works
- **Anyone can post** an event (no sign-in needed). Posts sync live across all devices.
- **Admin** (small "Admin Sign In" button, bottom-right) can edit and delete any event.
  - Password: `Race2Suc3ss68`
  - This is secure: the password is verified by Supabase's servers (bcrypt-hashed, rate-limited), it is **not** stored in the page, and the database itself only allows the admin account to edit/delete — it can't be bypassed.
- **Photos** upload to Supabase Storage (not the browser), so there are no size headaches.

## Deploy it (so others can use it)
The project lives in the GitHub repo **hzisow/digital-bulletin-board**.

**Vercel (recommended):**
1. Go to https://vercel.com/new
2. Import the `digital-bulletin-board` repo
3. Framework Preset: **Other**, leave build settings empty → **Deploy**
4. You get a public URL like `https://digital-bulletin-board.vercel.app`

That's it — admin login uses password auth, which needs **no redirect URL configuration**, so there's nothing else to set in Supabase.

## Making changes later
Edit `index.html`, then from the project folder:
```bash
git add -A && git commit -m "your change" && git push
```
Vercel auto-redeploys on every push.

## Project details (for reference)
- Supabase project: `ma-deca-board` (id `esdwajfppazlwzlikuie`)
- Admin dashboard: https://supabase.com/dashboard/project/esdwajfppazlwzlikuie
- To change the admin password later: Supabase dashboard → Authentication → Users → `admin@madeca-board.app` → reset password.
- `supabase-setup.sql` documents the schema/policies (already applied).
