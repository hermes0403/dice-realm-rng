-- T-0159 follow-up: retain display-name snapshots even after a member leaves or deletes an account.
create or replace function private.add_guild_xp_with_ledger(
  p_guild_id uuid,p_amount bigint,p_member_id uuid,p_actor_user_id uuid,
  p_source text,p_task_key text,p_award_key text,p_task_date date default null,
  p_cycle_number bigint default null,p_admin_email text default null,
  p_reason text default null,p_details jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_before bigint; v_after bigint; v_ledger_id bigint; v_guild_name text; v_member_name text; v_details jsonb;
begin
  if p_guild_id is null or p_amount is null or p_amount<=0 or p_source not in ('task','admin')
     or nullif(btrim(p_task_key),'') is null or nullif(btrim(p_award_key),'') is null then
    raise exception 'invalid_guild_xp_ledger_entry' using errcode='22023';
  end if;
  select xp_total,name into v_before,v_guild_name from public.guilds where id=p_guild_id for update;
  if not found then raise exception 'guild_not_found' using errcode='P0002'; end if;
  select username into v_member_name from public.player_profiles where user_id=p_member_id;
  v_details:=coalesce(p_details,'{}'::jsonb)
    || jsonb_build_object('member_name',coalesce(nullif(p_details->>'member_name',''),nullif(p_details->>'target_username',''),v_member_name,'玩家'))
    || jsonb_build_object('guild_name',coalesce(nullif(p_details->>'guild_name',''),v_guild_name,'公會'));
  insert into public.guild_xp_award_ledger(
    award_key,guild_id,member_id,actor_user_id,source,task_key,task_date,cycle_number,
    base_xp,xp_awarded,actor_admin_email,reason,details
  ) values(p_award_key,p_guild_id,p_member_id,p_actor_user_id,p_source,p_task_key,p_task_date,p_cycle_number,
    p_amount,0,p_admin_email,p_reason,v_details)
  on conflict(award_key) do nothing returning id into v_ledger_id;
  if v_ledger_id is null then return; end if;
  perform private.add_guild_xp(p_guild_id,p_amount);
  select xp_total into v_after from public.guilds where id=p_guild_id;
  update public.guild_xp_award_ledger set xp_awarded=greatest(0,v_after-v_before) where id=v_ledger_id;
end;
$function$;
revoke all on function private.add_guild_xp_with_ledger(uuid,bigint,uuid,uuid,text,text,text,date,bigint,text,text,jsonb) from public,anon,authenticated;

update public.guild_xp_award_ledger l
set details=coalesce(l.details,'{}'::jsonb)
  || jsonb_build_object('member_name',coalesce(nullif(l.details->>'member_name',''),nullif(l.details->>'target_username',''),
      (select pp.username from public.player_profiles pp where pp.user_id=l.member_id),'玩家'))
  || jsonb_build_object('guild_name',coalesce(nullif(l.details->>'guild_name',''),g.name,'公會'))
from public.guilds g
where l.guild_id=g.id and (l.details->>'member_name' is null or l.details->>'guild_name' is null);
