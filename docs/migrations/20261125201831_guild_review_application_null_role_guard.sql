-- Fix NULL role authorization in guild application review.
-- A user without a membership row has v_role = NULL; "NULL NOT IN (...)" is NULL,
-- and PL/pgSQL IF treats NULL as not true. Explicitly deny missing roles.
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

  select * into v_app from public.guild_applications where id = p_application_id;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;

  perform 1 from public.guilds where id = v_app.guild_id for update;

  select role into v_role
  from public.guild_members
  where guild_id = v_app.guild_id and user_id = v_uid;

  if v_role is null or v_role not in ('leader', 'vice_leader', 'officer') then
    raise exception 'guild_permission_denied' using errcode = '42501';
  end if;

  select * into v_app from public.guild_applications where id = p_application_id for update;
  if v_app.status <> 'pending' then
    return jsonb_build_object('ok', true, 'already_processed', true, 'status', v_app.status);
  end if;

  if p_approve then
    insert into public.guild_members(guild_id, user_id, role)
    values (v_app.guild_id, v_app.applicant_id, 'member');
    update public.guild_applications
    set status = 'approved', reviewed_by = v_uid, reviewed_at = now()
    where id = p_application_id;
  else
    update public.guild_applications
    set status = 'rejected', reviewed_by = v_uid, reviewed_at = now()
    where id = p_application_id;
  end if;

  return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'rejected' end);
exception when unique_violation then
  raise exception 'applicant_already_in_guild' using errcode = '23505';
end;
$function$;
