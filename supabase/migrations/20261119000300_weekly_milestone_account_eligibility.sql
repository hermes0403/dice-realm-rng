-- Enforce account-creation eligibility at the moment each weekly milestone unlocks.
create table if not exists public.realm_weekly_milestone_unlocks (
  campaign_start date not null,
  milestone bigint not null,
  unlocked_at timestamptz not null default now(),
  primary key (campaign_start, milestone)
);
alter table public.realm_weekly_milestone_unlocks enable row level security;
revoke all on public.realm_weekly_milestone_unlocks from public, anon, authenticated;

-- Historical unlock timestamps were not recorded by the previous implementation.
-- Establish a conservative cut-off now for milestones already reached; future
-- milestones are timestamped by record_weekly_realm_rolls at the first observed crossing.
insert into public.realm_weekly_milestone_unlocks(campaign_start,milestone,unlocked_at)
select date '2026-11-17', milestone, now()
from (values (50000::bigint),(150000::bigint),(300000::bigint),(500000::bigint),(800000::bigint)) as m(milestone)
where milestone <= (
  select coalesce(sum(rolls),0)
  from public.realm_weekly_roll_contributions
  where campaign_start=date '2026-11-17'
)
on conflict (campaign_start,milestone) do nothing;

-- Existing accounts already marked as having received the 300,000 milestone
-- were previously granted the wrong reward pair. Add the intended potions once.
create table if not exists public.realm_weekly_reward_corrections (
  campaign_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone bigint not null,
  corrected_at timestamptz not null default now(),
  primary key (campaign_start,user_id,milestone)
);
alter table public.realm_weekly_reward_corrections enable row level security;
revoke all on public.realm_weekly_reward_corrections from public, anon, authenticated;

do $$
declare
  v_user record;
  v_data jsonb;
  v_potions jsonb;
  v_inventory jsonb;
begin
  for v_user in
    select c.user_id
    from public.realm_weekly_roll_claims c
    join auth.users u on u.id=c.user_id
    join public.realm_weekly_milestone_unlocks m
      on m.campaign_start=c.campaign_start and m.milestone=c.milestone
    where c.campaign_start=date '2026-11-17'
      and c.milestone=300000
      and u.created_at<=m.unlocked_at
      and exists(select 1 from public.game_saves gs where gs.user_id=c.user_id)
  loop
    insert into public.realm_weekly_reward_corrections(campaign_start,user_id,milestone)
      values(date '2026-11-17',v_user.user_id,300000)
      on conflict do nothing;
    if not found then continue; end if;

    select save_data into v_data
    from public.game_saves where user_id=v_user.user_id for update;
    v_data:=coalesce(v_data,'{}'::jsonb);
    v_potions:=coalesce(v_data->'potions','{}'::jsonb);
    v_inventory:=coalesce(v_potions->'inventory','{}'::jsonb);
    v_inventory:=jsonb_set(v_inventory,'{speed2}',
      to_jsonb(coalesce(nullif(v_inventory->>'speed2','')::integer,0)+5),true);
    v_inventory:=jsonb_set(v_inventory,'{luck2}',
      to_jsonb(coalesce(nullif(v_inventory->>'luck2','')::integer,0)+5),true);
    v_potions:=jsonb_set(v_potions,'{inventory}',v_inventory,true);
    v_data:=jsonb_set(v_data,'{potions}',v_potions,true);
    update public.game_saves set save_data=v_data,updated_at=now()
      where user_id=v_user.user_id;
  end loop;
end;
$$;

create or replace function public.apply_weekly_realm_rewards(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_total bigint := 0;
  v_data jsonb;
  v_potions jsonb;
  v_inventory jsonb;
  v_created_at timestamptz;
  v_unlocked_at timestamptz;
  v_item record;
  v_granted jsonb := '[]'::jsonb;
begin
  if p_uid is null then return v_granted; end if;

  select created_at into v_created_at from auth.users where id=p_uid;
  if v_created_at is null then return v_granted; end if;

  select coalesce(sum(rolls),0) into v_total
  from public.realm_weekly_roll_contributions
  where campaign_start=date '2026-11-17';

  select save_data into v_data from public.game_saves where user_id=p_uid for update;
  if not found then return v_granted; end if;
  v_data := coalesce(v_data,'{}'::jsonb);

  for v_item in
    select * from (values
      (50000::bigint,1000000::bigint,null::text,0,null::text,0,'1M$'::text),
      (150000::bigint,0::bigint,'luck3'::text,1,null::text,0,'幸運藥水 III ×1'::text),
      (300000::bigint,0::bigint,'speed2'::text,5,'luck2'::text,5,'速度藥水 II ×5 · 幸運藥水 II ×5'::text),
      (500000::bigint,0::bigint,'angel1'::text,1,null::text,0,'天堂藥水 I ×1'::text),
      (800000::bigint,100000000::bigint,'angel2'::text,1,null::text,0,'天堂藥水 II ×1 · 100M$'::text)
    ) as r(milestone,coins,potion1,amount1,potion2,amount2,reward_text)
    where milestone<=v_total
    order by milestone
  loop
    select unlocked_at into v_unlocked_at
    from public.realm_weekly_milestone_unlocks
    where campaign_start=date '2026-11-17' and milestone=v_item.milestone;

    -- Account must already exist when this milestone first unlocks.
    if v_unlocked_at is null or v_created_at > v_unlocked_at then
      continue;
    end if;

    insert into public.realm_weekly_roll_claims(campaign_start,user_id,milestone)
      values(date '2026-11-17',p_uid,v_item.milestone)
      on conflict do nothing;
    if not found then continue; end if;

    if v_item.coins>0 then
      v_data:=jsonb_set(v_data,'{coins}',
        to_jsonb(coalesce(nullif(v_data->>'coins','')::numeric,0)+v_item.coins),true);
    end if;

    v_potions:=coalesce(v_data->'potions','{}'::jsonb);
    v_inventory:=coalesce(v_potions->'inventory','{}'::jsonb);
    if v_item.potion1 is not null then
      v_inventory:=jsonb_set(v_inventory,array[v_item.potion1],
        to_jsonb(coalesce(nullif(v_inventory->>v_item.potion1,'')::integer,0)+v_item.amount1),true);
    end if;
    if v_item.potion2 is not null then
      v_inventory:=jsonb_set(v_inventory,array[v_item.potion2],
        to_jsonb(coalesce(nullif(v_inventory->>v_item.potion2,'')::integer,0)+v_item.amount2),true);
    end if;
    v_potions:=jsonb_set(v_potions,'{inventory}',v_inventory,true);
    v_data:=jsonb_set(v_data,'{potions}',v_potions,true);

    update public.game_saves set save_data=v_data,updated_at=now() where user_id=p_uid;
    insert into public.realm_weekly_reward_notifications(campaign_start,user_id,milestone,reward_text)
      values(date '2026-11-17',p_uid,v_item.milestone,v_item.reward_text)
      on conflict do nothing;
    v_granted:=v_granted||jsonb_build_array(jsonb_build_object(
      'milestone',v_item.milestone,'reward',v_item.reward_text));
  end loop;
  return v_granted;
end;
$$;
revoke all on function public.apply_weekly_realm_rewards(uuid) from public,anon,authenticated;

create or replace function public.record_weekly_realm_rolls(p_rolls bigint default 0)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_accepted bigint:=0;
  v_total bigint:=0;
  v_user record;
  v_result jsonb;
begin
  if v_uid is null then raise exception '登入後才能參與全服活動'; end if;
  if p_rolls<0 or p_rolls>4500 then raise exception '抽數提交值超出允許範圍'; end if;

  if p_rolls>0
    and (now() at time zone 'Asia/Taipei')::date>=date '2026-11-17'
    and (now() at time zone 'Asia/Taipei')<timestamp '2026-11-23 00:00:00'
  then
    insert into public.realm_weekly_roll_contributions(campaign_start,user_id,rolls,last_submitted_at,updated_at)
      values(date '2026-11-17',v_uid,p_rolls,now(),now())
      on conflict(campaign_start,user_id) do update
        set rolls=public.realm_weekly_roll_contributions.rolls+excluded.rolls,
            last_submitted_at=now(),updated_at=now()
      where public.realm_weekly_roll_contributions.last_submitted_at is null
         or public.realm_weekly_roll_contributions.last_submitted_at<=now()-interval '9 minutes'
      returning p_rolls into v_accepted;
  end if;

  select coalesce(sum(rolls),0) into v_total
  from public.realm_weekly_roll_contributions
  where campaign_start=date '2026-11-17';

  insert into public.realm_weekly_milestone_unlocks(campaign_start,milestone,unlocked_at)
  select date '2026-11-17', milestone, now()
  from (values (50000::bigint),(150000::bigint),(300000::bigint),(500000::bigint),(800000::bigint)) as m(milestone)
  where milestone<=v_total
  on conflict (campaign_start,milestone) do nothing;

  for v_user in select user_id from public.game_saves loop
    perform public.apply_weekly_realm_rewards(v_user.user_id);
  end loop;

  v_result:=public.get_weekly_realm_progress();
  return v_result||jsonb_build_object('accepted_rolls',v_accepted,'total_rolls',v_total);
end;
$$;
