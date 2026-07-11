-- Integrity hardening: sign-in allow-list, append-only audit log, and
-- database-enforced invariants (unique card sequence, independent inspector,
-- WO numbering sequence, FH/FC roll-up trigger).
-- (Mirror of the migration applied remotely via MCP on 2026-07-11.)

create table allowed_users (
  github_username text primary key,
  added_at timestamptz not null default now()
);
alter table allowed_users enable row level security;
create policy "read_allowed" on allowed_users for select to authenticated using (true);
insert into allowed_users (github_username) values ('DavidROliverBA'), ('ux-test');

create or replace function is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from allowed_users
    where github_username = coalesce(auth.jwt() -> 'user_metadata' ->> 'user_name', '')
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'aircraft','engineers','defects','parts','work_orders','task_cards',
    'crs_releases','airworthiness_directives','ad_compliance',
    'flights','tools','mp_tasks','mp_compliance','llp_components',
    'audits','audit_findings','roster_entries'
  ] loop
    execute format('drop policy if exists "auth_all" on %I;', t);
    execute format('create policy "allowed_all" on %I for all to authenticated using (is_allowed()) with check (is_allowed());', t);
  end loop;
end $$;

-- Audit log: append-only (select + insert; no update/delete policy exists)
drop policy if exists "auth_all" on audit_log;
create policy "audit_read"   on audit_log for select to authenticated using (is_allowed());
create policy "audit_insert" on audit_log for insert to authenticated with check (is_allowed());

-- Task-card invariants
alter table task_cards add constraint task_cards_unique_seq unique (work_order_id, sequence);
alter table task_cards add constraint task_cards_independent_inspector
  check (inspected_by is null or completed_by is null or inspected_by <> completed_by);

-- WO numbering from a sequence
create sequence if not exists wo_number_seq start 4;
create or replace function next_wo_number() returns text
language sql volatile set search_path = public as $$
  select 'WO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('wo_number_seq')::text, 4, '0');
$$;
alter table work_orders alter column wo_number set default next_wo_number();

-- FH/FC roll-up as a trigger (single source of truth; app code no longer
-- updates aircraft totals). Skipped while reset_demo_data() runs, signalled
-- by a transaction-local GUC.
create or replace function roll_flight_onto_aircraft() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('aeromro.resetting', true), '') = 'on' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.status = 'closed')
     or (tg_op = 'UPDATE' and old.status = 'open' and new.status = 'closed') then
    update aircraft
      set total_hours = total_hours + new.block_hours,
          total_cycles = total_cycles + new.cycles
      where id = new.aircraft_id;
  end if;
  return new;
end $$;

create trigger trg_roll_flight
  after insert or update on flights
  for each row execute function roll_flight_onto_aircraft();
