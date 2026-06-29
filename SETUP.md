# MA DECA Chapter Event Board — Backend Setup

This turns the board into a **shared, multi-device site** using **Supabase** (free, no credit card). Everyone can view the board; people sign in with their email to post and manage their own chapter's events.

Total time: ~10 minutes. You do steps in the browser; no coding.

---

## What you'll end up with
- A free Supabase project (database + image storage + login)
- The board hosted at a public URL anyone can open
- Posts and photos that sync live across all devices

---

## Step 1 — Create a free Supabase project
1. Go to **https://supabase.com** → **Start your project** → sign in with GitHub or email.
2. Click **New project**. Pick any name (e.g. `ma-deca-board`), set a database password (save it somewhere), choose a region near you (e.g. East US).
3. Wait ~2 minutes for it to finish setting up.

## Step 2 — Create the database + storage
1. In your project, open **SQL Editor** (left sidebar) → **New query**.
2. Open the file **`supabase-setup.sql`** (in this folder), copy everything, paste it in, and click **Run**.
3. You should see "Success". This creates the `events` table, the security rules, realtime, and the `event-photos` storage bucket.

## Step 3 — Turn on email login
1. Go to **Authentication → Sign In / Providers** (or "Providers").
2. Make sure **Email** is enabled. (Magic link is on by default — no password needed.)
3. *(Optional but recommended for less friction during testing:)* Under **Authentication → Providers → Email**, you can leave "Confirm email" on. Magic links work either way.

## Step 4 — Get your two keys
1. Go to **Project Settings → API**.
2. Copy the **Project URL** (looks like `https://abcdwxyz.supabase.co`).
3. Copy the **anon public** key (a long string). *(The anon key is safe to put in the page — your data is protected by the security rules from Step 2. Never use the `service_role` key here.)*

## Step 5 — Paste the keys into the app
1. Open **`index.html`** in a text editor.
2. Near the top of the `<script>` section, find the **SUPABASE BACKEND CONFIG** block:
   ```js
   var SUPABASE_URL = "";         // e.g. "https://abcdwxyz.supabase.co"
   var SUPABASE_ANON_KEY = "";    // the long "anon public" key
   ```
3. Paste your two values between the quotes. Save.

## Step 6 — Host the page (required for login to work)
Login links must redirect to a real web address, so the page needs to be online (a `file://` page won't work for sign-in). Pick the easiest free option:

**Option A — Netlify Drop (no account needed, fastest)**
1. Go to **https://app.netlify.com/drop**.
2. Drag this whole **`ma-deca-board` folder** onto the page.
3. You'll instantly get a URL like `https://something.netlify.app`. That's your site.

**Option B — GitHub Pages**
1. Create a GitHub repo, upload the folder's files.
2. Settings → Pages → deploy from `main` branch → root. Your URL will be `https://username.github.io/repo`.

## Step 7 — Tell Supabase your site URL
1. Back in Supabase: **Authentication → URL Configuration**.
2. Set **Site URL** to your hosted URL from Step 6 (e.g. `https://something.netlify.app`).
3. Add the same URL under **Redirect URLs** too. Save.

## Step 8 — Try it
1. Open your hosted URL.
2. Click **Sign in** (top right), enter your email, and click the link it sends you.
3. You'll come back signed in — now **Post an Event**. Open the URL on your phone to confirm it shows up everywhere. 🎉

---

## Notes
- **Until you finish setup**, the app runs in local mode (saves only in your browser) so it never appears broken.
- **Photos** now upload to Supabase Storage (not the browser), so size limits are no longer a concern.
- **Editing/deleting**: people only see edit/delete buttons on events they created.
- **Free tier limits** (plenty for a state board): 500MB database, 1GB file storage, 50,000 monthly active users. If a project goes unused for ~1 week it can pause — just open the dashboard to resume.
- **Re-deploying after edits**: if you change `index.html` later, drag the folder onto Netlify Drop again (or push to GitHub).
