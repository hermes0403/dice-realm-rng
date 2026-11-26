-- T-0148: three guild ranks and secure leader-only promotion.
alter table public.guild_members drop constraint if exists guild_members_role_check;
update public.guild_members set role='member' where role='officer';
alter table public.guild_members add constraint guild_members_role_check check (role = any (array['leader'::text,'vice_leader'::text,'member'::text]));
create or replace function private.enforce_guild_role_limits() returns trigger language plpgsql security definer set search_path to ''
as $function$
declare v_count integer; v_limit integer;
begin
 perform 1 from public.guilds where id=new.guild_id for update;
 v_limit := case new.role when 'leader' then 1 when 'vice_leader' then 2 else 2147483647 end;
 if tg_op='UPDATE' then
  select count(*) into v_count from public.guild_members m where m.guild_id=new.guild_id and m.role=new.role and m.user_id<>old.user_id;
 else
  select count(*) into v_count from public.guild_members m where m.guild_id=new.guild_id and m.role=new.role;
 end if;
 if v_count>=v_limit then raise exception 'guild_role_limit_reached' using errcode='23514'; end if;
 return new;
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
  if v_role not in ('leader','vice_leader','member') then raise exception 'guild_permission_denied' using errcode = '42501'; end if;
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

  if v_role in ('leader', 'vice_leader') then
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
create or replace function private.guild_update_member_role(p_user_id uuid,p_role text)
returns jsonb language plpgsql volatile security definer set search_path to ''
as $function$
declare v_uid uuid:=auth.uid(); v_guild_id uuid; v_actor_role text; v_target_role text;
begin
 if v_uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
 if p_user_id is null or p_role is null then raise exception 'guild_member_role_target_required' using errcode='22023'; end if;
 if p_role not in ('vice_leader','member') then raise exception 'guild_member_role_invalid' using errcode='22023'; end if;
 select guild_id,role into v_guild_id,v_actor_role from public.guild_members where user_id=v_uid for update;
 if v_guild_id is null or v_actor_role<>'leader' then raise exception 'guild_member_promotion_permission_denied' using errcode='42501'; end if;
 if p_user_id=v_uid then raise exception 'guild_cannot_change_own_role' using errcode='23514'; end if;
 perform 1 from public.guilds where id=v_guild_id for update;
 select role into v_target_role from public.guild_members where guild_id=v_guild_id and user_id=p_user_id for update;
 if v_target_role is null then raise exception 'guild_member_not_found' using errcode='P0002'; end if;
 if v_target_role='leader' then raise exception 'guild_cannot_change_leader_role' using errcode='42501'; end if;
 if v_target_role=p_role then return jsonb_build_object('ok',true,'role',v_target_role,'unchanged',true); end if;
 update public.guild_members set role=p_role where guild_id=v_guild_id and user_id=p_user_id;
 return jsonb_build_object('ok',true,'role',p_role);
end;
$function$;
revoke all on function private.guild_update_member_role(uuid,text) from public,anon,authenticated;
grant execute on function private.guild_update_member_role(uuid,text) to authenticated;
create or replace function public.guild_update_member_role(p_user_id uuid,p_role text)
returns jsonb language sql volatile set search_path to ''
as $function$ select private.guild_update_member_role(p_user_id,p_role); $function$;
revoke all on function public.guild_update_member_role(uuid,text) from public,anon;
grant execute on function public.guild_update_member_role(uuid,text) to authenticated;
