-- Ensure admin-adjusted global progress also records first milestone unlock times.
create or replace function public.admin_add_weekly_realm_rolls(p_rolls bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_total bigint := 0;
  v_result jsonb;
  v_user record;
begin
  if v_uid is null or v_email <> 'toby110403@gmail.com' then
    raise exception '管理員權限不足';
  end if;
  if p_rolls is null or p_rolls < 1 or p_rolls > 1000000000 then
    raise exception '增加次數必須介於 1 至 1,000,000,000';
  end if;
  if (now() at time zone 'Asia/Taipei')::date < date '2026-11-17'
     or (now() at time zone 'Asia/Taipei') >= timestamp '2026-11-23 00:00:00' then
    raise exception '目前沒有進行中的全服活動';
  end if;

  insert into public.realm_weekly_roll_contributions
    (campaign_start, user_id, rolls, last_submitted_at, updated_at)
  values (date '2026-11-17', v_uid, p_rolls, now(), now())
  on conflict (campaign_start, user_id) do update
    set rolls = public.realm_weekly_roll_contributions.rolls + excluded.rolls,
        last_submitted_at = now(),
        updated_at = now();

  select coalesce(sum(rolls), 0) into v_total
  from public.realm_weekly_roll_contributions
  where campaign_start = date '2026-11-17';

  insert into public.realm_weekly_milestone_unlocks(campaign_start,milestone,unlocked_at)
  select date '2026-11-17', milestone, now()
  from (values (50000::bigint),(150000::bigint),(300000::bigint),(500000::bigint),(800000::bigint)) as m(milestone)
  where milestone<=v_total
  on conflict (campaign_start,milestone) do nothing;

  for v_user in select user_id from public.game_saves loop
    perform public.apply_weekly_realm_rewards(v_user.user_id);
  end loop;

  v_result := public.get_weekly_realm_progress();
  return v_result || jsonb_build_object('accepted_rolls', p_rolls, 'total_rolls', v_total);
end;
$function$;
