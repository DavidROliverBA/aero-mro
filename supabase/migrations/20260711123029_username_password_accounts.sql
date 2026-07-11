-- Username + password accounts, layered on Supabase Auth (GoTrue does the
-- bcrypt hashing and session handling — we never store passwords ourselves).
-- Usernames map to synthetic emails <username>@aeromro.demo. The allow-list
-- becomes the username registry, optionally linked to an engineer so My Work
-- and sign-offs bind to the login identity.
-- (Mirror of the migration applied remotely via MCP on 2026-07-11.)

alter table allowed_users rename column github_username to username;
alter table allowed_users add column engineer_id uuid references engineers(id) on delete set null;
alter table allowed_users add column auth_kind text not null default 'github'
  check (auth_kind in ('github', 'password'));

create or replace function is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from allowed_users
    where username = coalesce(auth.jwt() -> 'user_metadata' ->> 'user_name', '')
  );
$$;

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
  if not is_allowed() then
    raise exception 'Not authorised to manage users';
  end if;
  if p_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
    raise exception 'Username must be 3-32 chars: lowercase letters, digits, . _ - (starting alphanumeric)';
  end if;
  if length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters';
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
  insert into allowed_users (username, engineer_id, auth_kind)
  values (p_username, p_engineer_id, 'password');

  insert into audit_log (entity, action, actor, detail)
  values ('allowed_users', 'User account created',
          coalesce(auth.jwt() -> 'user_metadata' ->> 'user_name', 'system'),
          p_username || case when p_engineer_id is not null then ' (linked to engineer)' else '' end);
  return p_username;
end $$;

create or replace function delete_app_user(p_username text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_kind text;
begin
  if not is_allowed() then
    raise exception 'Not authorised to manage users';
  end if;
  if p_username = coalesce(auth.jwt() -> 'user_metadata' ->> 'user_name', '') then
    raise exception 'You cannot remove your own account';
  end if;
  select auth_kind into v_kind from allowed_users where username = p_username;
  if v_kind is null then
    raise exception 'Unknown user %', p_username;
  end if;
  delete from allowed_users where username = p_username;
  if v_kind = 'password' then
    delete from auth.users where email = p_username || '@aeromro.demo';
  end if;
  insert into audit_log (entity, action, actor, detail)
  values ('allowed_users', 'User account removed',
          coalesce(auth.jwt() -> 'user_metadata' ->> 'user_name', 'system'), p_username);
end $$;

revoke all on function create_app_user(text, text, uuid) from public;
revoke all on function delete_app_user(text) from public;
grant execute on function create_app_user(text, text, uuid) to authenticated;
grant execute on function delete_app_user(text) to authenticated;

update allowed_users set auth_kind = 'password' where username = 'ux-test';
