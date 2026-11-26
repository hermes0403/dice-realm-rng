-- T-0141 follow-up: owner-updated guild XP thresholds and Lv.13 reward.
-- Existing reward event records and player progress are preserved; no retroactive grants.

create or replace function private.guild_level_for_xp(p_xp bigint)
returns integer
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_costs bigint[] := array[
    100,250,500,850,1300,1400,1600,1800,2000,2200,2500,2600,2750,3000,3600,3900,4500,4800,5000
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

create or replace function private.add_guild_xp(p_guild_id uuid, p_amount bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_guild public.guilds%rowtype;
  v_effective_amount bigint;
  v_new_xp bigint;
  v_new_level integer;
  v_level integer;
  v_reward_key text;
  v_reward_type text;
  v_reward_text text;
  v_reward_amount integer;
  v_inserted_guild_id uuid;
  v_member record;
  v_mail_id uuid;
  v_body text;
begin
  if p_guild_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'invalid_guild_xp_award' using errcode = '22023';
  end if;

  select * into v_guild
    from public.guilds
   where id = p_guild_id
   for update;
  if not found then
    raise exception 'guild_not_found' using errcode = 'P0002';
  end if;

  v_effective_amount := p_amount;
  if exists (
    select 1 from public.guild_level_reward_events
     where guild_id = p_guild_id and reward_key = 'guild_xp_bonus_5' and reward_type = 'bonus'
  ) then
    v_effective_amount := greatest(1, round(p_amount::numeric * 1.05)::bigint);
  end if;

  v_new_xp := v_guild.xp_total + v_effective_amount;
  v_new_level := private.guild_level_for_xp(v_new_xp);

  update public.guilds
     set xp_total = v_new_xp,
         level = v_new_level
   where id = p_guild_id;

  if v_new_level <= v_guild.level then return; end if;

  for v_level in (v_guild.level + 1)..v_new_level loop
    v_reward_key := '';
    v_reward_type := '';
    v_reward_text := '';
    v_reward_amount := 1;

    case v_level
      when 2 then v_reward_key := 'luck1'; v_reward_type := 'potion'; v_reward_text := '幸運藥水 I ×1';
      when 3 then v_reward_key := 'luck3'; v_reward_type := 'potion'; v_reward_text := '幸運藥水 III ×1';
      when 4 then v_reward_key := 'speed1'; v_reward_type := 'potion'; v_reward_text := '速度藥水 I ×1';
      when 5 then v_reward_key := 'badge_frame'; v_reward_type := 'cosmetic'; v_reward_text := '公會徽章框';
      when 6 then v_reward_key := 'money1'; v_reward_type := 'potion'; v_reward_text := '金錢藥水 I ×1';
      when 7 then v_reward_key := 'luck3'; v_reward_type := 'potion'; v_reward_text := '幸運藥水 III ×1';
      when 8 then v_reward_key := 'luck2'; v_reward_type := 'potion'; v_reward_text := '幸運藥水 II ×1';
      when 9 then v_reward_key := 'name_color'; v_reward_type := 'cosmetic'; v_reward_text := '專屬公會名稱顏色';
      when 10 then v_reward_key := 'angel1'; v_reward_type := 'potion'; v_reward_text := '天堂藥水 I ×1';
      when 11 then v_reward_key := 'guild_xp_bonus_5'; v_reward_type := 'bonus'; v_reward_text := '公會 XP 加成 +5%';
      when 12 then v_reward_key := 'speed2'; v_reward_type := 'potion'; v_reward_text := '速度藥水 II ×1';
      when 13 then v_reward_key := 'guild_xp_bonus_5'; v_reward_type := 'bonus'; v_reward_text := '公會 XP 加成 +5%';
      when 14 then v_reward_key := 'money2'; v_reward_type := 'potion'; v_reward_text := '金錢藥水 II ×1';
      when 15 then v_reward_key := 'badge_effect'; v_reward_type := 'cosmetic'; v_reward_text := '公會徽章特效';
      when 16 then v_reward_key := 'luck3'; v_reward_type := 'potion'; v_reward_text := '幸運藥水 III ×1';
      when 17 then v_reward_key := 'angel1'; v_reward_type := 'potion'; v_reward_text := '天堂藥水 I ×1';
      when 18 then v_reward_key := 'angel1'; v_reward_type := 'potion'; v_reward_text := '天堂藥水 I ×2'; v_reward_amount := 2;
      when 19 then v_reward_key := 'guild_background'; v_reward_type := 'cosmetic'; v_reward_text := '專屬公會背景';
      when 20 then v_reward_key := 'angel2'; v_reward_type := 'potion'; v_reward_text := '天堂藥水 II ×1';
      else raise exception 'guild_level_reward_missing';
    end case;

    insert into public.guild_level_reward_events (
      guild_id, guild_level, reward_key, reward_type, reward_text
    ) values (
      p_guild_id, v_level, v_reward_key, v_reward_type, v_reward_text
    )
    on conflict (guild_id, guild_level) do nothing
    returning guild_id into v_inserted_guild_id;
    if not found then continue; end if;

    for v_member in
      select user_id from public.guild_members
       where guild_id = p_guild_id
       order by joined_at, user_id
    loop
      v_body := format(
        E'你的公會「%s」已升級至 Lv.%s。\n本次升級獎勵：%s。%s',
        v_guild.name,
        v_level,
        v_reward_text,
        case v_reward_type
          when 'potion' then '獎勵已發放至你的藥水庫存。'
          when 'bonus' then '公會 XP 加成已啟用。'
          else '此為公會共享解鎖，所有成員均可使用。'
        end
      );

      insert into public.guild_level_reward_mail (
        guild_id, guild_level, recipient_id, subject, body, reward_text
      ) values (
        p_guild_id, v_level, v_member.user_id,
        format('公會已升級至 Lv.%s！', v_level),
        v_body,
        v_reward_text
      )
      on conflict (guild_id, guild_level, recipient_id) do nothing
      returning id into v_mail_id;

      if found and v_reward_type = 'potion' then
        insert into public.player_grants (user_id)
        values (v_member.user_id)
        on conflict (user_id) do nothing;

        update public.player_grants
           set luck1_total = luck1_total + case when v_reward_key = 'luck1' then v_reward_amount else 0 end,
               luck2_total = luck2_total + case when v_reward_key = 'luck2' then v_reward_amount else 0 end,
               luck3_total = luck3_total + case when v_reward_key = 'luck3' then v_reward_amount else 0 end,
               speed1_total = speed1_total + case when v_reward_key = 'speed1' then v_reward_amount else 0 end,
               speed2_total = speed2_total + case when v_reward_key = 'speed2' then v_reward_amount else 0 end,
               money1_total = money1_total + case when v_reward_key = 'money1' then v_reward_amount else 0 end,
               money2_total = money2_total + case when v_reward_key = 'money2' then v_reward_amount else 0 end,
               angel1_total = angel1_total + case when v_reward_key = 'angel1' then v_reward_amount else 0 end,
               angel2_total = angel2_total + case when v_reward_key = 'angel2' then v_reward_amount else 0 end,
               updated_at = now()
         where user_id = v_member.user_id;
      end if;
    end loop;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guild_get_daily_tasks()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_guild_id uuid;
  v_guild_name text;
  v_xp_total bigint;
  v_level integer;
  v_xp_in_level bigint;
  v_xp_to_next bigint := 0;
  v_costs bigint[] := array[
    100,250,500,850,1300,1400,1600,1800,2000,2200,2500,2600,2750,3000,3600,3900,4500,4800,5000
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
