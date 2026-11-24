-- Guild foundation migration.
-- Source reconstruction captured from the live Supabase schema after migration
-- 20261124221835_guild_foundation had already been applied.
-- This file is tracked under docs/migrations because AGENTS.md prohibits pushing
-- files inside supabase/. Do not re-apply this migration to an environment that
-- already records version 20261124221835.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  join_mode text not null default 'application',
  is_public boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint guilds_name_length check (char_length(btrim(name)) >= 2 and char_length(btrim(name)) <= 24),
  constraint guilds_description_length check (char_length(description) <= 160),
  constraint guilds_join_mode_check check (join_mode = any (array['application'::text, 'open'::text]))
);

create table public.guild_members (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  constraint guild_members_pkey primary key (guild_id, user_id),
  constraint guild_members_user_id_key unique (user_id),
  constraint guild_members_role_check check (role = any (array['leader'::text, 'vice_leader'::text, 'officer'::text, 'member'::text]))
);

create table public.guild_applications (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  message text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  constraint guild_application_message_length check (char_length(message) <= 120),
  constraint guild_applications_status_check check (status = any (array['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]))
);

create unique index guilds_name_lower_uidx on public.guilds (lower(name));
create index guilds_public_name_idx on public.guilds (is_public, lower(name));
create index guild_members_guild_joined_idx on public.guild_members (guild_id, joined_at);
create unique index guild_members_one_leader_uidx on public.guild_members (guild_id) where role = 'leader';
create unique index guild_applications_one_pending_uidx on public.guild_applications (guild_id, applicant_id) where status = 'pending';
create index guild_applications_pending_guild_idx on public.guild_applications (guild_id, created_at) where status = 'pending';

alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_applications enable row level security;

-- Clients must use the authenticated RPC surface; direct table CRUD is disabled.
revoke all on table public.guilds, public.guild_members, public.guild_applications from anon, authenticated;

create or replace function private.enforce_guild_role_limits()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
  v_limit integer;
begin
  perform 1 from public.guilds where id = new.guild_id for update;
  v_limit := case new.role
    when 'leader' then 1
    when 'vice_leader' then 2
    when 'officer' then 3
    else 2147483647
  end;
  if tg_op = 'UPDATE' then
    select count(*) into v_count
    from public.guild_members m
    where m.guild_id = new.guild_id and m.role = new.role and m.user_id <> old.user_id;
  else
    select count(*) into v_count
    from public.guild_members m
    where m.guild_id = new.guild_id and m.role = new.role;
  end if;
  if v_count >= v_limit then
    raise exception 'guild_role_limit_reached' using errcode = '23514';
  end if;
  return new;
end;
$function$;

create trigger guild_members_role_limit
before insert or update of role, guild_id on public.guild_members
for each row execute function private.enforce_guild_role_limits();

create or replace function private.guild_create(p_name text, p_description text default '')
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
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if exists (select 1 from public.guild_members where user_id = v_uid) then
    raise exception 'already_in_guild' using errcode = '23505';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 24 then
    raise exception 'guild_name_length_invalid' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description,'')) > 160 then
    raise exception 'guild_description_too_long' using errcode = '22023';
  end if;
  insert into public.guilds(name, description, created_by)
    values (btrim(p_name), coalesce(p_description,''), v_uid) returning id into v_guild_id;
  insert into public.guild_members(guild_id, user_id, role) values (v_guild_id, v_uid, 'leader');
  return jsonb_build_object('ok', true, 'guild_id', v_guild_id);
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'guilds_name_lower_uidx' then
    raise exception 'guild_name_taken' using errcode = '23505';
  end if;
  raise exception 'already_in_guild' using errcode = '23505';
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
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 30 then raise exception 'invalid_limit' using errcode = '22023'; end if;
  if exists (select 1 from public.guild_members where user_id = v_uid) then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_result
  from (
    select g.id, g.name, g.description, g.join_mode,
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
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select guild_id, role into v_guild_id, v_role from public.guild_members where user_id = v_uid;
  if v_guild_id is null then
    return jsonb_build_object('guild', null, 'members', '[]'::jsonb, 'applications', '[]'::jsonb, 'my_role', null);
  end if;
  select jsonb_build_object('id',g.id,'name',g.name,'description',g.description,
    'member_count',(select count(*) from public.guild_members mm where mm.guild_id=g.id),
    'created_at',g.created_at) into v_guild
  from public.guilds g where g.id=v_guild_id;
  select coalesce(jsonb_agg(jsonb_build_object('username',coalesce(pp.username,'未知玩家'),
    'role',m.role,'joined_at',m.joined_at)
    order by case m.role when 'leader' then 1 when 'vice_leader' then 2 when 'officer' then 3 else 4 end,m.joined_at),'[]'::jsonb)
  into v_members
  from public.guild_members m left join public.player_profiles pp on pp.user_id=m.user_id
  where m.guild_id=v_guild_id;
  if v_role in ('leader','vice_leader','officer') then
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'username',coalesce(pp.username,'未知玩家'),
      'message',a.message,'created_at',a.created_at) order by a.created_at),'[]'::jsonb)
    into v_apps
    from public.guild_applications a left join public.player_profiles pp on pp.user_id=a.applicant_id
    where a.guild_id=v_guild_id and a.status='pending';
  end if;
  return jsonb_build_object('guild',v_guild,'members',v_members,'applications',v_apps,'my_role',v_role);
end;
$function$;

create or replace function private.guild_apply(p_guild_id uuid, p_message text default '')
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_guild public.guilds%rowtype;
  v_app_id uuid;
  v_existing boolean := false;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if char_length(coalesce(p_message,'')) > 120 then raise exception 'application_message_too_long' using errcode = '22023'; end if;
  if exists (select 1 from public.guild_members where user_id=v_uid) then raise exception 'already_in_guild' using errcode = '23505'; end if;
  select * into v_guild from public.guilds where id=p_guild_id and is_public for update;
  if not found then raise exception 'guild_not_found' using errcode = 'P0002'; end if;
  if v_guild.join_mode='open' then
    insert into public.guild_members(guild_id,user_id,role) values(v_guild.id,v_uid,'member');
    return jsonb_build_object('ok',true,'joined',true);
  end if;
  insert into public.guild_applications(guild_id,applicant_id,message)
    values(v_guild.id,v_uid,coalesce(p_message,''))
    on conflict (guild_id,applicant_id) where status='pending' do nothing returning id into v_app_id;
  if v_app_id is null then
    v_existing := true;
    select id into v_app_id from public.guild_applications
      where guild_id=v_guild.id and applicant_id=v_uid and status='pending';
  end if;
  return jsonb_build_object('ok',true,'application_id',v_app_id,'already_applied',v_existing);
exception when unique_violation then raise exception 'already_in_guild' using errcode = '23505';
end;
$function$;

create or replace function private.guild_review_application(p_application_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_app public.guild_applications%rowtype;
  v_role text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_approve is null then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select * into v_app from public.guild_applications where id=p_application_id;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  perform 1 from public.guilds where id=v_app.guild_id for update;
  select role into v_role from public.guild_members where guild_id=v_app.guild_id and user_id=v_uid;
  if v_role not in ('leader','vice_leader','officer') then raise exception 'guild_permission_denied' using errcode = '42501'; end if;
  select * into v_app from public.guild_applications where id=p_application_id for update;
  if v_app.status <> 'pending' then
    return jsonb_build_object('ok',true,'already_processed',true,'status',v_app.status);
  end if;
  if p_approve then
    insert into public.guild_members(guild_id,user_id,role) values(v_app.guild_id,v_app.applicant_id,'member');
    update public.guild_applications set status='approved',reviewed_by=v_uid,reviewed_at=now() where id=p_application_id;
  else
    update public.guild_applications set status='rejected',reviewed_by=v_uid,reviewed_at=now() where id=p_application_id;
  end if;
  return jsonb_build_object('ok',true,'status',case when p_approve then 'approved' else 'rejected' end);
exception when unique_violation then raise exception 'applicant_already_in_guild' using errcode = '23505';
end;
$function$;

create or replace function private.guild_leave()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_role text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select guild_id,role into v_guild_id,v_role from public.guild_members where user_id=v_uid;
  if v_guild_id is null then raise exception 'not_in_guild' using errcode = 'P0002'; end if;
  perform 1 from public.guilds where id=v_guild_id for update;
  if v_role='leader' then raise exception 'leader_must_transfer_or_disband' using errcode = '23514'; end if;
  delete from public.guild_members where guild_id=v_guild_id and user_id=v_uid;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.guild_create(p_name text, p_description text default '')
returns jsonb
language sql
set search_path to ''
as $function$ select private.guild_create(p_name,p_description); $function$;

create or replace function public.guild_search(p_query text default '', p_limit integer default 20)
returns jsonb
language sql
set search_path to ''
as $function$ select private.guild_search(p_query,p_limit); $function$;

create or replace function public.guild_get_my_guild()
returns jsonb
language sql
set search_path to ''
as $function$ select private.guild_get_my_guild(); $function$;

create or replace function public.guild_apply(p_guild_id uuid, p_message text default '')
returns jsonb
language sql
set search_path to ''
as $function$ select private.guild_apply(p_guild_id,p_message); $function$;

create or replace function public.guild_review_application(p_application_id uuid, p_approve boolean)
returns jsonb
language sql
set search_path to ''
as $function$ select private.guild_review_application(p_application_id,p_approve); $function$;

create or replace function public.guild_leave()
returns jsonb
language sql
set search_path to ''
as $function$ select private.guild_leave(); $function$;

revoke all on function private.enforce_guild_role_limits() from public, anon, authenticated;
revoke all on function private.guild_create(text,text) from public, anon;
revoke all on function private.guild_search(text,integer) from public, anon;
revoke all on function private.guild_get_my_guild() from public, anon;
revoke all on function private.guild_apply(uuid,text) from public, anon;
revoke all on function private.guild_review_application(uuid,boolean) from public, anon;
revoke all on function private.guild_leave() from public, anon;
grant execute on function private.guild_create(text,text) to authenticated;
grant execute on function private.guild_search(text,integer) to authenticated;
grant execute on function private.guild_get_my_guild() to authenticated;
grant execute on function private.guild_apply(uuid,text) to authenticated;
grant execute on function private.guild_review_application(uuid,boolean) to authenticated;
grant execute on function private.guild_leave() to authenticated;

revoke all on function public.guild_create(text,text) from public, anon;
revoke all on function public.guild_search(text,integer) from public, anon;
revoke all on function public.guild_get_my_guild() from public, anon;
revoke all on function public.guild_apply(uuid,text) from public, anon;
revoke all on function public.guild_review_application(uuid,boolean) from public, anon;
revoke all on function public.guild_leave() from public, anon;
grant execute on function public.guild_create(text,text) to authenticated, service_role;
grant execute on function public.guild_search(text,integer) to authenticated, service_role;
grant execute on function public.guild_get_my_guild() to authenticated, service_role;
grant execute on function public.guild_apply(uuid,text) to authenticated, service_role;
grant execute on function public.guild_review_application(uuid,boolean) to authenticated, service_role;
grant execute on function public.guild_leave() to authenticated, service_role;
