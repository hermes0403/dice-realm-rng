-- T-0023: atomic optimistic concurrency for cloud saves.
-- This is intentionally compatible with the existing client while the new client rolls out:
-- legacy writes that reduce total_rolls are rejected by the trigger.

create or replace function public.prevent_game_save_roll_regression()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  old_rolls bigint := coalesce(nullif(old.save_data->>'rolls', '')::bigint, 0);
  new_rolls bigint := coalesce(nullif(new.save_data->>'rolls', '')::bigint, 0);
begin
  if new_rolls < old_rolls then
    raise exception 'Stale cloud save rejected: total rolls cannot decrease (old %, new %)', old_rolls, new_rolls
      using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_game_save_roll_regression on public.game_saves;
create trigger trg_prevent_game_save_roll_regression
before update of save_data on public.game_saves
for each row execute function public.prevent_game_save_roll_regression();

create or replace function public.prevent_profile_roll_regression()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.total_rolls < old.total_rolls then
    raise exception 'Stale profile rejected: total rolls cannot decrease (old %, new %)', old.total_rolls, new.total_rolls
      using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_profile_roll_regression on public.player_profiles;
create trigger trg_prevent_profile_roll_regression
before update of total_rolls on public.player_profiles
for each row execute function public.prevent_profile_roll_regression();

create or replace function public.sync_player_game_save(
  p_expected_updated_at timestamptz,
  p_save_data jsonb,
  p_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_current_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_save_data) <> 'object' or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Invalid save payload' using errcode = '22023';
  end if;
  if coalesce(nullif(p_save_data->>'rolls', '')::bigint, -1) < 0
     or coalesce(nullif(p_save_data->>'coins', '')::numeric, -1) < 0 then
    raise exception 'Invalid save counters' using errcode = '22023';
  end if;

  select updated_at
    into v_current_updated_at
    from public.game_saves
   where user_id = v_user_id
   for update;

  if not found then
    if p_expected_updated_at is not null then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', null);
    end if;

    insert into public.game_saves(user_id, save_data, updated_at)
    values (v_user_id, p_save_data, v_now)
    on conflict (user_id) do nothing
    returning updated_at into v_current_updated_at;

    if not found then
      select updated_at into v_current_updated_at
        from public.game_saves where user_id = v_user_id;
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', v_current_updated_at);
    end if;
  else
    if p_expected_updated_at is null
       or v_current_updated_at is distinct from p_expected_updated_at then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', v_current_updated_at);
    end if;

    update public.game_saves
       set save_data = p_save_data,
           updated_at = v_now
     where user_id = v_user_id
       and updated_at = p_expected_updated_at
    returning updated_at into v_current_updated_at;

    if not found then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', null);
    end if;
  end if;

  insert into public.player_profiles(
    user_id, username, total_rolls, unique_dice, rarest_den, coins,
    achievement_count, achievement_reached_at, last_seen, updated_at
  )
  values (
    v_user_id,
    coalesce(nullif(p_profile->>'username', ''), '旅人'),
    greatest(0, coalesce(nullif(p_profile->>'total_rolls', '')::bigint, 0)),
    greatest(0, coalesce(nullif(p_profile->>'unique_dice', '')::integer, 0)),
    greatest(0, coalesce(nullif(p_profile->>'rarest_den', '')::bigint, 0)),
    greatest(0, coalesce(nullif(p_profile->>'coins', '')::bigint, 0)),
    greatest(0, coalesce(nullif(p_profile->>'achievement_count', '')::integer, 0)),
    nullif(p_profile->>'achievement_reached_at', '')::timestamptz,
    v_now,
    v_now
  )
  on conflict (user_id) do update set
    username = excluded.username,
    total_rolls = excluded.total_rolls,
    unique_dice = excluded.unique_dice,
    rarest_den = excluded.rarest_den,
    coins = excluded.coins,
    achievement_count = excluded.achievement_count,
    achievement_reached_at = excluded.achievement_reached_at,
    last_seen = excluded.last_seen,
    updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'conflict', false, 'updated_at', v_current_updated_at);
end;
$$;

revoke all on function public.sync_player_game_save(timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_player_game_save(timestamptz, jsonb, jsonb) to authenticated;


-- Compatibility refinement: preserve a profile count that is already ahead by 1-2 rolls.
drop trigger if exists trg_prevent_profile_roll_regression on public.player_profiles;
drop function if exists public.prevent_profile_roll_regression();

create or replace function public.sync_player_game_save(
  p_expected_updated_at timestamptz,
  p_save_data jsonb,
  p_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_current_updated_at timestamptz;
  v_profile_rolls bigint := 0;
  v_effective_rolls bigint := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_save_data) <> 'object' or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Invalid save payload' using errcode = '22023';
  end if;
  if coalesce(nullif(p_save_data->>'rolls', '')::bigint, -1) < 0
     or coalesce(nullif(p_save_data->>'coins', '')::numeric, -1) < 0 then
    raise exception 'Invalid save counters' using errcode = '22023';
  end if;

  select updated_at
    into v_current_updated_at
    from public.game_saves
   where user_id = v_user_id
   for update;

  if not found then
    if p_expected_updated_at is not null then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', null);
    end if;
  else
    if p_expected_updated_at is null
       or v_current_updated_at is distinct from p_expected_updated_at then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', v_current_updated_at);
    end if;
  end if;

  select total_rolls into v_profile_rolls
    from public.player_profiles
   where user_id = v_user_id
   for update;
  v_effective_rolls := greatest(
    coalesce(nullif(p_save_data->>'rolls', '')::bigint, 0),
    coalesce(v_profile_rolls, 0)
  );
  p_save_data := jsonb_set(p_save_data, '{rolls}', to_jsonb(v_effective_rolls), true);

  if v_current_updated_at is null then
    insert into public.game_saves(user_id, save_data, updated_at)
    values (v_user_id, p_save_data, v_now)
    on conflict (user_id) do nothing
    returning updated_at into v_current_updated_at;
    if not found then
      select updated_at into v_current_updated_at
        from public.game_saves where user_id = v_user_id;
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', v_current_updated_at);
    end if;
  else
    update public.game_saves
       set save_data = p_save_data,
           updated_at = v_now
     where user_id = v_user_id
       and updated_at = p_expected_updated_at
    returning updated_at into v_current_updated_at;
    if not found then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', null);
    end if;
  end if;

  insert into public.player_profiles(
    user_id, username, total_rolls, unique_dice, rarest_den, coins,
    achievement_count, achievement_reached_at, last_seen, updated_at
  )
  values (
    v_user_id,
    coalesce(nullif(p_profile->>'username', ''), '旅人'),
    v_effective_rolls,
    greatest(0, coalesce(nullif(p_profile->>'unique_dice', '')::integer, 0)),
    greatest(0, coalesce(nullif(p_profile->>'rarest_den', '')::bigint, 0)),
    greatest(0, coalesce(nullif(p_profile->>'coins', '')::bigint, 0)),
    greatest(0, coalesce(nullif(p_profile->>'achievement_count', '')::integer, 0)),
    nullif(p_profile->>'achievement_reached_at', '')::timestamptz,
    v_now,
    v_now
  )
  on conflict (user_id) do update set
    username = excluded.username,
    total_rolls = greatest(public.player_profiles.total_rolls, excluded.total_rolls),
    unique_dice = excluded.unique_dice,
    rarest_den = greatest(public.player_profiles.rarest_den, excluded.rarest_den),
    coins = excluded.coins,
    achievement_count = excluded.achievement_count,
    achievement_reached_at = excluded.achievement_reached_at,
    last_seen = excluded.last_seen,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'ok', true, 'conflict', false, 'updated_at', v_current_updated_at,
    'total_rolls', v_effective_rolls
  );
end;
$$;

revoke all on function public.sync_player_game_save(timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_player_game_save(timestamptz, jsonb, jsonb) to authenticated;


-- Keep profile projections synchronized with the canonical game_saves counters.
create or replace function public.prevent_profile_projection_mismatch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_save jsonb;
  v_save_rolls bigint;
  v_save_coins bigint;
begin
  select save_data into v_save
    from public.game_saves
   where user_id = new.user_id;

  if found then
    v_save_rolls := coalesce(nullif(v_save->>'rolls','')::bigint,0);
    v_save_coins := coalesce(nullif(v_save->>'coins','')::bigint,0);
    if new.total_rolls <> v_save_rolls or new.coins <> v_save_coins then
      raise exception 'Stale profile projection rejected: profile counters must match the current cloud save'
        using errcode = '40001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_profile_projection_mismatch on public.player_profiles;
create trigger trg_prevent_profile_projection_mismatch
before insert or update of total_rolls, coins on public.player_profiles
for each row execute function public.prevent_profile_projection_mismatch();
