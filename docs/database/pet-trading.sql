-- Dice Realm pet-trading invitation/session baseline.
-- Rebuild/reference script for a fresh environment. The live project changes
-- were applied via Supabase migrations; this file is documentation and is NOT
-- stored under supabase/ or automatically executed by the app.
-- Requires public.player_profiles(user_id) and Supabase auth.users/auth.uid().

create table if not exists public.pet_trade_invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','cancelled','expired')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '2 minutes'),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists pet_trade_invitations_recipient_pending_idx
  on public.pet_trade_invitations (recipient_id, created_at desc)
  where status = 'pending';
create index if not exists pet_trade_invitations_sender_pending_idx
  on public.pet_trade_invitations (sender_id, created_at desc)
  where status = 'pending';
create unique index if not exists pet_trade_invitations_one_pending_pair_idx
  on public.pet_trade_invitations (sender_id, recipient_id)
  where status = 'pending';

alter table public.pet_trade_invitations enable row level security;
drop policy if exists "participants can read their pet trade invitations" on public.pet_trade_invitations;
create policy "participants can read their pet trade invitations"
  on public.pet_trade_invitations for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
revoke all on public.pet_trade_invitations from anon, authenticated;

create table if not exists public.pet_trade_sessions (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique
    references public.pet_trade_invitations(id) on delete cascade,
  participant_a uuid not null references auth.users(id) on delete cascade,
  participant_b uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','cancelled','expired','completed')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '15 minutes'),
  updated_at timestamptz not null default clock_timestamp(),
  check (participant_a <> participant_b)
);

create index if not exists pet_trade_sessions_participant_a_active_idx
  on public.pet_trade_sessions (participant_a, status, expires_at);
create index if not exists pet_trade_sessions_participant_b_active_idx
  on public.pet_trade_sessions (participant_b, status, expires_at);

alter table public.pet_trade_sessions enable row level security;
drop policy if exists "Trade participants can read their sessions" on public.pet_trade_sessions;
create policy "Trade participants can read their sessions"
  on public.pet_trade_sessions for select to authenticated
  using (auth.uid() = participant_a or auth.uid() = participant_b);
revoke all on public.pet_trade_sessions from anon, authenticated;
grant select on public.pet_trade_invitations, public.pet_trade_sessions to authenticated;

create or replace function public.create_pet_trade_invitation(p_recipient_id uuid)
returns public.pet_trade_invitations
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_sender_id uuid := auth.uid();
  v_invitation public.pet_trade_invitations;
  v_recent_count integer;
  v_pair_key text;
begin
  if v_sender_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_recipient_id is null or p_recipient_id = v_sender_id then
    raise exception 'invalid_recipient' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_sender_id::text, 26026));
  v_pair_key := least(v_sender_id::text, p_recipient_id::text)
             || ':' || greatest(v_sender_id::text, p_recipient_id::text);
  perform pg_advisory_xact_lock(hashtextextended(v_pair_key, 26027));

  if not exists (select 1 from public.player_profiles p where p.user_id = p_recipient_id) then
    raise exception 'recipient_not_found' using errcode = 'P0002';
  end if;

  update public.pet_trade_invitations
     set status = 'expired', responded_at = clock_timestamp()
   where status = 'pending' and expires_at <= clock_timestamp()
     and (sender_id = v_sender_id or recipient_id = v_sender_id);

  select count(*) into v_recent_count
    from public.pet_trade_invitations
   where sender_id = v_sender_id
     and created_at > clock_timestamp() - interval '10 minutes';
  if v_recent_count >= 10 then
    raise exception 'invitation_rate_limited' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.pet_trade_invitations
     where status = 'pending'
       and ((sender_id = v_sender_id and recipient_id = p_recipient_id)
         or (sender_id = p_recipient_id and recipient_id = v_sender_id))
  ) then
    raise exception 'pending_invitation_exists' using errcode = '23505';
  end if;

  insert into public.pet_trade_invitations(sender_id, recipient_id)
  values (v_sender_id, p_recipient_id)
  returning * into v_invitation;
  return v_invitation;
end;
$function$;

create or replace function public.respond_pet_trade_invitation(
  p_invitation_id uuid,
  p_action text
)
returns public.pet_trade_invitations
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_invitation public.pet_trade_invitations;
  v_next_status text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_action is null or p_action not in ('accept','reject','cancel') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  select * into v_invitation
    from public.pet_trade_invitations
   where id = p_invitation_id
   for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  if v_user_id not in (v_invitation.sender_id, v_invitation.recipient_id) then
    raise exception 'not_invitation_participant' using errcode = '42501';
  end if;
  if p_action in ('accept','reject') then
    if v_user_id <> v_invitation.recipient_id then
      raise exception 'only_recipient_can_respond' using errcode = '42501';
    end if;
  elsif v_user_id <> v_invitation.sender_id then
    raise exception 'only_sender_can_cancel' using errcode = '42501';
  end if;

  if v_invitation.status <> 'pending' then
    return v_invitation;
  end if;
  if v_invitation.expires_at <= clock_timestamp() then
    update public.pet_trade_invitations
       set status = 'expired', responded_at = clock_timestamp()
     where id = p_invitation_id
     returning * into v_invitation;
    return v_invitation;
  end if;

  v_next_status := case p_action
    when 'accept' then 'accepted'
    when 'reject' then 'rejected'
    else 'cancelled'
  end;

  update public.pet_trade_invitations
     set status = v_next_status, responded_at = clock_timestamp()
   where id = p_invitation_id
   returning * into v_invitation;

  if v_next_status = 'accepted' then
    insert into public.pet_trade_sessions(invitation_id, participant_a, participant_b)
    values (v_invitation.id, v_invitation.sender_id, v_invitation.recipient_id)
    on conflict (invitation_id) do nothing;
  end if;
  return v_invitation;
end;
$function$;

create or replace function public.cancel_pet_trade_session(p_session_id uuid)
returns public.pet_trade_sessions
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
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

  select * into v_session
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
       set status = 'expired', updated_at = clock_timestamp()
     where id = p_session_id
     returning * into v_session;
  else
    update public.pet_trade_sessions
       set status = 'cancelled', updated_at = clock_timestamp()
     where id = p_session_id
     returning * into v_session;
  end if;
  return v_session;
end;
$function$;

revoke all on function public.create_pet_trade_invitation(uuid) from public, anon;
revoke all on function public.respond_pet_trade_invitation(uuid, text) from public, anon;
revoke all on function public.cancel_pet_trade_session(uuid) from public, anon;
grant execute on function public.create_pet_trade_invitation(uuid) to authenticated;
grant execute on function public.respond_pet_trade_invitation(uuid, text) to authenticated;
grant execute on function public.cancel_pet_trade_session(uuid) to authenticated;

do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'pet_trade_invitations'
  ) then
    alter publication supabase_realtime add table public.pet_trade_invitations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'pet_trade_sessions'
  ) then
    alter publication supabase_realtime add table public.pet_trade_sessions;
  end if;
end;
$publication$;
