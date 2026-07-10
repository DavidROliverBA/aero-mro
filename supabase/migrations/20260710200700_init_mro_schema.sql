-- ============================================================================
-- AeroMRO — Part-145 / CAMO maintenance data model
-- Regulatory basis: UK CAA (UK Reg (EU) 1321/2014 as retained) & EASA Part-145
-- (Approved Maintenance Organisation) + Part-M / Part-CAMO (Continuing
-- Airworthiness Management) + Part-66 (Certifying Staff Licensing).
--
-- DEMO DATA ONLY. Fictional airline "Albion Atlantic Airways". No real airline
-- operational data. Paste this whole file into the Supabase SQL Editor and Run.
-- ============================================================================

-- Clean slate (safe to re-run) -------------------------------------------------
drop table if exists audit_log cascade;
drop table if exists ad_compliance cascade;
drop table if exists airworthiness_directives cascade;
drop table if exists crs_releases cascade;
drop table if exists task_cards cascade;
drop table if exists work_orders cascade;
drop table if exists parts cascade;
drop table if exists defects cascade;
drop table if exists engineers cascade;
drop table if exists aircraft cascade;

-- Enumerated domains ----------------------------------------------------------
do $$ begin
  create type aircraft_status as enum ('in_service', 'scheduled_maintenance', 'aog', 'stored');
  create type defect_status   as enum ('open', 'deferred', 'closed');
  create type mel_category     as enum ('A', 'B', 'C', 'D');          -- MMEL rectification intervals
  create type wo_type          as enum ('scheduled', 'unscheduled', 'ad_sb', 'mod');
  create type wo_status        as enum ('open', 'in_progress', 'awaiting_parts', 'awaiting_crs', 'closed');
  create type task_status      as enum ('open', 'in_progress', 'complete', 'inspected');
  create type part_condition   as enum ('serviceable', 'unserviceable', 'scrap', 'quarantine');
  create type ad_status        as enum ('open', 'complied', 'not_applicable', 'repetitive_active');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- ENTITIES
-- ============================================================================

-- Fleet -----------------------------------------------------------------------
create table aircraft (
  id               uuid primary key default gen_random_uuid(),
  registration     text not null unique,          -- e.g. G-ALBA (UK reg prefix)
  type_designator  text not null,                 -- ICAO type, e.g. A320, B789
  msn              text not null,                  -- manufacturer serial number
  operator         text not null default 'Albion Atlantic Airways',
  total_hours      numeric(10,1) not null default 0,
  total_cycles     integer not null default 0,
  status           aircraft_status not null default 'in_service',
  base             text not null default 'LGW',    -- home base ICAO/IATA
  next_check_type  text,                           -- e.g. 'A-Check', 'C-Check'
  next_check_due   date,
  created_at       timestamptz not null default now()
);

-- Part-66 certifying staff ----------------------------------------------------
create table engineers (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null,
  staff_no           text not null unique,
  part66_licence_no  text not null unique,         -- UK.66.xxxxx
  licence_categories text[] not null default '{}', -- {B1.1, B2, C}
  type_ratings       text[] not null default '{}', -- {A320, B787}
  licence_expiry     date not null,
  company_auth       boolean not null default true,-- Part-145 company authorisation held
  created_at         timestamptz not null default now()
);

-- ============================================================================
-- EVENTS / RECORDS
-- ============================================================================

-- Defects (tech log entries + deferred defect register) -----------------------
create table defects (
  id             uuid primary key default gen_random_uuid(),
  aircraft_id    uuid not null references aircraft(id) on delete cascade,
  raised_at      timestamptz not null default now(),
  raised_by      text not null,                    -- flight crew or engineer
  description    text not null,
  ata_chapter    text,                             -- e.g. '32' Landing Gear
  mel_reference  text,                             -- MEL item, e.g. '32-41-01a'
  mel_cat        mel_category,                     -- null if not deferred under MEL
  severity       text not null default 'minor',    -- minor | major | critical
  status         defect_status not null default 'open',
  deferred_until date,                             -- MEL rectification deadline
  closed_at      timestamptz,
  ai_triaged     boolean not null default false    -- flagged when AI populated fields
);

-- Serialised / rotable parts with EASA Form 1 traceability --------------------
create table parts (
  id             uuid primary key default gen_random_uuid(),
  part_number    text not null,
  serial_number  text,                             -- null for consumables
  description    text not null,
  condition      part_condition not null default 'serviceable',
  form1_ref      text,                             -- EASA Form 1 (authorised release) ref
  shelf_expiry   date,                             -- for life-limited / cure-dated stock
  fitted_to      uuid references aircraft(id) on delete set null,
  ata_chapter    text,
  created_at     timestamptz not null default now()
);

-- Work orders -----------------------------------------------------------------
create table work_orders (
  id           uuid primary key default gen_random_uuid(),
  wo_number    text not null unique,               -- WO-2026-0001
  aircraft_id  uuid not null references aircraft(id) on delete cascade,
  title        text not null,
  wo_type      wo_type not null default 'unscheduled',
  status       wo_status not null default 'open',
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  source_defect uuid references defects(id) on delete set null
);

-- Task cards (steps within a work order) --------------------------------------
create table task_cards (
  id                  uuid primary key default gen_random_uuid(),
  work_order_id       uuid not null references work_orders(id) on delete cascade,
  sequence            integer not null default 1,
  description         text not null,
  ata_chapter         text,
  status              task_status not null default 'open',
  assigned_engineer   uuid references engineers(id) on delete set null,
  est_hours           numeric(5,1) not null default 1,
  requires_inspection boolean not null default false   -- duplicate/independent inspection needed
);

-- Certificate of Release to Service (CRS) -------------------------------------
create table crs_releases (
  id             uuid primary key default gen_random_uuid(),
  work_order_id  uuid not null references work_orders(id) on delete cascade,
  engineer_id    uuid not null references engineers(id),
  released_at    timestamptz not null default now(),
  statement      text not null,                    -- the Part-145.A.50 release statement
  licence_valid  boolean not null default false,   -- verified Part-66 licence + type rating at release
  ai_drafted     boolean not null default false
);

-- Airworthiness Directives (AD) & Service Bulletins ---------------------------
create table airworthiness_directives (
  id               uuid primary key default gen_random_uuid(),
  ad_number        text not null unique,           -- e.g. EASA AD 2026-0123
  authority        text not null,                  -- EASA | UK CAA | FAA
  applies_to_type  text not null,                  -- ICAO type designator
  subject          text not null,
  effective_date   date not null,
  compliance_by    date,                           -- terminating action deadline
  repetitive       boolean not null default false,
  interval_days    integer,                        -- for repetitive ADs
  created_at       timestamptz not null default now()
);

-- Per-aircraft AD compliance status -------------------------------------------
create table ad_compliance (
  id            uuid primary key default gen_random_uuid(),
  ad_id         uuid not null references airworthiness_directives(id) on delete cascade,
  aircraft_id   uuid not null references aircraft(id) on delete cascade,
  status        ad_status not null default 'open',
  complied_at   date,
  next_due      date,                              -- for repetitive ADs
  work_order_id uuid references work_orders(id) on delete set null,
  unique (ad_id, aircraft_id)
);

-- Immutable-ish audit trail (Part-145 record-keeping) -------------------------
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,
  entity_id   uuid,
  action      text not null,
  actor       text not null default 'system',
  detail      text,
  logged_at   timestamptz not null default now()
);

-- Helpful indexes -------------------------------------------------------------
create index on defects (aircraft_id, status);
create index on defects (deferred_until) where status = 'deferred';
create index on work_orders (aircraft_id, status);
create index on task_cards (work_order_id);
create index on ad_compliance (aircraft_id, status);
create index on parts (fitted_to);

-- ============================================================================
-- ROW-LEVEL SECURITY
-- Demo posture: RLS enabled, anon key granted read + write so the single-page
-- app works with only the publishable key. In production you would scope these
-- policies to authenticated roles (certifying staff, planners, quality).
-- ============================================================================
alter table aircraft                 enable row level security;
alter table engineers                enable row level security;
alter table defects                  enable row level security;
alter table parts                    enable row level security;
alter table work_orders              enable row level security;
alter table task_cards               enable row level security;
alter table crs_releases             enable row level security;
alter table airworthiness_directives enable row level security;
alter table ad_compliance            enable row level security;
alter table audit_log                enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'aircraft','engineers','defects','parts','work_orders','task_cards',
    'crs_releases','airworthiness_directives','ad_compliance','audit_log'
  ]
  loop
    execute format('create policy "demo_all" on %I for all using (true) with check (true);', t);
  end loop;
end $$;
