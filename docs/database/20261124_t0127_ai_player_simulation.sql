create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

create schema if not exists ai_private authorization postgres;
revoke all on schema ai_private from public, anon, authenticated;

create table if not exists ai_private.ai_players (
  ai_id text primary key,
  display_name text not null,
  enabled boolean not null default true,
  active_start_hour smallint not null check (active_start_hour between 0 and 23),
  active_end_hour smallint not null check (active_end_hour between 0 and 23),
  start_chance numeric not null check (start_chance between 0 and 1),
  session_min_minutes smallint not null check (session_min_minutes between 5 and 180),
  session_max_minutes smallint not null check (session_max_minutes between session_min_minutes and 180),
  rolls_min smallint not null check (rolls_min between 1 and 10),
  rolls_max smallint not null check (rolls_max between rolls_min and 10),
  active_until timestamptz,
  total_rolls bigint not null default 0,
  last_seen timestamptz,
  simulation_version text not null default 'ai-sim-v1-2026-11-24',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_private.ai_dice_pool (
  dice_id text primary key,
  dice_name text not null,
  denominator bigint not null check (denominator >= 2),
  weather_type text,
  glitch_bonus boolean not null default false,
  is_halloween boolean not null default false,
  is_active boolean not null default true,
  simulation_version text not null
);

create table if not exists ai_private.ai_dice_inventory (
  ai_id text not null references ai_private.ai_players(ai_id) on delete cascade,
  dice_id text not null references ai_private.ai_dice_pool(dice_id),
  quantity bigint not null default 0 check (quantity >= 0),
  first_obtained_at timestamptz not null default now(),
  last_obtained_at timestamptz not null default now(),
  primary key (ai_id, dice_id)
);

create table if not exists ai_private.ai_batch_runs (
  batch_slot timestamptz primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  online_players integer not null default 0,
  rolls_created integer not null default 0,
  simulation_version text not null default 'ai-sim-v1-2026-11-24'
);

create table if not exists ai_private.ai_roll_events (
  id bigint generated always as identity primary key,
  batch_slot timestamptz not null references ai_private.ai_batch_runs(batch_slot) on delete cascade,
  ai_id text not null references ai_private.ai_players(ai_id),
  roll_index smallint not null,
  dice_id text not null references ai_private.ai_dice_pool(dice_id),
  dice_name text not null,
  denominator bigint not null,
  simulation_version text not null,
  created_at timestamptz not null default now(),
  unique (batch_slot, ai_id, roll_index)
);

create index if not exists ai_roll_events_ai_created_idx
  on ai_private.ai_roll_events (ai_id, created_at desc);
create index if not exists ai_roll_events_batch_idx
  on ai_private.ai_roll_events (batch_slot);

alter table ai_private.ai_players enable row level security;
alter table ai_private.ai_dice_pool enable row level security;
alter table ai_private.ai_dice_inventory enable row level security;
alter table ai_private.ai_batch_runs enable row level security;
alter table ai_private.ai_roll_events enable row level security;

revoke all on all tables in schema ai_private from public, anon, authenticated;
revoke all on all sequences in schema ai_private from public, anon, authenticated;

insert into ai_private.ai_players
  (ai_id, display_name, active_start_hour, active_end_hour, start_chance, session_min_minutes, session_max_minutes, rolls_min, rolls_max)
values
  ('npc-001','星塵旅人',6,10,0.22,20,45,1,2),
  ('npc-002','虛空觀測者',10,14,0.20,15,35,1,2),
  ('npc-003','霓虹巡遊者',14,18,0.18,20,40,1,3),
  ('npc-004','深空旅者',18,23,0.26,20,50,1,3),
  ('npc-005','黎明守望者',22,6,0.16,10,30,1,2)
on conflict (ai_id) do nothing;

insert into ai_private.ai_dice_pool
  (dice_id,dice_name,denominator,weather_type,glitch_bonus,is_halloween,is_active,simulation_version)
values
('d1','初始骰子',2,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d2','微光骰子',4,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d3','潮汐骰子',8,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d4','月影骰子',16,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d5','星塵骰子',32,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d6','霜晶骰子',64,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d7','幻影骰子',128,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d8','雷鳴骰子',256,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d9','深海骰子',512,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d33','萬聖節：深海',2560,null,false,true,true,'ai-sim-v1-2026-11-24'),
('d34','萬聖節：彗星',20500,null,false,true,true,'ai-sim-v1-2026-11-24'),
('d35','萬聖節：星爆',261031,null,false,true,true,'ai-sim-v1-2026-11-24'),
('d36','萬聖節：幽靈之眼',60012,null,false,true,true,'ai-sim-v1-2026-11-24'),
('d10','極光骰子',1024,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d11','裂隙骰子',2048,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d12','彗星骰子',4096,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d13','日冕骰子',8192,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d14','虛空骰子',16384,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d15','時序骰子',32768,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d16','混沌骰子',65536,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d17','天體骰子',131072,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d18','星爆骰子',262144,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d19','維度骰子',524288,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d20','奇點骰子',1048576,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d21','創世骰子',2097152,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d22','永夜骰子',4194304,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d23','終焉骰子',8388608,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d24','原初骰子',33554432,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d25','深紅',10000000,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d26','星核骰子',20480000,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d27','終極界限骰子',49999999,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d28','裂光骰子',2500,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d29','時空座標骰子',99999,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d30','超新星骰子',1000000,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d31','異常座標骰子',24681012,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d32','骰界核心',75000000,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d37','雨滴骰子',500,'rain',false,false,true,'ai-sim-v1-2026-11-24'),
('d38','細雨骰子',2308,'rain',false,false,true,'ai-sim-v1-2026-11-24'),
('d39','雨幕骰子',9800,'rain',false,false,true,'ai-sim-v1-2026-11-24'),
('d40','天瀑骰子',85500,'rain',false,false,true,'ai-sim-v1-2026-11-24'),
('d41','初雪骰子',555,'snow',false,false,true,'ai-sim-v1-2026-11-24'),
('d42','冰晶骰子',5300,'snow',false,false,true,'ai-sim-v1-2026-11-24'),
('d43','暴雪骰子',9150,'snow',false,false,true,'ai-sim-v1-2026-11-24'),
('d44','極寒骰子',54005,'snow',false,false,true,'ai-sim-v1-2026-11-24'),
('d45','電弧骰子',700,'thunder',false,false,true,'ai-sim-v1-2026-11-24'),
('d46','雷鳴骰子',1480,'thunder',false,false,true,'ai-sim-v1-2026-11-24'),
('d47','雷暴骰子',7560,'thunder',false,false,true,'ai-sim-v1-2026-11-24'),
('d48','天罰骰子',35800,'thunder',false,false,true,'ai-sim-v1-2026-11-24'),
('d49','神雷骰子',70500,'thunder',false,false,true,'ai-sim-v1-2026-11-24'),
('d50','晶露骰子',960,'crystal',false,false,true,'ai-sim-v1-2026-11-24'),
('d51','紫晶骰子',1780,'crystal',false,false,true,'ai-sim-v1-2026-11-24'),
('d52','稜光骰子',6223,'crystal',false,false,true,'ai-sim-v1-2026-11-24'),
('d53','星晶骰子',11111,'crystal',false,false,true,'ai-sim-v1-2026-11-24'),
('d54','餘燼骰子',1111,'hell',false,false,true,'ai-sim-v1-2026-11-24'),
('d55','煉火骰子',2222,'hell',false,false,true,'ai-sim-v1-2026-11-24'),
('d56','深獄骰子',5555,'hell',false,false,true,'ai-sim-v1-2026-11-24'),
('d57','煉獄核心',8282,'hell',false,false,true,'ai-sim-v1-2026-11-24'),
('d58','星雲骰子',6000000,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d59','超界骰子',60000000,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d60','晶耀核心',17100,'crystal',false,false,true,'ai-sim-v1-2026-11-24'),
('d61','熾獄之心',15222,'hell',false,false,true,'ai-sim-v1-2026-11-24'),
('d62','永霜核心',34321,'snow',false,false,true,'ai-sim-v1-2026-11-24'),
('d63','深雨之核',62200,'rain',false,false,true,'ai-sim-v1-2026-11-24'),
('d64','錯誤代碼',100000000,null,true,false,true,'ai-sim-v1-2026-11-24'),
('d65','異常殘響',7777777,null,true,false,true,'ai-sim-v1-2026-11-24'),
('d66','系統崩解',25000000,null,true,false,true,'ai-sim-v1-2026-11-24'),
('d67','虛空漏洞',800000,null,true,false,true,'ai-sim-v1-2026-11-24'),
('d68','星界殘片',24888888,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d69','深空裂隙',8050000,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d70','永劫核心',110050000,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d71','量子悖論',8255000,null,false,false,true,'ai-sim-v1-2026-11-24'),
('d72','原初之眼',974000,null,false,false,true,'ai-sim-v1-2026-11-24')
on conflict (dice_id) do update set
  dice_name=excluded.dice_name,
  denominator=excluded.denominator,
  weather_type=excluded.weather_type,
  glitch_bonus=excluded.glitch_bonus,
  is_halloween=excluded.is_halloween,
  is_active=excluded.is_active,
  simulation_version=excluded.simulation_version;

create or replace function ai_private.run_ai_simulation_batch()
returns jsonb
language plpgsql
security definer
set search_path = ai_private, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_local_hour integer := extract(hour from (clock_timestamp() at time zone 'Asia/Taipei'))::integer;
  v_batch_slot timestamptz;
  v_weather_types text[] := array[]::text[];
  v_weather_1 text;
  v_weather_2 text;
  v_player record;
  v_in_window boolean;
  v_session_minutes integer;
  v_roll_count integer;
  v_roll_index integer;
  v_dice record;
  v_inserted integer;
  v_player_rolls integer;
  v_total_rolls integer := 0;
  v_online integer := 0;
begin
  v_batch_slot := date_trunc('hour', v_now)
    + (floor(extract(minute from v_now) / 10) * interval '10 minutes');

  insert into ai_private.ai_batch_runs(batch_slot, started_at)
  values (v_batch_slot, v_now)
  on conflict (batch_slot) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('duplicate', true, 'batch_slot', v_batch_slot);
  end if;

  select weather_type, weather_type_2
    into v_weather_1, v_weather_2
  from public.realm_weather_state
  where singleton is true and (ends_at is null or ends_at > v_now)
  limit 1;
  v_weather_types := array_remove(array[v_weather_1, v_weather_2], null);

  for v_player in
    select * from ai_private.ai_players
    where enabled
    order by ai_id
    for update
  loop
    v_player_rolls := 0;

    if v_player.active_until is not null and v_player.active_until <= v_now then
      update ai_private.ai_players set active_until = null where ai_id = v_player.ai_id;
      v_player.active_until := null;
    end if;

    if v_player.active_until is null then
      if v_player.active_start_hour < v_player.active_end_hour then
        v_in_window := v_local_hour >= v_player.active_start_hour and v_local_hour < v_player.active_end_hour;
      else
        v_in_window := v_local_hour >= v_player.active_start_hour or v_local_hour < v_player.active_end_hour;
      end if;
      if not v_in_window or random() >= v_player.start_chance then
        continue;
      end if;
      v_session_minutes := v_player.session_min_minutes
        + floor(random() * (v_player.session_max_minutes - v_player.session_min_minutes + 1))::integer;
      update ai_private.ai_players
      set active_until = v_now + make_interval(mins => v_session_minutes),
          updated_at = v_now
      where ai_id = v_player.ai_id
      returning active_until into v_player.active_until;
    end if;

    v_online := v_online + 1;
    v_roll_count := v_player.rolls_min
      + floor(random() * (v_player.rolls_max - v_player.rolls_min + 1))::integer;

    for v_roll_index in 1..v_roll_count loop
      select picked.dice_id, picked.dice_name, picked.denominator
        into v_dice
      from (
        select weighted.dice_id, weighted.dice_name, weighted.denominator,
          sum(weighted.weight) over (order by weighted.dice_id) as cumulative_weight,
          sum(weighted.weight) over () as total_weight
        from (
          select d.dice_id, d.dice_name, d.denominator,
            (1.0 / greatest(2, d.denominator))
            * case
                when d.denominator > 1024
                 and mod(v_player.total_rolls + v_roll_index - 1, 10) = 0
                then 2.0 else 1.0
              end
            * case
                when d.denominator between 1000000 and 100000000
                then 1.0 + (
                  (case when 'hell' = any(v_weather_types) then 4 else 0 end)
                  + (case when 'glitch' = any(v_weather_types) then 5 else 0 end)
                ) / 100.0
                else 1.0
              end
            * case
                when 'glitch' = any(v_weather_types) and d.glitch_bonus
                then 10.0 else 1.0
              end as weight
          from ai_private.ai_dice_pool d
          where d.is_active
            and (d.weather_type is null or d.weather_type = any(v_weather_types))
            and not (d.is_halloween and (v_now at time zone 'Asia/Taipei')::date >= date '2026-11-01')
        ) weighted
      ) picked
      where picked.cumulative_weight >= random() * picked.total_weight
      order by picked.cumulative_weight
      limit 1;

      if v_dice.dice_id is null then
        continue;
      end if;

      insert into ai_private.ai_roll_events
        (batch_slot, ai_id, roll_index, dice_id, dice_name, denominator, simulation_version)
      values
        (v_batch_slot, v_player.ai_id, v_roll_index, v_dice.dice_id, v_dice.dice_name, v_dice.denominator, v_player.simulation_version)
      on conflict (batch_slot, ai_id, roll_index) do nothing;
      get diagnostics v_inserted = row_count;

      if v_inserted > 0 then
        insert into ai_private.ai_dice_inventory (ai_id, dice_id, quantity, first_obtained_at, last_obtained_at)
        values (v_player.ai_id, v_dice.dice_id, 1, v_now, v_now)
        on conflict (ai_id, dice_id) do update
          set quantity = ai_private.ai_dice_inventory.quantity + 1,
              last_obtained_at = excluded.last_obtained_at;
        v_player_rolls := v_player_rolls + 1;
      end if;
    end loop;

    update ai_private.ai_players
    set total_rolls = total_rolls + v_player_rolls,
        last_seen = v_now,
        updated_at = v_now
    where ai_id = v_player.ai_id;
    v_total_rolls := v_total_rolls + v_player_rolls;
  end loop;

  update ai_private.ai_batch_runs
  set completed_at = v_now, online_players = v_online, rolls_created = v_total_rolls
  where batch_slot = v_batch_slot;

  return jsonb_build_object(
    'duplicate', false,
    'batch_slot', v_batch_slot,
    'online_players', v_online,
    'rolls_created', v_total_rolls,
    'simulation_version', 'ai-sim-v1-2026-11-24'
  );
end;
$$;

revoke all on function ai_private.run_ai_simulation_batch() from public, anon, authenticated;
grant execute on function ai_private.run_ai_simulation_batch() to postgres;

create or replace function public.admin_list_ai_players()
returns table (
  ai_id text,
  display_name text,
  enabled boolean,
  online boolean,
  active_until timestamptz,
  total_rolls bigint,
  unique_dice integer,
  last_seen timestamptz,
  simulation_version text
)
language sql
security definer
set search_path = ai_private, pg_temp
as $$
  select p.ai_id, p.display_name, p.enabled,
    coalesce(p.active_until > now(), false),
    p.active_until, p.total_rolls,
    count(i.dice_id)::integer,
    p.last_seen, p.simulation_version
  from ai_players p
  left join ai_dice_inventory i on i.ai_id = p.ai_id
  group by p.ai_id
  order by p.ai_id;
$$;

revoke all on function public.admin_list_ai_players() from public, anon, authenticated;
grant execute on function public.admin_list_ai_players() to service_role;

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'dice-rng-ai-simulation-10m'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule(
    'dice-rng-ai-simulation-10m',
    '*/10 * * * *',
    'select ai_private.run_ai_simulation_batch();'
  );
end;
$$;
