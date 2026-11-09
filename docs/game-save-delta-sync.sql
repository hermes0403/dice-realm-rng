-- T-0040: send only changed top-level save fields and merge them atomically.
-- Existing game_saves triggers remain active: sold-pet tombstones, achievement preservation,
-- and roll-regression protection are intentionally not replaced.

create or replace function public.sync_player_game_save_delta(
  p_expected_updated_at timestamptz,
  p_save_patch jsonb,
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
  v_current_save jsonb;
  v_next_save jsonb;
  v_saved_data jsonb;
  v_profile_rolls bigint := 0;
  v_effective_rolls bigint := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_save_patch) is distinct from 'object'
     or jsonb_typeof(p_profile) is distinct from 'object' then
    raise exception 'Invalid save patch' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_object_keys(p_save_patch) as keys(key)
     where key not in (
       'dumplingWeatherRewardClaimed', 'pets', 'equippedPetUids',
       'petDiscovered', 'petSkillLuckCharges', 'petSkillDaily',
       'name', 'joined', 'rolls', 'bag', 'bagCapacity', 'first',
       'rollCounts', 'gloves', 'equipped', 'best', 'coins',
       'currencyVersion', 'adminGrantApplied', 'autoSellThreshold',
       'autoDeleteDice', 'autoSold', 'autoDepositWeatherEnabled',
       'autoDepositThreshold', 'autoDepositDice', 'questDate', 'quest',
       'dailyQuestCompletions', 'weatherConvertAt', 'achievements',
       'potions', 'petAutoSellRarities', 'halloweenUnlocked'
     )
  ) then
    raise exception 'Save patch contains unsupported fields' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_object_keys(p_profile) as keys(key)
     where key not in (
       'username', 'unique_dice', 'rarest_den',
       'achievement_count', 'achievement_reached_at'
     )
  ) then
    raise exception 'Profile patch contains unsupported fields' using errcode = '22023';
  end if;

  if pg_column_size(p_save_patch) > 2097152 then
    raise exception 'Save patch is too large' using errcode = '22023';
  end if;

  select save_data, updated_at
    into v_current_save, v_current_updated_at
    from public.game_saves
   where user_id = v_user_id
   for update;

  if not found then
    if p_expected_updated_at is not null then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', null);
    end if;
    if not (p_save_patch ? 'bag')
       or not (p_save_patch ? 'rolls')
       or not (p_save_patch ? 'coins') then
      raise exception 'Initial save must include bag, rolls and coins' using errcode = '22023';
    end if;
    v_next_save := p_save_patch;
  else
    if p_expected_updated_at is null
       or v_current_updated_at is distinct from p_expected_updated_at then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', v_current_updated_at);
    end if;
    v_next_save := coalesce(v_current_save, '{}'::jsonb) || p_save_patch;
  end if;

  if jsonb_typeof(v_next_save -> 'bag') is distinct from 'object' then
    raise exception 'Invalid bag payload' using errcode = '22023';
  end if;

  if coalesce(nullif(v_next_save->>'rolls', '')::bigint, -1) < 0
     or coalesce(nullif(v_next_save->>'coins', '')::numeric, -1) < 0 then
    raise exception 'Invalid save counters' using errcode = '22023';
  end if;

  select total_rolls into v_profile_rolls
    from public.player_profiles
   where user_id = v_user_id
   for update;

  v_effective_rolls := greatest(
    coalesce(nullif(v_next_save->>'rolls', '')::bigint, 0),
    coalesce(v_profile_rolls, 0),
    coalesce(nullif(v_current_save->>'rolls', '')::bigint, 0)
  );
  v_next_save := jsonb_set(v_next_save, '{rolls}', to_jsonb(v_effective_rolls), true);

  if v_current_updated_at is null then
    insert into public.game_saves(user_id, save_data, updated_at)
    values (v_user_id, v_next_save, v_now)
    on conflict (user_id) do nothing
    returning save_data, updated_at into v_saved_data, v_current_updated_at;

    if not found then
      select updated_at into v_current_updated_at
        from public.game_saves where user_id = v_user_id;
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', v_current_updated_at);
    end if;
  else
    update public.game_saves
       set save_data = v_next_save,
           updated_at = v_now
     where user_id = v_user_id
       and updated_at = p_expected_updated_at
    returning save_data, updated_at into v_saved_data, v_current_updated_at;

    if not found then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', null);
    end if;
  end if;

  -- Use the post-trigger row so profile projections match the canonical saved data.
  v_effective_rolls := coalesce(nullif(v_saved_data->>'rolls', '')::bigint, 0);

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
    greatest(0, coalesce(nullif(v_saved_data->>'coins', '')::bigint, 0)),
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
    'ok', true,
    'conflict', false,
    'updated_at', v_current_updated_at,
    'total_rolls', v_effective_rolls
  );
end;
$$;

revoke all on function public.sync_player_game_save_delta(timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_player_game_save_delta(timestamptz, jsonb, jsonb)
  to authenticated;
