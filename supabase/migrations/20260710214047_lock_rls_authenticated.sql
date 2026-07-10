-- Replace the public demo_all policies with authenticated-only access.
-- Applied 2026-07-10 after GitHub OAuth sign-in was confirmed working.
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
