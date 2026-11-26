-- T-0147: persistent, server-authorized guild cosmetic selections.
-- Cosmetic unlocks are read from actual guild reward events; legacy reward rows do not grant cosmetics retroactively.

alter table public.guilds
  add column if not exists name_color text not null default 'default'
    check (name_color in ('default','nebula','ice','ember','emerald','solar')),
  add column if not exists badge_effect text not null default 'none'
    check (badge_effect in ('none','pulse','orbit','radiant')),
  add column if not exists background_theme text not null default 'default'
    check (background_theme in ('default','nebula','aurora','eclipse','crimson'));

create or replace function private.guild_update_cosmetics(
  p_name_color text,
  p_badge_effect text,
  p_background_theme text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_role text;
  v_name_color text := coalesce(p_name_color, 'default');
  v_badge_effect text := coalesce(p_badge_effect, 'none');
  v_background_theme text := coalesce(p_background_theme, 'default');
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select gm.guild_id, gm.role
    into v_guild_id, v_role
  from public.guild_members gm
  where gm.user_id = v_uid;

  if v_guild_id is null or v_role not in ('leader','vice_leader') then
    raise exception 'guild_cosmetics_permission_denied' using errcode = '42501';
  end if;

  perform 1
    from public.guilds g
   where g.id = v_guild_id
   for update;
  if not found then
    raise exception 'guild_not_found' using errcode = 'P0002';
  end if;

  if v_name_color not in ('default','nebula','ice','ember','emerald','solar') then
    raise exception 'guild_name_color_invalid' using errcode = '22023';
  end if;
  if v_badge_effect not in ('none','pulse','orbit','radiant') then
    raise exception 'guild_badge_effect_invalid' using errcode = '22023';
  end if;
  if v_background_theme not in ('default','nebula','aurora','eclipse','crimson') then
    raise exception 'guild_background_invalid' using errcode = '22023';
  end if;

  if v_name_color <> 'default' and not exists (
    select 1 from public.guild_level_reward_events e
    where e.guild_id = v_guild_id
      and e.reward_key = 'name_color'
      and e.reward_type = 'cosmetic'
  ) then
    raise exception 'guild_name_color_locked' using errcode = '42501';
  end if;

  if v_badge_effect <> 'none' and not exists (
    select 1 from public.guild_level_reward_events e
    where e.guild_id = v_guild_id
      and e.reward_key = 'badge_effect'
      and e.reward_type = 'cosmetic'
  ) then
    raise exception 'guild_badge_effect_locked' using errcode = '42501';
  end if;

  if v_background_theme <> 'default' and not exists (
    select 1 from public.guild_level_reward_events e
    where e.guild_id = v_guild_id
      and e.reward_key = 'guild_background'
      and e.reward_type = 'cosmetic'
  ) then
    raise exception 'guild_background_locked' using errcode = '42501';
  end if;

  update public.guilds
     set name_color = v_name_color,
         badge_effect = v_badge_effect,
         background_theme = v_background_theme
   where id = v_guild_id;

  return jsonb_build_object(
    'name_color', v_name_color,
    'badge_effect', v_badge_effect,
    'background_theme', v_background_theme
  );
end;
$function$;

revoke all on function private.guild_update_cosmetics(text,text,text) from public, anon, authenticated;
grant execute on function private.guild_update_cosmetics(text,text,text) to authenticated;

create or replace function public.guild_update_cosmetics(
  p_name_color text,
  p_badge_effect text,
  p_background_theme text
)
returns jsonb
language sql
volatile
set search_path to ''
as $function$
  select private.guild_update_cosmetics(p_name_color,p_badge_effect,p_background_theme);
$function$;

revoke all on function public.guild_update_cosmetics(text,text,text) from public, anon;
grant execute on function public.guild_update_cosmetics(text,text,text) to authenticated;

create or replace function private.guild_get_my_guild()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_role text;
  v_guild jsonb;
  v_members jsonb;
  v_apps jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select guild_id, role
    into v_guild_id, v_role
  from public.guild_members
  where user_id = v_uid;

  if v_guild_id is null then
    return jsonb_build_object(
      'guild', null,
      'members', '[]'::jsonb,
      'applications', '[]'::jsonb,
      'my_role', null,
      'mail_unread_count', (
        select count(*) from public.guild_level_reward_mail
        where recipient_id = v_uid and not is_read
      )
    );
  end if;

  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'level', g.level,
    'xp_total', g.xp_total,
    'description', g.description,
    'join_mode', g.join_mode,
    'name_color', g.name_color,
    'badge_effect', g.badge_effect,
    'background_theme', g.background_theme,
    'member_count', (
      select count(*) from public.guild_members mm where mm.guild_id = g.id
    ),
    'created_at', g.created_at,
    'reward_unlocks', (
      select coalesce(
        jsonb_agg(jsonb_build_object('level', r.guild_level, 'reward_key', r.reward_key, 'reward_text', r.reward_text) order by r.guild_level),
        '[]'::jsonb
      )
      from public.guild_level_reward_events r
      where r.guild_id = g.id and r.reward_type in ('cosmetic','bonus')
    ),
    'announcement', (
      select jsonb_build_object(
        'message', a.message,
        'updated_at', a.updated_at,
        'updated_by', coalesce(pp.username, '未知玩家')
      )
      from public.guild_announcements a
      left join public.player_profiles pp on pp.user_id = a.updated_by
      where a.guild_id = g.id
    )
  )
  into v_guild
  from public.guilds g
  where g.id = v_guild_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'username', coalesce(pp.username, '未知玩家'),
        'user_id', case when v_role in ('leader', 'vice_leader') then m.user_id else null end,
        'role', m.role,
        'joined_at', m.joined_at
      )
      order by
        case m.role
          when 'leader' then 1
          when 'vice_leader' then 2
          when 'officer' then 3
          else 4
        end,
        m.joined_at
    ),
    '[]'::jsonb
  )
  into v_members
  from public.guild_members m
  left join public.player_profiles pp on pp.user_id = m.user_id
  where m.guild_id = v_guild_id;

  if v_role in ('leader', 'vice_leader', 'officer') then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'username', coalesce(pp.username, '未知玩家'),
          'message', a.message,
          'created_at', a.created_at
        )
        order by a.created_at
      ),
      '[]'::jsonb
    )
    into v_apps
    from public.guild_applications a
    left join public.player_profiles pp on pp.user_id = a.applicant_id
    where a.guild_id = v_guild_id and a.status = 'pending';
  end if;

  return jsonb_build_object(
    'guild', v_guild,
    'members', v_members,
    'applications', v_apps,
    'my_role', v_role,
    'mail_unread_count', (
      select count(*) from public.guild_level_reward_mail
      where recipient_id = v_uid and not is_read
    )
  );
end;
$function$;

create or replace function private.guild_search(p_query text default '', p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 30 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_result
  from (
    select g.id, g.name, g.description, g.join_mode,
      g.name_color, g.badge_effect, g.background_theme,
      count(m.user_id)::integer as member_count,
      coalesce(pp.username, '未知玩家') as leader_name
    from public.guilds g
    left join public.guild_members m on m.guild_id = g.id
    left join public.guild_members lm on lm.guild_id = g.id and lm.role = 'leader'
    left join public.player_profiles pp on pp.user_id = lm.user_id
    where g.is_public
      and (coalesce(btrim(p_query),'') = '' or position(lower(btrim(p_query)) in lower(g.name)) > 0)
    group by g.id, pp.username
    order by count(m.user_id) desc, g.created_at desc
    limit p_limit
  ) q;
  return v_result;
end;
$function$;

create or replace function private.guild_get_ranking()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', ranked.rank,
        'name', ranked.name,
        'level', ranked.level,
        'xp_total', ranked.xp_total,
        'member_count', ranked.member_count,
        'name_color', ranked.name_color,
        'badge_effect', ranked.badge_effect,
        'background_theme', ranked.background_theme
      )
      order by ranked.rank
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      row_number() over (
        order by g.level desc, g.xp_total desc, g.created_at asc, g.id asc
      )::integer as rank,
      g.name,
      g.level,
      g.xp_total,
      count(m.user_id)::integer as member_count,
      g.name_color,
      g.badge_effect,
      g.background_theme
    from public.guilds g
    left join public.guild_members m on m.guild_id = g.id
    where g.is_public = true
    group by g.id, g.name, g.level, g.xp_total, g.created_at,
      g.name_color, g.badge_effect, g.background_theme
  ) ranked;

  return v_result;
end;
$function$;
