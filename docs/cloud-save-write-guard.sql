-- T-0094: prevent stale browser clients from writing whole save/profile rows.
-- Game-save writes are routed through authenticated, version-checked RPCs only.

DROP POLICY IF EXISTS "Users can create own save" ON public.game_saves;
DROP POLICY IF EXISTS "Users can update own save" ON public.game_saves;
DROP POLICY IF EXISTS "Users can create own profile" ON public.player_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.player_profiles;

REVOKE INSERT, UPDATE ON TABLE public.game_saves FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE ON TABLE public.player_profiles FROM PUBLIC, anon, authenticated;

-- purchase_glove previously relied on the broad game_saves UPDATE policy.
-- Move the validated transaction behind a narrowly executable definer function.
ALTER FUNCTION public.purchase_glove(text) SECURITY DEFINER;
ALTER FUNCTION public.purchase_glove(text) SET search_path TO 'public', 'pg_temp';
REVOKE ALL ON FUNCTION public.purchase_glove(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_glove(text) TO authenticated;

-- The old full-snapshot RPC is not used by the current client. Disable it for
-- authenticated clients so cached legacy pages cannot submit whole old saves.
REVOKE ALL ON FUNCTION public.sync_player_game_save(timestamptz, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

-- Current clients use the version-checked delta RPC.
REVOKE ALL ON FUNCTION public.sync_player_game_save_delta(timestamptz, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_player_game_save_delta(timestamptz, jsonb, jsonb)
  TO authenticated;

-- Presence must update only last_seen; it must not project stale game stats.
CREATE OR REPLACE FUNCTION public.touch_player_presence()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_rows integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;

  UPDATE public.player_profiles
     SET last_seen = v_now,
         updated_at = v_now
   WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object('updated', v_rows > 0, 'last_seen', v_now);
END;
$function$;

REVOKE ALL ON FUNCTION public.touch_player_presence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_player_presence() TO authenticated;

-- Keep lifetime discovery projections monotonic even if another trusted path
-- submits an older projection. Presence no longer writes these columns.
CREATE OR REPLACE FUNCTION public.prevent_profile_projection_mismatch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_save jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.unique_dice := greatest(coalesce(OLD.unique_dice, 0), coalesce(NEW.unique_dice, 0));
    NEW.rarest_den := greatest(coalesce(OLD.rarest_den, 0), coalesce(NEW.rarest_den, 0));
    NEW.achievement_count := greatest(coalesce(OLD.achievement_count, 0), coalesce(NEW.achievement_count, 0));
    NEW.achievement_reached_at := greatest(OLD.achievement_reached_at, NEW.achievement_reached_at);
  END IF;

  SELECT save_data INTO v_save
    FROM public.game_saves
   WHERE user_id = NEW.user_id;

  IF FOUND THEN
    NEW.total_rolls := greatest(
      coalesce(nullif(v_save->>'rolls', '')::bigint, 0),
      coalesce(NEW.total_rolls, 0),
      CASE WHEN TG_OP = 'UPDATE' THEN coalesce(OLD.total_rolls, 0) ELSE 0 END
    );
    NEW.coins := coalesce(nullif(v_save->>'coins', '')::bigint, 0);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_profile_projection_mismatch ON public.player_profiles;
CREATE TRIGGER trg_prevent_profile_projection_mismatch
BEFORE INSERT OR UPDATE OF total_rolls, coins, unique_dice, rarest_den, achievement_count, achievement_reached_at
ON public.player_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_projection_mismatch();

-- Protect cumulative dice history on every game_saves write. Bag counts are
-- intentionally not forced upward because selling/consuming dice is valid.
CREATE OR REPLACE FUNCTION public.prevent_game_save_roll_regression()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_rolls bigint;
  v_new_rolls bigint;
  v_old_counts jsonb;
  v_new_counts jsonb;
  v_old_first jsonb;
  v_new_first jsonb;
  v_old_best jsonb;
  v_new_best jsonb;
  v_old_discovered jsonb;
  v_new_discovered jsonb;
  v_old_grants jsonb;
  v_new_grants jsonb;
  v_old_capacity bigint;
  v_new_capacity bigint;
  v_old_auto_sold bigint;
  v_new_auto_sold bigint;
  v_old_weather_convert bigint;
  v_new_weather_convert bigint;
  v_old_halloween jsonb;
  v_new_halloween jsonb;
  v_key text;
  v_value jsonb;
  v_old_count bigint;
  v_new_count bigint;
  v_old_time timestamptz;
  v_new_time timestamptz;
  v_old_den bigint;
  v_new_den bigint;
BEGIN
  IF jsonb_typeof(OLD.save_data) IS DISTINCT FROM 'object'
     OR jsonb_typeof(NEW.save_data) IS DISTINCT FROM 'object' THEN
    RETURN NEW;
  END IF;

  v_old_rolls := coalesce(nullif(OLD.save_data->>'rolls', '')::bigint, 0);
  v_new_rolls := coalesce(nullif(NEW.save_data->>'rolls', '')::bigint, 0);
  IF v_new_rolls < v_old_rolls THEN
    -- Reject a stale whole-row save instead of allowing its bag to roll back.
    RETURN NULL;
  END IF;

  v_old_counts := CASE WHEN jsonb_typeof(OLD.save_data->'rollCounts') = 'object'
    THEN OLD.save_data->'rollCounts' ELSE '{}'::jsonb END;
  v_new_counts := CASE WHEN jsonb_typeof(NEW.save_data->'rollCounts') = 'object'
    THEN NEW.save_data->'rollCounts' ELSE '{}'::jsonb END;
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(v_old_counts)
  LOOP
    v_old_count := greatest(0, coalesce((v_value #>> '{}')::bigint, 0));
    v_new_count := greatest(0, coalesce((v_new_counts->>v_key)::bigint, 0));
    IF v_old_count > v_new_count THEN
      v_new_counts := jsonb_set(v_new_counts, ARRAY[v_key], to_jsonb(v_old_count), true);
    END IF;
  END LOOP;
  NEW.save_data := jsonb_set(NEW.save_data, '{rollCounts}', v_new_counts, true);

  v_old_first := CASE WHEN jsonb_typeof(OLD.save_data->'first') = 'object'
    THEN OLD.save_data->'first' ELSE '{}'::jsonb END;
  v_new_first := CASE WHEN jsonb_typeof(NEW.save_data->'first') = 'object'
    THEN NEW.save_data->'first' ELSE '{}'::jsonb END;
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(v_old_first)
  LOOP
    BEGIN
      v_old_time := (v_value #>> '{}')::timestamptz;
      v_new_time := nullif(v_new_first->>v_key, '')::timestamptz;
      IF v_new_time IS NULL OR v_old_time < v_new_time THEN
        v_new_first := jsonb_set(v_new_first, ARRAY[v_key], v_value, true);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      IF NOT (v_new_first ? v_key) THEN
        v_new_first := jsonb_set(v_new_first, ARRAY[v_key], v_value, true);
      END IF;
    END;
  END LOOP;
  NEW.save_data := jsonb_set(NEW.save_data, '{first}', v_new_first, true);

  v_old_best := OLD.save_data->'best';
  v_new_best := NEW.save_data->'best';
  v_old_den := coalesce(nullif(v_old_best->>'den', '')::bigint, 0);
  v_new_den := coalesce(nullif(v_new_best->>'den', '')::bigint, 0);
  IF v_old_den > v_new_den THEN
    NEW.save_data := jsonb_set(NEW.save_data, '{best}', v_old_best, true);
  END IF;

  v_old_discovered := CASE WHEN jsonb_typeof(OLD.save_data->'petDiscovered') = 'object'
    THEN OLD.save_data->'petDiscovered' ELSE '{}'::jsonb END;
  v_new_discovered := CASE WHEN jsonb_typeof(NEW.save_data->'petDiscovered') = 'object'
    THEN NEW.save_data->'petDiscovered' ELSE '{}'::jsonb END;
  NEW.save_data := jsonb_set(
    NEW.save_data, '{petDiscovered}', v_old_discovered || v_new_discovered, true
  );

  v_old_grants := CASE WHEN jsonb_typeof(OLD.save_data->'adminGrantApplied') = 'object'
    THEN OLD.save_data->'adminGrantApplied' ELSE '{}'::jsonb END;
  v_new_grants := CASE WHEN jsonb_typeof(NEW.save_data->'adminGrantApplied') = 'object'
    THEN NEW.save_data->'adminGrantApplied' ELSE '{}'::jsonb END;
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(v_old_grants)
  LOOP
    v_old_count := greatest(0, coalesce((v_value #>> '{}')::bigint, 0));
    v_new_count := greatest(0, coalesce((v_new_grants->>v_key)::bigint, 0));
    IF v_old_count > v_new_count THEN
      v_new_grants := jsonb_set(v_new_grants, ARRAY[v_key], to_jsonb(v_old_count), true);
    END IF;
  END LOOP;
  NEW.save_data := jsonb_set(NEW.save_data, '{adminGrantApplied}', v_new_grants, true);

  v_old_capacity := coalesce(nullif(OLD.save_data->>'bagCapacity', '')::bigint, 0);
  v_new_capacity := coalesce(nullif(NEW.save_data->>'bagCapacity', '')::bigint, 0);
  IF v_old_capacity > v_new_capacity THEN
    NEW.save_data := jsonb_set(NEW.save_data, '{bagCapacity}', to_jsonb(v_old_capacity), true);
  END IF;

  v_old_auto_sold := coalesce(nullif(OLD.save_data->>'autoSold', '')::bigint, 0);
  v_new_auto_sold := coalesce(nullif(NEW.save_data->>'autoSold', '')::bigint, 0);
  IF v_old_auto_sold > v_new_auto_sold THEN
    NEW.save_data := jsonb_set(NEW.save_data, '{autoSold}', to_jsonb(v_old_auto_sold), true);
  END IF;

  v_old_weather_convert := coalesce(nullif(OLD.save_data->>'weatherConvertAt', '')::bigint, 0);
  v_new_weather_convert := coalesce(nullif(NEW.save_data->>'weatherConvertAt', '')::bigint, 0);
  IF v_old_weather_convert > v_new_weather_convert THEN
    NEW.save_data := jsonb_set(NEW.save_data, '{weatherConvertAt}', to_jsonb(v_old_weather_convert), true);
  END IF;

  v_old_halloween := CASE WHEN jsonb_typeof(OLD.save_data->'halloweenUnlocked') = 'object'
    THEN OLD.save_data->'halloweenUnlocked' ELSE '{}'::jsonb END;
  v_new_halloween := CASE WHEN jsonb_typeof(NEW.save_data->'halloweenUnlocked') = 'object'
    THEN NEW.save_data->'halloweenUnlocked' ELSE '{}'::jsonb END;
  NEW.save_data := jsonb_set(
    NEW.save_data,
    '{halloweenUnlocked}',
    jsonb_build_object(
      'd33', coalesce((v_old_halloween->>'d33')::boolean, false) OR coalesce((v_new_halloween->>'d33')::boolean, false),
      'd34', coalesce((v_old_halloween->>'d34')::boolean, false) OR coalesce((v_new_halloween->>'d34')::boolean, false)
    ),
    true
  );

  RETURN NEW;
END;
$function$;
