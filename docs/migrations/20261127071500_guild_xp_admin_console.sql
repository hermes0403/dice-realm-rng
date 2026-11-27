-- T-0160: XP console with guild-wide manual grants and per-player lifetime totals.
create or replace function public.admin_grant_guild_xp_to_guild(
  p_admin_user_id uuid,p_admin_email text,p_guild_id uuid,p_amount bigint,p_reason text,p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare v_guild_name text; v_before bigint; v_after bigint;
begin
  if lower(coalesce(p_admin_email,''))<>'toby110403@gmail.com' or p_admin_user_id is null then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_guild_id is null or p_request_id is null or p_amount is null or p_amount<1 or p_amount>1000000000
     or char_length(btrim(coalesce(p_reason,'')))<3 or char_length(btrim(p_reason))>300 then
    raise exception 'invalid_guild_xp_grant' using errcode='22023';
  end if;
  select name,xp_total into v_guild_name,v_before from public.guilds where id=p_guild_id for update;
  if not found then raise exception 'guild_not_found' using errcode='P0002'; end if;
  perform private.add_guild_xp_with_ledger(
    p_guild_id,p_amount,null,p_admin_user_id,'admin','admin_manual','admin_guild:'||p_request_id::text,
    null,null,lower(p_admin_email),btrim(p_reason),
    jsonb_build_object('grant_scope','guild','member_name','全公會','guild_name',v_guild_name,'request_id',p_request_id)
  );
  select xp_total into v_after from public.guilds where id=p_guild_id;
  return jsonb_build_object('success',true,'guild_id',p_guild_id,'guild_name',v_guild_name,
    'base_xp',p_amount,'xp_awarded',greatest(0,v_after-v_before),'grant_scope','guild');
end;
$function$;
revoke all on function public.admin_grant_guild_xp_to_guild(uuid,text,uuid,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_grant_guild_xp_to_guild(uuid,text,uuid,bigint,text,uuid) to service_role;

create or replace function public.admin_get_guild_xp_dashboard()
returns jsonb language sql stable security definer set search_path to ''
as $function$
with guild_rows as (
  select g.id,g.name,g.level,g.xp_total,count(gm.user_id)::integer as member_count
  from public.guilds g left join public.guild_members gm on gm.guild_id=g.id
  group by g.id,g.name,g.level,g.xp_total
),
personal as (
  select l.member_id,sum(l.xp_awarded)::bigint as total_xp,count(*)::bigint as award_count,
    max(l.awarded_at) as last_awarded_at,
    (array_agg(coalesce(nullif(l.details->>'member_name',''),'玩家') order by l.awarded_at desc))[1] as snapshot_name,
    (array_agg(coalesce(nullif(l.details->>'guild_name',''),'未加入公會') order by l.awarded_at desc))[1] as snapshot_guild_name
  from public.guild_xp_award_ledger l where l.member_id is not null and l.task_key<>'all_login'
  group by l.member_id
),
players as (
  select coalesce(pp.user_id,p.member_id) as user_id,
    coalesce(pp.username,p.snapshot_name,'已離開的玩家') as username,
    coalesce(g.name,p.snapshot_guild_name,'未加入公會') as guild_name,
    coalesce(p.total_xp,0)::bigint as total_xp,coalesce(p.award_count,0)::bigint as award_count,p.last_awarded_at
  from public.player_profiles pp full outer join personal p on p.member_id=pp.user_id
  left join public.guild_members gm on gm.user_id=coalesce(pp.user_id,p.member_id)
  left join public.guilds g on g.id=gm.guild_id
)
select jsonb_build_object(
  'guilds',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'level',level,'xp_total',xp_total,'member_count',member_count) order by name) from guild_rows),'[]'::jsonb),
  'players',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'username',username,'guild_name',guild_name,'total_xp',total_xp,'award_count',award_count,'last_awarded_at',last_awarded_at) order by total_xp desc,username) from players),'[]'::jsonb)
);
$function$;
revoke all on function public.admin_get_guild_xp_dashboard() from public,anon,authenticated;
grant execute on function public.admin_get_guild_xp_dashboard() to service_role;
