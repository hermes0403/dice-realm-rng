-- T-0132: Align the collective daily-login reward and payload with the confirmed roster threshold.
-- 2 members => 2 logins; 3 or 4 members => at least 3 logins; 1 member => ineligible.

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

  if v_member_count >= 2 and v_logged_in_count >= least(v_member_count, 3) then
    insert into public.guild_daily_login_bonuses(guild_id, task_date, awarded_at)
    values (p_guild_id, p_task_date, p_now)
    on conflict (guild_id, task_date) do nothing
    returning guild_id into v_awarded_guild_id;
    if found then perform private.add_guild_xp(p_guild_id, 20::bigint); end if;
  end if;
end;
$function$;

revoke all on function private.award_guild_daily_login_bonus(uuid, date, timestamptz) from public, anon, authenticated;

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
  v_all_login_target integer := 0;
  v_all_login_title text;
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

  v_all_login_target := case when v_member_count >= 2 then least(v_member_count, 3) else 0 end;
  v_all_login_title := case
    when v_member_count = 1 then '等待第 2 位成員加入'
    when v_member_count >= 3 then '3 位以上成員每日登入'
    else '2 位成員每日登入'
  end;

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
      jsonb_build_object(
        'key','all_login',
        'title',v_all_login_title,
        'progress',case when v_all_login_target > 0 then least(v_logged_in_count, v_all_login_target) else 0 end,
        'target',v_all_login_target,
        'xp',20,
        'eligible',v_member_count>=2,
        'completed',v_bonus_completed
      )
    )
  );
end;
$function$;
revoke all on function private.guild_get_daily_tasks() from public, anon, authenticated;
