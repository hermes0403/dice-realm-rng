-- T-0026 secure one-pet-for-one-pet exchange.
-- Apply after docs/database/pet-trading.sql.
-- The live Supabase project has these statements tracked as four migrations:
-- pet_trade_offers_atomic_exchange_and_inventory_lock
-- pet_trade_single_active_room_per_player
-- pet_trade_prevent_overlapping_active_rooms
-- pet_trade_offer_snapshot_for_room_display

alter table public.pet_trade_sessions
  add column if not exists offered_pet_uid_a text,
  add column if not exists offered_pet_uid_b text,
  add column if not exists offered_pet_snapshot_a jsonb,
  add column if not exists offered_pet_snapshot_b jsonb,
  add column if not exists confirmed_a boolean not null default false,
  add column if not exists confirmed_b boolean not null default false,
  add column if not exists revision integer not null default 0;

create unique index if not exists pet_trade_one_active_session_a_idx
  on public.pet_trade_sessions(participant_a) where status='active';
create unique index if not exists pet_trade_one_active_session_b_idx
  on public.pet_trade_sessions(participant_b) where status='active';

create or replace function public.set_pet_trade_offer(p_session_id uuid,p_pet_uid text)
returns public.pet_trade_sessions
language plpgsql security definer
set search_path=pg_catalog,public,auth
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_session public.pet_trade_sessions;
  v_save jsonb;
  v_pet jsonb;
  v_existing text;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_session_id is null or p_pet_uid is null or length(p_pet_uid)<1 or length(p_pet_uid)>128 then
    raise exception 'invalid_offer' using errcode='22023';
  end if;
  select * into v_session from public.pet_trade_sessions where id=p_session_id for update;
  if not found then raise exception 'trade_session_not_found' using errcode='P0002'; end if;
  if v_user_id not in (v_session.participant_a,v_session.participant_b) then
    raise exception 'not_trade_participant' using errcode='42501';
  end if;
  if v_session.status<>'active' or v_session.expires_at<=clock_timestamp() then
    raise exception 'trade_session_inactive' using errcode='P0001';
  end if;
  select save_data into v_save from public.game_saves where user_id=v_user_id for update;
  if not found then raise exception 'game_save_not_found' using errcode='P0002'; end if;
  select pet into v_pet
    from jsonb_array_elements(case when jsonb_typeof(v_save->'pets')='array' then v_save->'pets' else '[]'::jsonb end) pet
   where pet->>'uid'=p_pet_uid;
  if v_pet is null then raise exception 'pet_not_owned' using errcode='P0002'; end if;
  if exists(select 1 from public.pet_sale_tombstones where user_id=v_user_id and pet_uid=p_pet_uid) then
    raise exception 'pet_already_sold' using errcode='P0001';
  end if;
  v_existing:=case when v_user_id=v_session.participant_a then v_session.offered_pet_uid_a else v_session.offered_pet_uid_b end;
  if v_existing is distinct from p_pet_uid then
    update public.pet_trade_sessions
       set offered_pet_uid_a=case when v_user_id=participant_a then p_pet_uid else offered_pet_uid_a end,
           offered_pet_uid_b=case when v_user_id=participant_b then p_pet_uid else offered_pet_uid_b end,
           offered_pet_snapshot_a=case when v_user_id=participant_a then v_pet else offered_pet_snapshot_a end,
           offered_pet_snapshot_b=case when v_user_id=participant_b then v_pet else offered_pet_snapshot_b end,
           confirmed_a=false,confirmed_b=false,revision=revision+1,updated_at=clock_timestamp()
     where id=p_session_id returning * into v_session;
  end if;
  return v_session;
end;
$function$;

create or replace function public.confirm_pet_trade(p_session_id uuid)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,auth
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_session public.pet_trade_sessions;
  v_save_a jsonb;
  v_save_b jsonb;
  v_pet_a jsonb;
  v_pet_b jsonb;
  v_pets_a jsonb;
  v_pets_b jsonb;
  v_equipped_a jsonb;
  v_equipped_b jsonb;
  v_discovered_a jsonb;
  v_discovered_b jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='28000'; end if;
  select * into v_session from public.pet_trade_sessions where id=p_session_id for update;
  if not found then raise exception 'trade_session_not_found' using errcode='P0002'; end if;
  if v_user_id not in (v_session.participant_a,v_session.participant_b) then
    raise exception 'not_trade_participant' using errcode='42501';
  end if;
  if v_session.status<>'active' or v_session.expires_at<=clock_timestamp() then
    raise exception 'trade_session_inactive' using errcode='P0001';
  end if;
  if v_session.offered_pet_uid_a is null or v_session.offered_pet_uid_b is null then
    raise exception 'both_players_must_offer_a_pet' using errcode='22023';
  end if;

  update public.pet_trade_sessions
     set confirmed_a=case when v_user_id=participant_a then true else confirmed_a end,
         confirmed_b=case when v_user_id=participant_b then true else confirmed_b end,
         updated_at=clock_timestamp()
   where id=p_session_id returning * into v_session;
  if not (v_session.confirmed_a and v_session.confirmed_b) then
    return jsonb_build_object('success',true,'completed',false,'confirmed_a',v_session.confirmed_a,
      'confirmed_b',v_session.confirmed_b,'revision',v_session.revision);
  end if;

  if v_session.participant_a<v_session.participant_b then
    select save_data into v_save_a from public.game_saves where user_id=v_session.participant_a for update;
    select save_data into v_save_b from public.game_saves where user_id=v_session.participant_b for update;
  else
    select save_data into v_save_b from public.game_saves where user_id=v_session.participant_b for update;
    select save_data into v_save_a from public.game_saves where user_id=v_session.participant_a for update;
  end if;
  if v_save_a is null or v_save_b is null then raise exception 'game_save_not_found' using errcode='P0002'; end if;

  select pet into v_pet_a from jsonb_array_elements(case when jsonb_typeof(v_save_a->'pets')='array' then v_save_a->'pets' else '[]'::jsonb end) pet
   where pet->>'uid'=v_session.offered_pet_uid_a;
  select pet into v_pet_b from jsonb_array_elements(case when jsonb_typeof(v_save_b->'pets')='array' then v_save_b->'pets' else '[]'::jsonb end) pet
   where pet->>'uid'=v_session.offered_pet_uid_b;
  if v_pet_a is null or v_pet_b is null then raise exception 'offered_pet_no_longer_owned' using errcode='P0002'; end if;
  if exists(select 1 from public.pet_sale_tombstones t where
    (t.user_id=v_session.participant_a and t.pet_uid=v_session.offered_pet_uid_a) or
    (t.user_id=v_session.participant_b and t.pet_uid=v_session.offered_pet_uid_b)) then
    raise exception 'offered_pet_unavailable' using errcode='P0001';
  end if;
  if (select count(*) from jsonb_array_elements(case when jsonb_typeof(v_save_a->'pets')='array' then v_save_a->'pets' else '[]'::jsonb end) p where p->>'uid'=v_session.offered_pet_uid_a)<>1
     or (select count(*) from jsonb_array_elements(case when jsonb_typeof(v_save_b->'pets')='array' then v_save_b->'pets' else '[]'::jsonb end) p where p->>'uid'=v_session.offered_pet_uid_b)<>1 then
    raise exception 'duplicate_pet_uid_detected' using errcode='23505';
  end if;

  select coalesce(jsonb_agg(p order by ord),'[]'::jsonb) into v_pets_a
    from jsonb_array_elements(case when jsonb_typeof(v_save_a->'pets')='array' then v_save_a->'pets' else '[]'::jsonb end) with ordinality x(p,ord)
   where p->>'uid'<>v_session.offered_pet_uid_a;
  v_pets_a:=v_pets_a||jsonb_build_array(v_pet_b);
  select coalesce(jsonb_agg(p order by ord),'[]'::jsonb) into v_pets_b
    from jsonb_array_elements(case when jsonb_typeof(v_save_b->'pets')='array' then v_save_b->'pets' else '[]'::jsonb end) with ordinality x(p,ord)
   where p->>'uid'<>v_session.offered_pet_uid_b;
  v_pets_b:=v_pets_b||jsonb_build_array(v_pet_a);

  select coalesce(jsonb_agg(to_jsonb(uid)),'[]'::jsonb) into v_equipped_a
    from jsonb_array_elements_text(case when jsonb_typeof(v_save_a->'equippedPetUids')='array' then v_save_a->'equippedPetUids' else '[]'::jsonb end) uid
   where uid<>v_session.offered_pet_uid_a;
  select coalesce(jsonb_agg(to_jsonb(uid)),'[]'::jsonb) into v_equipped_b
    from jsonb_array_elements_text(case when jsonb_typeof(v_save_b->'equippedPetUids')='array' then v_save_b->'equippedPetUids' else '[]'::jsonb end) uid
   where uid<>v_session.offered_pet_uid_b;
  v_discovered_a:=coalesce(v_save_a->'petDiscovered','{}'::jsonb)||jsonb_build_object(v_pet_b->>'id',true);
  v_discovered_b:=coalesce(v_save_b->'petDiscovered','{}'::jsonb)||jsonb_build_object(v_pet_a->>'id',true);

  update public.pet_trade_sessions set status='completed',updated_at=clock_timestamp() where id=p_session_id;
  update public.game_saves set save_data=jsonb_set(jsonb_set(jsonb_set(v_save_a,'{pets}',v_pets_a,true),
    '{equippedPetUids}',v_equipped_a,true),'{petDiscovered}',v_discovered_a,true),updated_at=clock_timestamp()
   where user_id=v_session.participant_a;
  update public.game_saves set save_data=jsonb_set(jsonb_set(jsonb_set(v_save_b,'{pets}',v_pets_b,true),
    '{equippedPetUids}',v_equipped_b,true),'{petDiscovered}',v_discovered_b,true),updated_at=clock_timestamp()
   where user_id=v_session.participant_b;
  return jsonb_build_object('success',true,'completed',true,'participant_a',v_session.participant_a,'participant_b',v_session.participant_b);
end;
$function$;

create or replace function public.prevent_pet_inventory_overwrite_during_trade()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public
as $function$
begin
  if (new.save_data->'pets' is distinct from old.save_data->'pets'
      or new.save_data->'equippedPetUids' is distinct from old.save_data->'equippedPetUids')
     and exists(select 1 from public.pet_trade_sessions s where s.status='active'
       and s.expires_at>clock_timestamp() and (s.participant_a=new.user_id or s.participant_b=new.user_id)) then
    raise exception 'pet_inventory_locked_by_trade' using errcode='55P03';
  end if;
  return new;
end;
$function$;

create or replace function public.enforce_one_active_pet_trade_per_player()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public
as $function$
begin
  if new.status='active' then
    perform pg_advisory_xact_lock(hashtextextended(least(new.participant_a::text,new.participant_b::text),26028));
    perform pg_advisory_xact_lock(hashtextextended(greatest(new.participant_a::text,new.participant_b::text),26028));
    if exists(select 1 from public.pet_trade_sessions s where s.status='active' and s.id is distinct from new.id
      and (s.participant_a in (new.participant_a,new.participant_b) or s.participant_b in (new.participant_a,new.participant_b)) then
      raise exception 'player_already_has_active_trade' using errcode='23505';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_pet_inventory_during_trade on public.game_saves;
create trigger protect_pet_inventory_during_trade before update of save_data on public.game_saves
for each row execute function public.prevent_pet_inventory_overwrite_during_trade();
drop trigger if exists enforce_one_active_pet_trade_per_player on public.pet_trade_sessions;
create trigger enforce_one_active_pet_trade_per_player before insert or update of status,participant_a,participant_b
on public.pet_trade_sessions for each row execute function public.enforce_one_active_pet_trade_per_player();

revoke all on function public.set_pet_trade_offer(uuid,text) from public,anon;
revoke all on function public.confirm_pet_trade(uuid) from public,anon;
revoke all on function public.prevent_pet_inventory_overwrite_during_trade() from public,anon,authenticated;
revoke all on function public.enforce_one_active_pet_trade_per_player() from public,anon,authenticated;
grant execute on function public.set_pet_trade_offer(uuid,text) to authenticated;
grant execute on function public.confirm_pet_trade(uuid) to authenticated;
