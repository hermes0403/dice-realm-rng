-- T-0098: Time Crystal crafting, activation, and server-authoritative weather extension.
-- This source records migration 20261117101418 already applied to project pkdctcfifauygnjipmab.
create schema if not exists private;

create table if not exists private.player_time_crystal_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owned boolean not null default false,
  cooldown_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.player_time_crystal_state enable row level security;
revoke all on table private.player_time_crystal_state from public, anon, authenticated;

alter table public.realm_weather_state
  add column if not exists time_crystal_pending boolean not null default false,
  add column if not exists time_crystal_armed_at timestamptz;

CREATE OR REPLACE FUNCTION public.activate_time_crystal()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_item private.player_time_crystal_state%rowtype;
  v_weather public.realm_weather_state%rowtype;
  v_cooldown_until timestamptz;
begin
  if v_uid is null then raise exception '請先登入雲端帳號'; end if;

  select * into v_item
    from private.player_time_crystal_state
    where user_id = v_uid
    for update;
  if not found or not coalesce(v_item.owned, false) then
    raise exception '尚未持有時序結晶';
  end if;

  select * into v_weather
    from public.realm_weather_state
    where singleton = true
    for update;
  if not found then raise exception '全服天氣狀態尚未初始化'; end if;

  if v_weather.ends_at > now()
     and v_weather.summoned_by in ('管理員面板', '管理員') then
    raise exception '活動進行中...';
  end if;

  if coalesce(v_weather.time_crystal_pending, false) then
    raise exception '已有時序結晶效果待生效';
  end if;

  if v_item.cooldown_until is not null and v_item.cooldown_until > now() then
    raise exception '時序結晶冷卻中';
  end if;

  v_cooldown_until := now() + interval '1 hour';
  update private.player_time_crystal_state
    set cooldown_until = v_cooldown_until,
        updated_at = now()
    where user_id = v_uid;

  update public.realm_weather_state
    set time_crystal_pending = true,
        time_crystal_armed_at = now(),
        updated_at = now()
    where singleton = true;

  return jsonb_build_object(
    'ok', true,
    'pending', true,
    'cooldown_until', v_cooldown_until
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.convert_weather_with_glove()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.convert_weather_with_glove('global');
$function$


CREATE OR REPLACE FUNCTION public.convert_weather_with_glove(p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_save jsonb;
  v_state public.realm_weather_state%rowtype;
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_last_ms bigint;
  v_type text;
  v_name text;
  v_until timestamptz;
  v_scope text := lower(coalesce(p_scope, 'global'));
  v_has_converter boolean := false;
  v_is_equipped boolean := false;
  v_time_crystal_applied boolean := false;
begin
  if v_uid is null then raise exception '請先登入雲端帳號'; end if;
  if v_scope not in ('global','personal') then raise exception '無效的天氣影響範圍'; end if;

  select save_data into v_save
    from public.game_saves
    where user_id = v_uid
    for update;
  if v_save is null then raise exception '找不到雲端存檔，請先同步遊戲進度'; end if;

  v_has_converter :=
    coalesce((v_save->'items'->>'g7')::integer, 0) > 0
    or coalesce((v_save->'gloves'->>'g7')::integer, 0) > 0;
  v_is_equipped :=
    coalesce(v_save->>'equippedItem', '') = 'g7'
    or (coalesce(v_save->>'equipped', '') = 'g7'
        and coalesce((v_save->'gloves'->>'g7')::integer, 0) > 0);
  if not v_has_converter or not v_is_equipped then
    raise exception '必須先持有並啟用天氣轉換器';
  end if;

  v_last_ms := greatest(0, coalesce((v_save->>'weatherConvertAt')::bigint,0));
  if v_now_ms - v_last_ms < 3600000 then
    raise exception '天氣轉換器仍在冷卻中（每小時一次）';
  end if;

  if v_scope = 'global' then
    select * into v_state
      from public.realm_weather_state
      where singleton = true
      for update;
    if v_state.weather_type in ('crystal','hell') and v_state.ends_at > now() then
      raise exception '水晶／地獄天氣期間不可被其他天氣打斷';
    end if;
    v_time_crystal_applied := coalesce(v_state.time_crystal_pending, false);
  end if;

  v_type := (array['rain','snow','thunder'])[1 + floor(random()*3)::integer];
  v_until := now() + interval '5 minutes';
  if v_scope = 'global' and v_time_crystal_applied then
    v_until := v_until + interval '1 minute';
  end if;

  select coalesce(nullif(left(username,20),''),'玩家')
    into v_name
    from public.player_profiles
    where user_id = v_uid;
  if v_name is null then
    v_name := coalesce(nullif(left(v_save->>'name',20),''),'玩家');
  end if;

  update public.game_saves
    set save_data = jsonb_set(v_save,'{weatherConvertAt}',to_jsonb(v_now_ms),true),
        updated_at = now()
    where user_id = v_uid;

  if v_scope = 'personal' then
    insert into public.player_weather_overrides(user_id,weather_type,ends_at,set_by,updated_at)
    values(v_uid,v_type,v_until,v_name,now())
    on conflict(user_id) do update
      set weather_type=excluded.weather_type,
          ends_at=excluded.ends_at,
          set_by=excluded.set_by,
          updated_at=excluded.updated_at;
  else
    update public.realm_weather_state
      set weather_type = v_type,
          ends_at = v_until,
          summoned_by = v_name,
          updated_at = now(),
          time_crystal_pending = case when v_time_crystal_applied then false else time_crystal_pending end,
          time_crystal_armed_at = case when v_time_crystal_applied then null else time_crystal_armed_at end
      where singleton = true;
  end if;

  return jsonb_build_object(
    'weather_type', v_type,
    'ends_at', v_until,
    'summoned_by', v_name,
    'updated_at', now(),
    'weather_convert_at', v_now_ms,
    'scope', v_scope,
    'time_crystal_applied', v_time_crystal_applied,
    'time_crystal_pending',
      case when v_scope = 'global' and v_time_crystal_applied then false
           when v_scope = 'global' then coalesce(v_state.time_crystal_pending, false)
           else null end
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.craft_time_crystal()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_save jsonb;
  v_bag jsonb;
  v_item private.player_time_crystal_state%rowtype;
  v_glitch_id text;
  v_candidate text;
  v_time_count integer;
  v_void_count integer;
  v_glitch_count integer;
begin
  if v_uid is null then raise exception '請先登入雲端帳號'; end if;

  select save_data into v_save
    from public.game_saves
    where user_id = v_uid
    for update;
  if v_save is null then
    raise exception '找不到雲端存檔，請先同步遊戲進度';
  end if;

  select * into v_item
    from private.player_time_crystal_state
    where user_id = v_uid
    for update;
  if coalesce(v_item.owned, false) then
    raise exception '已持有時序結晶';
  end if;

  v_bag := case
    when jsonb_typeof(v_save->'bag') = 'object' then v_save->'bag'
    else '{}'::jsonb
  end;
  v_time_count := greatest(0, coalesce(nullif(v_bag->>'d15', '')::integer, 0));
  v_void_count := greatest(0, coalesce(nullif(v_bag->>'d14', '')::integer, 0));
  if v_time_count < 1 then raise exception '缺少時序骰子'; end if;
  if v_void_count < 1 then raise exception '缺少虛空骰子'; end if;

  foreach v_candidate in array array['d64', 'd65', 'd66', 'd67']
  loop
    v_glitch_count := greatest(0, coalesce(nullif(v_bag->>v_candidate, '')::integer, 0));
    if v_glitch_count > 0 then
      v_glitch_id := v_candidate;
      exit;
    end if;
  end loop;
  if v_glitch_id is null then raise exception '缺少故障骰子'; end if;

  v_bag := v_bag - 'd15' - 'd14' - v_glitch_id;
  if v_time_count > 1 then
    v_bag := jsonb_set(v_bag, '{d15}', to_jsonb(v_time_count - 1), true);
  end if;
  if v_void_count > 1 then
    v_bag := jsonb_set(v_bag, '{d14}', to_jsonb(v_void_count - 1), true);
  end if;
  if v_glitch_count > 1 then
    v_bag := jsonb_set(v_bag, array[v_glitch_id], to_jsonb(v_glitch_count - 1), true);
  end if;

  update public.game_saves
    set save_data = jsonb_set(v_save, '{bag}', v_bag, true),
        updated_at = now()
    where user_id = v_uid;

  insert into private.player_time_crystal_state(user_id, owned, updated_at)
  values(v_uid, true, now())
  on conflict(user_id) do update
    set owned = true, updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'owned', true,
    'bag', v_bag,
    'consumed_glitch_dice_id', v_glitch_id
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.get_time_crystal_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_item private.player_time_crystal_state%rowtype;
  v_weather public.realm_weather_state%rowtype;
begin
  if v_uid is null then raise exception '請先登入雲端帳號'; end if;
  select * into v_item
    from private.player_time_crystal_state
    where user_id = v_uid;
  select * into v_weather
    from public.realm_weather_state
    where singleton = true;
  return jsonb_build_object(
    'owned', coalesce(v_item.owned, false),
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
$function$


CREATE OR REPLACE FUNCTION public.summon_realm_weather()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_points bigint;
  v_type text;
  v_until timestamptz;
  v_name text;
  v_roll double precision;
  v_state public.realm_weather_state%rowtype;
  v_time_crystal_applied boolean := false;
  v_duration interval := interval '5 minutes';
begin
  if v_uid is null then raise exception '請先登入雲端帳號'; end if;

  select * into v_state
    from public.realm_weather_state
    where singleton = true
    for update;

  if (
    v_state.weather_type in ('crystal','hell','glitch')
    or v_state.weather_type_2 in ('crystal','hell','glitch')
  ) and v_state.ends_at > now() then
    raise exception '目前特殊天氣無法被其他天氣打斷，請等天氣結束';
  end if;

  select points into v_points
    from public.realm_weather_contributions
    where user_id = v_uid
    for update;
  v_points := coalesce(v_points, 0);
  if v_points < 35000 then
    raise exception '召喚進度不足：目前 % / 35000', v_points;
  end if;

  v_roll := random();
  if v_roll < 0.60 then
    v_type := 'crystal';
  elsif v_roll < 0.87 then
    v_type := 'hell';
  else
    v_type := 'glitch';
  end if;

  v_time_crystal_applied := coalesce(v_state.time_crystal_pending, false);
  if v_time_crystal_applied then
    v_duration := interval '6 minutes';
  end if;
  v_until := now() + v_duration;

  select coalesce(nullif(left(username,20),''),'玩家')
    into v_name
    from public.player_profiles
    where user_id = v_uid;
  if v_name is null then
    select coalesce(nullif(left(save_data->>'name',20),''),'玩家')
      into v_name
      from public.game_saves
      where user_id = v_uid;
  end if;

  update public.realm_weather_contributions
    set points = points - 35000, updated_at = now()
    where user_id = v_uid
    returning points into v_points;

  update public.realm_weather_state
    set weather_type = v_type,
        weather_type_2 = null,
        ends_at = v_until,
        summoned_by = v_name,
        updated_at = now(),
        time_crystal_pending = false,
        time_crystal_armed_at = null
    where singleton = true;

  return jsonb_build_object(
    'weather_type', v_type,
    'ends_at', v_until,
    'summoned_by', v_name,
    'updated_at', now(),
    'remaining_points', v_points,
    'time_crystal_applied', v_time_crystal_applied,
    'time_crystal_pending', false
  );
end;
$function$



revoke all on function public.get_time_crystal_status() from public, anon;
revoke all on function public.craft_time_crystal() from public, anon;
revoke all on function public.activate_time_crystal() from public, anon;
revoke all on function public.summon_realm_weather() from public, anon;
revoke all on function public.convert_weather_with_glove(text) from public, anon;
revoke all on function public.convert_weather_with_glove() from public, anon;

grant execute on function public.get_time_crystal_status() to authenticated;
grant execute on function public.craft_time_crystal() to authenticated;
grant execute on function public.activate_time_crystal() to authenticated;
grant execute on function public.summon_realm_weather() to authenticated;
grant execute on function public.convert_weather_with_glove(text) to authenticated;
grant execute on function public.convert_weather_with_glove() to authenticated;
