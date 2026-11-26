-- Allow authenticated guild members to browse public guilds.
-- Joining a second guild remains blocked by private.guild_apply.
create or replace function private.guild_search(p_query text default '', p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 30 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_result
  from (
    select g.id, g.name, g.description, g.join_mode,
      count(m.user_id)::integer as member_count,
      coalesce(pp.username, '未知玩家') as leader_name
    from public.guilds g
    left join public.guild_members m on m.guild_id = g.id
    left join public.guild_members lm on lm.guild_id = g.id and lm.role = 'leader'
    left join public.player_profiles pp on pp.user_id = lm.user_id
    where g.is_public
      and (coalesce(btrim(p_query),'') = '' or position(lower(btrim(p_query)) in lower(g.name)) > 0)
    group by g.id, pp.username
    order by count(m.user_id) desc, g.created_at desc
    limit p_limit
  ) q;
  return v_result;
end;
$function$;

-- Preserve the existing authenticated-only execution boundary.
revoke all on function private.guild_search(text,integer) from public, anon;
grant execute on function private.guild_search(text,integer) to authenticated;
