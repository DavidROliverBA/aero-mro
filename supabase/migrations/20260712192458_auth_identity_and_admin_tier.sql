-- Authorisation hardening.
--
-- NOTE ON THE MIRROR: two guards here (the backfill DO block below, and the
-- rls_auto_enable revoke at the end) are conditional in this file but were
-- unconditional in the version applied to the live project. Both are no-ops on
-- that project (every allow-list row bound; the function exists there), so the
-- resulting schema is identical — the conditions exist only so a fresh
-- `supabase db push` succeeds. Do not "simplify" them back.
--
-- Before this migration, is_allowed() trusted user_metadata.user_name — a claim
-- that any authenticated user can rewrite via auth.updateUser(). Combined with
-- open GitHub OAuth sign-in, that let any GitHub account grant itself full
-- read/write plus user management. reset_demo_data() was worse: security
-- definer, granted to authenticated, with no gate at all.
--
-- Authorisation now keys on auth.uid() (signed into the JWT, not user-writable).
-- user_metadata goes back to being a display name only.

-- 1. Identity binding + admin tier -------------------------------------------

alter table allowed_users add column if not exists user_id uuid unique;
alter table allowed_users add column if not exists is_admin boolean not null default false;

-- Backfill from the auth metadata as it stands right now. Safe only because the
-- auth.users table is uncontaminated (verified: every account is legitimate);
-- once bound, the uid is what counts and the metadata can never re-grant access.
-- Match on user_name, NOT on <username>@aeromro.demo: the ux-test row's email is
-- uxtest@aeromro.demo, so an email-based join would silently orphan it.
update allowed_users a
   set user_id = u.id
  from auth.users u
 where a.user_id is null
   and u.raw_user_meta_data ->> 'user_name' = a.username;

-- Abort rather than half-apply and lock everyone out of a LIVE deployment.
-- The dangerous case is a PARTIAL bind: some rows matched an auth user and some
-- didn't, which means real accounts are about to lose access. Fire only on that.
--   * live DB (all rows bound)      -> unbound = 0        -> no raise
--   * fresh DB (auth.users empty)   -> nothing bound yet  -> no raise (see below)
--   * partial bind                  -> RAISE, roll back
-- A fresh `supabase db push` leaves the seeded allow-list rows unbound, which is
-- correct: nobody can sign in until the bootstrap block in the README creates the
-- first account and binds it. Without this carve-out, self-hosting would abort here.
do $$
declare unbound int; bound int;
begin
  select count(*) filter (where user_id is null),
         count(*) filter (where user_id is not null)
    into unbound, bound
    from allowed_users;
  if unbound > 0 and bound > 0 then
    raise exception 'Backfill incomplete: % allowed_users row(s) have no matching auth user', unbound;
  end if;
end $$;

update allowed_users set is_admin = true where username = 'DavidROliverBA';

-- 2. The gates ----------------------------------------------------------------

create or replace function is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from allowed_users au where au.user_id = auth.uid()
  );
$$;

-- service_role (the MCP server's key) is always admin: its JWT is signed with the
-- project secret and cannot be forged by a browser client. Without this branch the
-- MCP reset_demo tool would break the moment reset_demo_data() is gated.
-- The current_setting('role') branch is a fallback for the newer sb_secret_* keys,
-- which may not carry a 'role' claim; SECURITY DEFINER changes the effective user,
-- not the role GUC, so this still reads PostgREST's SET LOCAL ROLE.
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or coalesce(nullif(current_setting('role', true), 'none'), '') = 'service_role'
      or exists (
        select 1 from allowed_users au
         where au.user_id = auth.uid() and au.is_admin
      );
$$;

-- Supabase grants EXECUTE to anon/authenticated EXPLICITLY via default privileges,
-- so "revoke ... from public" removes nothing. anon must be named.
revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- 3. Pre-authorising a GitHub user who has never signed in --------------------
-- The uid model would otherwise lose that ability. Restricted to provider=github,
-- where user_name comes from GitHub's API at insert time — not from the client.
-- Email signups cannot use this path, so nobody can self-bind by passing
-- user_name to signUp(). Only unclaimed rows (user_id is null) can be claimed.

-- SECURITY DEFINER is load-bearing on every function here, not a style choice:
-- allowed_users' RLS policy calls is_allowed(), which reads allowed_users. Running
-- as the owner (which bypasses RLS) is what stops that recursing. Do not "tidy".
create or replace function claim_allowed_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') = 'github'
     and coalesce(new.raw_user_meta_data ->> 'user_name', '') <> '' then
    update allowed_users
       set user_id = new.id
     where user_id is null
       and auth_kind = 'github'
       and username = new.raw_user_meta_data ->> 'user_name';
  end if;
  return new;
exception when others then
  -- Never let a claim failure abort the insert: this trigger sits in the path of
  -- every GoTrue signup AND create_app_user's direct insert into auth.users.
  raise warning 'claim_allowed_user skipped: %', sqlerrm;
  return new;
end $$;

-- Fires on UPDATE too: if a future GoTrue populates app_metadata in a follow-up
-- write rather than at INSERT, an insert-only trigger would silently never claim.
drop trigger if exists trg_claim_allowed_user on auth.users;
create trigger trg_claim_allowed_user
after insert or update of raw_app_meta_data, raw_user_meta_data on auth.users
for each row execute function claim_allowed_user();

-- 4. Registry is readable only to allow-listed users --------------------------

drop policy if exists "read_allowed" on allowed_users;
create policy "read_allowed" on allowed_users
  for select to authenticated using (is_allowed());

-- 5. Admin-only: user management and the destructive reset --------------------

create or replace function create_app_user(
  p_username text,
  p_password text,
  p_engineer_id uuid default null
) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  uid uuid := gen_random_uuid();
  v_email text;
begin
  if not is_admin() then
    raise exception 'Not authorised to manage users';
  end if;
  if p_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
    raise exception 'Username must be 3-32 chars: lowercase letters, digits, . _ - (starting alphanumeric)';
  end if;
  if length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;
  if p_engineer_id is not null and not exists (select 1 from engineers e where e.id = p_engineer_id) then
    raise exception 'Unknown engineer';
  end if;
  v_email := p_username || '@aeromro.demo';
  if exists (select 1 from auth.users where email = v_email)
     or exists (select 1 from allowed_users where username = p_username) then
    raise exception 'Username % already exists', p_username;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
          v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}',
          jsonb_build_object('user_name', p_username), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
          jsonb_build_object('sub', uid::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());
  -- Bind the identity at creation: never rely on metadata to resolve it later.
  insert into allowed_users (username, engineer_id, auth_kind, user_id)
  values (p_username, p_engineer_id, 'password', uid);

  insert into audit_log (entity, action, actor, detail)
  values ('allowed_users', 'User account created',
          coalesce((select au.username from allowed_users au where au.user_id = auth.uid()), 'system'),
          p_username || case when p_engineer_id is not null then ' (linked to engineer)' else '' end);
  return p_username;
end $$;

create or replace function delete_app_user(p_username text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_kind text;
  v_uid  uuid;
begin
  if not is_admin() then
    raise exception 'Not authorised to manage users';
  end if;
  select auth_kind, user_id into v_kind, v_uid from allowed_users where username = p_username;
  if v_kind is null then
    raise exception 'Unknown user %', p_username;
  end if;
  -- Compare identities, not metadata strings.
  if v_uid is not null and v_uid = auth.uid() then
    raise exception 'You cannot remove your own account';
  end if;
  delete from allowed_users where username = p_username;
  if v_kind = 'password' and v_uid is not null then
    delete from auth.users where id = v_uid;   -- by uid: the ux-test row's email does not match its username
  end if;
  insert into audit_log (entity, action, actor, detail)
  values ('allowed_users', 'User account removed',
          coalesce((select au.username from allowed_users au where au.user_id = auth.uid()), 'system'), p_username);
end $$;

revoke all on function create_app_user(text, text, uuid) from public, anon;
revoke all on function delete_app_user(text) from public, anon;
grant execute on function create_app_user(text, text, uuid) to authenticated;
grant execute on function delete_app_user(text) to authenticated;

-- reset_demo_data(): same body, now gated. Guests can no longer wipe the demo.
create or replace function reset_demo_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not authorised to reset demo data';
  end if;

  create temp table _keep_engineers on commit drop as
    select * from engineers
    where id not in (
      'a1111111-1111-1111-1111-111111111111',
      'a2222222-2222-2222-2222-222222222222',
      'a3333333-3333-3333-3333-333333333333',
      'a4444444-4444-4444-4444-444444444444',
      'a5555555-5555-5555-5555-555555555555'
    );
  create temp table _keep_roster on commit drop as
    select r.* from roster_entries r
    join _keep_engineers e on e.id = r.engineer_id;

  perform reset_demo_core();
  perform generate_extended_fleet();
  perform seed_damage_and_photos();

  insert into engineers select * from _keep_engineers;
  insert into roster_entries select * from _keep_roster;
end $$;

revoke all on function reset_demo_data() from public, anon;
grant execute on function reset_demo_data() to authenticated;

-- CRITICAL. These helpers are SECURITY DEFINER, zero-arg, and were granted EXECUTE
-- to `anon` by Supabase's default privileges — which makes them callable as
-- unauthenticated PostgREST RPCs using the publishable key that ships in the JS
-- bundle. reset_demo_core() TRUNCATEs the database, audit_log included. Gating
-- reset_demo_data() alone would have left this back door wide open.
-- reset_demo_data() is SECURITY DEFINER owned by postgres, so it keeps EXECUTE on
-- them as owner; nothing else needs it.
revoke all on function reset_demo_core() from public, anon, authenticated;
revoke all on function generate_extended_fleet() from public, anon, authenticated;
revoke all on function seed_damage_and_photos() from public, anon, authenticated;

-- rls_auto_enable() exists on the live project but was created ad-hoc and never
-- mirrored into a migration, so it does not exist on a fresh `supabase db push`.
-- An unguarded REVOKE would abort the push for every self-hoster.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- 6. Audit actor: the authenticated identity, set server-side -----------------
-- `actor` stays as-is (it carries the engineer attribution the sign-off flow
-- records, e.g. "Priya Nair (UK.66.10042)") but is client-supplied and therefore
-- forgeable. actor_user records who was actually signed in; the client cannot set
-- it, because the trigger overwrites whatever it sends.

alter table audit_log add column if not exists actor_user text;

create or replace function set_audit_actor_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- limit 1: this trigger is in the path of EVERY write in the app (logAudit throws
  -- on failure), so a multi-row subquery here would take the whole system down.
  new.actor_user := coalesce(
    (select au.username from allowed_users au where au.user_id = auth.uid() limit 1),
    case when coalesce(auth.jwt() ->> 'role', '') = 'service_role' then 'service_role' end,
    'unknown'
  );
  return new;
end $$;

drop trigger if exists trg_audit_actor_user on audit_log;
create trigger trg_audit_actor_user
before insert on audit_log
for each row execute function set_audit_actor_user();
