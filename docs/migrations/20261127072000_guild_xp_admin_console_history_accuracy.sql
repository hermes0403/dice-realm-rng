-- T-0160 follow-up: expose a lower-bound marker for XP rows whose historical boosted value cannot be reconstructed.
create or replace function public.admin_get_guild_xp_dashboard()
returns jsonb
language sql stable security definer set search_path to ''
as $function$
with guild_rows as (
  select g.id,g.name,g.level,g.xp_total,count(gm.user_id)::integer as member_count
  from public.guilds g left join public.guild_members gm on gm.guild_id=g.id
  group by g.id,g.name,g.level,g.xp_total
),
personal as (
  select l.member_id,sum(l.xp_awarded)::bigint as total_xp,count(*)::bigint as award_count,
    count(*) filter(where l.details->>'historical_effective_amount_unknown'='true')::bigint as historical_unknown_count,
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
    coalesce(p.total_xp,0)::bigint as total_xp,coalesce(p.award_count,0)::bigint as award_count,
    coalesce(p.historical_unknown_count,0)::bigint as historical_unknown_count,p.last_awarded_at
  from public.player_profiles pp full outer join personal p on p.member_id=pp.user_id
  left join public.guild_members gm on gm.user_id=coalesce(pp.user_id,p.member_id)
  left join public.guilds g on g.id=gm.guild_id
)
select jsonb_build_object(
  'guilds',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'level',level,'xp_total',xp_total,'member_count',member_count) order by name) from guild_rows),'[]'::jsonb),
  'players',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'username',username,'guild_name',guild_name,
    'total_xp',total_xp,'award_count',award_count,'historical_unknown_count',historical_unknown_count,'last_awarded_at',last_awarded_at)
    order by total_xp desc,username) from players),'[]'::jsonb)
);
$function$;
revoke all on function public.admin_get_guild_xp_dashboard() from public,anon,authenticated;
grant execute on function public.admin_get_guild_xp_dashboard() to service_role;
