-- T-0127: expose only currently-online simulated visitor display names.
-- No AI inventory, roll history, identifiers, or private state is exposed.
create or replace function public.list_public_ai_activity()
returns table (display_name text, online boolean)
language sql
stable
security definer
set search_path = ai_private, pg_temp
as $$
  select p.display_name, (p.active_until is not null and p.active_until > now()) as online
  from ai_players p
  where p.enabled and p.active_until is not null and p.active_until > now()
  order by p.ai_id;
$$;

revoke all on function public.list_public_ai_activity() from public;
grant execute on function public.list_public_ai_activity() to anon, authenticated;
