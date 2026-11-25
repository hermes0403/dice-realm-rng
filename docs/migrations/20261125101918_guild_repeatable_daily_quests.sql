-- T-0130 rework: repeatable daily online and roll quest cycles.
-- Preserve already-awarded XP while moving progress into per-cycle counters.
-- Daily boundaries remain Asia/Taipei; each completed cycle gets a unique claim row.

alter table public.guild_daily_member_progress
  add column if not exists online_cycles_completed bigint not null default 0,
  add column if not exists roll_cycles_completed bigint not null default 0;

alter table public.guild_daily_member_progress
  drop constraint if exists guild_daily_member_progress_online_seconds_check,
  drop constraint if exists guild_daily_member_progress_roll_count_check;

create table if not exists public.guild_daily_task_claims (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_date date not null,
  task_key text not null check (task_key in ('online', 'rolls')),
  cycle_number bigint not null check (cycle_number > 0),
  xp_awarded integer not null check (xp_awarded > 0),
  awarded_at timestamptz not null default now(),
  primary key (guild_id, user_id, task_date, task_key, cycle_number)
);

create index if not exists guild_daily_task_claims_user_date_idx
  on public.guild_daily_task_claims (user_id, task_date);

alter table public.guild_daily_task_claims enable row level security;
revoke all on table public.guild_daily_task_claims from public, anon, authenticated;

-- Migrate the existing once-per-day completion into cycle #1 without awarding XP again.
insert into public.guild_daily_task_claims
  (guild_id, user_id, task_date, task_key, cycle_number, xp_awarded, awarded_at)
select guild_id, user_id, task_date, 'online', 1, 10, coalesce(updated_at, now())
  from public.guild_daily_member_progress
 where online_xp_awarded
on conflict do nothing;

insert into public.guild_daily_task_claims
  (guild_id, user_id, task_date, task_key, cycle_number, xp_awarded, awarded_at)
select guild_id, user_id, task_date, 'rolls', 1, 15, coalesce(updated_at, now())
  from public.guild_daily_member_progress
 where roll_xp_awarded
on conflict do nothing;

update public.guild_daily_member_progress
   set online_cycles_completed = greatest(online_cycles_completed, case when online_xp_awarded then 1 else 0 end),
       online_seconds = case when online_xp_awarded then 0 else least(online_seconds, 1799) end,
       roll_cycles_completed = greatest(roll_cycles_completed, case when roll_xp_awarded then 1 else 0 end),
       roll_count = case when roll_xp_awarded then 0 else least(roll_count, 999) end;

alter table public.guild_daily_member_progress
  add constraint guild_daily_member_progress_online_seconds_check
    check (online_seconds between 0 and 1799),
  add constraint guild_daily_member_progress_roll_count_check
    check (roll_count between 0 and 999),
  add constraint guild_daily_member_progress_online_cycles_check
    check (online_cycles_completed >= 0),
  add constraint guild_daily_member_progress_roll_cycles_check
    check (roll_cycles_completed >= 0);

create or replace function private.add_guild_xp(p_guild_id uuid, p_amount bigint)
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
  if not found then
    raise exception 'guild_not_found' using errcode = 'P0002';
  end if;
end;
$function$;
revoke all on function private.add_guild_xp(uuid, bigint) from public, anon, authenticated;

create or replace function private.award_guild_daily_login_bonus(
  p_guild_id uuid,
  p_task_date date,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_count integer := 0;
  v_logged_in_count integer := 0;
  v_awarded_guild_id uuid;
begin
  if p_guild_id is null or p_task_date is null or p_now is null then return; end if;
  perform 1 from public.guilds where id = p_guild_id for update;
  if not found then return; end if;

  select count(*)::integer,
         count(*) filter (where p.login_completed_at is not null)::integer
    into v_member_count, v_logged_in_count
    from public.guild_members m
    left join public.guild_daily_member_progress p
      on p.guild_id = m.guild_id
     and p.user_id = m.user_id
     and p.task_date = p_task_date
   where m.guild_id = p_guild_id;

  -- A one-member guild is not eligible for the collective reward.
  if v_member_count >= 2 and v_logged_in_count = v_member_count then
    insert into public.guild_daily_login_bonuses(guild_id, task_date, awarded_at)
    values (p_guild_id, p_task_date, p_now)
    on conflict (guild_id, task_date) do nothing
    returning guild_id into v_awarded_guild_id;
    if found then perform private.add_guild_xp(p_guild_id, 20::bigint); end if;
  end if;
end;
$function$;

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
  v_online_cycles_completed bigint := 0;
  v_login_awarded boolean := false;
  v_last_presence_at timestamptz;
  v_elapsed integer := 0;
  v_total_seconds bigint := 0;
  v_next_online integer := 0;
  v_new_cycles bigint := 0;
  v_inserted bigint := 0;
  v_award_login boolean := false;
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select guild_id into v_guild_id
    from public.guild_members
   where user_id = p_user_id
   for share;
  if v_guild_id is null then return; end if;

  perform 1 from public.guilds where id = v_guild_id for update;
  if not found then return; end if;

  insert into public.guild_daily_member_progress (
    guild_id, user_id, task_date, login_completed_at, last_presence_at
  ) values (v_guild_id, p_user_id, v_task_date, p_now, p_now)
  on conflict (guild_id, user_id, task_date) do nothing;

  select online_seconds, online_cycles_completed, login_xp_awarded, last_presence_at
    into v_online_seconds, v_online_cycles_completed, v_login_awarded, v_last_presence_at
    from public.guild_daily_member_progress
   where guild_id = v_guild_id and user_id = p_user_id and task_date = v_task_date
   for update;

  if v_last_presence_at is not null then
    v_elapsed := greatest(0, least(90, floor(extract(epoch from (p_now - v_last_presence_at)))::integer));
  end if;

  v_total_seconds := v_online_seconds::bigint + v_elapsed;
  v_new_cycles := floor(v_total_seconds / 1800)::bigint;
  v_next_online := mod(v_total_seconds, 1800)::integer;
  v_award_login := not v_login_awarded;

  update public.guild_daily_member_progress
     set login_completed_at = coalesce(login_completed_at, p_now),
         online_seconds = v_next_online,
         online_cycles_completed = online_cycles_completed + v_new_cycles,
         last_presence_at = p_now,
         login_xp_awarded = true,
         online_xp_awarded = online_xp_awarded or v_new_cycles > 0,
         updated_at = p_now
   where guild_id = v_guild_id and user_id = p_user_id and task_date = v_task_date;

  if v_award_login then perform private.add_guild_xp(v_guild_id, 15::bigint); end if;

  if v_new_cycles > 0 then
    insert into public.guild_daily_task_claims
      (guild_id, user_id, task_date, task_key, cycle_number, xp_awarded, awarded_at)
    select v_guild_id, p_user_id, v_task_date, 'online', cycles.cycle_number, 10, p_now
      from generate_series(
        v_online_cycles_completed + 1,
        v_online_cycles_completed + v_new_cycles
      ) as cycles(cycle_number)
    on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 then
      perform private.add_guild_xp(v_guild_id, v_inserted * 10::bigint);
    end if;
  end if;

  perform private.award_guild_daily_login_bonus(v_guild_id, v_task_date, p_now);
end;
$function$;
revoke all on function private.record_guild_presence(uuid, timestamptz) from public, anon, authenticated;

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
  v_roll_cycles_completed bigint := 0;
  v_total_rolls bigint := 0;
  v_new_cycles bigint := 0;
  v_next_count integer := 0;
  v_inserted bigint := 0;
begin
  if tg_op <> 'UPDATE' then return new; end if;
  v_old_rolls := greatest(0, coalesce(nullif(old.save_data->>'rolls', '')::bigint, 0));
  v_new_rolls := greatest(0, coalesce(nullif(new.save_data->>'rolls', '')::bigint, 0));
  v_delta := v_new_rolls - v_old_rolls;
  if v_delta <= 0 then return new; end if;

  select guild_id into v_guild_id
    from public.guild_members
   where user_id = new.user_id
   for share;
  if v_guild_id is null then return new; end if;
  perform 1 from public.guilds where id = v_guild_id for update;
  if not found then return new; end if;

  v_task_date := (new.updated_at at time zone 'Asia/Taipei')::date;
  insert into public.guild_daily_member_progress (guild_id, user_id, task_date)
  values (v_guild_id, new.user_id, v_task_date)
  on conflict (guild_id, user_id, task_date) do nothing;

  select roll_count, roll_cycles_completed
    into v_roll_count, v_roll_cycles_completed
    from public.guild_daily_member_progress
   where guild_id = v_guild_id and user_id = new.user_id and task_date = v_task_date
   for update;

  v_elapsed := greatest(0, extract(epoch from (new.updated_at - old.updated_at)));
  v_credit := least(v_delta, floor(v_elapsed * 8)::bigint);
  if v_credit <= 0 then return new; end if;

  v_total_rolls := v_roll_count::bigint + v_credit;
  v_new_cycles := floor(v_total_rolls / 1000)::bigint;
  v_next_count := mod(v_total_rolls, 1000)::integer;

  update public.guild_daily_member_progress
     set roll_count = v_next_count,
         roll_cycles_completed = roll_cycles_completed + v_new_cycles,
         roll_xp_awarded = roll_xp_awarded or v_new_cycles > 0,
         updated_at = new.updated_at
   where guild_id = v_guild_id and user_id = new.user_id and task_date = v_task_date;

  if v_new_cycles > 0 then
    insert into public.guild_daily_task_claims
      (guild_id, user_id, task_date, task_key, cycle_number, xp_awarded, awarded_at)
    select v_guild_id, new.user_id, v_task_date, 'rolls', cycles.cycle_number, 15, new.updated_at
      from generate_series(
        v_roll_cycles_completed + 1,
        v_roll_cycles_completed + v_new_cycles
      ) as cycles(cycle_number)
    on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 then
      perform private.add_guild_xp(v_guild_id, v_inserted * 15::bigint);
    end if;
  end if;

  return new;
end;
$function$;
revoke all on function private.track_guild_roll_progress() from public, anon, authenticated;

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
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select guild_id into v_guild_id
    from public.guild_members where user_id = v_user_id;
  if v_guild_id is null then
    return jsonb_build_object('guild', null, 'tasks', '[]'::jsonb);
  end if;

  select name, xp_total into v_guild_name, v_xp_total
    from public.guilds where id = v_guild_id;
  v_level := private.guild_level_for_xp(v_xp_total);
  v_xp_in_level := greatest(0, v_xp_total);
  if v_level > 1 then
    for v_idx in 1..(v_level - 1) loop
      v_xp_in_level := v_xp_in_level - v_costs[v_idx];
    end loop;
  end if;
  if v_level < 20 then
    v_xp_to_next := v_costs[v_level];
  end if;

  select * into v_progress
    from public.guild_daily_member_progress
   where guild_id = v_guild_id and user_id = v_user_id and task_date = v_task_date;

  select count(*)::integer,
         count(*) filter (where p.login_completed_at is not null)::integer
    into v_member_count, v_logged_in_count
    from public.guild_members m
    left join public.guild_daily_member_progress p
      on p.guild_id = m.guild_id
     and p.user_id = m.user_id
     and p.task_date = v_task_date
   where m.guild_id = v_guild_id;

  select exists (
    select 1 from public.guild_daily_login_bonuses
     where guild_id = v_guild_id and task_date = v_task_date
  ) into v_bonus_completed;

  return jsonb_build_object(
    'guild', jsonb_build_object(
      'id', v_guild_id,
      'name', v_guild_name,
      'level', v_level,
      'xp_total', v_xp_total,
      'xp_in_level', v_xp_in_level,
      'xp_to_next', v_xp_to_next,
      'member_count', v_member_count
    ),
    'tasks', jsonb_build_array(
      jsonb_build_object('key','login','title','每日登入','progress',case when v_progress.login_completed_at is not null then 1 else 0 end,'target',1,'xp',15,'completed',v_progress.login_completed_at is not null),
      jsonb_build_object('key','online','title','在線累積','progress',coalesce(v_progress.online_seconds,0),'target',1800,'xp',10,'cycles_completed',coalesce(v_progress.online_cycles_completed,0),'completed',coalesce(v_progress.online_seconds,0)=0 and coalesce(v_progress.online_cycles_completed,0)>0),
      jsonb_build_object('key','rolls','title','擲骰累積','progress',coalesce(v_progress.roll_count,0),'target',1000,'xp',15,'cycles_completed',coalesce(v_progress.roll_cycles_completed,0),'completed',coalesce(v_progress.roll_count,0)=0 and coalesce(v_progress.roll_cycles_completed,0)>0),
      jsonb_build_object('key','all_login','title','全員每日登入','progress',v_logged_in_count,'target',greatest(2,v_member_count),'xp',20,'eligible',v_member_count>=2,'completed',v_bonus_completed)
    )
  );
end;
$function$;
revoke all on function private.guild_get_daily_tasks() from public, anon, authenticated;
