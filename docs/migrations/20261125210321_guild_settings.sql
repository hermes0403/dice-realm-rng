-- T-0133: Allow the guild leader to update public guild settings.
-- The client can only call the authenticated RPC; guilds has no direct client write grants.

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
    'created_at', g.created_at
  )
  into v_guild
  from public.guilds g
  where g.id = v_guild_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'username', coalesce(pp.username, '未知玩家'),
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

create or replace function private.guild_update_settings(
  p_name text,
  p_description text,
  p_join_mode text
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
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select gm.guild_id
    into v_guild_id
  from public.guild_members gm
  where gm.user_id = v_uid
    and gm.role = 'leader'
  for update;

  if v_guild_id is null then
    raise exception 'guild_settings_permission_denied' using errcode = '42501';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 2 and 24 then
    raise exception 'guild_name_length_invalid' using errcode = '22023';
  end if;

  if char_length(coalesce(p_description, '')) > 160 then
    raise exception 'guild_description_too_long' using errcode = '22023';
  end if;

  if p_join_mode is null or p_join_mode not in ('application', 'open') then
    raise exception 'guild_join_mode_invalid' using errcode = '22023';
  end if;

  begin
    update public.guilds g
    set
      name = btrim(p_name),
      description = coalesce(p_description, ''),
      join_mode = p_join_mode
    where g.id = v_guild_id
    returning jsonb_build_object(
      'id', g.id,
      'name', g.name,
      'description', g.description,
      'join_mode', g.join_mode
    )
    into v_result;
  exception
    when unique_violation then
      raise exception 'guild_name_taken' using errcode = '23505';
  end;

  if v_result is null then
    raise exception 'guild_not_found' using errcode = 'P0002';
  end if;

  return v_result;
end;
$function$;

create or replace function public.guild_update_settings(
  p_name text,
  p_description text,
  p_join_mode text
)
returns jsonb
language sql
volatile
set search_path to ''
as $function$
  select private.guild_update_settings(p_name, p_description, p_join_mode);
$function$;

revoke all on function private.guild_update_settings(text, text, text) from public, anon, authenticated;
grant execute on function private.guild_update_settings(text, text, text) to authenticated;

revoke all on function public.guild_update_settings(text, text, text) from public, anon;
grant execute on function public.guild_update_settings(text, text, text) to authenticated;
