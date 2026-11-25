-- T-0136: Secure guild member removal with server-side role hierarchy checks.

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
      'my_role', null
    );
  end if;

  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'description', g.description,
    'join_mode', g.join_mode,
    'member_count', (
      select count(*)
      from public.guild_members mm
      where mm.guild_id = g.id
    ),
    'created_at', g.created_at,
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
    where a.guild_id = v_guild_id
      and a.status = 'pending';
  end if;

  return jsonb_build_object(
    'guild', v_guild,
    'members', v_members,
    'applications', v_apps,
    'my_role', v_role
  );
end;
$function$;


create or replace function private.guild_remove_member(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_actor_role text;
  v_target_role text;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_user_id is null then
    raise exception 'guild_member_target_required' using errcode = '22023';
  end if;

  select gm.guild_id, gm.role
    into v_guild_id, v_actor_role
  from public.guild_members gm
  where gm.user_id = v_uid
  for update;

  if v_guild_id is null or v_actor_role not in ('leader', 'vice_leader') then
    raise exception 'guild_member_management_permission_denied' using errcode = '42501';
  end if;

  if p_user_id = v_uid then
    raise exception 'guild_cannot_remove_self' using errcode = '42501';
  end if;

  select gm.role
    into v_target_role
  from public.guild_members gm
  where gm.guild_id = v_guild_id
    and gm.user_id = p_user_id
  for update;

  if v_target_role is null then
    raise exception 'guild_member_not_found' using errcode = 'P0002';
  end if;

  if v_target_role = 'leader' then
    raise exception 'guild_cannot_remove_leader' using errcode = '42501';
  end if;

  if v_actor_role = 'vice_leader'
     and v_target_role not in ('officer', 'member') then
    raise exception 'guild_member_hierarchy_denied' using errcode = '42501';
  end if;

  delete from public.guild_members
  where guild_id = v_guild_id
    and user_id = p_user_id;

  if not found then
    raise exception 'guild_member_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ok', true,
    'removed_user_id', p_user_id
  );
end;
$function$;

revoke all on function private.guild_remove_member(uuid) from public, anon, authenticated;

create or replace function public.guild_remove_member(p_user_id uuid)
returns jsonb
language sql
set search_path to ''
as $function$
  select private.guild_remove_member(p_user_id);
$function$;

revoke all on function public.guild_remove_member(uuid) from public, anon;
grant execute on function public.guild_remove_member(uuid) to authenticated;
