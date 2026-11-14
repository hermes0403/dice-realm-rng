-- T-0084: player summon odds for crystal, hell and glitch weather.
-- Keep the existing RPC and its permissions; no new tables, columns, RPCs or polling.
create or replace function public.summon_realm_weather()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_points bigint;
  v_type text;
  v_until timestamptz;
  v_name text;
  v_roll double precision;
  v_state public.realm_weather_state%rowtype;
begin
  if v_uid is null then raise exception '請先登入雲端帳號'; end if;
  select * into v_state from public.realm_weather_state where singleton = true for update;
  if (
    v_state.weather_type in ('crystal','hell','glitch')
    or v_state.weather_type_2 in ('crystal','hell','glitch')
  ) and v_state.ends_at > now() then
    raise exception '目前特殊天氣無法被其他天氣打斷，請等天氣結束';
  end if;
  select points into v_points from public.realm_weather_contributions where user_id = v_uid for update;
  v_points := coalesce(v_points, 0);
  if v_points < 35000 then raise exception '召喚進度不足：目前 % / 35000', v_points; end if;

  v_roll := random();
  if v_roll < 0.60 then
    v_type := 'crystal';
  elsif v_roll < 0.87 then
    v_type := 'hell';
  else
    v_type := 'glitch';
  end if;

  v_until := now() + interval '5 minutes';
  select coalesce(nullif(left(username,20),''),'玩家') into v_name from public.player_profiles where user_id = v_uid;
  if v_name is null then
    select coalesce(nullif(left(save_data->>'name',20),''),'玩家') into v_name from public.game_saves where user_id = v_uid;
  end if;
  update public.realm_weather_contributions set points = points - 35000, updated_at = now()
    where user_id = v_uid returning points into v_points;
  update public.realm_weather_state set weather_type = v_type, weather_type_2 = null,
    ends_at = v_until, summoned_by = v_name, updated_at = now()
    where singleton = true;
  return jsonb_build_object('weather_type',v_type,'ends_at',v_until,'summoned_by',v_name,'updated_at',now(),'remaining_points',v_points);
end;
$function$;

create or replace function public.log_realm_weather_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_source text;
begin
  v_source := case
    when new.summoned_by in ('管理員面板','管理員') then 'admin'
    when new.weather_type in ('crystal','hell','glitch') then 'summon'
    when new.weather_type = 'sunny' then 'default'
    else 'weather'
  end;
  if TG_OP='INSERT' then
    insert into public.realm_weather_history(weather_type,started_at,ends_at,summoned_by,source)
    values(new.weather_type,coalesce(new.updated_at,now()),new.ends_at,new.summoned_by,v_source);
  elsif old.weather_type is distinct from new.weather_type or old.ends_at is distinct from new.ends_at then
    if old.ends_at is not null then
      update public.realm_weather_history set ends_at=old.ends_at
      where id=(select id from public.realm_weather_history order by id desc limit 1);
    end if;
    insert into public.realm_weather_history(weather_type,started_at,ends_at,summoned_by,source)
    values(new.weather_type,coalesce(new.updated_at,now()),new.ends_at,new.summoned_by,v_source);
  end if;
  return new;
end
$function$;
