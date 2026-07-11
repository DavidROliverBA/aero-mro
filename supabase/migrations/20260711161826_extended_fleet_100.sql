-- Scale the demo fleet to 100 aircraft: keep the 5 hand-crafted "hero"
-- aircraft (G-ALBA..G-ALBE) with their curated stories, and deterministically
-- generate 95 more (G-AMAA..) with plausible hours/cycles, maintenance
-- programme states, defect history and recent sectors. reset_demo_data()
-- becomes a wrapper: core hero seed (renamed reset_demo_core) + generator.
-- (Mirror of the migration applied remotely via MCP on 2026-07-11.)

alter function reset_demo_data() rename to reset_demo_core;

create or replace function generate_extended_fleet() returns void
language plpgsql security definer set search_path = public as $$
declare
  i int;
  v_reg text;
  v_type text;
  v_base text;
  v_fh numeric;
  v_fc int;
  v_status aircraft_status;
  v_id uuid;
  t record;
  f numeric;
begin
  perform setseed(0.42); -- deterministic: every reset produces the same fleet
  delete from aircraft where registration like 'G-AM%';

  for i in 0..94 loop
    v_reg := 'G-AM' || chr(65 + (i / 26)) || chr(65 + (i % 26));
    v_type := case when i % 3 = 0 then 'B789' else 'A320' end;
    v_base := case when v_type = 'B789' then 'LHR' else 'LGW' end;
    v_fh := round((5000 + random() * 45000)::numeric, 1);
    v_fc := case when v_type = 'B789' then (v_fh / (5.5 + random() * 2))::int
                 else (v_fh / (1.8 + random() * 0.6))::int end;
    v_status := (case
      when i = 7 then 'aog'
      when i > 0 and i % 23 = 0 then 'stored'
      when i > 0 and i % 17 = 0 then 'scheduled_maintenance'
      else 'in_service' end)::aircraft_status;

    insert into aircraft (registration, type_designator, msn, total_hours, total_cycles, status, base, next_check_type, next_check_due)
    values (v_reg, v_type, 'MSN-' || (10000 + i), v_fh, v_fc, v_status, v_base,
            'A-Check', current_date + ((i * 7) % 170) + 5)
    returning id into v_id;

    for t in select * from mp_tasks where applies_to_type = v_type loop
      f := 0.05 + random() * (case when i % 31 = 0 then 1.15 else 0.85 end);
      insert into mp_compliance (mp_task_id, aircraft_id, last_done_date, last_done_fh, last_done_fc)
      values (
        t.id, v_id,
        case when t.interval_days is not null then current_date - (t.interval_days * f)::int
             else current_date - (90 + (random() * 300)::int) end,
        case when t.interval_fh is not null then round(greatest(v_fh - t.interval_fh * f, 0)::numeric, 1) else null end,
        case when t.interval_fc is not null then greatest(v_fc - (t.interval_fc * f)::int, 0) else null end
      );
    end loop;

    if i % 2 = 0 then
      insert into defects (aircraft_id, raised_at, raised_by, description, ata_chapter, severity, status, closed_at)
      values (v_id, now() - ((10 + (i % 70)) || ' days')::interval, 'Line report',
              (array['Cabin reading light u/s','Galley chiller intermittent','Nose wheel steering shimmy reported','Static discharge wick missing','Lavatory smoke detector fault','Cargo net attachment worn'])[1 + i % 6],
              (array['33','25','32','23','26','25'])[1 + i % 6],
              'minor', 'closed', now() - ((8 + (i % 65)) || ' days')::interval);
    end if;
    if i % 5 = 0 then
      insert into defects (aircraft_id, raised_at, raised_by, description, ata_chapter, severity, status)
      values (v_id, now() - ((i % 4) || ' days')::interval, 'Capt report',
              (array['APU bleed pressure fluctuating','Autothrottle disconnect intermittent','Wing tank fuel quantity disagree','TCAS fail message on ground test'])[1 + i % 4],
              (array['36','22','28','34'])[1 + i % 4], 'major', 'open');
    end if;

    if i % 3 = 1 then
      insert into flights (aircraft_id, flight_no, flight_date, dep, arr, block_hours, cycles, captain, status)
      values (v_id, 'AB' || (500 + i), current_date - (i % 3), v_base,
              (array['AMS','CDG','FCO','JFK','DXB','MAD'])[1 + i % 6],
              round((1 + random() * 8)::numeric, 1), 1, 'Line crew', 'closed');
    end if;
  end loop;
end $$;

create or replace function reset_demo_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform reset_demo_core();
  perform generate_extended_fleet();
end $$;

revoke all on function generate_extended_fleet() from public;
revoke all on function reset_demo_core() from public;
revoke all on function reset_demo_data() from public;
grant execute on function reset_demo_data() to authenticated;

select reset_demo_data();
