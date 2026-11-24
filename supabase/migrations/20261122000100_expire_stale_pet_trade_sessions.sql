-- Expired trade sessions must not block a new trade between the same players.
-- Close stale rows once, then make the guard ignore any expired active row that
-- may be left behind by an interrupted client or an older deployment.
update public.pet_trade_sessions
   set status = 'expired',
       updated_at = clock_timestamp()
 where status = 'active'
   and expires_at <= clock_timestamp();

create or replace function public.enforce_one_active_pet_trade_per_player()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.status = 'active' then
    perform pg_advisory_xact_lock(hashtextextended(least(new.participant_a::text, new.participant_b::text), 26028));
    perform pg_advisory_xact_lock(hashtextextended(greatest(new.participant_a::text, new.participant_b::text), 26028));

    if exists (
      select 1
        from public.pet_trade_sessions s
       where s.status = 'active'
         and s.expires_at > clock_timestamp()
         and s.id is distinct from new.id
         and (
           s.participant_a in (new.participant_a, new.participant_b)
           or s.participant_b in (new.participant_a, new.participant_b)
         )
    ) then
      raise exception 'player_already_has_active_trade' using errcode = '23505';
    end if;
  end if;

  return new;
end;
$function$;
