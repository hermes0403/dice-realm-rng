-- T-0156: guild leaders can send potion gifts to members; recipients claim once.
-- Inventory changes are serialized against game_saves and adopted into the client sync baseline.

create table public.guild_potion_gift_mail (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  potion_id text not null check (potion_id = any (array[
    'luck1'::text, 'luck2'::text, 'luck3'::text,
    'speed1'::text, 'speed2'::text,
    'money1'::text, 'money2'::text,
    'angel1'::text, 'angel2'::text
  ])),
  potion_amount integer not null check (potion_amount between 1 and 1000000),
  subject text not null,
  body text not null,
  reward_text text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  constraint guild_potion_gift_mail_request_once unique (sender_id, request_id, recipient_id)
);

create index guild_potion_gift_mail_recipient_created_idx
  on public.guild_potion_gift_mail (recipient_id, created_at desc);
create index guild_potion_gift_mail_sender_request_idx
  on public.guild_potion_gift_mail (sender_id, request_id);

alter table public.guild_potion_gift_mail enable row level security;
revoke all on table public.guild_potion_gift_mail from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.guild_send_potion_gift(
  p_request_id uuid, p_potion_id text, p_amount integer, p_recipient_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_actor_role text;
  v_existing_count integer := 0;
  v_existing_recipients uuid[];
  v_request_recipients uuid[];
  v_member_count integer := 0;
  v_save_data jsonb;
  v_potions jsonb;
  v_inventory jsonb;
  v_balance bigint;
  v_total bigint;
  v_updated_at timestamptz;
  v_potion_name text;
  v_gift_ids jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_request_id is null then raise exception 'guild_potion_gift_request_id_required' using errcode = '22023'; end if;
  if p_potion_id is null or p_potion_id not in (
    'luck1','luck2','luck3','speed1','speed2','money1','money2','angel1','angel2'
  ) then
    raise exception 'guild_potion_gift_potion_invalid' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then
    raise exception 'guild_potion_gift_amount_invalid' using errcode = '22023';
  end if;
  if p_recipient_ids is null or cardinality(p_recipient_ids) < 1 or cardinality(p_recipient_ids) > 30 then
    raise exception 'guild_potion_gift_recipients_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_recipient_ids) as recipients(recipient_id) where recipient_id is null) then
    raise exception 'guild_potion_gift_recipients_invalid' using errcode = '22023';
  end if;
  if v_uid = any(p_recipient_ids) then
    raise exception 'guild_potion_gift_self_not_allowed' using errcode = '22023';
  end if;

  select array_agg(distinct recipient_id order by recipient_id)
    into v_request_recipients
    from unnest(p_recipient_ids) as recipients(recipient_id);
  if cardinality(v_request_recipients) <> cardinality(p_recipient_ids) then
    raise exception 'guild_potion_gift_duplicate_recipient' using errcode = '22023';
  end if;

  -- Repeating the same request after a network timeout must not deduct twice.
  select count(*)::integer, array_agg(g.recipient_id order by g.recipient_id)
    into v_existing_count, v_existing_recipients
    from public.guild_potion_gift_mail g
   where g.sender_id = v_uid and g.request_id = p_request_id;
  if v_existing_count > 0 then
    if v_existing_count <> cardinality(p_recipient_ids)
       or v_existing_recipients is distinct from v_request_recipients
       or exists (
         select 1 from public.guild_potion_gift_mail g
          where g.sender_id = v_uid and g.request_id = p_request_id
            and (g.potion_id <> p_potion_id or g.potion_amount <> p_amount)
       ) then
      raise exception 'guild_potion_gift_request_conflict' using errcode = '23505';
    end if;
    select save_data, updated_at into v_save_data, v_updated_at
      from public.game_saves where user_id = v_uid;
    if not found then raise exception 'guild_potion_gift_save_not_initialized' using errcode = 'P0002'; end if;
    v_inventory := coalesce(v_save_data #> '{potions,inventory}', '{}'::jsonb);
    select coalesce(jsonb_agg(g.id order by g.recipient_id), '[]'::jsonb)
      into v_gift_ids
      from public.guild_potion_gift_mail g
     where g.sender_id = v_uid and g.request_id = p_request_id;
    return jsonb_build_object(
      'ok', true, 'already_sent', true, 'gift_count', v_existing_count,
      'total_amount', v_existing_count::bigint * p_amount,
      'inventory', v_inventory, 'updated_at', v_updated_at, 'gift_ids', v_gift_ids
    );
  end if;

  -- Serialize with guild membership/role changes before validating recipients.
  select guild_id into v_guild_id from public.guild_members where user_id = v_uid;
  if v_guild_id is null then raise exception 'guild_membership_required' using errcode = '42501'; end if;
  perform 1 from public.guilds where id = v_guild_id for update;
  if not found then raise exception 'guild_not_found' using errcode = 'P0002'; end if;
  select role into v_actor_role
    from public.guild_members
   where guild_id = v_guild_id and user_id = v_uid
   for update;
  if v_actor_role is distinct from 'leader' then
    raise exception 'guild_potion_gift_leader_only' using errcode = '42501';
  end if;

  select count(*)::integer into v_member_count
    from public.guild_members
   where guild_id = v_guild_id and user_id = any(p_recipient_ids);
  if v_member_count <> cardinality(p_recipient_ids) then
    raise exception 'guild_potion_gift_recipient_not_member' using errcode = '42501';
  end if;

  select save_data, updated_at into v_save_data, v_updated_at
    from public.game_saves where user_id = v_uid for update;
  if not found then raise exception 'guild_potion_gift_save_not_initialized' using errcode = 'P0002'; end if;
  if jsonb_typeof(v_save_data) is distinct from 'object' then
    raise exception 'guild_potion_gift_save_invalid' using errcode = '22023';
  end if;
  v_potions := coalesce(v_save_data -> 'potions', '{}'::jsonb);
  if jsonb_typeof(v_potions) is distinct from 'object' then
    raise exception 'guild_potion_gift_inventory_invalid' using errcode = '22023';
  end if;
  v_inventory := coalesce(v_potions -> 'inventory', '{}'::jsonb);
  if jsonb_typeof(v_inventory) is distinct from 'object' then
    raise exception 'guild_potion_gift_inventory_invalid' using errcode = '22023';
  end if;
  v_balance := coalesce(nullif(v_inventory ->> p_potion_id, '')::bigint, 0);
  if v_balance < 0 or v_balance > 2147483647 then
    raise exception 'guild_potion_gift_inventory_invalid' using errcode = '22023';
  end if;
  v_total := p_amount::bigint * cardinality(p_recipient_ids)::bigint;
  if v_balance < v_total then
    raise exception 'guild_potion_gift_insufficient_inventory' using errcode = '23514';
  end if;

  v_inventory := jsonb_set(v_inventory, array[p_potion_id], to_jsonb(v_balance - v_total), true);
  v_potions := jsonb_set(v_potions, '{inventory}', v_inventory, true);
  v_save_data := jsonb_set(v_save_data, '{potions}', v_potions, true);
  update public.game_saves
     set save_data = v_save_data, updated_at = clock_timestamp()
   where user_id = v_uid
   returning updated_at into v_updated_at;

  v_potion_name := case p_potion_id
    when 'luck1' then '運氣藥水 I' when 'luck2' then '運氣藥水 II' when 'luck3' then '運氣藥水 III'
    when 'speed1' then '速度藥水 I' when 'speed2' then '速度藥水 II'
    when 'money1' then '金錢藥水 I' when 'money2' then '金錢藥水 II'
    when 'angel1' then '天堂藥水 I' when 'angel2' then '天堂藥水 II'
  end;

  with inserted as (
    insert into public.guild_potion_gift_mail (
      request_id, guild_id, sender_id, recipient_id, potion_id, potion_amount, subject, body, reward_text
    )
    select p_request_id, v_guild_id, v_uid, recipients.recipient_id, p_potion_id, p_amount,
      '你的會長贈予你',
      format('你的會長贈予你 %s × %s', v_potion_name, p_amount),
      format('%s × %s', v_potion_name, p_amount)
    from unnest(p_recipient_ids) as recipients(recipient_id)
    returning id, recipient_id
  )
  select coalesce(jsonb_agg(id order by recipient_id), '[]'::jsonb) into v_gift_ids from inserted;

  return jsonb_build_object(
    'ok', true, 'already_sent', false, 'gift_count', cardinality(p_recipient_ids),
    'total_amount', v_total, 'potion_id', p_potion_id, 'potion_name', v_potion_name,
    'inventory', v_inventory, 'updated_at', v_updated_at, 'gift_ids', v_gift_ids
  );
end;
$function$;

create or replace function private.guild_claim_potion_gift(p_gift_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_gift public.guild_potion_gift_mail%rowtype;
  v_save_data jsonb;
  v_potions jsonb;
  v_inventory jsonb;
  v_balance bigint;
  v_updated_at timestamptz;
  v_potion_name text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_gift_id is null then raise exception 'guild_potion_gift_id_required' using errcode = '22023'; end if;
  select * into v_gift
    from public.guild_potion_gift_mail
   where id = p_gift_id and recipient_id = v_uid
   for update;
  if not found then raise exception 'guild_potion_gift_not_found' using errcode = 'P0002'; end if;
  if v_gift.claimed_at is not null then
    raise exception 'guild_potion_gift_already_claimed' using errcode = '23505';
  end if;

  -- A gift remains the recipient's property even if they later leave the guild.
  select save_data into v_save_data
    from public.game_saves where user_id = v_uid for update;
  if not found then raise exception 'guild_potion_gift_save_not_initialized' using errcode = 'P0002'; end if;
  if jsonb_typeof(v_save_data) is distinct from 'object' then
    raise exception 'guild_potion_gift_save_invalid' using errcode = '22023';
  end if;
  v_potions := coalesce(v_save_data -> 'potions', '{}'::jsonb);
  if jsonb_typeof(v_potions) is distinct from 'object' then
    raise exception 'guild_potion_gift_inventory_invalid' using errcode = '22023';
  end if;
  v_inventory := coalesce(v_potions -> 'inventory', '{}'::jsonb);
  if jsonb_typeof(v_inventory) is distinct from 'object' then
    raise exception 'guild_potion_gift_inventory_invalid' using errcode = '22023';
  end if;
  v_balance := coalesce(nullif(v_inventory ->> v_gift.potion_id, '')::bigint, 0);
  if v_balance < 0 or v_balance > 2147483647 - v_gift.potion_amount then
    raise exception 'guild_potion_gift_inventory_invalid' using errcode = '22023';
  end if;

  v_inventory := jsonb_set(v_inventory, array[v_gift.potion_id], to_jsonb(v_balance + v_gift.potion_amount), true);
  v_potions := jsonb_set(v_potions, '{inventory}', v_inventory, true);
  v_save_data := jsonb_set(v_save_data, '{potions}', v_potions, true);
  update public.game_saves
     set save_data = v_save_data, updated_at = clock_timestamp()
   where user_id = v_uid
   returning updated_at into v_updated_at;

  update public.guild_potion_gift_mail
     set claimed_at = clock_timestamp()
   where id = v_gift.id and recipient_id = v_uid and claimed_at is null;
  if not found then raise exception 'guild_potion_gift_already_claimed' using errcode = '23505'; end if;

  v_potion_name := case v_gift.potion_id
    when 'luck1' then '運氣藥水 I' when 'luck2' then '運氣藥水 II' when 'luck3' then '運氣藥水 III'
    when 'speed1' then '速度藥水 I' when 'speed2' then '速度藥水 II'
    when 'money1' then '金錢藥水 I' when 'money2' then '金錢藥水 II'
    when 'angel1' then '天堂藥水 I' when 'angel2' then '天堂藥水 II'
  end;
  return jsonb_build_object(
    'ok', true, 'gift_id', v_gift.id, 'potion_id', v_gift.potion_id,
    'potion_name', v_potion_name, 'potion_amount', v_gift.potion_amount,
    'inventory', v_inventory, 'updated_at', v_updated_at
  );
end;
$function$;

create or replace function private.guild_get_mailbox(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 50)));
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
    into v_result
    from (
      select combined.*
        from (
          select m.id, m.guild_id, m.guild_level, m.subject, m.body, m.reward_text,
                 m.is_read, m.created_at, 'guild_reward'::text as mail_type,
                 null::text as potion_id, null::integer as potion_amount,
                 null::uuid as sender_id, null::text as sender_name,
                 null::timestamptz as claimed_at
            from public.guild_level_reward_mail m
           where m.recipient_id = v_uid
          union all
          select g.id, g.guild_id, null::smallint as guild_level, g.subject, g.body, g.reward_text,
                 (g.claimed_at is not null) as is_read, g.created_at, 'potion_gift'::text as mail_type,
                 g.potion_id, g.potion_amount, g.sender_id,
                 coalesce(pp.username, '公會長') as sender_name, g.claimed_at
            from public.guild_potion_gift_mail g
            left join public.player_profiles pp on pp.user_id = g.sender_id
           where g.recipient_id = v_uid
        ) combined
       order by combined.created_at desc, combined.id desc
       limit v_limit
    ) q;
  return v_result;
end;
$function$;

create or replace function private.guild_get_my_guild()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_role text;
  v_guild jsonb;
  v_members jsonb;
  v_apps jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select guild_id, role into v_guild_id, v_role
    from public.guild_members where user_id = v_uid;
  if v_guild_id is null then
    return jsonb_build_object(
      'guild', null, 'members', '[]'::jsonb, 'applications', '[]'::jsonb, 'my_role', null,
      'mail_unread_count',
        (select count(*) from public.guild_level_reward_mail where recipient_id = v_uid and not is_read)
        + (select count(*) from public.guild_potion_gift_mail where recipient_id = v_uid and claimed_at is null)
    );
  end if;

  select jsonb_build_object(
    'id', g.id, 'name', g.name, 'level', g.level, 'xp_total', g.xp_total,
    'description', g.description, 'join_mode', g.join_mode,
    'name_color', g.name_color, 'badge_effect', g.badge_effect, 'background_theme', g.background_theme,
    'member_count', (select count(*) from public.guild_members mm where mm.guild_id = g.id),
    'created_at', g.created_at,
    'reward_unlocks', (
      select coalesce(jsonb_agg(jsonb_build_object('level', r.guild_level, 'reward_key', r.reward_key, 'reward_text', r.reward_text) order by r.guild_level), '[]'::jsonb)
      from public.guild_level_reward_events r
      where r.guild_id = g.id and r.reward_type in ('cosmetic','bonus')
    ),
    'announcement', (
      select jsonb_build_object('message', a.message, 'updated_at', a.updated_at, 'updated_by', coalesce(pp.username, '未知玩家'))
      from public.guild_announcements a
      left join public.player_profiles pp on pp.user_id = a.updated_by
      where a.guild_id = g.id
    )
  ) into v_guild
  from public.guilds g where g.id = v_guild_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'username', coalesce(pp.username, '未知玩家'),
        'user_id', case when v_role in ('leader', 'vice_leader') then m.user_id else null end,
        'role', m.role, 'joined_at', m.joined_at
      )
      order by case m.role when 'leader' then 1 when 'vice_leader' then 2 else 4 end, m.joined_at
    ), '[]'::jsonb
  ) into v_members
  from public.guild_members m
  left join public.player_profiles pp on pp.user_id = m.user_id
  where m.guild_id = v_guild_id;

  if v_role in ('leader', 'vice_leader') then
    select coalesce(
      jsonb_agg(jsonb_build_object('id', a.id, 'username', coalesce(pp.username, '未知玩家'),
        'message', a.message, 'created_at', a.created_at) order by a.created_at),
      '[]'::jsonb
    ) into v_apps
    from public.guild_applications a
    left join public.player_profiles pp on pp.user_id = a.applicant_id
    where a.guild_id = v_guild_id and a.status = 'pending';
  end if;

  return jsonb_build_object(
    'guild', v_guild, 'members', v_members, 'applications', v_apps, 'my_role', v_role,
    'mail_unread_count',
      (select count(*) from public.guild_level_reward_mail where recipient_id = v_uid and not is_read)
      + (select count(*) from public.guild_potion_gift_mail where recipient_id = v_uid and claimed_at is null)
  );
end;
$function$;

revoke all on function private.guild_send_potion_gift(uuid,text,integer,uuid[]) from public, anon, authenticated;
revoke all on function private.guild_claim_potion_gift(uuid) from public, anon, authenticated;
revoke all on function private.guild_get_mailbox(integer) from public, anon, authenticated;
revoke all on function private.guild_get_my_guild() from public, anon;
grant execute on function private.guild_get_my_guild() to authenticated;

create or replace function public.guild_send_potion_gift(
  p_request_id uuid, p_potion_id text, p_amount integer, p_recipient_ids uuid[]
)
returns jsonb language sql volatile security definer set search_path to ''
as $function$
  select private.guild_send_potion_gift(p_request_id, p_potion_id, p_amount, p_recipient_ids);
$function$;

create or replace function public.guild_claim_potion_gift(p_gift_id uuid)
returns jsonb language sql volatile security definer set search_path to ''
as $function$
  select private.guild_claim_potion_gift(p_gift_id);
$function$;

revoke all on function public.guild_send_potion_gift(uuid,text,integer,uuid[]) from public, anon;
revoke all on function public.guild_claim_potion_gift(uuid) from public, anon;
grant execute on function public.guild_send_potion_gift(uuid,text,integer,uuid[]) to authenticated;
grant execute on function public.guild_claim_potion_gift(uuid) to authenticated;
