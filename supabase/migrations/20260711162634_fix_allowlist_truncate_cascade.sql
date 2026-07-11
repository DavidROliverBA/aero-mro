-- BUG FIX: allowed_users gained an FK to engineers, which put it in the blast
-- radius of reset_demo_data()'s TRUNCATE ... engineers ... CASCADE — every
-- demo reset wiped the allow-list and locked all users out (found by the
-- Playwright suites going 6-red after the 100-aircraft reset). Drop the FK
-- (the link is validated inside create_app_user instead) so TRUNCATE CASCADE
-- can never touch the registry, and restore the baseline allow-list.
-- (Mirror of the migration applied remotely via MCP on 2026-07-11. The
-- re-issued create_app_user is identical to 20260711123029's version plus an
-- explicit `p_engineer_id exists in engineers` check replacing the FK.)

alter table allowed_users drop constraint allowed_users_engineer_id_fkey;

insert into allowed_users (username, auth_kind) values
  ('DavidROliverBA', 'github'),
  ('ux-test', 'password')
on conflict (username) do nothing;
-- create_app_user re-issued with explicit engineer existence check — see
-- remote migration 20260711162634 for the full body.
