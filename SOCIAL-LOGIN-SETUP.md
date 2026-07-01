# Enabling Google & Microsoft sign-in

The "Continue with Google / Microsoft" buttons are already in the app. They won't work until you enable each provider in Supabase and connect a developer app. Do these once.

**Your Supabase callback URL (you'll paste this into Google and Microsoft):**
```
https://esdwajfppazlwzlikuie.supabase.co/auth/v1/callback
```

Also make sure your deployed site URL (e.g. your Vercel URL) is set in Supabase → **Authentication → URL Configuration** (Site URL + Redirect URLs), so users land back on your site after signing in.

---

## Google (~10 min)

1. Go to **https://console.cloud.google.com** → create a project (or pick one).
2. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create
   - App name: `MA DECA Chapter Board`, add your email for support + developer contact → Save and continue through the steps (you can leave scopes default) → Back to dashboard.
   - Under **Audience / Publishing**, click **Publish app** (so anyone can sign in, not just test users).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `MA DECA Board`
   - **Authorized redirect URIs → Add URI**, paste the Supabase callback URL above.
   - Create → copy the **Client ID** and **Client secret**.
4. In Supabase: **Authentication → Sign In / Providers → Google**:
   - Toggle **Enable**, paste the **Client ID** and **Client secret** → **Save**.

Done — "Continue with Google" now works.

---

## Microsoft (~10 min)

1. Go to **https://portal.azure.com** → search **Microsoft Entra ID** → **App registrations → New registration**.
2. Fill in:
   - Name: `MA DECA Chapter Board`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (widest coverage).
   - **Redirect URI**: platform **Web**, paste the Supabase callback URL above.
   - **Register**.
3. Copy the **Application (client) ID** from the overview page.
4. **Certificates & secrets → New client secret** → add → **copy the Value** immediately (not the Secret ID).
5. In Supabase: **Authentication → Sign In / Providers → Azure**:
   - Toggle **Enable**, paste the **Application (client) ID** and the **secret Value**.
   - (Leave "Azure Tenant URL" blank for multi-tenant / personal accounts.) → **Save**.

Done — "Continue with Microsoft" now works.

---

## Notes
- Email + password stays available as a fallback; the modal recommends Google/Microsoft.
- Social accounts are verified, which cuts down on spam signups — a nice side benefit.
- Nothing else in the app needs changing; the same security rules apply to social users (they can edit only their own events; admin manages all).
