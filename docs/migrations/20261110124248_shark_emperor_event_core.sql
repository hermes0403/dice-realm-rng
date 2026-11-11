-- Shark Emperor event task and virtual-currency foundation.
-- This source reflects the final safe state: no randomized egg-opening endpoint.

create schema if not exists private;

create table if not exists public.shark_event_tasks (
  task_id text primary key,
  task_order integer not null unique check (task_order > 0),
  title text not null,
  event_key text not null,
  target_count integer not null check (target_count > 0),
  reward numeric(12,1) not null check (reward >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.shark_event_tasks enable row level security;
revoke all on public.shark_event_tasks from anon, authenticated;

create table if not exists public.shark_event_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  shark_coins numeric(18,1) not null default 0 check (shark_coins >= 0),
  dragon_eggs integer not null default 0 check (dragon_eggs >= 0),
  current_task_order integer,
  progress_count integer not null default 0 check (progress_count >= 0),
  updated_at timestamptz not null default now()
);
alter table public.shark_event_accounts enable row level security;
revoke all on public.shark_event_accounts from anon, authenticated;

create table if not exists public.shark_event_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('task_reward','admin_grant')),
  coin_delta numeric(18,1) not null default 0,
  egg_delta integer not null default 0,
  idempotency_key text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
alter table public.shark_event_ledger enable row level security;
revoke all on public.shark_event_ledger from anon, authenticated;

create table if not exists public.shark_event_progress_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null references public.shark_event_tasks(task_id),
  event_key text not null,
  event_id text not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique(user_id, event_key, event_id)
);
alter table public.shark_event_progress_events enable row level security;
revoke all on public.shark_event_progress_events from anon, authenticated;

insert into public.shark_event_tasks(task_id,task_order,title,event_key,target_count,reward) values
('shark_01',1,'擲骰 100 次','roll_count',100,1),
('shark_02',2,'合成 1 隻寵物','pet_fusion',1,1),
('shark_03',3,'合成普通寵物','pet_fusion_common',1,1),
('shark_04',4,'合成稀有寵物','pet_fusion_rare',1,1),
('shark_05',5,'合成 1 個藥水','potion_craft',1,1),
('shark_06',6,'擲骰 500 次','roll_count',500,1),
('shark_07',7,'合成運氣藥水 II','potion_luck2',1,1),
('shark_08',8,'合成天氣變異','pet_weather_mutation',1,1),
('shark_09',9,'持有 5 隻寵物','pet_count_5',5,1),
('shark_10',10,'召喚水晶／地獄天氣','weather_summon_special',1,1.5),
('shark_11',11,'合成黃金變異','pet_golden_mutation',1,1.5),
('shark_12',12,'擲骰 888 次','roll_count',888,1.5),
('shark_13',13,'合成傳奇寵物','pet_fusion_legendary',1,1.5),
('shark_14',14,'擲骰 888 次','roll_count',888,1.5),
('shark_15',15,'合成 5 個運氣藥水 II','potion_luck2',5,1.5),
('shark_16',16,'持有 10 隻寵物','pet_count_10',10,1.5),
('shark_17',17,'合成 5 個速度藥水 II','potion_speed2',5,1.5),
('shark_18',18,'合成運氣藥水 III','potion_luck3',1,1.5),
('shark_19',19,'擲骰 1024 次','roll_count',1024,1.5),
('shark_20',20,'擲出機率 1/4096 以上的骰子','rare_dice_4096',1,1.5),
('shark_21',21,'合成 3 隻傳奇寵物','pet_fusion_legendary',3,1.5),
('shark_22',22,'出售 10 隻寵物','pet_sale',10,1.5),
('shark_23',23,'再次召喚水晶／地獄天氣','weather_summon_special',1,1.5),
('shark_24',24,'合成 10 個運氣藥水 II','potion_luck2',10,1.5),
('shark_25',25,'擲出機率 1/8192 以上的骰子','rare_dice_8192',1,1.5)
on conflict (task_id) do update set
  task_order=excluded.task_order,title=excluded.title,event_key=excluded.event_key,
  target_count=excluded.target_count,reward=excluded.reward,is_active=true;

create or replace function private.record_shark_event_progress(
  p_user_id uuid, p_event_key text, p_event_id text, p_amount integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_account public.shark_event_accounts%rowtype;
  v_task public.shark_event_tasks%rowtype;
  v_next_order integer;
  v_new_progress integer;
  v_reward numeric(18,1) := 0;
begin
  if p_user_id is null or p_event_key is null or p_event_id is null or coalesce(p_amount,0) < 1 then
    return jsonb_build_object('success',false,'reason','invalid_event');
  end if;
  insert into public.shark_event_accounts(user_id,current_task_order)
  select p_user_id,min(task_order) from public.shark_event_tasks where is_active
  on conflict (user_id) do nothing;
  select * into v_account from public.shark_event_accounts where user_id=p_user_id for update;
  if v_account.current_task_order is null then
    return jsonb_build_object('success',true,'completed',true);
  end if;
  select * into v_task from public.shark_event_tasks
   where task_order=v_account.current_task_order and is_active;
  if not found or v_task.event_key <> p_event_key then
    return jsonb_build_object('success',true,'counted',false);
  end if;
  insert into public.shark_event_progress_events(user_id,task_id,event_key,event_id,amount)
  values(p_user_id,v_task.task_id,p_event_key,p_event_id,p_amount)
  on conflict(user_id,event_key,event_id) do nothing;
  if not found then
    return jsonb_build_object('success',true,'duplicate',true,'progress',v_account.progress_count);
  end if;
  v_new_progress := least(v_task.target_count, v_account.progress_count + p_amount);
  if v_new_progress >= v_task.target_count then
    v_reward := v_task.reward;
    insert into public.shark_event_ledger(user_id,entry_type,coin_delta,idempotency_key,details)
    values(p_user_id,'task_reward',v_reward,'task_reward:'||v_task.task_id,
      jsonb_build_object('task_id',v_task.task_id,'task_order',v_task.task_order,'title',v_task.title))
    on conflict(user_id,idempotency_key) do nothing;
    if found then
      update public.shark_event_accounts
         set shark_coins=shark_coins+v_reward, progress_count=0, updated_at=clock_timestamp()
       where user_id=p_user_id;
    else
      update public.shark_event_accounts set progress_count=0,updated_at=clock_timestamp()
       where user_id=p_user_id;
    end if;
    select min(task_order) into v_next_order
      from public.shark_event_tasks
     where is_active and task_order>v_task.task_order;
    v_next_order := coalesce(v_next_order, v_task.task_order + 1);
    update public.shark_event_accounts set current_task_order=v_next_order,updated_at=clock_timestamp()
     where user_id=p_user_id;
    return jsonb_build_object('success',true,'completed_task',v_task.task_id,'reward',v_reward,'next_task_order',v_next_order);
  end if;
  update public.shark_event_accounts set progress_count=v_new_progress,updated_at=clock_timestamp()
   where user_id=p_user_id;
  return jsonb_build_object('success',true,'progress',v_new_progress,'target',v_task.target_count);
end;
$$;
revoke all on function private.record_shark_event_progress(uuid,text,text,integer) from public, anon, authenticated;

create or replace function private.get_shark_event_state()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_account public.shark_event_accounts%rowtype;
  v_task public.shark_event_tasks%rowtype;
  v_completed integer;
  v_total integer;
begin
  if v_uid is null then raise exception '請先登入帳號'; end if;
  select count(*) into v_total from public.shark_event_tasks where is_active;
  insert into public.shark_event_accounts(user_id,current_task_order)
  select v_uid,min(task_order) from public.shark_event_tasks where is_active
  on conflict(user_id) do nothing;
  select * into v_account from public.shark_event_accounts where user_id=v_uid;
  select count(*) into v_completed from public.shark_event_tasks
   where is_active and task_order < coalesce(v_account.current_task_order,2147483647);
  if v_account.current_task_order is not null then
    select * into v_task from public.shark_event_tasks
     where task_order=v_account.current_task_order and is_active;
  end if;
  return jsonb_build_object(
    'shark_coins',v_account.shark_coins,
    'dragon_eggs',v_account.dragon_eggs,
    'completed_tasks',v_completed,
    'total_tasks',v_total,
    'current_task',case when v_task.task_id is null then null else jsonb_build_object(
      'id',v_task.task_id,'order',v_task.task_order,'title',v_task.title,
      'progress',v_account.progress_count,'target',v_task.target_count,'reward',v_task.reward,
      'event_key',v_task.event_key
    ) end
  );
end;
$$;
revoke all on function private.get_shark_event_state() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.get_shark_event_state() to authenticated;

create or replace function public.get_shark_event_state()
returns jsonb language sql security invoker
set search_path = pg_catalog, public, private
as $ select private.get_shark_event_state(); $;
revoke all on function public.get_shark_event_state() from public, anon;
grant execute on function public.get_shark_event_state() to authenticated;

create or replace function private.admin_grant_shark_coins(
  p_target_user_id uuid, p_amount numeric, p_idempotency_key text, p_reason text default '管理員發放'
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_balance numeric(18,1);
begin
  if lower(coalesce(auth.jwt()->>'email','')) <> 'toby110403@gmail.com' then
    raise exception '沒有管理員權限' using errcode='42501';
  end if;
  if p_target_user_id is null or p_amount is null or p_amount<=0 or p_amount>1000000
     or p_idempotency_key is null or length(p_idempotency_key)<8 or length(p_idempotency_key)>120 then
    raise exception '發放參數錯誤';
  end if;
  insert into public.shark_event_accounts(user_id,current_task_order)
  select p_target_user_id,min(task_order) from public.shark_event_tasks where is_active
  on conflict(user_id) do nothing;
  insert into public.shark_event_ledger(user_id,entry_type,coin_delta,idempotency_key,details)
  values(p_target_user_id,'admin_grant',p_amount,'admin_grant:'||p_idempotency_key,
    jsonb_build_object('reason',left(coalesce(p_reason,'管理員發放'),200),'admin',auth.uid()))
  on conflict(user_id,idempotency_key) do nothing;
  if found then
    update public.shark_event_accounts set shark_coins=shark_coins+p_amount,updated_at=clock_timestamp()
     where user_id=p_target_user_id;
  end if;
  select shark_coins into v_balance from public.shark_event_accounts where user_id=p_target_user_id;
  return jsonb_build_object('success',true,'shark_coins',v_balance);
end;
$$;
revoke all on function private.admin_grant_shark_coins(uuid,numeric,text,text) from public, anon;
grant execute on function private.admin_grant_shark_coins(uuid,numeric,text,text) to authenticated;

create or replace function public.admin_grant_shark_coins(
  p_target_user_id uuid, p_amount numeric, p_idempotency_key text, p_reason text default '管理員發放'
) returns jsonb language sql security invoker
set search_path = pg_catalog, public, private
as $ select private.admin_grant_shark_coins(p_target_user_id,p_amount,p_idempotency_key,p_reason); $;
revoke all on function public.admin_grant_shark_coins(uuid,numeric,text,text) from public, anon;
grant execute on function public.admin_grant_shark_coins(uuid,numeric,text,text) to authenticated;

create or replace function private.shark_event_pet_sale_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  perform private.record_shark_event_progress(new.user_id,'pet_sale','pet-sale:'||new.pet_uid,1);
  return new;
end;
$$;
revoke all on function private.shark_event_pet_sale_trigger() from public, anon, authenticated;
drop trigger if exists trg_shark_event_pet_sale on public.pet_sale_tombstones;
create trigger trg_shark_event_pet_sale after insert on public.pet_sale_tombstones
for each row execute function private.shark_event_pet_sale_trigger();

create or replace function private.shark_event_weather_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_changed boolean := false;
begin
  if tg_op='INSERT' then
    v_changed := true;
  else
    v_changed := old.weather_type is distinct from new.weather_type
      or old.ends_at is distinct from new.ends_at;
  end if;
  if v_changed and new.weather_type in ('crystal','hell')
     and new.summoned_by is distinct from '管理員面板'
     and auth.uid() is not null then
    perform private.record_shark_event_progress(auth.uid(),'weather_summon_special',
      'weather-summon:'||coalesce(new.updated_at::text,clock_timestamp()::text),1);
  end if;
  return new;
end;
$$;
revoke all on function private.shark_event_weather_trigger() from public, anon, authenticated;
drop trigger if exists trg_shark_event_weather on public.realm_weather_state;
create trigger trg_shark_event_weather after insert or update on public.realm_weather_state
for each row execute function private.shark_event_weather_trigger();
