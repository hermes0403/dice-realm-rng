-- T-0126: Persist each Time Crystal material deposit and consume dice atomically.
-- The materials column stays in the private schema; clients can only call the authenticated RPC.

alter table private.player_time_crystal_state
  add column if not exists materials jsonb not null default '{}'::jsonb;

create or replace function public.deposit_time_crystal_material(
  p_die_id text,
  p_expected_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_save jsonb;
  v_bag jsonb;
  v_materials jsonb;
  v_item private.player_time_crystal_state%rowtype;
  v_slot text;
  v_count bigint;
  v_updated_at timestamptz;
begin
  if v_uid is null or p_expected_user_id is null or v_uid <> p_expected_user_id then
    raise exception '登入帳號已變更，請重新操作';
  end if;

  if p_die_id is null or p_die_id not in ('d15', 'd14', 'd64', 'd65', 'd66', 'd67') then
    raise exception '這顆骰子不符合時序結晶配方';
  end if;

  v_slot := case
    when p_die_id = 'd15' then 'time'
    when p_die_id = 'd14' then 'void'
    else 'glitch'
  end;

  select save_data, updated_at
    into v_save, v_updated_at
    from public.game_saves
    where user_id = v_uid
    for update;

  if not found or v_save is null then
    raise exception '找不到雲端存檔，請先同步遊戲進度';
  end if;

  insert into private.player_time_crystal_state(user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select *
    into v_item
    from private.player_time_crystal_state
    where user_id = v_uid
    for update;

  if coalesce(v_item.owned, false) then
    raise exception '已合成時序結晶';
  end if;

  v_materials := coalesce(v_item.materials, '{}'::jsonb);
  v_bag := case
    when jsonb_typeof(v_save->'bag') = 'object' then v_save->'bag'
    else '{}'::jsonb
  end;

  -- A retry of the same committed request is idempotent: return the current
  -- server bag without consuming another die.
  if v_materials ? v_slot then
    if v_materials->>v_slot = p_die_id then
      return jsonb_build_object(
        'ok', true,
        'already_deposited', true,
        'bag', v_bag,
        'materials', v_materials,
        'updated_at', v_updated_at
      );
    end if;
    raise exception '這項材料已投入';
  end if;

  v_count := case
    when coalesce(v_bag->>p_die_id, '') ~ '^[0-9]+$'
      then (v_bag->>p_die_id)::bigint
    else 0
  end;
  if v_count < 1 then
    raise exception '背包中沒有可投入的對應骰子';
  end if;

  if v_count = 1 then
    v_bag := v_bag - p_die_id;
  else
    v_bag := jsonb_set(v_bag, array[p_die_id], to_jsonb(v_count - 1), true);
  end if;

  update public.game_saves
    set save_data = jsonb_set(v_save, '{bag}', v_bag, true),
        updated_at = now()
    where user_id = v_uid
    returning updated_at into v_updated_at;

  v_materials := jsonb_set(v_materials, array[v_slot], to_jsonb(p_die_id), true);
  update private.player_time_crystal_state
    set materials = v_materials,
        updated_at = now()
    where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'already_deposited', false,
    'bag', v_bag,
    'materials', v_materials,
    'updated_at', v_updated_at
  );
end;
$function$;

create or replace function public.craft_time_crystal()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_save jsonb;
  v_item private.player_time_crystal_state%rowtype;
  v_materials jsonb;
begin
  if v_uid is null then
    raise exception '請先登入雲端帳號';
  end if;

  -- Keep the same lock order as material deposits: game_saves, then item state.
  select save_data
    into v_save
    from public.game_saves
    where user_id = v_uid
    for update;

  if not found or v_save is null then
    raise exception '找不到雲端存檔，請先同步遊戲進度';
  end if;

  insert into private.player_time_crystal_state(user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select *
    into v_item
    from private.player_time_crystal_state
    where user_id = v_uid
    for update;

  if coalesce(v_item.owned, false) then
    raise exception '已持有時序結晶';
  end if;

  v_materials := coalesce(v_item.materials, '{}'::jsonb);
  if v_materials->>'time' is distinct from 'd15' then
    raise exception '尚未投入時序骰子';
  end if;
  if v_materials->>'void' is distinct from 'd14' then
    raise exception '尚未投入虛空骰子';
  end if;
  if v_materials->>'glitch' not in ('d64', 'd65', 'd66', 'd67') then
    raise exception '尚未投入故障骰子';
  end if;

  update private.player_time_crystal_state
    set owned = true,
        updated_at = now()
    where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'owned', true,
    'materials', v_materials
  );
end;
$function$;

create or replace function public.get_time_crystal_status()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_item private.player_time_crystal_state%rowtype;
  v_weather public.realm_weather_state%rowtype;
begin
  if v_uid is null then
    raise exception '請先登入雲端帳號';
  end if;

  select *
    into v_item
    from private.player_time_crystal_state
    where user_id = v_uid;

  select *
    into v_weather
    from public.realm_weather_state
    where singleton = true;

  return jsonb_build_object(
    'owned', coalesce(v_item.owned, false),
    'materials', coalesce(v_item.materials, '{}'::jsonb),
    'cooldown_until', v_item.cooldown_until,
    'pending', coalesce(v_weather.time_crystal_pending, false),
    'admin_weather_active',
      coalesce(
        v_weather.ends_at > now()
        and v_weather.summoned_by in ('管理員面板', '管理員'),
        false
      )
  );
end;
$function$;

revoke all on function public.deposit_time_crystal_material(text, uuid) from public, anon;
grant execute on function public.deposit_time_crystal_material(text, uuid) to authenticated;

revoke all on function public.craft_time_crystal() from public, anon;
grant execute on function public.craft_time_crystal() to authenticated;

revoke all on function public.get_time_crystal_status() from public, anon;
grant execute on function public.get_time_crystal_status() to authenticated;

comment on function public.deposit_time_crystal_material(text, uuid)
  is 'T-0126: atomically consumes one owned die and persists it in the caller''s Time Crystal recipe slot.';
