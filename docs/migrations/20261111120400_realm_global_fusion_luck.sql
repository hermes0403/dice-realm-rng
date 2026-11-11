alter table public.realm_global_boost
  add column if not exists fusion_luck_percent numeric not null default 0
    check (fusion_luck_percent >= 0 and fusion_luck_percent <= 500),
  add column if not exists fusion_luck_starts_at timestamptz,
  add column if not exists fusion_luck_ends_at timestamptz,
  add column if not exists fusion_luck_updated_by text;

create or replace function public.admin_set_realm_fusion_luck(
  p_fusion_luck_percent numeric,
  p_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.realm_global_boost%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null
     or lower(coalesce(auth.jwt()->>'email', '')) <> 'toby110403@gmail.com' then
    raise exception '管理員權限不足';
  end if;

  if p_fusion_luck_percent is null
     or p_fusion_luck_percent < 0
     or p_fusion_luck_percent > 500 then
    raise exception '融合運氣需介於 0 至 500%%';
  end if;

  if p_duration_seconds is null
     or p_duration_seconds < 1
     or p_duration_seconds > 604800 then
    raise exception '持續時間需介於 1 至 604800 秒';
  end if;

  update public.realm_global_boost
  set fusion_luck_percent = p_fusion_luck_percent,
      fusion_luck_starts_at = v_now,
      fusion_luck_ends_at = case
        when p_fusion_luck_percent > 0 then v_now + make_interval(secs => p_duration_seconds)
        else v_now
      end,
      fusion_luck_updated_by = left(auth.jwt()->>'email', 120)
  where singleton = true
  returning * into v_row;

  if not found then
    insert into public.realm_global_boost (
      singleton, fusion_luck_percent, fusion_luck_starts_at,
      fusion_luck_ends_at, fusion_luck_updated_by
    )
    values (
      true, p_fusion_luck_percent, v_now,
      case when p_fusion_luck_percent > 0 then v_now + make_interval(secs => p_duration_seconds) else v_now end,
      left(auth.jwt()->>'email', 120)
    )
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'luck_percent', v_row.luck_percent,
    'speed_percent', v_row.speed_percent,
    'starts_at', v_row.starts_at,
    'ends_at', v_row.ends_at,
    'updated_at', v_row.updated_at,
    'fusion_luck_percent', v_row.fusion_luck_percent,
    'fusion_luck_starts_at', v_row.fusion_luck_starts_at,
    'fusion_luck_ends_at', v_row.fusion_luck_ends_at,
    'fusion_luck_updated_by', v_row.fusion_luck_updated_by
  );
end;
$function$;

revoke all on function public.admin_set_realm_fusion_luck(numeric, integer) from public;
revoke all on function public.admin_set_realm_fusion_luck(numeric, integer) from anon;
grant execute on function public.admin_set_realm_fusion_luck(numeric, integer) to authenticated;
