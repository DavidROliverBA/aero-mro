-- Reproducibility consolidation: re-issues the FINAL body of every database
-- function so a fresh `supabase db push` over this migration series yields a
-- correct system, regardless of the pointer-style mirrors of intermediate
-- versions (20260711115954, 20260712080259). On the original project this was
-- a no-op re-statement of current state, verified identical after applying.

-- 1. reset_demo_core: curated hero seed WITH the v2 additions (GUC + setval).
create or replace function reset_demo_core() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('aeromro.resetting', 'on', true);
  perform setval('wo_number_seq', 4, false);

  truncate audit_log, roster_entries, audit_findings, audits, llp_components,
           mp_compliance, mp_tasks, tools, flights, ad_compliance,
           airworthiness_directives, crs_releases, task_cards, work_orders,
           parts, defects, engineers, aircraft restart identity cascade;

  insert into aircraft (id, registration, type_designator, msn, total_hours, total_cycles, status, base, next_check_type, next_check_due) values
    ('11111111-1111-1111-1111-111111111111', 'G-ALBA', 'A320', 'MSN-7421', 28450.5, 14320, 'in_service',            'LGW', 'A-Check', current_date + 17),
    ('22222222-2222-2222-2222-222222222222', 'G-ALBB', 'A320', 'MSN-7503', 31210.0, 15890, 'aog',                   'LGW', 'A-Check', current_date + 34),
    ('33333333-3333-3333-3333-333333333333', 'G-ALBC', 'B789', 'MSN-66112', 19870.2, 3120, 'in_service',            'LHR', 'A-Check', current_date + 53),
    ('44444444-4444-4444-4444-444444444444', 'G-ALBD', 'B789', 'MSN-66145', 20540.8, 3260, 'scheduled_maintenance', 'LHR', 'C-Check', current_date + 4),
    ('55555555-5555-5555-5555-555555555555', 'G-ALBE', 'A320', 'MSN-7688', 12030.0, 6210,  'in_service',            'LGW', 'A-Check', current_date + 92);

  insert into engineers (id, full_name, staff_no, part66_licence_no, licence_categories, type_ratings, licence_expiry, company_auth) values
    ('a1111111-1111-1111-1111-111111111111', 'Priya Nair',      'ENG-1042', 'UK.66.10042', '{B1.1,C}', '{A320,B789}', current_date + 260, true),
    ('a2222222-2222-2222-2222-222222222222', 'Tom Harding',     'ENG-1088', 'UK.66.10088', '{B2}',     '{A320}',      current_date + 20,  true),
    ('a3333333-3333-3333-3333-333333333333', 'Grace Okoro',     'ENG-1120', 'UK.66.11120', '{B1.1}',   '{B789}',      current_date - 11,  true),
    ('a4444444-4444-4444-4444-444444444444', 'Daniel Fischer',  'ENG-1155', 'UK.66.11155', '{B1.1,B2}','{A320,B789}', current_date + 560, true),
    ('a5555555-5555-5555-5555-555555555555', 'Sofia Marchetti', 'ENG-1201', 'UK.66.12201', '{C}',      '{A320,B789}', current_date + 500, false);

  insert into defects (aircraft_id, raised_at, raised_by, description, ata_chapter, mel_reference, mel_cat, severity, status, deferred_until, closed_at) values
    ('22222222-2222-2222-2222-222222222222', now() - interval '2 days',  'Capt. R. Osei', 'No.2 engine EGT exceedance on start; ECAM ENG 2 EGT OVER LIMIT. Aircraft AOG at stand.', '72', null, null, 'critical', 'open', null, null),
    ('11111111-1111-1111-1111-111111111111', now() - interval '1 day',   'FO L. Byrne',   'Left main gear tyre pressure repeatedly below limit at pre-flight.', '32', '32-41-01a', 'B', 'major', 'deferred', current_date + 3, null),
    ('11111111-1111-1111-1111-111111111111', now() - interval '5 days',  'Cabin crew',    'Reading light row 14C inoperative.', '33', '33-21-00d', 'D', 'minor', 'deferred', current_date + 120, null),
    ('33333333-3333-3333-3333-333333333333', now() - interval '3 days',  'ENG-1042',      'APU slow to reach governed speed; auto-shutdown on 2 of 3 attempts.', '49', '49-00-00c', 'C', 'major', 'deferred', current_date + 10, null),
    ('55555555-5555-5555-5555-555555555555', now() - interval '1 day',   'FO K. Adeyemi', 'Weather radar returns intermittent on Capt side display.', '34', null, null, 'major', 'open', null, null),
    ('44444444-4444-4444-4444-444444444444', now() - interval '4 days',  'ENG-1155',      'Cargo door seal perished — found during C-Check inspection.', '52', null, null, 'minor', 'open', null, null),
    ('55555555-5555-5555-5555-555555555555', now() - interval '52 days', 'Capt. M. Duval','Weather radar display blanking intermittently, Capt side.','34', null, null, 'major','closed', null, now() - interval '50 days'),
    ('55555555-5555-5555-5555-555555555555', now() - interval '31 days', 'ENG-1088',      'Wx radar transceiver BITE fault on ground test.','34', null, null, 'minor','closed', null, now() - interval '30 days'),
    ('22222222-2222-2222-2222-222222222222', now() - interval '74 days', 'Capt. R. Osei', 'Pack 1 overheat caution in cruise, reset OK.','21', null, null, 'major','closed', null, now() - interval '70 days'),
    ('22222222-2222-2222-2222-222222222222', now() - interval '48 days', 'FO L. Byrne',   'Pack 1 overheat caution recurred on climb.','21', null, null, 'major','closed', null, now() - interval '44 days'),
    ('22222222-2222-2222-2222-222222222222', now() - interval '20 days', 'ENG-1042',      'Pack 1 flow control valve sluggish on functional test.','21', null, null, 'major','closed', null, now() - interval '18 days'),
    ('33333333-3333-3333-3333-333333333333', now() - interval '15 days', 'Capt. S. Bakare','Cabin interphone crackle, doors 2L/2R stations.','23', null, null, 'minor','closed', null, now() - interval '12 days');

  insert into parts (part_number, serial_number, description, condition, form1_ref, shelf_expiry, fitted_to, ata_chapter, location, quantity) values
    ('C20486-3',  'SN-88231', 'Main wheel & tyre assembly, A320', 'serviceable',   'F1-2026-4471', null,              '11111111-1111-1111-1111-111111111111', '32', 'LGW Stores A-12', 1),
    ('3960100-4', 'SN-11902', 'APU fuel control unit, B787',      'unserviceable', 'F1-2025-9920', null,              null, '49', 'LHR U/S Bay Q-2', 1),
    ('622-4790',  'SN-55012', 'Weather radar transceiver',        'serviceable',   'F1-2026-1180', null,              null, '34', 'LGW Stores B-04', 1),
    ('HTL-0032',  null,       'Hydraulic filter element',         'serviceable',   'F1-2026-3301', current_date + 294, null, '29', 'LGW Stores C-31', 6),
    ('EGT-7781',  'SN-40113', 'EGT thermocouple harness, V2500',  'serviceable',   'F1-2026-5567', null,              null, '72', 'LGW Stores A-03', 1),
    ('SEAL-889-C', null,      'Cargo door seal kit, B787',        'serviceable',   'F1-2026-6012', current_date - 11, null, '52', 'LHR Stores D-08', 2),
    ('BRK-4402-1', 'SN-70233','Brake unit, A320 main gear',       'quarantine',    null,           null,              null, '32', 'LGW Quarantine Q-1', 1),
    ('O2-GEN-115', null,      'Passenger oxygen generator (15-min)','serviceable', 'F1-2026-7104', current_date + 24, null, '35', 'LGW Stores E-17', 12);

  insert into work_orders (id, wo_number, aircraft_id, title, wo_type, status, source_defect) values
    ('b1111111-1111-1111-1111-111111111111', 'WO-2026-0001', '22222222-2222-2222-2222-222222222222', 'No.2 engine EGT exceedance investigation', 'unscheduled', 'awaiting_parts',
       (select id from defects where description like 'No.2 engine EGT%')),
    ('b2222222-2222-2222-2222-222222222222', 'WO-2026-0002', '44444444-4444-4444-4444-444444444444', 'C-Check — G-ALBD', 'scheduled', 'in_progress', null),
    ('b3333333-3333-3333-3333-333333333333', 'WO-2026-0003', '11111111-1111-1111-1111-111111111111', 'LH MLG tyre replacement', 'unscheduled', 'awaiting_crs',
       (select id from defects where description like 'Left main gear tyre%'));

  insert into task_cards (work_order_id, sequence, description, ata_chapter, status, assigned_engineer, est_hours, requires_inspection, completed_by, completed_at, inspected_by, inspected_at) values
    ('b1111111-1111-1111-1111-111111111111', 1, 'Perform borescope inspection of No.2 engine HP turbine', '72', 'complete',    'a1111111-1111-1111-1111-111111111111', 4.0, true,  'a1111111-1111-1111-1111-111111111111', now() - interval '2 days', null, null),
    ('b1111111-1111-1111-1111-111111111111', 2, 'Replace EGT thermocouple harness', '72', 'in_progress', 'a1111111-1111-1111-1111-111111111111', 3.5, false, null, null, null, null),
    ('b2222222-2222-2222-2222-222222222222', 1, 'Open all access panels, zonal inspection', '05', 'complete',    'a4444444-4444-4444-4444-444444444444', 12.0, false, 'a4444444-4444-4444-4444-444444444444', now() - interval '4 days', null, null),
    ('b2222222-2222-2222-2222-222222222222', 2, 'Replace perished cargo door seal', '52', 'in_progress', 'a4444444-4444-4444-4444-444444444444', 2.5, false, null, null, null, null),
    ('b2222222-2222-2222-2222-222222222222', 3, 'Landing gear detailed inspection & lubrication', '32', 'open',        null, 8.0, true,  null, null, null, null),
    ('b3333333-3333-3333-3333-333333333333', 1, 'Jack aircraft, remove LH MLG wheel', '32', 'complete',    'a1111111-1111-1111-1111-111111111111', 1.5, false, 'a1111111-1111-1111-1111-111111111111', now() - interval '3 days', null, null),
    ('b3333333-3333-3333-3333-333333333333', 2, 'Fit serviceable wheel assembly, torque & lockwire', '32', 'inspected',   'a1111111-1111-1111-1111-111111111111', 1.0, true,  'a1111111-1111-1111-1111-111111111111', now() - interval '3 days', 'a4444444-4444-4444-4444-444444444444', now() - interval '3 days');

  insert into crs_releases (work_order_id, engineer_id, statement, licence_valid) values
    ('b3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111',
     'Certifies that the work specified except as otherwise specified was carried out in accordance with Part-145 and in respect to that work the aircraft/component is considered ready for release to service.',
     true);

  insert into airworthiness_directives (id, ad_number, authority, applies_to_type, subject, effective_date, compliance_by, repetitive, interval_days) values
    ('c1111111-1111-1111-1111-111111111111', 'EASA AD 2026-0088', 'EASA',   'A320', 'Wing fuel tank access panel fastener inspection', current_date - 71, current_date + 21, false, null),
    ('c2222222-2222-2222-2222-222222222222', 'UK CAA AD G-2026-04', 'UK CAA', 'B789', 'Repetitive inspection of aft pressure bulkhead fitting', current_date - 87, null, true, 90),
    ('c3333333-3333-3333-3333-333333333333', 'EASA AD 2026-0142', 'EASA',   'A320', 'Slat track lubrication and wear check', current_date - 21, current_date + 162, false, null);

  insert into ad_compliance (ad_id, aircraft_id, status, complied_at, next_due) values
    ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'complied',          current_date - 52, null),
    ('c1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'open',              null, null),
    ('c1111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'open',              null, null),
    ('c2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'repetitive_active', current_date - 62, current_date + 12),
    ('c2222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'repetitive_active', current_date - 60, current_date + 14),
    ('c3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'open',              null, null),
    ('c3333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'open',              null, null);

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

  insert into roster_entries (engineer_id, duty_date, shift, base)
  select 'a1111111-1111-1111-1111-111111111111', d::date,
         (case when extract(dow from d) in (0,6) then 'off' else 'early' end)::duty_shift, 'LGW'
  from generate_series(current_date - 3, current_date + 10, interval '1 day') d;
  insert into roster_entries (engineer_id, duty_date, shift, base)
  select 'a2222222-2222-2222-2222-222222222222', d::date,
         (case when d::date between current_date + 2 and current_date + 4 then 'leave'
               when extract(dow from d) in (0,6) then 'off' else 'late' end)::duty_shift, 'LGW'
  from generate_series(current_date - 3, current_date + 10, interval '1 day') d;
  insert into roster_entries (engineer_id, duty_date, shift, base)
  select 'a3333333-3333-3333-3333-333333333333', d::date,
         (case when d::date = current_date + 3 then 'training'
               when extract(dow from d) in (0,6) then 'off' else 'early' end)::duty_shift, 'LHR'
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
    ('crs_releases',   'CRS issued',              'Priya Nair (UK.66.10042)', 'WO-2026-0003 released to service'),
    ('defects',        'Defect deferred',         'Tom Harding',              'MEL 32-41-01a Cat B applied to G-ALBA tyre defect'),
    ('tools',          'Tool quarantined',        'Tom Harding',              'TL-0518 crimp tool dropped — quarantined pending inspection'),
    ('audit_findings', 'Finding raised',          'S. Whitfield (Quality)',   'AUD-2026-06: night-shift task cards signed without stamp reference'),
    ('system',         'Demo data reset',         'Settings',                 'All demo data restored to seed state');
end $$;

-- 2. seed_damage_and_photos: FINAL version (rn*4 template index — all 9 types occur).
create or replace function seed_damage_and_photos() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int; k int; ti int;
  v_status damage_status;
  v_within boolean;
  types  text[] := array['dent','dent','scratch','scratch','corrosion','lightning strike','buckle','delamination','dent'];
  stations text[] := array[
    'FR%s LH, below cabin floor line',
    'FR%s RH, above window belt',
    'LH wing upper skin, rib %s',
    'RH wing leading edge, slat %s',
    'Belly skin FR%s, drain path',
    'Vertical stabiliser tip / static wick base',
    'Cargo door surround FR%s',
    'Radome, lower quadrant',
    'Horizontal stabiliser LE, RH side'];
  xmin numeric[] := array[0.15,0.15,0.45,0.45,0.30,0.90,0.35,0.02,0.86];
  xmax numeric[] := array[0.75,0.75,0.62,0.62,0.60,0.94,0.45,0.05,0.92];
  ymin numeric[] := array[0.53,0.43,0.14,0.66,0.50,0.46,0.55,0.48,0.66];
  ymax numeric[] := array[0.57,0.47,0.34,0.84,0.52,0.50,0.58,0.52,0.76];
  srms   text[] := array['SRM 53-11-01','SRM 53-11-01','SRM 57-21-04','SRM 57-42-11','SRM 51-10-05','SRM 55-30-12','SRM 52-30-06','SRM 53-10-02','SRM 55-10-03'];
  recorders text[] := array['Priya Nair (ENG-1042)','Tom Harding (ENG-1088)','Daniel Fischer (ENG-1155)','Line report','Base maintenance'];
begin
  delete from damage_records;
  delete from aircraft_photos;
  perform setseed(0.7);

  insert into damage_records (aircraft_id, pos_x, pos_y, damage_type, station, length_mm, width_mm, depth_mm, within_limits, srm_ref, status, recorded_by, recorded_at, notes) values
    ('11111111-1111-1111-1111-111111111111', 0.44, 0.55, 'dent',             'FR34, below cabin floor line, LH', 40, 25, 1.2, true,  'SRM 53-11-01', 'monitor',  'Daniel Fischer (ENG-1155)', now() - interval '140 days', 'Ground-equipment contact. Within SRM allowable — inspect at each A-Check.'),
    ('11111111-1111-1111-1111-111111111111', 0.32, 0.24, 'scratch',          'LH wing leading edge, rib 12',     120, 4, 0.4, true, 'SRM 57-21-04', 'repaired', 'Priya Nair (ENG-1042)',     now() - interval '300 days', 'Blended and re-protected.'),
    ('22222222-2222-2222-2222-222222222222', 0.92, 0.47, 'lightning strike', 'Vertical stabiliser tip cap',      15, 15, 0.8, false, 'SRM 55-30-12', 'open',     'Tom Harding (ENG-1088)',    now() - interval '6 days',   'Multiple burn points. Beyond allowable — awaiting Part-21 repair design.'),
    ('33333333-3333-3333-3333-333333333333', 0.04, 0.50, 'dent',             'Radome, upper RH quadrant',        30, 30, 2.0, true,  'SRM 53-10-02', 'monitor',  'Grace Okoro (ENG-1120)',    now() - interval '60 days',  'Suspected bird strike. Radar performance checked — no degradation.'),
    ('44444444-4444-4444-4444-444444444444', 0.47, 0.58, 'corrosion',        'FR47, galley drain mast area',     60, 40, null, true, 'SRM 51-10-05', 'repaired', 'Daniel Fischer (ENG-1155)', now() - interval '20 days',  'Found during C-Check. Blended, treated and re-finished.'),
    ('55555555-5555-5555-5555-555555555555', 0.56, 0.10, 'dent',             'RH wingtip, outboard of sharklet', 22, 18, 0.9, true, 'SRM 57-40-08', 'monitor',  'Priya Nair (ENG-1042)',     now() - interval '90 days',  'Hangar-door clearance incident. Repetitive inspection every 600 FH.');

  for r in select id, registration, row_number() over (order by registration) rn
           from aircraft where registration like 'G-AM%' loop
    n := 1 + (r.rn % 3)::int;
    for k in 1..n loop
      ti := 1 + ((r.rn * 4 + k * 5) % 9)::int;
      v_within := (r.rn + k) % 23 <> 0;
      v_status := case
        when not v_within then 'open'
        when (r.rn + k) % 10 = 0 then 'open'
        when (r.rn + k) % 3 = 0 then 'repaired'
        else 'monitor' end;
      insert into damage_records (aircraft_id, pos_x, pos_y, damage_type, station, length_mm, width_mm, depth_mm, within_limits, srm_ref, status, recorded_by, recorded_at, notes)
      values (
        r.id,
        round((xmin[ti] + random() * (xmax[ti] - xmin[ti]))::numeric, 3),
        round((ymin[ti] + random() * (ymax[ti] - ymin[ti]))::numeric, 3),
        types[ti],
        replace(stations[ti], '%s', (18 + ((r.rn * 5 + k * 7) % 52))::text),
        (10 + (random() * 140)::int),
        (5 + (random() * 60)::int),
        round((0.2 + random() * 2.4)::numeric, 2),
        v_within,
        srms[ti],
        v_status,
        recorders[1 + ((r.rn + k) % 5)::int],
        now() - ((30 + (random() * 680)::int) || ' days')::interval,
        case when not v_within then 'Beyond SRM allowable — engineering disposition required.' else null end
      );
    end loop;
  end loop;

  insert into aircraft_photos (aircraft_id, url, caption, credit, added_by) values
    ('11111111-1111-1111-1111-111111111111', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/G-EZPA_easyJet_Airbus_A320-214%28WL%29_-_cn_6970_takeoff_from_Schiphol.JPG/960px-G-EZPA_easyJet_Airbus_A320-214%28WL%29_-_cn_6970_takeoff_from_Schiphol.JPG', 'Representative A320-200 (library photo)', 'Wikimedia Commons', 'Fleet records'),
    ('22222222-2222-2222-2222-222222222222', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/G-EUUM_GIB.JPG/960px-G-EUUM_GIB.JPG', 'Representative A320-200 (library photo)', 'Wikimedia Commons', 'Fleet records'),
    ('33333333-3333-3333-3333-333333333333', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/EVA_Air_Boeing_787-9_B-17885_taking_off_from_Taoyuan_February_2026.jpg/960px-EVA_Air_Boeing_787-9_B-17885_taking_off_from_Taoyuan_February_2026.jpg', 'Representative 787-9 (library photo)', 'Wikimedia Commons', 'Fleet records'),
    ('44444444-4444-4444-4444-444444444444', 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Etihad_Airways_Boeing_787-9_A6-BLP_taking_off_Manchester_Airport.jpg/960px-Etihad_Airways_Boeing_787-9_A6-BLP_taking_off_Manchester_Airport.jpg', 'Representative 787-9 (library photo)', 'Wikimedia Commons', 'Fleet records'),
    ('55555555-5555-5555-5555-555555555555', 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/G-EZTV_easyJet_Airbus_A320-214_-_cn_4234_takeoff_from_Schiphol_pic2.JPG/960px-G-EZTV_easyJet_Airbus_A320-214_-_cn_4234_takeoff_from_Schiphol_pic2.JPG', 'Representative A320-200 (library photo)', 'Wikimedia Commons', 'Fleet records');
end $$;

-- 3. reset_demo_data: FINAL wrapper (preserves added engineers + reseeds damage/photos).
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
  perform seed_damage_and_photos();

  insert into engineers select * from _keep_engineers;
  insert into roster_entries select * from _keep_roster;
end $$;

revoke all on function reset_demo_core() from public;
revoke all on function seed_damage_and_photos() from public;
revoke all on function reset_demo_data() from public;
grant execute on function reset_demo_data() to authenticated;

-- Leave the database in the canonical demo state.
select reset_demo_data();
