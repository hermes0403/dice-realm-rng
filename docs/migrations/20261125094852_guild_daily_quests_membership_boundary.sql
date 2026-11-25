-- T-0130 membership-boundary hardening.
-- Applied as Supabase migration 20261125094852.
-- Re-evaluate the once-per-day all-member login bonus after membership changes:
-- a departing member can complete the current roster; a joining member must
-- already have a login record for this Taipei date or log in after joining.

create or replace function private.award_guild_daily_login_bonus(
  p_guild_id uuid,
  p_task_date date,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_count integer := 0;
  v_logged_in_count integer := 0;
  v_awarded_guild_id uuid;
begin
  if p_guild_id is null or p_task_date is null or p_now is null then return; end if;
  perform 1 from public.guilds where id = p_guild_id for update;
  if not found then return; end if;

  select count(*)::integer,
         count(*) filter (where p.login_completed_at is not null)::integer
    into v_member_count, v_logged_in_count
    from public.guild_members m
    left join public.guild_daily_member_progress p
      on p.guild_id = m.guild_id
     and p.user_id = m.user_id
     and p.task_date = p_task_date
   where m.guild_id = p_guild_id;

  if v_member_count > 0 and v_logged_in_count = v_member_count then
    insert into public.guild_daily_login_bonuses(guild_id, task_date, awarded_at)
    values (p_guild_id, p_task_date, p_now)
    on conflict (guild_id, task_date) do nothing
    returning guild_id into v_awarded_guild_id;
    if found then perform private.add_guild_xp(p_guild_id, 20); end if;
  end if;
end;
$function$;

create or replace function private.record_guild_presence(p_user_id uuid, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_guild_id uuid;
  v_task_date date := (p_now at time zone 'Asia/Taipei')::date;
  v_online_seconds integer := 0;
  v_login_awarded boolean := false;
  v_online_awarded boolean := false;
  v_last_presence_at timestamptz;
  v_elapsed integer := 0;
  v_next_online integer := 0;
  v_award_login boolean := false;
  v_award_online boolean := false;
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select guild_id into v_guild_id
    from public.guild_members where user_id = p_user_id;
  if v_guild_id is null then return; end if;

  perform 1 from public.guilds where id = v_guild_id for update;
  insert into public.guild_daily_member_progress (
    guild_id, user_id, task_date, login_completed_at, last_presence_at
  ) values (v_guild_id, p_user_id, v_task_date, p_now, p_now)
  on conflict (guild_id, user_id, task_date) do nothing;

  select online_seconds, login_xp_awarded, online_xp_awarded, last_presence_at
    into v_online_seconds, v_login_awarded, v_online_awarded, v_last_presence_at
    from public.guild_daily_member_progress
   where guild_id = v_guild_id and user_id = p_user_id and task_date = v_task_date
   for update;

  if v_last_presence_at is not null then
    v_elapsed := greatest(0, least(90, floor(extract(epoch from (p_now - v_last_presence_at)))::integer));
  end if;
  v_next_online := least(1800, v_online_seconds + v_elapsed);
  v_award_login := not v_login_awarded;
  v_award_online := v_next_online >= 1800 and not v_online_awarded;

  update public.guild_daily_member_progress
     set login_completed_at = coalesce(login_completed_at, p_now),
         online_seconds = v_next_online,
         last_presence_at = p_now,
         login_xp_awarded = true,
         online_xp_awarded = online_xp_awarded or v_award_online,
         updated_at = p_now
   where guild_id = v_guild_id and user_id = p_user_id and task_date = v_task_date;

  if v_award_login then perform private.add_guild_xp(v_guild_id, 15); end if;
  if v_award_online then perform private.add_guild_xp(v_guild_id, 10); end if;
  perform private.award_guild_daily_login_bonus(v_guild_id, v_task_date, p_now);
end;
$function$;

create or replace function private.recheck_guild_daily_login_bonus()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_task_date date := (clock_timestamp() at time zone 'Asia/Taipei')::date;
begin
  if tg_op = 'DELETE' then
    perform private.award_guild_daily_login_bonus(old.guild_id, v_task_date, v_now);
    return old;
  elsif tg_op = 'INSERT' then
    perform private.award_guild_daily_login_bonus(new.guild_id, v_task_date, v_now);
    return new;
  else
    if old.guild_id is distinct from new.guild_id then
      perform private.award_guild_daily_login_bonus(old.guild_id, v_task_date, v_now);
      perform private.award_guild_daily_login_bonus(new.guild_id, v_task_date, v_now);
    end if;
    return new;
  end if;
end;
$function$;

drop trigger if exists guild_members_daily_login_recheck_insert on public.guild_members;
create trigger guild_members_daily_login_recheck_insert
after insert on public.guild_members
for each row execute function private.recheck_guild_daily_login_bonus();

drop trigger if exists guild_members_daily_login_recheck_delete on public.guild_members;
create trigger guild_members_daily_login_recheck_delete
after delete on public.guild_members
for each row execute function private.recheck_guild_daily_login_bonus();

drop trigger if exists guild_members_daily_login_recheck_update on public.guild_members;
create trigger guild_members_daily_login_recheck_update
after update of guild_id on public.guild_members
for each row execute function private.recheck_guild_daily_login_bonus();

-- Avoid an unnecessary progress UPDATE on every later save after the 1,000-roll target.
create or replace function private.track_guild_roll_progress()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_guild_id uuid;
  v_task_date date;
  v_old_rolls bigint := 0;
  v_new_rolls bigint := 0;
  v_delta bigint := 0;
  v_elapsed numeric := 0;
  v_credit bigint := 0;
  v_roll_count integer := 0;
  v_roll_awarded boolean := false;
  v_next_count integer := 0;
  v_award boolean := false;
begin
  if tg_op <> 'UPDATE' then return new; end if;
  v_old_rolls := greatest(0, coalesce(nullif(old.save_data->>'rolls', '')::bigint, 0));
  v_new_rolls := greatest(0, coalesce(nullif(new.save_data->>'rolls', '')::bigint, 0));
  v_delta := v_new_rolls - v_old_rolls;
  if v_delta <= 0 then return new; end if;

  select guild_id into v_guild_id
    from public.guild_members where user_id = new.user_id;
  if v_guild_id is null then return new; end if;
  perform 1 from public.guilds where id = v_guild_id for update;

  v_task_date := (new.updated_at at time zone 'Asia/Taipei')::date;
  insert into public.guild_daily_member_progress (guild_id, user_id, task_date)
  values (v_guild_id, new.user_id, v_task_date)
  on conflict (guild_id, user_id, task_date) do nothing;

  select roll_count, roll_xp_awarded
    into v_roll_count, v_roll_awarded
    from public.guild_daily_member_progress
   where guild_id = v_guild_id and user_id = new.user_id and task_date = v_task_date
   for update;

  if v_roll_count >= 1000 then return new; end if;
  v_elapsed := greatest(0, extract(epoch from (new.updated_at - old.updated_at)));
  v_credit := least(v_delta, floor(v_elapsed * 8)::bigint);
  if v_credit <= 0 then return new; end if;

  v_next_count := least(1000::bigint, v_roll_count::bigint + v_credit)::integer;
  v_award := v_next_count >= 1000 and not v_roll_awarded;
  update public.guild_daily_member_progress
     set roll_count = v_next_count,
         roll_xp_awarded = roll_xp_awarded or v_award,
         updated_at = new.updated_at
   where guild_id = v_guild_id and user_id = new.user_id and task_date = v_task_date;

  if v_award then perform private.add_guild_xp(v_guild_id, 15); end if;
  return new;
end;
$function$;

revoke all on function private.award_guild_daily_login_bonus(uuid, date, timestamptz) from public, anon, authenticated;
revoke all on function private.record_guild_presence(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.recheck_guild_daily_login_bonus() from public, anon, authenticated;
revoke all on function private.track_guild_roll_progress() from public, anon, authenticated;
