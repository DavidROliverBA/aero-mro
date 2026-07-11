-- Comprehensive MRO modules: electronic tech log, task-card sign-off with
-- independent inspection, tooling calibration (145.A.40), stores upgrade
-- (145.A.42), maintenance programme + due list (CAMO), LLP tracking (M.A.305),
-- quality audits/CAPA (145.A.65). Demo data only — Albion Atlantic Airways.
-- (Mirror of the migration applied remotely via MCP on 2026-07-11; seed rows
-- use current_date arithmetic so the demo stays evergreen.)

do $$ begin
  create type flight_status  as enum ('open','closed');
  create type tool_condition as enum ('serviceable','quarantine');
  create type audit_status   as enum ('planned','in_progress','closed');
  create type finding_level  as enum ('level_1','level_2','observation');
exception when duplicate_object then null; end $$;

create table flights (
  id             uuid primary key default gen_random_uuid(),
  aircraft_id    uuid not null references aircraft(id) on delete cascade,
  flight_no      text not null,
  flight_date    date not null,
  dep            text not null,
  arr            text not null,
  block_hours    numeric(4,1) not null,
  cycles         integer not null default 1,
  captain        text not null,
  fuel_uplift_kg integer,
  oil_uplift_qt  numeric(4,1),
  status         flight_status not null default 'closed',
  remarks        text,
  created_at     timestamptz not null default now()
);

alter table task_cards
  add column completed_by uuid references engineers(id),
  add column completed_at timestamptz,
  add column inspected_by uuid references engineers(id),
  add column inspected_at timestamptz;

alter table parts
  add column location text,
  add column quantity integer not null default 1;

create table tools (
  id              uuid primary key default gen_random_uuid(),
  tool_no         text not null unique,
  description     text not null,
  location        text not null,
  last_calibrated date,
  calibration_due date,
  condition       tool_condition not null default 'serviceable',
  assigned_to     uuid references engineers(id),
  created_at      timestamptz not null default now()
);

create table mp_tasks (
  id              uuid primary key default gen_random_uuid(),
  task_code       text not null unique,
  applies_to_type text not null,
  title           text not null,
  ata_chapter     text,
  interval_fh     numeric(8,1),
  interval_fc     integer,
  interval_days   integer,
  source          text not null default 'MPD',
  created_at      timestamptz not null default now()
);

create table mp_compliance (
  id             uuid primary key default gen_random_uuid(),
  mp_task_id     uuid not null references mp_tasks(id) on delete cascade,
  aircraft_id    uuid not null references aircraft(id) on delete cascade,
  last_done_date date,
  last_done_fh   numeric(10,1),
  last_done_fc   integer,
  work_order_id  uuid references work_orders(id),
  unique (mp_task_id, aircraft_id)
);

create table llp_components (
  id             uuid primary key default gen_random_uuid(),
  aircraft_id    uuid not null references aircraft(id) on delete cascade,
  part_number    text not null,
  serial_number  text not null,
  description    text not null,
  position       text,
  limit_fc       integer,
  limit_fh       numeric(10,1),
  accumulated_fc integer not null default 0,
  accumulated_fh numeric(10,1) not null default 0,
  installed_on   date
);

create table audits (
  id             uuid primary key default gen_random_uuid(),
  audit_ref      text not null unique,
  area           text not null,
  regulation_ref text,
  audit_date     date not null,
  auditor        text not null,
  status         audit_status not null default 'planned'
);

create table audit_findings (
  id                uuid primary key default gen_random_uuid(),
  audit_id          uuid not null references audits(id) on delete cascade,
  level             finding_level not null,
  description       text not null,
  corrective_action text,
  owner             text,
  due_date          date,
  status            text not null default 'open' check (status in ('open','closed')),
  closed_at         timestamptz
);

do $$
declare t text;
begin
  foreach t in array array[
    'flights','tools','mp_tasks','mp_compliance','llp_components','audits','audit_findings'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- Seed (abridged header — identical data to the applied migration) ------------
insert into flights (aircraft_id, flight_no, flight_date, dep, arr, block_hours, cycles, captain, fuel_uplift_kg, oil_uplift_qt, status, remarks) values
  ('11111111-1111-1111-1111-111111111111','AB412', current_date - 1,'LGW','BCN', 2.1, 1,'Capt. R. Osei',      6200, 1.0,'closed', null),
  ('11111111-1111-1111-1111-111111111111','AB413', current_date - 1,'BCN','LGW', 2.2, 1,'Capt. R. Osei',      6350, null,'closed', null),
  ('11111111-1111-1111-1111-111111111111','AB204', current_date,    'LGW','AMS', 1.2, 1,'Capt. J. Hartley',   4100, null,'open',  'LH MLG tyre pressure checked before departure per open MEL item.'),
  ('55555555-5555-5555-5555-555555555555','AB318', current_date - 2,'LGW','FCO', 2.6, 1,'Capt. M. Duval',     7800, 0.5,'closed', 'Wx radar intermittent again on Capt side — see defect log.'),
  ('55555555-5555-5555-5555-555555555555','AB319', current_date - 2,'FCO','LGW', 2.7, 1,'Capt. M. Duval',     7900, null,'closed', null),
  ('55555555-5555-5555-5555-555555555555','AB210', current_date - 1,'LGW','GVA', 1.6, 1,'Capt. K. Adeyemi',   5100, null,'closed', null),
  ('33333333-3333-3333-3333-333333333333','AB101', current_date - 3,'LHR','JFK', 7.9, 1,'Capt. S. Bakare',   62000, 4.0,'closed', 'APU slow start on turnaround — deferred per MEL 49-00-00c.'),
  ('33333333-3333-3333-3333-333333333333','AB102', current_date - 2,'JFK','LHR', 6.8, 1,'Capt. S. Bakare',   58000, null,'closed', null),
  ('33333333-3333-3333-3333-333333333333','AB103', current_date,    'LHR','SIN',12.9, 1,'Capt. E. Nwosu',   102000, 3.5,'open',  null);

update task_cards set completed_by = 'a1111111-1111-1111-1111-111111111111', completed_at = now() - interval '2 days'
  where description = 'Perform borescope inspection of No.2 engine HP turbine';
update task_cards set completed_by = 'a4444444-4444-4444-4444-444444444444', completed_at = now() - interval '4 days'
  where description = 'Open all access panels, zonal inspection';
update task_cards set completed_by = 'a1111111-1111-1111-1111-111111111111', completed_at = now() - interval '3 days'
  where description = 'Jack aircraft, remove LH MLG wheel';
update task_cards set
  completed_by = 'a1111111-1111-1111-1111-111111111111', completed_at = now() - interval '3 days',
  inspected_by = 'a4444444-4444-4444-4444-444444444444', inspected_at = now() - interval '3 days'
  where description = 'Fit serviceable wheel assembly, torque & lockwire';

update parts set location = 'LGW Stores A-12' where part_number = 'C20486-3';
update parts set location = 'LHR U/S Bay Q-2' where part_number = '3960100-4';
update parts set location = 'LGW Stores B-04' where part_number = '622-4790';
update parts set location = 'LGW Stores C-31', quantity = 6 where part_number = 'HTL-0032';
update parts set location = 'LGW Stores A-03' where part_number = 'EGT-7781';
insert into parts (part_number, serial_number, description, condition, form1_ref, shelf_expiry, fitted_to, ata_chapter, location, quantity) values
  ('SEAL-889-C', null,      'Cargo door seal kit, B787',            'serviceable', 'F1-2026-6012', current_date - 11, null, '52', 'LHR Stores D-08', 2),
  ('BRK-4402-1', 'SN-70233','Brake unit, A320 main gear',           'quarantine',  null,           null,              null, '32', 'LGW Quarantine Q-1', 1),
  ('O2-GEN-115', null,      'Passenger oxygen generator (15-min)',  'serviceable', 'F1-2026-7104', current_date + 24, null, '35', 'LGW Stores E-17', 12);

insert into tools (tool_no, description, location, last_calibrated, calibration_due, condition, assigned_to) values
  ('TL-0107','Torque wrench 40–200 Nm',            'LGW Line Van 2',   current_date - 386, current_date - 21, 'serviceable', 'a2222222-2222-2222-2222-222222222222'),
  ('TL-0212','Pitot-static test set',              'LGW Avionics Bay', current_date - 352, current_date + 13, 'serviceable', null),
  ('TL-0345','Video borescope, 6mm probe',         'LHR Tool Store',   current_date - 120, current_date + 245,'serviceable', null),
  ('TL-0433','Aircraft jack 35T (tail)',           'LHR Hangar 3',     current_date - 200, current_date + 165,'serviceable', null),
  ('TL-0518','Crimp tool, MS3191 contacts',        'LGW Quarantine',   current_date - 400, current_date - 35, 'quarantine',  null),
  ('TL-0609','Digital multimeter, CAT III',        'LGW Avionics Bay', current_date - 90,  current_date + 275,'serviceable', 'a4444444-4444-4444-4444-444444444444');

insert into mp_tasks (id, task_code, applies_to_type, title, ata_chapter, interval_fh, interval_fc, interval_days, source) values
  ('d1111111-1111-1111-1111-111111111111','AMP-A320-05-01','A320','A-Check package',                        '05', 600,  500,  120, 'MPD'),
  ('d2222222-2222-2222-2222-222222222222','AMP-A320-32-02','A320','MLG functional & retraction check',      '32', 2400, null, 365, 'MPD'),
  ('d3333333-3333-3333-3333-333333333333','AMP-A320-27-03','A320','Flap/slat track lubrication',            '27', null, 900,  180, 'MPD'),
  ('d4444444-4444-4444-4444-444444444444','AMP-A320-72-04','A320','Engine borescope inspection (V2500)',    '72', 750,  null, null,'SB'),
  ('d5555555-5555-5555-5555-555555555555','AMP-B789-05-01','B789','A-Check equivalent package',             '05', 1000, null, 120, 'MPD'),
  ('d6666666-6666-6666-6666-666666666666','AMP-B789-21-02','B789','ECS pack filter replacement',            '21', null, null, 180, 'MPD'),
  ('d7777777-7777-7777-7777-777777777777','AMP-B789-28-03','B789','Fuel tank entry & sealant inspection',   '28', 6000, null, null,'MPD');

insert into mp_compliance (mp_task_id, aircraft_id, last_done_date, last_done_fh, last_done_fc) values
  ('d1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111', current_date - 113, 27900.0, 13890),
  ('d1111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222', current_date - 133, 30560.0, 15540),
  ('d1111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555', current_date - 92,  11600.0, 5980),
  ('d2222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111', current_date - 299, 26800.0, 13480),
  ('d3333333-3333-3333-3333-333333333333','55555555-5555-5555-5555-555555555555', current_date - 160, 11400.0, 5600),
  ('d4444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222', current_date - 60,  30800.0, 15690),
  ('d4444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111', current_date - 45,  28100.0, 14150),
  ('d5555555-5555-5555-5555-555555555555','33333333-3333-3333-3333-333333333333', current_date - 100, 19200.0, 3010),
  ('d5555555-5555-5555-5555-555555555555','44444444-4444-4444-4444-444444444444', current_date - 128, 19800.0, 3140),
  ('d6666666-6666-6666-6666-666666666666','33333333-3333-3333-3333-333333333333', current_date - 130, 19350.0, 3035),
  ('d7777777-7777-7777-7777-777777777777','33333333-3333-3333-3333-333333333333', current_date - 400, 15200.0, 2410);

insert into llp_components (aircraft_id, part_number, serial_number, description, position, limit_fc, limit_fh, accumulated_fc, accumulated_fh, installed_on) values
  ('11111111-1111-1111-1111-111111111111','D23468-11','LLP-90112','MLG main fitting',            'LH MLG',    25000, null, 24310, 47100.0, '2019-02-14'),
  ('11111111-1111-1111-1111-111111111111','D23470-3', 'LLP-90340','NLG shock strut',             'NLG',       30000, null, 14320, 28450.5, '2016-06-01'),
  ('22222222-2222-2222-2222-222222222222','2A5001-77','LLP-71554','HPT disk stage 1 (V2527-A5)', 'No.2 eng',  20000, null, 18750, 36900.0, '2017-09-30'),
  ('33333333-3333-3333-3333-333333333333','GEN-X-441','LLP-30877','Fan disk (GEnx-1B)',          'No.1 eng',  30000, null, 3120,  19870.2, '2022-03-11'),
  ('55555555-5555-5555-5555-555555555555','D23468-11','LLP-91055','MLG main fitting',            'RH MLG',    25000, null, 6210,  12030.0, '2021-08-20');

insert into audits (id, audit_ref, area, regulation_ref, audit_date, auditor, status) values
  ('e1111111-1111-1111-1111-111111111111','AUD-2026-04','Stores & goods-in',      '145.A.42', current_date - 58, 'S. Whitfield (Quality)', 'closed'),
  ('e2222222-2222-2222-2222-222222222222','AUD-2026-06','Line maintenance — LGW', '145.A.45', current_date - 16, 'S. Whitfield (Quality)', 'in_progress'),
  ('e3333333-3333-3333-3333-333333333333','AUD-2026-07','Tooling & calibration',  '145.A.40', current_date + 18, 'M. Ashcroft (Quality)',  'planned');

insert into audit_findings (audit_id, level, description, corrective_action, owner, due_date, status, closed_at) values
  ('e1111111-1111-1111-1111-111111111111','level_2',    'Two rotables in serviceable rack without Form 1 attached to bin record.', 'Form 1 scans attached to stock records; goods-in checklist amended.', 'Stores supervisor', current_date - 30, 'closed', now() - interval '35 days'),
  ('e2222222-2222-2222-2222-222222222222','level_2',    'Task cards on night shift found signed without stamp/licence reference.',  'Toolbox talk delivered; stamp audit across line stations.',            'Line manager LGW',  current_date - 6,  'open',   null),
  ('e2222222-2222-2222-2222-222222222222','observation','Tool control checklist not consistently completed at shift handover.',     null,                                                                    'Line manager LGW',  current_date + 35, 'open',   null);

insert into defects (aircraft_id, raised_by, description, ata_chapter, severity, status, raised_at, closed_at) values
  ('55555555-5555-5555-5555-555555555555','Capt. M. Duval','Weather radar display blanking intermittently, Capt side.','34','major','closed', now() - interval '52 days', now() - interval '50 days'),
  ('55555555-5555-5555-5555-555555555555','ENG-1088',     'Wx radar transceiver BITE fault on ground test.',           '34','minor','closed', now() - interval '31 days', now() - interval '30 days'),
  ('22222222-2222-2222-2222-222222222222','Capt. R. Osei','Pack 1 overheat caution in cruise, reset OK.',              '21','major','closed', now() - interval '74 days', now() - interval '70 days'),
  ('22222222-2222-2222-2222-222222222222','FO L. Byrne',  'Pack 1 overheat caution recurred on climb.',                '21','major','closed', now() - interval '48 days', now() - interval '44 days'),
  ('22222222-2222-2222-2222-222222222222','ENG-1042',     'Pack 1 flow control valve sluggish on functional test.',    '21','major','closed', now() - interval '20 days', now() - interval '18 days'),
  ('33333333-3333-3333-3333-333333333333','Capt. S. Bakare','Cabin interphone crackle, doors 2L/2R stations.',         '23','minor','closed', now() - interval '15 days', now() - interval '12 days');

insert into audit_log (entity, entity_id, action, actor, detail) values
  ('tools',          null, 'Tool quarantined',       'Tom Harding',            'TL-0518 crimp tool dropped — quarantined pending inspection'),
  ('audit_findings', null, 'Finding raised',         'S. Whitfield (Quality)', 'AUD-2026-06: night-shift task cards signed without stamp reference'),
  ('flights',        null, 'Tech log sector closed', 'Capt. S. Bakare',        'AB102 JFK-LHR closed, 6.8 FH');
