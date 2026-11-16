-- Automatically distribute each reached weekly realm milestone to every saved player.
-- New players are granted any already-reached milestones when they load the event progress.
create table if not exists public.realm_weekly_reward_notifications (
  campaign_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone bigint not null,
  reward_text text not null,
  created_at timestamptz not null default now(),
  shown_at timestamptz,
  primary key (campaign_start, user_id, milestone)
);
alter table public.realm_weekly_reward_notifications enable row level security;
drop policy if exists "Users can read own weekly reward notifications" on public.realm_weekly_reward_notifications;
create policy "Users can read own weekly reward notifications"
  on public.realm_weekly_reward_notifications for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.realm_weekly_reward_notifications to authenticated;
create index if not exists realm_weekly_reward_notifications_pending_idx
  on public.realm_weekly_reward_notifications (user_id, campaign_start)
  where shown_at is null;

create or replace function public.apply_weekly_realm_rewards(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_total bigint := 0; v_data jsonb; v_potions jsonb; v_inventory jsonb;
  v_item record; v_granted jsonb := '[]'::jsonb;
begin
  if p_uid is null then return v_granted; end if;
  select coalesce(sum(rolls),0) into v_total from public.realm_weekly_roll_contributions
    where campaign_start = date '2026-11-17';
  select save_data into v_data from public.game_saves where user_id = p_uid for update;
  if not found then return v_granted; end if;
  v_data := coalesce(v_data,'{}'::jsonb);
  for v_item in
    select * from (values
      (50000::bigint,1000000::bigint,null::text,0,'1M$'::text),
      (150000::bigint,0::bigint,'luck3'::text,1,'幸運藥水 III ×1'::text),
      (300000::bigint,100000000::bigint,'speed1'::text,5,'速度藥水 I ×5 · 100M$'::text),
      (500000::bigint,0::bigint,'speed2'::text,5,'速度藥水 II ×5 · 幸運藥水 II ×5'::text),
      (800000::bigint,100000000::bigint,'angel2'::text,1,'天堂藥水 II ×1 · 100M$'::text)
    ) as rewards(milestone,coins,potion,amount,reward_text)
    where milestone <= v_total order by milestone
  loop
    insert into public.realm_weekly_roll_claims(campaign_start,user_id,milestone)
      values(date '2026-11-17',p_uid,v_item.milestone) on conflict do nothing;
    if not found then continue; end if;
    if v_item.coins > 0 then
      v_data := jsonb_set(v_data,'{coins}',to_jsonb(coalesce(nullif(v_data->>'coins','')::numeric,0)+v_item.coins),true);
    end if;
    if v_item.potion is not null then
      v_potions := coalesce(v_data->'potions','{}'::jsonb);
      v_inventory := coalesce(v_potions->'inventory','{}'::jsonb);
      v_inventory := jsonb_set(v_inventory,array[v_item.potion],
        to_jsonb(coalesce(nullif(v_inventory->>v_item.potion,'')::integer,0)+v_item.amount),true);
      v_potions := jsonb_set(v_potions,'{inventory}',v_inventory,true);
      v_data := jsonb_set(v_data,'{potions}',v_potions,true);
    end if;
    if v_item.milestone = 500000 then
      v_potions := coalesce(v_data->'potions','{}'::jsonb);
      v_inventory := coalesce(v_potions->'inventory','{}'::jsonb);
      v_inventory := jsonb_set(v_inventory,'{luck2}',
        to_jsonb(coalesce(nullif(v_inventory->>'luck2','')::integer,0)+5),true);
      v_potions := jsonb_set(v_potions,'{inventory}',v_inventory,true);
      v_data := jsonb_set(v_data,'{potions}',v_potions,true);
    end if;
    update public.game_saves set save_data=v_data,updated_at=now() where user_id=p_uid;
    insert into public.realm_weekly_reward_notifications(campaign_start,user_id,milestone,reward_text)
      values(date '2026-11-17',p_uid,v_item.milestone,v_item.reward_text) on conflict do nothing;
    v_granted := v_granted || jsonb_build_array(jsonb_build_object('milestone',v_item.milestone,'reward',v_item.reward_text));
  end loop;
  return v_granted;
end;
$$;
revoke all on function public.apply_weekly_realm_rewards(uuid) from public,anon,authenticated;

create or replace function public.get_weekly_realm_progress()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid(); v_total bigint := 0;
  v_claimed jsonb := '[]'::jsonb; v_rewards jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception '登入後才能查看全服活動'; end if;
  perform public.apply_weekly_realm_rewards(v_uid);
  select coalesce(sum(rolls),0) into v_total from public.realm_weekly_roll_contributions where campaign_start=date '2026-11-17';
  select coalesce(jsonb_agg(milestone order by milestone),'[]'::jsonb) into v_claimed
    from public.realm_weekly_roll_claims where campaign_start=date '2026-11-17' and user_id=v_uid;
  select coalesce(jsonb_agg(jsonb_build_object('milestone',milestone,'reward',reward_text) order by milestone),'[]'::jsonb) into v_rewards
    from public.realm_weekly_reward_notifications where campaign_start=date '2026-11-17' and user_id=v_uid and shown_at is null;
  update public.realm_weekly_reward_notifications set shown_at=now()
    where campaign_start=date '2026-11-17' and user_id=v_uid and shown_at is null;
  return jsonb_build_object('total_rolls',v_total,'claimed_milestones',v_claimed,'new_rewards',v_rewards,
    'week_start','2026-11-17','week_end','2026-11-23',
    'active',(now() at time zone 'Asia/Taipei')::date >= date '2026-11-17'
      and (now() at time zone 'Asia/Taipei') < timestamp '2026-11-23 00:00:00');
end;
$$;

create or replace function public.record_weekly_realm_rolls(p_rolls bigint default 0)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid(); v_accepted bigint := 0; v_total bigint := 0;
  v_user record; v_result jsonb;
begin
  if v_uid is null then raise exception '登入後才能參與全服活動'; end if;
  if p_rolls < 0 or p_rolls > 4500 then raise exception '抽數提交值超出允許範圍'; end if;
  if p_rolls > 0 and (now() at time zone 'Asia/Taipei')::date >= date '2026-11-17'
     and (now() at time zone 'Asia/Taipei') < timestamp '2026-11-23 00:00:00' then
    insert into public.realm_weekly_roll_contributions(campaign_start,user_id,rolls,last_submitted_at,updated_at)
      values(date '2026-11-17',v_uid,p_rolls,now(),now())
      on conflict(campaign_start,user_id) do update
        set rolls=public.realm_weekly_roll_contributions.rolls+excluded.rolls,last_submitted_at=now(),updated_at=now()
        where public.realm_weekly_roll_contributions.last_submitted_at is null
          or public.realm_weekly_roll_contributions.last_submitted_at <= now()-interval '9 minutes'
      returning p_rolls into v_accepted;
  end if;
  select coalesce(sum(rolls),0) into v_total from public.realm_weekly_roll_contributions where campaign_start=date '2026-11-17';
  for v_user in select user_id from public.game_saves loop
    perform public.apply_weekly_realm_rewards(v_user.user_id);
  end loop;
  v_result := public.get_weekly_realm_progress();
  return v_result || jsonb_build_object('accepted_rolls',v_accepted,'total_rolls',v_total);
end;
$$;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='realm_weekly_reward_notifications') then
    alter publication supabase_realtime add table public.realm_weekly_reward_notifications;
  end if;
end;
$$;
