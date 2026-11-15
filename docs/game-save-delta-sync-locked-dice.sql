-- T-0086: preserve the existing delta-sync RPC and extend its allowlist for dice locks.
-- CREATE OR REPLACE preserves the function's existing ACL and SECURITY DEFINER configuration.
do $$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef('public.sync_player_game_save_delta(timestamptz, jsonb, jsonb)'::regprocedure)
    into v_definition;

  if v_definition is null then
    raise exception 'sync_player_game_save_delta(timestamptz, jsonb, jsonb) is missing';
  end if;

  if position('lockedDice' in v_definition) = 0 then
    v_updated_definition := replace(
      v_definition,
      '''rollCounts'', ''gloves''',
      '''rollCounts'', ''lockedDice'', ''gloves'''
    );

    if v_updated_definition = v_definition then
      raise exception 'Could not locate the expected save-patch allowlist segment';
    end if;

    execute v_updated_definition;
  end if;
end
$$;
