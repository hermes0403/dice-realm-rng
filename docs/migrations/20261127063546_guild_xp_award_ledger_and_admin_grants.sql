-- T-0159: unified guild XP ledger and secure admin grant.
create table if not exists public.guild_xp_award_ledger (
  id bigserial primary key,
  award_key text not null unique,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  member_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('task','admin')),
  task_key text not null,
  task_date date,
  cycle_number bigint,
  base_xp bigint not null check (base_xp > 0),
  xp_awarded bigint not null default 0 check (xp_awarded >= 0),
  actor_admin_email text,
  reason text,
  details jsonb not null default '{}'::jsonb,
  awarded_at timestamptz not null default now()
);
create index if not exists guild_xp_award_ledger_recent_idx on public.guild_xp_award_ledger (awarded_at desc);
create index if not exists guild_xp_award_ledger_guild_idx on public.guild_xp_award_ledger (guild_id, awarded_at desc);
alter table public.guild_xp_award_ledger enable row level security;
revoke all on public.guild_xp_award_ledger from public, anon, authenticated;

create or replace function private.add_guild_xp_with_ledger(
  p_guild_id uuid,p_amount bigint,p_member_id uuid,p_actor_user_id uuid,
  p_source text,p_task_key text,p_award_key text,p_task_date date default null,
  p_cycle_number bigint default null,p_admin_email text default null,
  p_reason text default null,p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path to ''
as $function$
declare v_before bigint; v_after bigint; v_ledger_id bigint;
begin
  if p_guild_id is null or p_amount is null or p_amount<=0 or p_source not in ('task','admin')
     or nullif(btrim(p_task_key),'') is null or nullif(btrim(p_award_key),'') is null then
    raise exception 'invalid_guild_xp_ledger_entry' using errcode='22023';
  end if;
  select xp_total into v_before from public.guilds where id=p_guild_id for update;
  if not found then raise exception 'guild_not_found' using errcode='P0002'; end if;
  insert into public.guild_xp_award_ledger(award_key,guild_id,member_id,actor_user_id,source,task_key,task_date,cycle_number,base_xp,xp_awarded,actor_admin_email,reason,details)
  values(p_award_key,p_guild_id,p_member_id,p_actor_user_id,p_source,p_task_key,p_task_date,p_cycle_number,p_amount,0,p_admin_email,p_reason,coalesce(p_details,'{}'::jsonb))
  on conflict(award_key) do nothing returning id into v_ledger_id;
  if v_ledger_id is null then return; end if;
  perform private.add_guild_xp(p_guild_id,p_amount);
  select xp_total into v_after from public.guilds where id=p_guild_id;
  update public.guild_xp_award_ledger set xp_awarded=greatest(0,v_after-v_before) where id=v_ledger_id;
end;
$function$;
revoke all on function private.add_guild_xp_with_ledger(uuid,bigint,uuid,uuid,text,text,text,date,bigint,text,text,jsonb) from public,anon,authenticated;

do $migration$
declare v_def text;
begin
  v_def:=pg_get_functiondef('private.record_guild_presence(uuid,timestamptz)'::regprocedure);
  v_def:=replace(v_def,'perform private.add_guild_xp(v_guild_id, 15::bigint);',
    'perform private.add_guild_xp_with_ledger(v_guild_id,15::bigint,p_user_id,p_user_id,''task'',''login'',''login:''||v_guild_id::text||'':''||p_user_id::text||'':''||v_task_date::text,v_task_date,null,null,null,''{}''::jsonb);');
  v_def:=replace(v_def,'perform private.add_guild_xp(v_guild_id, v_inserted * 10::bigint);',
    'perform private.add_guild_xp_with_ledger(v_guild_id,v_inserted*10::bigint,p_user_id,p_user_id,''task'',''online'',''online:''||v_guild_id::text||'':''||p_user_id::text||'':''||v_task_date::text||'':''||(v_online_cycles_completed+1)::text||'':''||(v_online_cycles_completed+v_new_cycles)::text,v_task_date,v_online_cycles_completed+1,null,null,jsonb_build_object(''cycles'',v_new_cycles,''cycle_end'',v_online_cycles_completed+v_new_cycles));');
  if position('add_guild_xp_with_ledger' in v_def)=0 then raise exception 'presence instrumentation failed'; end if;
  execute v_def;
  v_def:=pg_get_functiondef('private.track_guild_roll_progress()'::regprocedure);
  v_def:=replace(v_def,'perform private.add_guild_xp(v_guild_id, v_inserted * 15::bigint);',
    'perform private.add_guild_xp_with_ledger(v_guild_id,v_inserted*15::bigint,new.user_id,new.user_id,''task'',''rolls'',''rolls:''||v_guild_id::text||'':''||new.user_id::text||'':''||v_task_date::text||'':''||(v_roll_cycles_completed+1)::text||'':''||(v_roll_cycles_completed+v_new_cycles)::text,v_task_date,v_roll_cycles_completed+1,null,null,jsonb_build_object(''cycles'',v_new_cycles,''cycle_end'',v_roll_cycles_completed+v_new_cycles));');
  if position('add_guild_xp_with_ledger' in v_def)=0 then raise exception 'roll instrumentation failed'; end if;
  execute v_def;
end;
$migration$;

create or replace function private.award_guild_daily_login_bonus(p_guild_id uuid,p_task_date date,p_now timestamptz,p_trigger_user_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_member_count integer:=0; v_logged_in_count integer:=0; v_awarded_guild_id uuid; v_snapshot jsonb:='[]'::jsonb; v_trigger_name text;
begin
  if p_guild_id is null or p_task_date is null or p_now is null or p_trigger_user_id is null then return; end if;
  perform 1 from public.guilds where id=p_guild_id for update;
  if not found then return; end if;
  select count(*)::integer,count(*) filter(where p.login_completed_at is not null)::integer into v_member_count,v_logged_in_count
  from public.guild_members m left join public.guild_daily_member_progress p
  on p.guild_id=m.guild_id and p.user_id=m.user_id and p.task_date=p_task_date where m.guild_id=p_guild_id;
  if v_member_count>=2 and v_logged_in_count>=least(v_member_count,3) then
    select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'username',coalesce(pp.username,'玩家')) order by m.joined_at,m.user_id),'[]'::jsonb)
    into v_snapshot from public.guild_members m left join public.player_profiles pp on pp.user_id=m.user_id where m.guild_id=p_guild_id;
    select coalesce(username,'玩家') into v_trigger_name from public.player_profiles where user_id=p_trigger_user_id;
    insert into public.guild_daily_login_bonuses(guild_id,task_date,awarded_at) values(p_guild_id,p_task_date,p_now)
    on conflict(guild_id,task_date) do nothing returning guild_id into v_awarded_guild_id;
    if found then
      perform private.add_guild_xp_with_ledger(p_guild_id,20::bigint,p_trigger_user_id,p_trigger_user_id,'task','all_login',
        'all_login:'||p_guild_id::text||':'||p_task_date::text,p_task_date,null,null,null,
        jsonb_build_object('trigger_member_id',p_trigger_user_id,'trigger_member_name',v_trigger_name,'member_snapshot',v_snapshot,'reward_scope','guild'));
    end if;
  end if;
end;
$function$;
revoke all on function private.award_guild_daily_login_bonus(uuid,date,timestamptz,uuid) from public,anon,authenticated;

do $migration$
declare v_def text;
begin
  v_def:=pg_get_functiondef('private.record_guild_presence(uuid,timestamptz)'::regprocedure);
  v_def:=replace(v_def,'perform private.award_guild_daily_login_bonus(v_guild_id, v_task_date, p_now);',
    'perform private.award_guild_daily_login_bonus(v_guild_id,v_task_date,p_now,p_user_id);');
  if position('award_guild_daily_login_bonus(v_guild_id,v_task_date,p_now,p_user_id)' in v_def)=0 then raise exception 'all-login actor instrumentation failed'; end if;
  execute v_def;
end;
$migration$;

create or replace function public.admin_grant_guild_xp(p_admin_user_id uuid,p_admin_email text,p_target_user_id uuid,p_amount bigint,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_guild_id uuid; v_username text; v_guild_name text; v_before bigint; v_after bigint;
begin
  if lower(coalesce(p_admin_email,''))<>'toby110403@gmail.com' or p_admin_user_id is null then raise exception 'admin_required' using errcode='42501'; end if;
  if p_target_user_id is null or p_request_id is null or p_amount is null or p_amount<1 or p_amount>1000000000
     or char_length(btrim(coalesce(p_reason,'')))<3 or char_length(btrim(p_reason))>300 then
    raise exception 'invalid_guild_xp_grant' using errcode='22023';
  end if;
  select gm.guild_id,coalesce(pp.username,'玩家'),g.name into v_guild_id,v_username,v_guild_name
  from public.guild_members gm join public.guilds g on g.id=gm.guild_id
  left join public.player_profiles pp on pp.user_id=gm.user_id where gm.user_id=p_target_user_id;
  if v_guild_id is null then raise exception 'target_player_not_in_guild' using errcode='P0002'; end if;
  select xp_total into v_before from public.guilds where id=v_guild_id for update;
  perform private.add_guild_xp_with_ledger(v_guild_id,p_amount,p_target_user_id,p_admin_user_id,'admin','admin_manual',
    'admin:'||p_request_id::text,null,null,lower(p_admin_email),btrim(p_reason),
    jsonb_build_object('target_username',v_username,'guild_name',v_guild_name,'request_id',p_request_id));
  select xp_total into v_after from public.guilds where id=v_guild_id;
  return jsonb_build_object('success',true,'guild_id',v_guild_id,'guild_name',v_guild_name,'target_user_id',p_target_user_id,
    'target_username',v_username,'base_xp',p_amount,'xp_awarded',greatest(0,v_after-v_before));
end;
$function$;
revoke all on function public.admin_grant_guild_xp(uuid,text,uuid,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_grant_guild_xp(uuid,text,uuid,bigint,text,uuid) to service_role;
