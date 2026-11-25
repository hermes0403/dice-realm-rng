-- T-0130 hardening: add the user-side lookup index and keep roll arithmetic bigint-safe.
-- Applied as migration 20261125093530.

create index if not exists guild_daily_member_progress_user_idx
  on public.guild_daily_member_progress (user_id, task_date);

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

  select guild_id into v_guild_id from public.guild_members where user_id = new.user_id;
  if v_guild_id is null then return new; end if;
  perform 1 from public.guilds where id = v_guild_id for update;

  v_task_date := (new.updated_at at time zone 'Asia/Taipei')::date;
  insert into public.guild_daily_member_progress (guild_id, user_id, task_date)
  values (v_guild_id, new.user_id, v_task_date)
  on conflict (guild_id, user_id, task_date) do nothing;

  select roll_count, roll_xp_awarded into v_roll_count, v_roll_awarded
    from public.guild_daily_member_progress
   where guild_id = v_guild_id and user_id = new.user_id and task_date = v_task_date
   for update;

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
