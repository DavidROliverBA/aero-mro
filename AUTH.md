# GitHub sign-in for AeroMRO

The app is gated behind Supabase Auth with GitHub as the OAuth provider. Only
signed-in users can load or change any data. Three things to configure — all
one-time.

## 1. Create a GitHub OAuth App

GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**:

| Field | Value |
|-------|-------|
| Application name | `AeroMRO` |
| Homepage URL | `http://localhost:5173` (add the Pages URL later) |
| Authorization callback URL | `https://biffxhtytzdcfsbxscwm.supabase.co/auth/v1/callback` |

Register it, copy the **Client ID**, then **Generate a new client secret** and copy that too.

> The callback URL is Supabase's, not the app's — Supabase handles the OAuth
> handshake and then redirects back to the app.

## 2. Enable GitHub in Supabase

Supabase Dashboard → **Authentication → Providers → GitHub**:

- Toggle **Enabled**
- Paste the **Client ID** and **Client Secret** from step 1
- Save

Then **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:5173` (swap to the Pages URL once deployed)
- **Redirect URLs:** add both `http://localhost:5173` and, later,
  `https://<your-deployment>.pages.dev` (or your custom domain). The app calls
  `signInWithOAuth({ redirectTo: window.location.origin })`, so each origin the
  app is served from must be listed here.

## 3. Lock RLS to authenticated users

This replaces the wide-open demo policies so that **only signed-in users** can
read or write. Run it in the Supabase SQL Editor (or via the Supabase MCP in the
aero-mro session):

```sql
do $$
declare t text;
begin
  foreach t in array array[
    'aircraft','engineers','defects','parts','work_orders','task_cards',
    'crs_releases','airworthiness_directives','ad_compliance','audit_log'
  ] loop
    execute format('drop policy if exists "demo_all" on %I;', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
```

With no policy for the `anon` role, unauthenticated requests are denied — the
publishable key alone can no longer read or modify anything.

## How the app behaves

- Not signed in → a "Sign in with GitHub" screen (`src/views/Login.tsx`).
- Signed in → the full app; the signed-in GitHub handle and a **Sign out**
  button appear at the bottom of the sidebar.
- Data loads only once a session exists; `onAuthStateChange` keeps it in sync.

## Note on access scope

Any GitHub user who reaches the app can currently sign in. To restrict to
specific people, gate on `session.user.email` / GitHub username in the app, or
(better) add an `allowed_users` table and reference it in the RLS policies
instead of the blanket `to authenticated` above.
