-- T-0105: private username mapping and server-side auth rate limiting.
-- This file intentionally excludes player UID seed rows; those are applied
-- separately to the project database and are not published in this repository.

create table if not exists public.player_login_names (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_normalized text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_login_names_username_length
    check (char_length(username) between 3 and 20),
  constraint player_login_names_username_no_space
    check (username !~ '[[:space:]]'),
  constraint player_login_names_normalized_lowercase
    check (username_normalized = lower(username_normalized))
);

create table if not exists public.player_auth_rate_limits (
  action text not null check (action in ('username_login', 'username_register')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  primary key (action, key_hash)
);

alter table public.player_login_names enable row level security;
alter table public.player_auth_rate_limits enable row level security;

revoke all on table public.player_login_names from public, anon, authenticated;
revoke all on table public.player_auth_rate_limits from public, anon, authenticated;
grant all on table public.player_login_names to service_role;
grant all on table public.player_auth_rate_limits to service_role;

create or replace function public.consume_player_auth_rate_limit(
  p_action text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
begin
  if p_action not in ('username_login', 'username_register')
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 100
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid player auth rate limit request'
      using errcode = '22023';
  end if;

  insert into public.player_auth_rate_limits as existing_limit
    (action, key_hash, window_started_at, attempts)
  values
    (p_action, p_key_hash, v_now, 1)
  on conflict (action, key_hash) do update
    set window_started_at = case
      when existing_limit.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then v_now
      else existing_limit.window_started_at
    end,
    attempts = case
      when existing_limit.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then 1
      else existing_limit.attempts + 1
    end
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$function$;

revoke all on function public.consume_player_auth_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_player_auth_rate_limit(text, text, integer, integer)
  to service_role;

comment on table public.player_login_names is
  'Private username-to-existing-Supabase-Auth-UID mapping; service role only.';
comment on table public.player_auth_rate_limits is
  'Hashed-IP rate limit buckets for public username login and registration endpoints.';
