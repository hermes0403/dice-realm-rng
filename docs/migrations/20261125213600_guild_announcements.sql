-- T-0135: One current announcement per guild, writable only by leaders and vice leaders.

create table if not exists public.guild_announcements (
  guild_id uuid primary key references public.guilds(id) on delete cascade,
  message text not null,
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint guild_announcements_message_length check (char_length(message) <= 200)
);

alter table public.guild_announcements enable row level security;
revoke all on table public.guild_announcements from public, anon, authenticated;

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

create or replace function private.guild_update_announcement(p_message text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_message text := btrim(coalesce(p_message, ''));
  v_updated_at timestamptz;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select gm.guild_id
    into v_guild_id
  from public.guild_members gm
  where gm.user_id = v_uid
    and gm.role in ('leader', 'vice_leader')
  for update;

  if v_guild_id is null then
    raise exception 'guild_announcement_permission_denied' using errcode = '42501';
  end if;

  if char_length(v_message) > 200 then
    raise exception 'guild_announcement_too_long' using errcode = '22023';
  end if;

  if v_message = '' then
    delete from public.guild_announcements
    where guild_id = v_guild_id;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;

  insert into public.guild_announcements(guild_id, message, updated_by, updated_at)
  values (v_guild_id, v_message, v_uid, now())
  on conflict (guild_id) do update
    set message = excluded.message,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
  returning updated_at into v_updated_at;

  return jsonb_build_object(
    'ok', true,
    'cleared', false,
    'updated_at', v_updated_at
  );
end;
$function$;

revoke all on function private.guild_update_announcement(text) from public, anon, authenticated;

create or replace function public.guild_update_announcement(p_message text)
returns jsonb
language sql
set search_path to ''
as $function$
  select private.guild_update_announcement(p_message);
$function$;

revoke all on function public.guild_update_announcement(text) from public, anon;
grant execute on function public.guild_update_announcement(text) to authenticated;
