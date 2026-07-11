-- Demo reset now preserves engineers added since seeding (and their roster
-- entries). The five seeded engineers have fixed UUIDs; anything else is
-- user-added and survives the reset, so Settings-created logins keep their
-- engineer links. (Mirror of the migration applied remotely via MCP 2026-07-11.)

create or replace function reset_demo_data() returns void
language plpgsql security definer set search_path = public as $$
begin
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

  insert into engineers select * from _keep_engineers;
  insert into roster_entries select * from _keep_roster;
end $$;

revoke all on function reset_demo_data() from public;
grant execute on function reset_demo_data() to authenticated;
