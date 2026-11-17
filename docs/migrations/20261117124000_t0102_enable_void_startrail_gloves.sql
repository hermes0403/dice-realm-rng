-- T-0102: Enable server-authoritative purchases for the two new gloves.
-- Existing g1-g6 prices and transaction behavior remain unchanged.
CREATE OR REPLACE FUNCTION public.purchase_glove(p_glove_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_price bigint;
  v_save jsonb;
  v_coins bigint;
  v_gloves jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  v_price := CASE p_glove_id
    WHEN 'g1' THEN 100000
    WHEN 'g2' THEN 2000000
    WHEN 'g3' THEN 15000000
    WHEN 'g4' THEN 60000000
    WHEN 'g5' THEN 250000000
    WHEN 'g6' THEN 1000000000
    WHEN 'g8' THEN 5000000000
    WHEN 'g9' THEN 18000000000
    ELSE NULL
  END;

  IF v_price IS NULL THEN
    RAISE EXCEPTION '無效的手套商品';
  END IF;

  -- Atomic conditional update: the row lock serializes simultaneous purchases.
  UPDATE public.game_saves
     SET save_data = pg_catalog.jsonb_set(
       pg_catalog.jsonb_set(
         pg_catalog.jsonb_set(
           coalesce(save_data, '{}'::jsonb),
           '{coins}',
           pg_catalog.to_jsonb(
             coalesce(nullif(save_data->>'coins', '')::bigint, 0) - v_price
           ),
           true
         ),
         '{gloves}',
         (CASE
            WHEN pg_catalog.jsonb_typeof(save_data->'gloves') = 'object'
              THEN save_data->'gloves'
            ELSE '{}'::jsonb
          END) || pg_catalog.jsonb_build_object(p_glove_id, 1),
         true
       ),
       '{equipped}',
       pg_catalog.to_jsonb(p_glove_id),
       true
     ),
     updated_at = pg_catalog.now()
   WHERE user_id = v_user_id
     AND coalesce(nullif(save_data->>'coins', '')::bigint, 0) >= v_price
     AND coalesce(nullif(save_data->'gloves'->>p_glove_id, '')::integer, 0) <= 0;

  IF NOT FOUND THEN
    SELECT save_data
      INTO v_save
      FROM public.game_saves
     WHERE user_id = v_user_id;
    IF v_save IS NULL THEN
      RAISE EXCEPTION '找不到雲端存檔，請重新登入';
    END IF;
    IF coalesce(nullif(v_save->'gloves'->>p_glove_id, '')::integer, 0) > 0 THEN
      RAISE EXCEPTION '這副手套已經購買';
    END IF;
    RAISE EXCEPTION '金幣不足，請重新整理後再試';
  END IF;

  SELECT save_data
    INTO v_save
    FROM public.game_saves
   WHERE user_id = v_user_id
   FOR UPDATE;

  v_coins := coalesce(nullif(v_save->>'coins', '')::bigint, 0);
  v_gloves := CASE
    WHEN pg_catalog.jsonb_typeof(v_save->'gloves') = 'object' THEN v_save->'gloves'
    ELSE '{}'::jsonb
  END;

  UPDATE public.player_profiles
     SET coins = v_coins,
         updated_at = pg_catalog.now()
   WHERE user_id = v_user_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'coins', v_coins,
    'gloves', v_gloves,
    'equipped', v_save->>'equipped'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purchase_glove(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_glove(text) TO authenticated, service_role;
