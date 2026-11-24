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
  v_pick numeric;
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

  if extract(hour from (v_now at time zone 'Asia/Taipei')) = 3
     and extract(minute from (v_now at time zone 'Asia/Taipei')) < 10 then
    delete from ai_private.ai_batch_runs where batch_slot < v_now - interval '30 days';
  end if;

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
      v_pick := random();
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
      where picked.cumulative_weight >= v_pick * picked.total_weight
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
    coalesce(p.enabled and p.active_until > now(), false),
    p.active_until, p.total_rolls,
    count(i.dice_id)::integer,
    p.last_seen, p.simulation_version
  from ai_players p
  left join ai_dice_inventory i on i.ai_id = p.ai_id
  group by p.ai_id
  order by p.ai_id;
$$;
;