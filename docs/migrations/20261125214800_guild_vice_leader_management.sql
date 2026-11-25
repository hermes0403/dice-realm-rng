-- T-0137: Leader-only appointment and removal of vice leaders.

create or replace function private.guild_set_vice_leader(
  p_user_id uuid,
  p_make_vice_leader boolean
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
  v_actor_role text;
  v_target_role text;
  v_vice_count integer;
  v_new_role text;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_user_id is null or p_make_vice_leader is null then
    raise exception 'guild_vice_leader_target_required' using errcode = '22023';
  end if;

  select gm.guild_id, gm.role
    into v_guild_id, v_actor_role
  from public.guild_members gm
  where gm.user_id = v_uid
  for update;

  if v_guild_id is null or v_actor_role <> 'leader' then
    raise exception 'guild_vice_leader_permission_denied' using errcode = '42501';
  end if;

  if p_user_id = v_uid then
    raise exception 'guild_cannot_change_own_role' using errcode = '42501';
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

  if p_make_vice_leader then
    if v_target_role <> 'member' then
      raise exception 'guild_vice_leader_target_must_be_member' using errcode = '22023';
    end if;

    select count(*)::integer
      into v_vice_count
    from public.guild_members gm
    where gm.guild_id = v_guild_id
      and gm.role = 'vice_leader';

    if v_vice_count >= 2 then
      raise exception 'guild_vice_leader_limit_reached' using errcode = '23514';
    end if;

    v_new_role := 'vice_leader';
  else
    if v_target_role <> 'vice_leader' then
      raise exception 'guild_target_is_not_vice_leader' using errcode = '22023';
    end if;

    v_new_role := 'member';
  end if;

  update public.guild_members
  set role = v_new_role
  where guild_id = v_guild_id
    and user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'role', v_new_role
  );
end;
$function$;

revoke all on function private.guild_set_vice_leader(uuid, boolean) from public, anon, authenticated;

create or replace function public.guild_set_vice_leader(
  p_user_id uuid,
  p_make_vice_leader boolean
)
returns jsonb
language sql
set search_path to ''
as $function$
  select private.guild_set_vice_leader(p_user_id, p_make_vice_leader);
$function$;

revoke all on function public.guild_set_vice_leader(uuid, boolean) from public, anon;
grant execute on function public.guild_set_vice_leader(uuid, boolean) to authenticated;
