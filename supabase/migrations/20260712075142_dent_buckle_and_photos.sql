-- Dent & buckle charts + aircraft photo library.
-- damage_records plot structural damage onto a rendered top-view schematic
-- (pos_x/pos_y are 0..1 fractions of the schematic canvas). aircraft_photos
-- hold externally-hosted reference photos (seeded from Wikimedia Commons).
-- Also re-issues reset_demo_data() to call seed_damage_and_photos().
-- (Mirror of the migration applied remotely via MCP on 2026-07-12; the full
-- seed_damage_and_photos() body — 6 hero damage records, 5 Commons photos,
-- 3 generated-fleet dents — and the updated wrapper are in the remote
-- migration 20260712075142.)

do $$ begin
  create type damage_status as enum ('open','monitor','repaired');
exception when duplicate_object then null; end $$;

create table damage_records (
  id            uuid primary key default gen_random_uuid(),
  aircraft_id   uuid not null references aircraft(id) on delete cascade,
  pos_x         numeric(4,3) not null check (pos_x >= 0 and pos_x <= 1),
  pos_y         numeric(4,3) not null check (pos_y >= 0 and pos_y <= 1),
  damage_type   text not null check (damage_type in ('dent','scratch','corrosion','lightning strike','buckle','delamination')),
  station       text,
  length_mm     integer,
  width_mm      integer,
  depth_mm      numeric(5,2),
  within_limits boolean not null default true,
  srm_ref       text,
  status        damage_status not null default 'open',
  recorded_by   text not null,
  recorded_at   timestamptz not null default now(),
  notes         text
);

create table aircraft_photos (
  id          uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  url         text not null check (url like 'https://%'),
  caption     text,
  credit      text,
  added_by    text,
  added_at    timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['damage_records','aircraft_photos'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy "allowed_all" on %I for all to authenticated using (is_allowed()) with check (is_allowed());', t);
  end loop;
end $$;
