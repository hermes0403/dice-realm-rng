-- T-0159 follow-up: backfill guild XP awards already recorded by the legacy task tables.
-- This writes history only; it does not change guild XP totals or issue any reward.
insert into public.guild_xp_award_ledger(
  award_key,guild_id,member_id,actor_user_id,source,task_key,task_date,base_xp,xp_awarded,details,awarded_at
)
select 'login:'||p.guild_id::text||':'||p.user_id::text||':'||p.task_date::text,
  p.guild_id,p.user_id,p.user_id,'task','login',p.task_date,15,15,
  jsonb_build_object('backfilled',true,'historical_effective_amount_unknown',true),
  coalesce(p.login_completed_at,p.updated_at,p.created_at,now())
from public.guild_daily_member_progress p where p.login_xp_awarded
on conflict(award_key) do nothing;

insert into public.guild_xp_award_ledger(
  award_key,guild_id,member_id,actor_user_id,source,task_key,task_date,cycle_number,base_xp,xp_awarded,details,awarded_at
)
select 'online:'||c.guild_id::text||':'||c.user_id::text||':'||c.task_date::text||':'||c.cycle_number::text||':'||c.cycle_number::text,
  c.guild_id,c.user_id,c.user_id,'task','online',c.task_date,c.cycle_number,c.xp_awarded,c.xp_awarded,
  jsonb_build_object('backfilled',true,'historical_effective_amount_unknown',true,'cycles',1),c.awarded_at
from public.guild_daily_task_claims c where c.task_key='online'
on conflict(award_key) do nothing;

insert into public.guild_xp_award_ledger(
  award_key,guild_id,member_id,actor_user_id,source,task_key,task_date,cycle_number,base_xp,xp_awarded,details,awarded_at
)
select 'rolls:'||c.guild_id::text||':'||c.user_id::text||':'||c.task_date::text||':'||c.cycle_number::text||':'||c.cycle_number::text,
  c.guild_id,c.user_id,c.user_id,'task','rolls',c.task_date,c.cycle_number,c.xp_awarded,c.xp_awarded,
  jsonb_build_object('backfilled',true,'historical_effective_amount_unknown',true,'cycles',1),c.awarded_at
from public.guild_daily_task_claims c where c.task_key='rolls'
on conflict(award_key) do nothing;

insert into public.guild_xp_award_ledger(
  award_key,guild_id,member_id,actor_user_id,source,task_key,task_date,base_xp,xp_awarded,details,awarded_at
)
select 'all_login:'||b.guild_id::text||':'||b.task_date::text,
  b.guild_id,trigger_row.user_id,trigger_row.user_id,'task','all_login',b.task_date,20,20,
  jsonb_build_object('backfilled',true,'historical_effective_amount_unknown',true,
    'trigger_member_id',trigger_row.user_id,'trigger_member_name',coalesce(pp.username,'玩家'),
    'member_snapshot',coalesce(snapshot.members,'[]'::jsonb),
    'snapshot_source','available_progress_rows_at_backfill','reward_scope','guild'),
  b.awarded_at
from public.guild_daily_login_bonuses b
left join lateral (
  select p.user_id from public.guild_daily_member_progress p
  where p.guild_id=b.guild_id and p.task_date=b.task_date
    and p.login_completed_at is not null and p.login_completed_at<=b.awarded_at
  order by p.login_completed_at desc,p.user_id limit 1
) trigger_row on true
left join public.player_profiles pp on pp.user_id=trigger_row.user_id
left join lateral (
  select jsonb_agg(jsonb_build_object('user_id',p.user_id,'username',coalesce(profile.username,'玩家'))
    order by p.login_completed_at,p.user_id) as members
  from public.guild_daily_member_progress p
  left join public.player_profiles profile on profile.user_id=p.user_id
  where p.guild_id=b.guild_id and p.task_date=b.task_date
    and p.login_completed_at is not null and p.login_completed_at<=b.awarded_at
) snapshot on true
on conflict(award_key) do nothing;
