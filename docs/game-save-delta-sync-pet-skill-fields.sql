-- T-0094 follow-up: allow all pet-skill fields emitted by services/cloud-save.js.
-- CREATE OR REPLACE preserves the existing function ACL and SECURITY DEFINER settings.
DO $$
DECLARE
  v_definition text;
  v_updated_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.sync_player_game_save_delta(timestamptz, jsonb, jsonb)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'sync_player_game_save_delta(timestamptz, jsonb, jsonb) is missing';
  END IF;

  IF position('''petSkillLogin''' in v_definition) = 0
     OR position('''petSkillSpeed''' in v_definition) = 0 THEN
    v_updated_definition := replace(
      v_definition,
      '''petDiscovered'', ''petSkillLuckCharges'', ''petSkillDaily'',',
      '''petDiscovered'', ''petSkillLuckCharges'', ''petSkillDaily'', ''petSkillLogin'', ''petSkillSpeed'','
    );

    IF v_updated_definition = v_definition THEN
      RAISE EXCEPTION 'Could not locate the expected pet skill save-patch allowlist segment';
    END IF;

    EXECUTE v_updated_definition;
  END IF;
END
$$;
