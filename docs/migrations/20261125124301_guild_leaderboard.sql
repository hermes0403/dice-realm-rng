-- T-0131: Public guild leaderboard. Ranking data is server-computed and read-only.
-- Only authenticated callers may invoke the RPC; no member identifiers are returned.

create index if not exists guilds_public_ranking_idx
  on public.guilds (level desc, xp_total desc, created_at asc, id asc)
  where is_public = true;

create or replace function private.guild_get_ranking()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', ranked.rank,
        'name', ranked.name,
        'level', ranked.level,
        'xp_total', ranked.xp_total,
        'member_count', ranked.member_count
      )
      order by ranked.rank
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      row_number() over (
        order by g.level desc, g.xp_total desc, g.created_at asc, g.id asc
      )::integer as rank,
      g.name,
      g.level,
      g.xp_total,
      count(m.user_id)::integer as member_count
    from public.guilds g
    left join public.guild_members m on m.guild_id = g.id
    where g.is_public = true
    group by g.id, g.name, g.level, g.xp_total, g.created_at
  ) ranked;

  return v_result;
end;
$function$;

create or replace function public.guild_get_ranking()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select private.guild_get_ranking();
$function$;

revoke all on function private.guild_get_ranking() from public, anon, authenticated;
grant execute on function private.guild_get_ranking() to authenticated;

revoke all on function public.guild_get_ranking() from public, anon;
grant execute on function public.guild_get_ranking() to authenticated;
