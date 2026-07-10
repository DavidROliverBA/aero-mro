-- ============================================================================
-- AeroMRO seed data — fictional "Albion Atlantic Airways" fleet.
-- Run AFTER schema.sql. Safe to re-run (truncates first).
-- ============================================================================

truncate audit_log, ad_compliance, airworthiness_directives, crs_releases,
         task_cards, work_orders, parts, defects, engineers, aircraft
         restart identity cascade;

-- Fleet -----------------------------------------------------------------------
insert into aircraft (id, registration, type_designator, msn, total_hours, total_cycles, status, base, next_check_type, next_check_due) values
  ('11111111-1111-1111-1111-111111111111', 'G-ALBA', 'A320', 'MSN-7421', 28450.5, 14320, 'in_service',            'LGW', 'A-Check', '2026-07-28'),
  ('22222222-2222-2222-2222-222222222222', 'G-ALBB', 'A320', 'MSN-7503', 31210.0, 15890, 'aog',                   'LGW', 'A-Check', '2026-08-14'),
  ('33333333-3333-3333-3333-333333333333', 'G-ALBC', 'B789', 'MSN-66112', 19870.2, 3120, 'in_service',            'LHR', 'A-Check', '2026-09-02'),
  ('44444444-4444-4444-4444-444444444444', 'G-ALBD', 'B789', 'MSN-66145', 20540.8, 3260, 'scheduled_maintenance', 'LHR', 'C-Check', '2026-07-15'),
  ('55555555-5555-5555-5555-555555555555', 'G-ALBE', 'A320', 'MSN-7688', 12030.0, 6210,  'in_service',            'LGW', 'A-Check', '2026-10-11');

-- Certifying staff (Part-66) --------------------------------------------------
insert into engineers (id, full_name, staff_no, part66_licence_no, licence_categories, type_ratings, licence_expiry, company_auth) values
  ('a1111111-1111-1111-1111-111111111111', 'Priya Nair',      'ENG-1042', 'UK.66.10042', '{B1.1,C}', '{A320,B789}', '2027-03-31', true),
  ('a2222222-2222-2222-2222-222222222222', 'Tom Harding',     'ENG-1088', 'UK.66.10088', '{B2}',     '{A320}',      '2026-07-31', true),
  ('a3333333-3333-3333-3333-333333333333', 'Grace Okoro',     'ENG-1120', 'UK.66.11120', '{B1.1}',   '{B789}',      '2026-06-30', true),  -- EXPIRED licence (demo)
  ('a4444444-4444-4444-4444-444444444444', 'Daniel Fischer',  'ENG-1155', 'UK.66.11155', '{B1.1,B2}','{A320,B789}', '2028-01-31', true),
  ('a5555555-5555-5555-5555-555555555555', 'Sofia Marchetti', 'ENG-1201', 'UK.66.12201', '{C}',      '{A320,B789}', '2027-11-30', false); -- no company auth (demo)

-- Defects ---------------------------------------------------------------------
insert into defects (aircraft_id, raised_by, description, ata_chapter, mel_reference, mel_cat, severity, status, deferred_until) values
  ('22222222-2222-2222-2222-222222222222', 'Capt. R. Osei', 'No.2 engine EGT exceedance on start; ECAM ENG 2 EGT OVER LIMIT. Aircraft AOG at stand.', '72', null, null, 'critical', 'open', null),
  ('11111111-1111-1111-1111-111111111111', 'FO L. Byrne',   'Left main gear tyre pressure repeatedly below limit at pre-flight.', '32', '32-41-01a', 'B', 'major', 'deferred', current_date + 3),
  ('11111111-1111-1111-1111-111111111111', 'Cabin crew',    'Reading light row 14C inoperative.', '33', '33-21-00d', 'D', 'minor', 'deferred', current_date + 120),
  ('33333333-3333-3333-3333-333333333333', 'ENG-1042',      'APU slow to reach governed speed; auto-shutdown on 2 of 3 attempts.', '49', '49-00-00c', 'C', 'major', 'deferred', current_date + 10),
  ('55555555-5555-5555-5555-555555555555', 'FO K. Adeyemi', 'Weather radar returns intermittent on Capt side display.', '34', null, null, 'major', 'open', null),
  ('44444444-4444-4444-4444-444444444444', 'ENG-1155',      'Cargo door seal perished — found during C-Check inspection.', '52', null, null, 'minor', 'open', null);

-- Parts (with EASA Form 1 traceability) ---------------------------------------
insert into parts (part_number, serial_number, description, condition, form1_ref, shelf_expiry, fitted_to, ata_chapter) values
  ('C20486-3',  'SN-88231', 'Main wheel & tyre assembly, A320', 'serviceable',   'F1-2026-4471', null,          '11111111-1111-1111-1111-111111111111', '32'),
  ('3960100-4', 'SN-11902', 'APU fuel control unit, B787',      'unserviceable', 'F1-2025-9920', null,          null,                                   '49'),
  ('622-4790',  'SN-55012', 'Weather radar transceiver',        'serviceable',   'F1-2026-1180', null,          null,                                   '34'),
  ('HTL-0032',  null,       'Hydraulic filter element',         'serviceable',   'F1-2026-3301', '2027-05-01',  null,                                   '29'),
  ('EGT-7781',  'SN-40113', 'EGT thermocouple harness, V2500',  'serviceable',   'F1-2026-5567', null,          null,                                   '72');

-- Work orders + task cards ----------------------------------------------------
insert into work_orders (id, wo_number, aircraft_id, title, wo_type, status, source_defect) values
  ('b1111111-1111-1111-1111-111111111111', 'WO-2026-0001', '22222222-2222-2222-2222-222222222222', 'No.2 engine EGT exceedance investigation', 'unscheduled', 'awaiting_parts',
     (select id from defects where description like 'No.2 engine EGT%')),
  ('b2222222-2222-2222-2222-222222222222', 'WO-2026-0002', '44444444-4444-4444-4444-444444444444', 'C-Check — G-ALBD', 'scheduled', 'in_progress', null),
  ('b3333333-3333-3333-3333-333333333333', 'WO-2026-0003', '11111111-1111-1111-1111-111111111111', 'LH MLG tyre replacement', 'unscheduled', 'awaiting_crs',
     (select id from defects where description like 'Left main gear tyre%'));

insert into task_cards (work_order_id, sequence, description, ata_chapter, status, assigned_engineer, est_hours, requires_inspection) values
  ('b1111111-1111-1111-1111-111111111111', 1, 'Perform borescope inspection of No.2 engine HP turbine', '72', 'complete',    'a1111111-1111-1111-1111-111111111111', 4.0, true),
  ('b1111111-1111-1111-1111-111111111111', 2, 'Replace EGT thermocouple harness', '72', 'in_progress', 'a1111111-1111-1111-1111-111111111111', 3.5, false),
  ('b2222222-2222-2222-2222-222222222222', 1, 'Open all access panels, zonal inspection', '05', 'complete',    'a4444444-4444-4444-4444-444444444444', 12.0, false),
  ('b2222222-2222-2222-2222-222222222222', 2, 'Replace perished cargo door seal', '52', 'in_progress', 'a4444444-4444-4444-4444-444444444444', 2.5, false),
  ('b2222222-2222-2222-2222-222222222222', 3, 'Landing gear detailed inspection & lubrication', '32', 'open',        null, 8.0, true),
  ('b3333333-3333-3333-3333-333333333333', 1, 'Jack aircraft, remove LH MLG wheel', '32', 'complete',    'a1111111-1111-1111-1111-111111111111', 1.5, false),
  ('b3333333-3333-3333-3333-333333333333', 2, 'Fit serviceable wheel assembly, torque & lockwire', '32', 'inspected',   'a1111111-1111-1111-1111-111111111111', 1.0, true);

-- One completed CRS (Certificate of Release to Service) ------------------------
insert into crs_releases (work_order_id, engineer_id, statement, licence_valid) values
  ('b3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111',
   'Certifies that the work specified except as otherwise specified was carried out in accordance with Part-145 and in respect to that work the aircraft/component is considered ready for release to service.',
   true);

-- Airworthiness Directives ----------------------------------------------------
insert into airworthiness_directives (id, ad_number, authority, applies_to_type, subject, effective_date, compliance_by, repetitive, interval_days) values
  ('c1111111-1111-1111-1111-111111111111', 'EASA AD 2026-0088', 'EASA',   'A320', 'Wing fuel tank access panel fastener inspection', '2026-05-01', '2026-08-01', false, null),
  ('c2222222-2222-2222-2222-222222222222', 'UK CAA AD G-2026-04', 'UK CAA', 'B789', 'Repetitive inspection of aft pressure bulkhead fitting', '2026-04-15', null, true, 90),
  ('c3333333-3333-3333-3333-333333333333', 'EASA AD 2026-0142', 'EASA',   'A320', 'Slat track lubrication and wear check', '2026-06-20', '2026-12-20', false, null);

-- AD applicability / compliance ----------------------------------------------
insert into ad_compliance (ad_id, aircraft_id, status, complied_at, next_due) values
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'complied',          '2026-05-20', null),
  ('c1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'open',              null, null),
  ('c1111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'open',              null, null),
  ('c2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'repetitive_active', '2026-05-10', current_date + 12),
  ('c2222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'repetitive_active', '2026-05-12', current_date + 14),
  ('c3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'open',              null, null),
  ('c3333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'open',              null, null);

insert into audit_log (entity, entity_id, action, actor, detail) values
  ('crs_releases', null, 'CRS issued', 'Priya Nair (UK.66.10042)', 'WO-2026-0003 released to service'),
  ('defects', null, 'Defect deferred', 'Tom Harding', 'MEL 32-41-01a Cat B applied to G-ALBA tyre defect');
