-- T-0134: Enforce the unified 2-16 character guild name limit.
-- Preflight is intentionally fail-closed: existing names are never truncated or rewritten.

do $$
begin
  if exists (
    select 1 from public.guilds
    where char_length(btrim(name)) > 16
  ) then
    raise exception 'guild_name_limit_preflight_failed_existing_names_over_16';
  end if;
end;
$$;

alter table public.guilds
  drop constraint if exists guilds_name_length;

alter table public.guilds
  add constraint guilds_name_length
  check (char_length(btrim(name)) between 2 and 16);

create or replace function private.guild_create(
  p_name text,
  p_description text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if exists (
    select 1 from public.guild_members
    where user_id = v_uid
  ) then
    raise exception 'already_in_guild' using errcode = '23505';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 2 and 16 then
    raise exception 'guild_name_length_invalid' using errcode = '22023';
  end if;

  if char_length(coalesce(p_description, '')) > 160 then
    raise exception 'guild_description_too_long' using errcode = '22023';
  end if;

  insert into public.guilds(name, description, created_by)
  values (btrim(p_name), coalesce(p_description, ''), v_uid)
  returning id into v_guild_id;

  insert into public.guild_members(guild_id, user_id, role)
  values (v_guild_id, v_uid, 'leader');

  return jsonb_build_object('ok', true, 'guild_id', v_guild_id);
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'guilds_name_lower_uidx' then
      raise exception 'guild_name_taken' using errcode = '23505';
    end if;
    raise exception 'already_in_guild' using errcode = '23505';
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

  if p_name is null or char_length(btrim(p_name)) not between 2 and 16 then
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
