-- T-0026 multi-pet trade extension. Apply after pet-trading-exchange.sql.
-- Each participant may offer up to four pets. Legacy scalar columns remain
-- for older readers; the arrays are authoritative for the updated client.

alter table public.pet_trade_sessions
  add column if not exists offered_pet_uids_a text[] not null default '{}'::text[],
  add column if not exists offered_pet_uids_b text[] not null default '{}'::text[],
  add column if not exists offered_pet_snapshots_a jsonb not null default '[]'::jsonb,
  add column if not exists offered_pet_snapshots_b jsonb not null default '[]'::jsonb;

update public.pet_trade_sessions
set offered_pet_uids_a = case when offered_pet_uid_a is null then '{}'::text[] else array[offered_pet_uid_a] end,
    offered_pet_snapshots_a = case when offered_pet_snapshot_a is null then '[]'::jsonb else jsonb_build_array(offered_pet_snapshot_a) end
where cardinality(offered_pet_uids_a)=0
  and (offered_pet_uid_a is not null or offered_pet_snapshot_a is not null);

update public.pet_trade_sessions
set offered_pet_uids_b = case when offered_pet_uid_b is null then '{}'::text[] else array[offered_pet_uid_b] end,
    offered_pet_snapshots_b = case when offered_pet_snapshot_b is null then '[]'::jsonb else jsonb_build_array(offered_pet_snapshot_b) end
where cardinality(offered_pet_uids_b)=0
  and (offered_pet_uid_b is not null or offered_pet_snapshot_b is not null);

drop function if exists public.confirm_pet_trade(uuid);

CREATE OR REPLACE FUNCTION public.confirm_pet_trade(p_session_id uuid, p_expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.pet_trade_sessions;
  v_save_a jsonb;
  v_save_b jsonb;
  v_uids_a text[];
  v_uids_b text[];
  v_owned_a integer := 0;
  v_owned_b integer := 0;
  v_incoming_a jsonb;
  v_incoming_b jsonb;
  v_remaining_a jsonb;
  v_remaining_b jsonb;
  v_pets_a jsonb;
  v_pets_b jsonb;
  v_equipped_a jsonb;
  v_equipped_b jsonb;
  v_discovered_a jsonb;
  v_discovered_b jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode='28000';
  end if;

  select * into v_session
  from public.pet_trade_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'trade_session_not_found' using errcode='P0002';
  end if;
  if v_user_id not in (v_session.participant_a, v_session.participant_b) then
    raise exception 'not_trade_participant' using errcode='42501';
  end if;
  if v_session.status <> 'active' or v_session.expires_at <= clock_timestamp() then
    raise exception 'trade_session_inactive' using errcode='P0001';
  end if;
  if p_expected_revision is null or p_expected_revision <> v_session.revision then
    raise exception 'trade_offer_changed_reload' using errcode='40001';
  end if;

  v_uids_a := coalesce(v_session.offered_pet_uids_a, '{}'::text[]);
  v_uids_b := coalesce(v_session.offered_pet_uids_b, '{}'::text[]);

  if cardinality(v_uids_a) < 1 or cardinality(v_uids_b) < 1 then
    raise exception 'both_players_must_offer_pets' using errcode='22023';
  end if;
  if cardinality(v_uids_a) > 4 or cardinality(v_uids_b) > 4 then
    raise exception 'trade_offer_limit_exceeded' using errcode='22023';
  end if;

  update public.pet_trade_sessions
  set confirmed_a = case when v_user_id = participant_a then true else confirmed_a end,
      confirmed_b = case when v_user_id = participant_b then true else confirmed_b end,
      updated_at = clock_timestamp()
  where id = p_session_id
  returning * into v_session;

  if not (v_session.confirmed_a and v_session.confirmed_b) then
    return jsonb_build_object(
      'success', true,
      'completed', false,
      'confirmed_a', v_session.confirmed_a,
      'confirmed_b', v_session.confirmed_b,
      'revision', v_session.revision
    );
  end if;

  -- Lock both save rows in a stable order to avoid deadlocks.
  perform 1
  from public.game_saves gs
  where gs.user_id in (v_session.participant_a, v_session.participant_b)
  order by gs.user_id
  for update;

  select save_data into v_save_a
  from public.game_saves
  where user_id = v_session.participant_a;
  select save_data into v_save_b
  from public.game_saves
  where user_id = v_session.participant_b;

  if v_save_a is null or v_save_b is null then
    raise exception 'game_save_not_found' using errcode='P0002';
  end if;

  select count(*) into v_owned_a
  from unnest(v_uids_a) as chosen(uid)
  where (
    select count(*)
    from jsonb_array_elements(
      case when jsonb_typeof(v_save_a->'pets') = 'array' then v_save_a->'pets' else '[]'::jsonb end
    ) owned(pet)
    where owned.pet->>'uid' = chosen.uid
  ) = 1;

  select count(*) into v_owned_b
  from unnest(v_uids_b) as chosen(uid)
  where (
    select count(*)
    from jsonb_array_elements(
      case when jsonb_typeof(v_save_b->'pets') = 'array' then v_save_b->'pets' else '[]'::jsonb end
    ) owned(pet)
    where owned.pet->>'uid' = chosen.uid
  ) = 1;

  if v_owned_a <> cardinality(v_uids_a) or v_owned_b <> cardinality(v_uids_b) then
    raise exception 'offered_pet_no_longer_owned' using errcode='P0002';
  end if;

  if exists (
    select 1 from public.pet_sale_tombstones t
    where (t.user_id = v_session.participant_a and t.pet_uid = any(v_uids_a))
       or (t.user_id = v_session.participant_b and t.pet_uid = any(v_uids_b))
  ) then
    raise exception 'offered_pet_unavailable' using errcode='P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(v_save_a->'pets') = 'array' then v_save_a->'pets' else '[]'::jsonb end) p
    where p->>'uid' = any(v_uids_b)
  ) or exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(v_save_b->'pets') = 'array' then v_save_b->'pets' else '[]'::jsonb end) p
    where p->>'uid' = any(v_uids_a)
  ) then
    raise exception 'duplicate_pet_uid_detected' using errcode='23505';
  end if;

  select coalesce(jsonb_agg(p order by ord), '[]'::jsonb)
  into v_remaining_a
  from jsonb_array_elements(case when jsonb_typeof(v_save_a->'pets') = 'array' then v_save_a->'pets' else '[]'::jsonb end)
       with ordinality x(p, ord)
  where not ((p->>'uid') = any(v_uids_a));

  select coalesce(jsonb_agg(p order by ord), '[]'::jsonb)
  into v_remaining_b
  from jsonb_array_elements(case when jsonb_typeof(v_save_b->'pets') = 'array' then v_save_b->'pets' else '[]'::jsonb end)
       with ordinality x(p, ord)
  where not ((p->>'uid') = any(v_uids_b));

  select coalesce(jsonb_agg(p order by array_position(v_uids_b, p->>'uid')), '[]'::jsonb)
  into v_incoming_a
  from jsonb_array_elements(case when jsonb_typeof(v_save_b->'pets') = 'array' then v_save_b->'pets' else '[]'::jsonb end) p
  where p->>'uid' = any(v_uids_b);

  select coalesce(jsonb_agg(p order by array_position(v_uids_a, p->>'uid')), '[]'::jsonb)
  into v_incoming_b
  from jsonb_array_elements(case when jsonb_typeof(v_save_a->'pets') = 'array' then v_save_a->'pets' else '[]'::jsonb end) p
  where p->>'uid' = any(v_uids_a);

  v_pets_a := v_remaining_a || v_incoming_a;
  v_pets_b := v_remaining_b || v_incoming_b;

  select coalesce(jsonb_agg(to_jsonb(e.uid) order by e.ord), '[]'::jsonb)
  into v_equipped_a
  from jsonb_array_elements_text(
    case when jsonb_typeof(v_save_a->'equippedPetUids') = 'array' then v_save_a->'equippedPetUids' else '[]'::jsonb end
  ) with ordinality e(uid, ord)
  where not (e.uid = any(v_uids_a));

  select coalesce(jsonb_agg(to_jsonb(e.uid) order by e.ord), '[]'::jsonb)
  into v_equipped_b
  from jsonb_array_elements_text(
    case when jsonb_typeof(v_save_b->'equippedPetUids') = 'array' then v_save_b->'equippedPetUids' else '[]'::jsonb end
  ) with ordinality e(uid, ord)
  where not (e.uid = any(v_uids_b));

  select coalesce(jsonb_object_agg(p->>'id', true), '{}'::jsonb)
  into v_discovered_a
  from jsonb_array_elements(v_incoming_a) p;

  select coalesce(jsonb_object_agg(p->>'id', true), '{}'::jsonb)
  into v_discovered_b
  from jsonb_array_elements(v_incoming_b) p;

  v_discovered_a := coalesce(v_save_a->'petDiscovered', '{}'::jsonb) || v_discovered_a;
  v_discovered_b := coalesce(v_save_b->'petDiscovered', '{}'::jsonb) || v_discovered_b;

  update public.pet_trade_sessions
  set status = 'completed', updated_at = clock_timestamp()
  where id = p_session_id;

  update public.game_saves
  set save_data = jsonb_set(
        jsonb_set(
          jsonb_set(v_save_a, '{pets}', v_pets_a, true),
          '{equippedPetUids}', v_equipped_a, true
        ),
        '{petDiscovered}', v_discovered_a, true
      ),
      updated_at = clock_timestamp()
  where user_id = v_session.participant_a;

  update public.game_saves
  set save_data = jsonb_set(
        jsonb_set(
          jsonb_set(v_save_b, '{pets}', v_pets_b, true),
          '{equippedPetUids}', v_equipped_b, true
        ),
        '{petDiscovered}', v_discovered_b, true
      ),
      updated_at = clock_timestamp()
  where user_id = v_session.participant_b;

  return jsonb_build_object(
    'success', true,
    'completed', true,
    'participant_a', v_session.participant_a,
    'participant_b', v_session.participant_b,
    'offered_count_a', cardinality(v_uids_a),
    'offered_count_b', cardinality(v_uids_b)
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.set_pet_trade_offer(p_session_id uuid, p_pet_uid text)
 RETURNS pet_trade_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
begin
  if p_pet_uid is null then
    raise exception 'invalid_offer' using errcode='22023';
  end if;
  return public.set_pet_trade_offers(p_session_id, array[p_pet_uid]::text[]);
end;
$function$


CREATE OR REPLACE FUNCTION public.set_pet_trade_offers(p_session_id uuid, p_pet_uids text[])
 RETURNS pet_trade_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.pet_trade_sessions;
  v_save jsonb;
  v_pet_uids text[] := coalesce(p_pet_uids, '{}'::text[]);
  v_snapshots jsonb := '[]'::jsonb;
  v_existing text[];
  v_owned_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode='28000';
  end if;
  if p_session_id is null then
    raise exception 'invalid_offer' using errcode='22023';
  end if;
  if cardinality(v_pet_uids) > 4 then
    raise exception 'trade_offer_limit_exceeded' using errcode='22023';
  end if;
  if cardinality(v_pet_uids) <> (
    select count(distinct chosen.uid)
    from unnest(v_pet_uids) as chosen(uid)
  ) then
    raise exception 'duplicate_pet_uid_in_offer' using errcode='22023';
  end if;
  if exists (
    select 1
    from unnest(v_pet_uids) as chosen(uid)
    where chosen.uid is null or btrim(chosen.uid) = '' or length(chosen.uid) > 128
  ) then
    raise exception 'invalid_offer' using errcode='22023';
  end if;

  select * into v_session
  from public.pet_trade_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'trade_session_not_found' using errcode='P0002';
  end if;
  if v_user_id not in (v_session.participant_a, v_session.participant_b) then
    raise exception 'not_trade_participant' using errcode='42501';
  end if;
  if v_session.status <> 'active' or v_session.expires_at <= clock_timestamp() then
    raise exception 'trade_session_inactive' using errcode='P0001';
  end if;

  select save_data into v_save
  from public.game_saves
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'game_save_not_found' using errcode='P0002';
  end if;

  select count(*) into v_owned_count
  from unnest(v_pet_uids) as chosen(uid)
  where (
    select count(*)
    from jsonb_array_elements(
      case when jsonb_typeof(v_save->'pets') = 'array' then v_save->'pets' else '[]'::jsonb end
    ) owned(pet)
    where owned.pet->>'uid' = chosen.uid
  ) = 1;

  if v_owned_count <> cardinality(v_pet_uids) then
    raise exception 'pet_not_owned_or_duplicate_uid' using errcode='P0002';
  end if;

  if exists (
    select 1
    from public.pet_sale_tombstones t
    where t.user_id = v_user_id
      and t.pet_uid = any(v_pet_uids)
  ) then
    raise exception 'pet_already_sold' using errcode='P0001';
  end if;

  select coalesce(jsonb_agg(owned.pet order by chosen.ordinality), '[]'::jsonb)
  into v_snapshots
  from unnest(v_pet_uids) with ordinality as chosen(uid, ordinality)
  join lateral jsonb_array_elements(
    case when jsonb_typeof(v_save->'pets') = 'array' then v_save->'pets' else '[]'::jsonb end
  ) as owned(pet)
    on owned.pet->>'uid' = chosen.uid;

  v_existing := case
    when v_user_id = v_session.participant_a then coalesce(v_session.offered_pet_uids_a, '{}'::text[])
    else coalesce(v_session.offered_pet_uids_b, '{}'::text[])
  end;

  if v_existing is distinct from v_pet_uids then
    update public.pet_trade_sessions
    set offered_pet_uids_a = case when v_user_id = participant_a then v_pet_uids else offered_pet_uids_a end,
        offered_pet_uids_b = case when v_user_id = participant_b then v_pet_uids else offered_pet_uids_b end,
        offered_pet_snapshots_a = case when v_user_id = participant_a then v_snapshots else offered_pet_snapshots_a end,
        offered_pet_snapshots_b = case when v_user_id = participant_b then v_snapshots else offered_pet_snapshots_b end,
        offered_pet_uid_a = case when v_user_id = participant_a and cardinality(v_pet_uids) = 1 then v_pet_uids[1]
                                 when v_user_id = participant_a then null else offered_pet_uid_a end,
        offered_pet_uid_b = case when v_user_id = participant_b and cardinality(v_pet_uids) = 1 then v_pet_uids[1]
                                 when v_user_id = participant_b then null else offered_pet_uid_b end,
        offered_pet_snapshot_a = case when v_user_id = participant_a and cardinality(v_pet_uids) = 1 then v_snapshots->0
                                      when v_user_id = participant_a then null else offered_pet_snapshot_a end,
        offered_pet_snapshot_b = case when v_user_id = participant_b and cardinality(v_pet_uids) = 1 then v_snapshots->0
                                      when v_user_id = participant_b then null else offered_pet_snapshot_b end,
        confirmed_a = false,
        confirmed_b = false,
        revision = revision + 1,
        updated_at = clock_timestamp()
    where id = p_session_id
    returning * into v_session;
  end if;

  return v_session;
end;
$function$


revoke all on function public.set_pet_trade_offers(uuid,text[]) from public,anon;
revoke all on function public.set_pet_trade_offer(uuid,text) from public,anon;
revoke all on function public.confirm_pet_trade(uuid,integer) from public,anon;
grant execute on function public.set_pet_trade_offers(uuid,text[]) to authenticated;
grant execute on function public.set_pet_trade_offer(uuid,text) to authenticated;
grant execute on function public.confirm_pet_trade(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
