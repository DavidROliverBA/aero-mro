-- Workforce planning (management functions): duty roster per engineer/day.
-- Supports the 145.A.30 man-hour plan, certifying-coverage gap detection and
-- licence-expiry horizon. Demo data only. (Mirror of the migration applied
-- remotely via MCP on 2026-07-11.)

do $$ begin
  create type duty_shift as enum ('early','late','night','off','leave','training');
exception when duplicate_object then null; end $$;

create table roster_entries (
  id          uuid primary key default gen_random_uuid(),
  engineer_id uuid not null references engineers(id) on delete cascade,
  duty_date   date not null,
  shift       duty_shift not null,
  base        text not null default 'LGW',
  unique (engineer_id, duty_date)
);

alter table roster_entries enable row level security;
create policy "auth_all" on roster_entries for all to authenticated using (true) with check (true);

-- Seed: 14 days (D-3 .. D+10). Weekly patterns engineered so the demo shows
-- real gaps: LGW A320 cover missing at weekends (Priya+Tom off), LHR B789
-- cover missing Mon+Tue (Daniel off, Grace's licence expired).

insert into roster_entries (engineer_id, duty_date, shift, base)
select 'a1111111-1111-1111-1111-111111111111', d::date,
       (case when extract(dow from d) in (0,6) then 'off' else 'early' end)::duty_shift, 'LGW'
from generate_series(current_date - 3, current_date + 10, interval '1 day') d;

insert into roster_entries (engineer_id, duty_date, shift, base)
select 'a2222222-2222-2222-2222-222222222222', d::date,
       (case
          when d::date between current_date + 2 and current_date + 4 then 'leave'
          when extract(dow from d) in (0,6) then 'off'
          else 'late'
        end)::duty_shift, 'LGW'
from generate_series(current_date - 3, current_date + 10, interval '1 day') d;

insert into roster_entries (engineer_id, duty_date, shift, base)
select 'a3333333-3333-3333-3333-333333333333', d::date,
       (case
          when d::date = current_date + 3 then 'training'
          when extract(dow from d) in (0,6) then 'off'
          else 'early'
        end)::duty_shift, 'LHR'
from generate_series(current_date - 3, current_date + 10, interval '1 day') d;

insert into roster_entries (engineer_id, duty_date, shift, base)
select 'a4444444-4444-4444-4444-444444444444', d::date,
       (case when extract(dow from d) in (1,2) then 'off' else 'night' end)::duty_shift, 'LHR'
from generate_series(current_date - 3, current_date + 10, interval '1 day') d;

insert into roster_entries (engineer_id, duty_date, shift, base)
select 'a5555555-5555-5555-5555-555555555555', d::date,
       (case when extract(dow from d) in (0,6) then 'off' else 'early' end)::duty_shift, 'LGW'
from generate_series(current_date - 3, current_date + 10, interval '1 day') d;

insert into audit_log (entity, action, actor, detail) values
  ('roster_entries', 'Roster published', 'Workforce planning', '14-day duty roster published for LGW and LHR line stations');
