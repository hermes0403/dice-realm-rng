-- T-0148 follow-up: expose only the public RPC wrapper to authenticated clients.
-- The private implementation remains inaccessible directly through PostgREST.
revoke all on function private.guild_update_member_role(uuid,text) from public, anon, authenticated;

create or replace function public.guild_update_member_role(p_user_id uuid,p_role text)
returns jsonb
language sql
volatile
security definer
set search_path to ''
as $function$
  select private.guild_update_member_role(p_user_id,p_role);
$function$;

revoke all on function public.guild_update_member_role(uuid,text) from public, anon;
grant execute on function public.guild_update_member_role(uuid,text) to authenticated;
