-- T-0166: server-authoritative three-second pet trade countdown.
ALTER TABLE public.pet_trade_sessions
  ADD COLUMN IF NOT EXISTS ready_at_a timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at_b timestamptz,
  ADD COLUMN IF NOT EXISTS countdown_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS countdown_revision integer,
  ADD COLUMN IF NOT EXISTS ready_lease_until_a timestamptz,
  ADD COLUMN IF NOT EXISTS ready_lease_until_b timestamptz;

CREATE OR REPLACE FUNCTION public.set_pet_trade_ready(p_session_id uuid, p_expected_revision integer, p_ready boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v_user_id uuid := auth.uid(); v_session public.pet_trade_sessions;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING errcode='28000'; END IF;
  IF p_session_id IS NULL OR p_ready IS NULL THEN RAISE EXCEPTION 'invalid_trade_ready_request' USING errcode='22023'; END IF;
  SELECT * INTO v_session FROM public.pet_trade_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trade_session_not_found' USING errcode='P0002'; END IF;
  IF v_user_id NOT IN (v_session.participant_a,v_session.participant_b) THEN RAISE EXCEPTION 'not_trade_participant' USING errcode='42501'; END IF;
  IF v_session.status<>'active' OR v_session.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'trade_session_inactive' USING errcode='P0001'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<>v_session.revision THEN RAISE EXCEPTION 'trade_offer_changed_reload' USING errcode='40001'; END IF;
  IF cardinality(coalesce(v_session.offered_pet_uids_a,'{}'::text[]))<1 OR cardinality(coalesce(v_session.offered_pet_uids_b,'{}'::text[]))<1 THEN
    RAISE EXCEPTION 'both_players_must_offer_pets' USING errcode='22023';
  END IF;
  IF NOT p_ready THEN
    UPDATE public.pet_trade_sessions
    SET confirmed_a=CASE WHEN v_user_id=participant_a THEN false ELSE confirmed_a END,
        confirmed_b=CASE WHEN v_user_id=participant_b THEN false ELSE confirmed_b END,
        ready_at_a=CASE WHEN v_user_id=participant_a THEN NULL ELSE ready_at_a END,
        ready_at_b=CASE WHEN v_user_id=participant_b THEN NULL ELSE ready_at_b END,
        countdown_started_at=NULL,countdown_revision=NULL,
        ready_lease_until_a=NULL,ready_lease_until_b=NULL,updated_at=clock_timestamp()
    WHERE id=p_session_id RETURNING * INTO v_session;
    RETURN jsonb_build_object('success',true,'ready',false,'confirmed_a',v_session.confirmed_a,
      'confirmed_b',v_session.confirmed_b,'countdown_started_at',NULL,'countdown_revision',NULL,'revision',v_session.revision);
  END IF;
  UPDATE public.pet_trade_sessions
  SET confirmed_a=CASE WHEN v_user_id=participant_a THEN true ELSE confirmed_a END,
      confirmed_b=CASE WHEN v_user_id=participant_b THEN true ELSE confirmed_b END,
      ready_at_a=CASE WHEN v_user_id=participant_a THEN coalesce(ready_at_a,clock_timestamp()) ELSE ready_at_a END,
      ready_at_b=CASE WHEN v_user_id=participant_b THEN coalesce(ready_at_b,clock_timestamp()) ELSE ready_at_b END,
      updated_at=clock_timestamp()
  WHERE id=p_session_id RETURNING * INTO v_session;
  IF v_session.confirmed_a AND v_session.confirmed_b AND v_session.countdown_started_at IS NULL THEN
    UPDATE public.pet_trade_sessions
    SET countdown_started_at=clock_timestamp(),countdown_revision=revision,
        ready_lease_until_a=clock_timestamp()+interval '2 seconds',
        ready_lease_until_b=clock_timestamp()+interval '2 seconds',updated_at=clock_timestamp()
    WHERE id=p_session_id RETURNING * INTO v_session;
  END IF;
  RETURN jsonb_build_object('success',true,'ready',true,'confirmed_a',v_session.confirmed_a,
    'confirmed_b',v_session.confirmed_b,'countdown_started_at',v_session.countdown_started_at,
    'countdown_revision',v_session.countdown_revision,'ready_lease_until_a',v_session.ready_lease_until_a,
    'ready_lease_until_b',v_session.ready_lease_until_b,'revision',v_session.revision);
END;
$function$;

CREATE OR REPLACE FUNCTION public.heartbeat_pet_trade_ready(p_session_id uuid,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth'
AS $function$
DECLARE v_user_id uuid:=auth.uid(); v_session public.pet_trade_sessions; v_lease_until timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING errcode='28000'; END IF;
  SELECT * INTO v_session FROM public.pet_trade_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trade_session_not_found' USING errcode='P0002'; END IF;
  IF v_user_id NOT IN (v_session.participant_a,v_session.participant_b) THEN RAISE EXCEPTION 'not_trade_participant' USING errcode='42501'; END IF;
  IF v_session.status<>'active' OR v_session.expires_at<=clock_timestamp()
     OR p_expected_revision IS NULL OR p_expected_revision<>v_session.revision
     OR v_session.countdown_revision IS DISTINCT FROM v_session.revision
     OR v_session.countdown_started_at IS NULL
     OR NOT(v_session.confirmed_a AND v_session.confirmed_b) THEN
    RAISE EXCEPTION 'trade_countdown_not_active' USING errcode='P0001';
  END IF;
  v_lease_until:=clock_timestamp()+interval '2 seconds';
  UPDATE public.pet_trade_sessions
  SET ready_lease_until_a=CASE WHEN v_user_id=participant_a THEN v_lease_until ELSE ready_lease_until_a END,
      ready_lease_until_b=CASE WHEN v_user_id=participant_b THEN v_lease_until ELSE ready_lease_until_b END,
      updated_at=clock_timestamp()
  WHERE id=p_session_id;
  RETURN jsonb_build_object('success',true,'lease_until',v_lease_until,'revision',v_session.revision);
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_pet_trade(p_session_id uuid, p_expected_revision integer)
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
  if p_expected_revision is null or p_expected_revision <> v_session.revision then
    raise exception 'trade_offer_changed_reload' using errcode='40001';
  end if;
  if v_session.status = 'completed' then
    return jsonb_build_object('success', true, 'completed', true, 'already_completed', true);
  end if;
  if v_session.status <> 'active' or v_session.expires_at <= clock_timestamp() then
    raise exception 'trade_session_inactive' using errcode='P0001';
  end if;
  if not (v_session.confirmed_a and v_session.confirmed_b)
     or v_session.countdown_started_at is null
     or v_session.countdown_revision is distinct from v_session.revision then
    raise exception 'trade_countdown_not_ready' using errcode='P0001';
  end if;
  if v_session.countdown_started_at + interval '3 seconds' > clock_timestamp() then
    raise exception 'trade_countdown_incomplete' using errcode='P0001';
  end if;
  if v_session.ready_lease_until_a is null or v_session.ready_lease_until_b is null
     or v_session.ready_lease_until_a <= clock_timestamp()
     or v_session.ready_lease_until_b <= clock_timestamp() then
    raise exception 'trade_connection_expired' using errcode='P0001';
  end if;

  v_uids_a := coalesce(v_session.offered_pet_uids_a, '{}'::text[]);
  v_uids_b := coalesce(v_session.offered_pet_uids_b, '{}'::text[]);

  if cardinality(v_uids_a) < 1 or cardinality(v_uids_b) < 1 then
    raise exception 'both_players_must_offer_pets' using errcode='22023';
  end if;
  if cardinality(v_uids_a) > 4 or cardinality(v_uids_b) > 4 then
    raise exception 'trade_offer_limit_exceeded' using errcode='22023';
  end if;

  -- Ready state and countdown are validated above; this RPC only finalizes.

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

  -- Recheck the lease after acquiring both save locks and validating ownership.
  -- A slow lock wait must not let an expired connection lease complete the trade.
  if v_session.status <> 'active'
     or v_session.expires_at <= clock_timestamp()
     or v_session.revision <> p_expected_revision
     or v_session.countdown_revision is distinct from v_session.revision
     or not (v_session.confirmed_a and v_session.confirmed_b)
     or v_session.countdown_started_at + interval '3 seconds' > clock_timestamp()
     or v_session.ready_lease_until_a <= clock_timestamp()
     or v_session.ready_lease_until_b <= clock_timestamp() then
    raise exception 'trade_countdown_invalidated' using errcode='P0001';
  end if;

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


CREATE OR REPLACE FUNCTION public.confirm_pet_trade(p_session_id uuid,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth'
AS $function$
BEGIN
  -- Old cached clients can only set ready; this function no longer exchanges assets.
  RETURN public.set_pet_trade_ready(p_session_id,p_expected_revision,true);
END;
$function$;

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
        ready_at_a = null,
        ready_at_b = null,
        countdown_started_at = null,
        countdown_revision = null,
        ready_lease_until_a = null,
        ready_lease_until_b = null,
        revision = revision + 1,
        updated_at = clock_timestamp()
    where id = p_session_id
    returning * into v_session;
  end if;

  return v_session;
end;
$function$


CREATE OR REPLACE FUNCTION public.cancel_pet_trade_session(p_session_id uuid)
 RETURNS pet_trade_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.pet_trade_sessions;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_session_id is null then
    raise exception 'invalid_session' using errcode = '22023';
  end if;

  select *
    into v_session
    from public.pet_trade_sessions
   where id = p_session_id
   for update;

  if not found then
    raise exception 'trade_session_not_found' using errcode = 'P0002';
  end if;

  if v_user_id not in (v_session.participant_a, v_session.participant_b) then
    raise exception 'not_trade_participant' using errcode = '42501';
  end if;

  if v_session.status <> 'active' then
    return v_session;
  end if;

  if v_session.expires_at <= clock_timestamp() then
    update public.pet_trade_sessions
       set status = 'expired',
           confirmed_a = false,
           confirmed_b = false,
           ready_at_a = null,
           ready_at_b = null,
           countdown_started_at = null,
           countdown_revision = null,
           ready_lease_until_a = null,
           ready_lease_until_b = null,
           updated_at = clock_timestamp()
     where id = p_session_id
     returning * into v_session;
  else
    update public.pet_trade_sessions
       set status = 'cancelled',
           confirmed_a = false,
           confirmed_b = false,
           ready_at_a = null,
           ready_at_b = null,
           countdown_started_at = null,
           countdown_revision = null,
           ready_lease_until_a = null,
           ready_lease_until_b = null,
           updated_at = clock_timestamp()
     where id = p_session_id
     returning * into v_session;
  end if;

  return v_session;
end;
$function$


REVOKE ALL ON FUNCTION public.set_pet_trade_ready(uuid,integer,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.heartbeat_pet_trade_ready(uuid,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.finalize_pet_trade(uuid,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.confirm_pet_trade(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_pet_trade_ready(uuid,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_pet_trade_ready(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pet_trade(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pet_trade(uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.set_pet_trade_offers(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_pet_trade_offers(uuid,text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_pet_trade_session(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_pet_trade_session(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
