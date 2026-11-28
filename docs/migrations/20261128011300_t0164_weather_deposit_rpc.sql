create or replace function public.deposit_weather_dice(p_dice_id text, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_den integer;
  v_save jsonb;
  v_bag jsonb;
  v_have integer;
  v_left integer;
  v_points bigint;
  v_deposits jsonb;
  v_updated_at timestamptz;
begin
  if v_uid is null then raise exception '請先登入雲端帳號'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then raise exception '投入數量需介於 1 到 1000'; end if;

  v_den := case p_dice_id
    when 'd37' then 500 when 'd38' then 2308 when 'd39' then 9800 when 'd40' then 85500
    when 'd41' then 555 when 'd42' then 5300 when 'd43' then 9150 when 'd44' then 54005
    when 'd45' then 700 when 'd46' then 1480 when 'd47' then 7560 when 'd48' then 35800 when 'd49' then 70500
    when 'd50' then 960 when 'd51' then 1780 when 'd52' then 6223 when 'd53' then 11111
    when 'd54' then 1111 when 'd55' then 2222 when 'd56' then 5555 when 'd57' then 8282
    when 'd60' then 17100 when 'd61' then 15222 when 'd62' then 34321 when 'd63' then 62200
    else null
  end;
  if v_den is null then raise exception '這顆骰子不能用於天氣召喚'; end if;

  select save_data into v_save
  from public.game_saves
  where user_id = v_uid
  for update;

  if v_save is null then raise exception '找不到雲端存檔，請先同步遊戲進度'; end if;
  v_bag := coalesce(v_save->'bag', '{}'::jsonb);
  v_have := greatest(0, coalesce((v_bag->>p_dice_id)::integer, 0));
  if v_have < p_quantity then raise exception '背包中的骰子數量不足'; end if;

  v_left := v_have - p_quantity;
  if v_left > 0 then
    v_bag := jsonb_set(v_bag, array[p_dice_id], to_jsonb(v_left), true);
  else
    v_bag := v_bag - p_dice_id;
  end if;

  update public.game_saves
  set save_data = jsonb_set(v_save, '{bag}', v_bag, true),
      updated_at = clock_timestamp()
  where user_id = v_uid
  returning updated_at into v_updated_at;

  insert into public.realm_weather_contributions(user_id, points, deposits, updated_at)
  values (v_uid, v_den::bigint * p_quantity, jsonb_build_object(p_dice_id, p_quantity), now())
  on conflict (user_id) do update set
    points = public.realm_weather_contributions.points + excluded.points,
    deposits = coalesce(public.realm_weather_contributions.deposits, '{}'::jsonb) ||
      jsonb_build_object(
        p_dice_id,
        coalesce((public.realm_weather_contributions.deposits->>p_dice_id)::integer, 0) + p_quantity
      ),
    updated_at = now()
  returning points, deposits into v_points, v_deposits;

  return jsonb_build_object(
    'points', v_points,
    'deposits', v_deposits,
    'bag', v_bag,
    'dice_id', p_dice_id,
    'quantity', p_quantity,
    'added_points', v_den::bigint * p_quantity,
    'updated_at', v_updated_at
  );
end;
$function$;
