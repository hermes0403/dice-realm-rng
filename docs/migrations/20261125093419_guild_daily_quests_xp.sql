-- T-0130: Guild daily quests, shared XP progression and four-member cap.
-- Applied to Supabase project pkdctcfifauygnjipmab as migration 20261125093419.
-- Daily periods are calculated using Asia/Taipei. Client input never contains XP
-- or completion flags; progress is derived by server-side presence and save hooks.

alter table public.guilds
  add column if not exists xp_total bigint not null default 0,
  add column if not exists level smallint not null default 1;
alter table public.guilds
  drop constraint if exists guilds_level_range_check;
alter table public.guilds
  add constraint guilds_level_range_check check (level between 1 and 20),
  add constraint guilds_xp_total_nonnegative_check check (xp_total >= 0);

create table if not exists public.guild_daily_member_progress (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_date date not null,
  login_completed_at timestamptz,
  online_seconds integer not null default 0 check (online_seconds between 0 and 1800),
  roll_count integer not null default 0 check (roll_count between 0 and 1000),
  login_xp_awarded boolean not null default false,
  online_xp_awarded boolean not null default false,
  roll_xp_awarded boolean not null default false,
  last_presence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, user_id, task_date)
);
create index if not exists guild_daily_member_progress_date_idx
  on public.guild_daily_member_progress (guild_id, task_date, user_id);

create table if not exists public.guild_daily_login_bonuses (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  task_date date not null,
  awarded_at timestamptz not null default now(),
  primary key (guild_id, task_date)
);

alter table public.guild_daily_member_progress enable row level security;
alter table public.guild_daily_login_bonuses enable row level security;
revoke all on table public.guild_daily_member_progress, public.guild_daily_login_bonuses
  from public, anon, authenticated;

create or replace function private.guild_level_for_xp(p_xp bigint)
returns integer
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_costs bigint[] := array[
    100,250,500,850,1300,1900,2700,3700,5000,6600,
    8500,10800,13500,16800,20800,25500,31000,37500,45000
  ];
  v_remaining bigint := greatest(0, coalesce(p_xp, 0));
  v_level integer := 1;
  v_idx integer;
begin
  for v_idx in 1..array_length(v_costs, 1) loop
    if v_remaining < v_costs[v_idx] then exit; end if;
    v_remaining := v_remaining - v_costs[v_idx];
    v_level := v_level + 1;
  end loop;
  return v_level;
end;
$function$;

create or replace function private.add_guild_xp(p_guild_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_guild_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'invalid_guild_xp_award' using errcode = '22023';
  end if;
  update public.guilds
     set xp_total = public.guilds.xp_total + p_amount,
         level = private.guild_level_for_xp(public.guilds.xp_total + p_amount)
   where id = p_guild_id;
  if not found then raise exception 'guild_not_found' using errcode = 'P0002'; end if;
end;
$function$;

-- Enforce the explicitly confirmed 4-member cap in the database, including
-- concurrent joins. The guild row lock serializes all membership changes.
create or replace function private.enforce_guild_member_cap()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  perform 1 from public.guilds where id = new.guild_id for update;
  if tg_op = 'UPDATE' then
    select count(*) into v_count
      from public.guild_members
     where guild_id = new.guild_id
       and not (guild_id = old.guild_id and user_id = old.user_id);
  else
    select count(*) into v_count
      from public.guild_members where guild_id = new.guild_id;
  end if;
  if v_count >= 4 then
    raise exception 'guild_member_limit_reached' using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists guild_members_total_cap on public.guild_members;
create trigger guild_members_total_cap
before insert or update of guild_id on public.guild_members
for each row execute function private.enforce_guild_member_cap();

create or replace function private.record_guild_presence(p_user_id uuid, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_guild_id uuid;
  v_task_date date := (p_now at time zone 'Asia/Taipei')::date;
  v_online_seconds integer := 0;
  v_login_awarded boolean := false;
  v_online_awarded boolean := false;
  v_last_presence_at timestamptz;
  v_elapsed integer := 0;
  v_next_online integer := 0;
  v_award_login boolean := false;
  v_award_online boolean := false;
  v_member_count integer := 0;
  v_logged_in_count integer := 0;
  v_bonus_guild_id uuid;
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select guild_id into v_guild_id from public.guild_members where user_id = p_user_id;
  if v_guild_id is null then return; end if;

  perform 1 from public.guilds where id = v_guild_id for update;
  insert into public.guild_daily_member_progress (
    guild_id, user_id, task_date, login_completed_at, last_presence_at
  ) values (v_guild_id, p_user_id, v_task_date, p_now, p_now)
  on conflict (guild_id, user_id, task_date) do nothing;

  select online_seconds, login_xp_awarded, online_xp_awarded, last_presence_at
    into v_online_seconds, v_login_awarded, v_online_awarded, v_last_presence_at
    from public.guild_daily_member_progress
   where guild_id = v_guild_id and user_id = p_user_id and task_date = v_task_date
   for update;

  if v_last_presence_at is not null then
    v_elapsed := greatest(0, least(90, floor(extract(epoch from (p_now - v_last_presence_at)))::integer));
  end if;
  v_next_online := least(1800, v_online_seconds + v_elapsed);
  v_award_login := not v_login_awarded;
  v_award_online := v_next_online >= 1800 and not v_online_awarded;

  update public.guild_daily_member_progress
     set login_completed_at = coalesce(login_completed_at, p_now),
         online_seconds = v_next_online,
         last_presence_at = p_now,
         login_xp_awarded = true,
         online_xp_awarded = online_xp_awarded or v_award_online,
         updated_at = p_now
   where guild_id = v_guild_id and user_id = p_user_id and task_date = v_task_date;

  if v_award_login then perform private.add_guild_xp(v_guild_id, 15); end if;
  if v_award_online then perform private.add_guild_xp(v_guild_id, 10); end if;

  select count(*)::integer,
         count(*) filter (where p.login_completed_at is not null)::integer
    into v_member_count, v_logged_in_count
    from public.guild_members m
    left join public.guild_daily_member_progress p
      on p.guild_id = m.guild_id and p.user_id = m.user_id and p.task_date = v_task_date
   where m.guild_id = v_guild_id;

  if v_member_count > 0 and v_logged_in_count = v_member_count then
    insert into public.guild_daily_login_bonuses(guild_id, task_date, awarded_at)
    values (v_guild_id, v_task_date, p_now)
    on conflict (guild_id, task_date) do nothing
    returning guild_id into v_bonus_guild_id;
    if found then perform private.add_guild_xp(v_guild_id, 20); end if;
  end if;
end;
$function$;

create or replace function private.track_guild_roll_progress()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_guild_id uuid;
  v_task_date date;
  v_old_rolls bigint := 0;
  v_new_rolls bigint := 0;
  v_delta bigint := 0;
  v_elapsed numeric := 0;
  v_credit bigint := 0;
  v_roll_count integer := 0;
  v_roll_awarded boolean := false;
  v_next_count integer := 0;
  v_award boolean := false;
begin
  if tg_op <> 'UPDATE' then return new; end if;
  v_old_rolls := greatest(0, coalesce(nullif(old.save_data->>'rolls', '')::bigint, 0));
  v_new_rolls := greatest(0, coalesce(nullif(new.save_data->>'rolls', '')::bigint, 0));
  v_delta := v_new_rolls - v_old_rolls;
  if v_delta <= 0 then return new; end if;

  select guild_id into v_guild_id from public.guild_members where user_id = new.user_id;
  if v_guild_id is null then return new; end if;
  perform 1 from public.guilds where id = v_guild_id for update;

  v_task_date := (new.updated_at at time zone 'Asia/Taipei')::date;
  insert into public.guild_daily_member_progress (guild_id, user_id, task_date)
  values (v_guild_id, new.user_id, v_task_date)
  on conflict (guild_id, user_id, task_date) do nothing;

  select roll_count, roll_xp_awarded into v_roll_count, v_roll_awarded
    from public.guild_daily_member_progress
   where guild_id = v_guild_id and user_id = new.user_id and task_date = v_task_date
   for update;

  v_elapsed := greatest(0, extract(epoch from (new.updated_at - old.updated_at)));
  -- Client save counters are untrusted; cap credited deltas at 8 rolls per second.
  v_credit := least(v_delta, floor(v_elapsed * 8)::bigint);
  if v_credit <= 0 then return new; end if;

  v_next_count := least(1000::bigint, v_roll_count::bigint + v_credit)::integer;
  v_award := v_next_count >= 1000 and not v_roll_awarded;
  update public.guild_daily_member_progress
     set roll_count = v_next_count,
         roll_xp_awarded = roll_xp_awarded or v_award,
         updated_at = new.updated_at
   where guild_id = v_guild_id and user_id = new.user_id and task_date = v_task_date;

  if v_award then perform private.add_guild_xp(v_guild_id, 15); end if;
  return new;
end;
$function$;

drop trigger if exists guild_daily_roll_progress on public.game_saves;
create trigger guild_daily_roll_progress
after update of save_data on public.game_saves
for each row when (new.save_data is distinct from old.save_data)
execute function private.track_guild_roll_progress();

create or replace function private.guild_get_daily_tasks()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_guild_id uuid;
  v_guild_name text;
  v_xp_total bigint;
  v_level integer;
  v_xp_in_level bigint;
  v_xp_to_next bigint := 0;
  v_costs bigint[] := array[
    100,250,500,850,1300,1900,2700,3700,5000,6600,
    8500,10800,13500,16800,20800,25500,31000,37500,45000
  ];
  v_idx integer;
  v_progress public.guild_daily_member_progress%rowtype;
  v_task_date date := (now() at time zone 'Asia/Taipei')::date;
  v_member_count integer := 0;
  v_logged_in_count integer := 0;
  v_bonus_completed boolean := false;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select guild_id into v_guild_id from public.guild_members where user_id = v_user_id;
  if v_guild_id is null then return jsonb_build_object('guild', null, 'tasks', '[]'::jsonb); end if;

  select name, xp_total into v_guild_name, v_xp_total from public.guilds where id = v_guild_id;
  v_level := private.guild_level_for_xp(v_xp_total);
  v_xp_in_level := greatest(0, v_xp_total);
  if v_level > 1 then
    for v_idx in 1..(v_level - 1) loop v_xp_in_level := v_xp_in_level - v_costs[v_idx]; end loop;
  end if;
  if v_level < 20 then v_xp_to_next := v_costs[v_level]; end if;

  select * into v_progress from public.guild_daily_member_progress
   where guild_id = v_guild_id and user_id = v_user_id and task_date = v_task_date;

  select count(*)::integer,
         count(*) filter (where p.login_completed_at is not null)::integer
    into v_member_count, v_logged_in_count
    from public.guild_members m
    left join public.guild_daily_member_progress p
      on p.guild_id = m.guild_id and p.user_id = m.user_id and p.task_date = v_task_date
   where m.guild_id = v_guild_id;

  select exists (select 1 from public.guild_daily_login_bonuses
                 where guild_id = v_guild_id and task_date = v_task_date)
    into v_bonus_completed;

  return jsonb_build_object(
    'guild', jsonb_build_object(
      'id', v_guild_id, 'name', v_guild_name, 'level', v_level,
      'xp_total', v_xp_total, 'xp_in_level', v_xp_in_level,
      'xp_to_next', v_xp_to_next, 'member_count', v_member_count
    ),
    'tasks', jsonb_build_array(
      jsonb_build_object('key','login','title','每日登入','progress',case when v_progress.login_completed_at is not null then 1 else 0 end,'target',1,'xp',15,'completed',v_progress.login_completed_at is not null),
      jsonb_build_object('key','online','title','在線累積','progress',coalesce(v_progress.online_seconds,0),'target',1800,'xp',10,'completed',coalesce(v_progress.online_xp_awarded,false)),
      jsonb_build_object('key','rolls','title','擲骰累積','progress',coalesce(v_progress.roll_count,0),'target',1000,'xp',15,'completed',coalesce(v_progress.roll_xp_awarded,false)),
      jsonb_build_object('key','all_login','title','全員每日登入','progress',v_logged_in_count,'target',v_member_count,'xp',20,'completed',v_bonus_completed)
    )
  );
end;
$function$;

create or replace function public.guild_get_daily_tasks()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  return private.guild_get_daily_tasks();
end;
$function$;

create or replace function public.touch_player_presence()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_rows integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.player_profiles set last_seen = v_now, updated_at = v_now where user_id = v_user_id;
  get diagnostics v_rows = row_count;
  perform private.record_guild_presence(v_user_id, v_now);
  return jsonb_build_object('updated', v_rows > 0, 'last_seen', v_now);
end;
$function$;

revoke all on function private.guild_level_for_xp(bigint) from public, anon, authenticated;
revoke all on function private.add_guild_xp(uuid, integer) from public, anon, authenticated;
revoke all on function private.enforce_guild_member_cap() from public, anon, authenticated;
revoke all on function private.record_guild_presence(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.track_guild_roll_progress() from public, anon, authenticated;
revoke all on function private.guild_get_daily_tasks() from public, anon, authenticated;
revoke all on function public.guild_get_daily_tasks() from public, anon;
grant execute on function public.guild_get_daily_tasks() to authenticated;
revoke all on function public.touch_player_presence() from public, anon;
grant execute on function public.touch_player_presence() to authenticated;
