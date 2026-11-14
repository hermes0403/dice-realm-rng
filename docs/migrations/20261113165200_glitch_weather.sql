alter table public.realm_weather_state
  drop constraint if exists realm_weather_state_weather_type_check;

alter table public.realm_weather_state
  add constraint realm_weather_state_weather_type_check
  check (weather_type = any (array[
    'sunny'::text, 'rain'::text, 'snow'::text, 'thunder'::text,
    'crystal'::text, 'hell'::text, 'dumpling'::text, 'shark'::text,
    'glitch'::text
  ]));

create or replace function public.admin_set_realm_weather(
  p_weather_type text,
  p_duration_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_until timestamptz;
  v_now timestamptz := now();
  v_row public.realm_weather_state%rowtype;
begin
  if lower(coalesce(auth.jwt()->>'email','')) <> 'toby110403@gmail.com' then
    raise exception '沒有管理員權限';
  end if;
  if p_weather_type not in ('sunny','rain','snow','thunder','crystal','hell','glitch') then
    raise exception '無效的天氣種類';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 1440 then
    raise exception '持續時間必須介於 1 至 1440 分鐘';
  end if;
  select * into v_row from public.realm_weather_state where singleton = true for update;
  v_until := v_now + make_interval(mins => p_duration_minutes);
  update public.realm_weather_state
    set weather_type = p_weather_type,
        ends_at = v_until,
        summoned_by = '管理員面板',
        updated_at = v_now
    where singleton = true
    returning * into v_row;
  return jsonb_build_object(
    'weather_type', v_row.weather_type,
    'ends_at', v_row.ends_at,
    'summoned_by', v_row.summoned_by,
    'updated_at', v_row.updated_at
  );
end;
$function$;

create or replace function public.admin_set_realm_weather_pair(
  p_weather_type text,
  p_weather_type_2 text default null::text,
  p_duration_minutes integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email',''));
  v_now timestamptz := now();
  v_until timestamptz;
  v_row public.realm_weather_state%rowtype;
  v_allowed text[] := array['sunny','rain','snow','thunder','crystal','hell','dumpling','shark','glitch'];
begin
  if auth.uid() is null or v_email <> 'toby110403@gmail.com' then
    raise exception '管理員權限不足';
  end if;
  if not (p_weather_type = any(v_allowed)) then
    raise exception '不支援的第一種天氣';
  end if;
  if p_weather_type_2 is not null and not (p_weather_type_2 = any(v_allowed)) then
    raise exception '不支援的第二種天氣';
  end if;
  if p_weather_type_2 = p_weather_type then
    raise exception '兩種天氣不可相同';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 1440 then
    raise exception '持續時間必須為 1 至 1440 分鐘';
  end if;
  v_until := v_now + make_interval(mins => p_duration_minutes);
  insert into public.realm_weather_state(singleton,weather_type,weather_type_2,ends_at,summoned_by,updated_at)
  values(true,p_weather_type,p_weather_type_2,v_until,'管理員',v_now)
  on conflict (singleton) do update
    set weather_type=excluded.weather_type,
        weather_type_2=excluded.weather_type_2,
        ends_at=excluded.ends_at,
        summoned_by=excluded.summoned_by,
        updated_at=excluded.updated_at
  returning * into v_row;
  return jsonb_build_object(
    'weather_type',v_row.weather_type,
    'weather_type_2',v_row.weather_type_2,
    'ends_at',v_row.ends_at,
    'summoned_by',v_row.summoned_by,
    'updated_at',v_row.updated_at
  );
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
    when new.weather_type in ('crystal','hell') then 'summon'
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
