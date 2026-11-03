-- Applied to Supabase project dice-rng on 2026-11-03.
-- Pet sale is an authenticated, atomic transaction. This file records the final schema/function state.

create table if not exists public.pet_sale_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_uid text not null check (char_length(pet_uid) between 1 and 128),
  sold_at timestamptz not null default now(),
  primary key (user_id, pet_uid)
);

alter table public.pet_sale_tombstones enable row level security;
revoke all on table public.pet_sale_tombstones from anon, authenticated;

create or replace function public.filter_sold_pets_from_game_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pets jsonb;
  v_equipped jsonb;
begin
  if jsonb_typeof(new.save_data) <> 'object' then return new; end if;

  if jsonb_typeof(new.save_data -> 'pets') = 'array' then
    select coalesce(jsonb_agg(x.pet order by x.ordinality), '[]'::jsonb)
      into v_pets
    from jsonb_array_elements(new.save_data -> 'pets') with ordinality as x(pet, ordinality)
    where not exists (
      select 1 from public.pet_sale_tombstones t
      where t.user_id = new.user_id
        and t.pet_uid = coalesce(x.pet ->> 'uid', '')
    );
    new.save_data := jsonb_set(new.save_data, '{pets}', v_pets, true);
  end if;

  if jsonb_typeof(new.save_data -> 'equippedPetUids') = 'array' then
    select coalesce(jsonb_agg(to_jsonb(x.uid) order by x.ordinality), '[]'::jsonb)
      into v_equipped
    from jsonb_array_elements_text(new.save_data -> 'equippedPetUids') with ordinality as x(uid, ordinality)
    where not exists (
      select 1 from public.pet_sale_tombstones t
      where t.user_id = new.user_id and t.pet_uid = x.uid
    );
    new.save_data := jsonb_set(new.save_data, '{equippedPetUids}', v_equipped, true);
  end if;
  return new;
end;
$$;

revoke all on function public.filter_sold_pets_from_game_save() from public, anon, authenticated;
drop trigger if exists trg_filter_sold_pets_from_game_save on public.game_saves;
create trigger trg_filter_sold_pets_from_game_save
before insert or update of save_data on public.game_saves
for each row execute function public.filter_sold_pets_from_game_save();

create or replace function public.sell_owned_pets(p_pet_uids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_save jsonb;
  v_pet jsonb;
  v_rarity text;
  v_base_total numeric := 0;
  v_multiplier numeric := 1;
  v_payout numeric := 0;
  v_new_coins numeric := 0;
  v_sold_uids text[] := array[]::text[];
  v_remaining_pets jsonb;
  v_remaining_equipped jsonb;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception '請先登入帳號'; end if;
  if p_pet_uids is null or cardinality(p_pet_uids) < 1 or cardinality(p_pet_uids) > 20
     or exists (select 1 from unnest(p_pet_uids) as requested(uid)
                where requested.uid is null or char_length(requested.uid) < 1 or char_length(requested.uid) > 128) then
    raise exception '出售清單格式錯誤';
  end if;

  select gs.save_data into v_save
  from public.game_saves gs where gs.user_id = v_user_id for update;
  if not found then raise exception '找不到雲端存檔，請重新登入後再試'; end if;

  for v_pet in
    select item.pet
    from jsonb_array_elements(case when jsonb_typeof(v_save -> 'pets') = 'array' then v_save -> 'pets' else '[]'::jsonb end) as item(pet)
    where coalesce(item.pet ->> 'uid', '') = any(p_pet_uids)
  loop
    if not (coalesce(v_pet ->> 'uid', '') = any(v_sold_uids))
       and not exists (select 1 from public.pet_sale_tombstones t where t.user_id = v_user_id and t.pet_uid = v_pet ->> 'uid') then
      -- Pet instances store definition IDs rather than rarity. Keep this map in sync with data/pets.js.
      v_rarity := case
        when v_pet ->> 'id' = 'dumpling_mythic' then 'mythic'
        when left(coalesce(v_pet ->> 'id', ''), 1) = 'c' then 'common'
        when left(coalesce(v_pet ->> 'id', ''), 1) = 'r' then 'rare'
        when left(coalesce(v_pet ->> 'id', ''), 1) = 'l' then 'legendary'
        when left(coalesce(v_pet ->> 'id', ''), 1) = 'm' then 'mythic'
        when left(coalesce(v_pet ->> 'id', ''), 1) = 's' then 'secret'
        else 'common'
      end;
      v_base_total := v_base_total + case v_rarity
        when 'common' then 100
        when 'rare' then 1000
        when 'legendary' then 10000
        when 'mythic' then 50000
        when 'secret' then 100000
        else 100
      end;
      v_sold_uids := array_append(v_sold_uids, v_pet ->> 'uid');
    end if;
  end loop;

  if cardinality(v_sold_uids) = 0 then
    return jsonb_build_object(
      'success', true, 'sold_count', 0, 'coins_added', 0,
      'coins', coalesce((v_save ->> 'coins')::numeric, 0),
      'pets', case when jsonb_typeof(v_save -> 'pets') = 'array' then v_save -> 'pets' else '[]'::jsonb end,
      'equipped_pet_uids', case when jsonb_typeof(v_save -> 'equippedPetUids') = 'array' then v_save -> 'equippedPetUids' else '[]'::jsonb end
    );
  end if;

  select greatest(
    1,
    coalesce((select (a.details ->> 'multiplier')::numeric
      from public.admin_actions a
      where a.action_type = 'coin_boost' and a.details ->> 'scope' = 'all'
        and (a.details ->> 'starts_at')::timestamptz <= v_now
        and (a.details ->> 'expires_at')::timestamptz > v_now
      order by a.created_at desc limit 1), 1),
    coalesce((select (a.details ->> 'multiplier')::numeric
      from public.admin_actions a
      where a.action_type = 'coin_boost' and a.details ->> 'scope' = 'single'
        and a.details ->> 'target_user_id' = v_user_id::text
        and (a.details ->> 'starts_at')::timestamptz <= v_now
        and (a.details ->> 'expires_at')::timestamptz > v_now
      order by a.created_at desc limit 1), 1)
  ) into v_multiplier;

  v_payout := floor(v_base_total * v_multiplier);
  v_new_coins := floor(coalesce((v_save ->> 'coins')::numeric, 0) + v_payout);

  insert into public.pet_sale_tombstones (user_id, pet_uid, sold_at)
  select v_user_id, sold_uid, v_now from unnest(v_sold_uids) as sold(sold_uid)
  on conflict (user_id, pet_uid) do nothing;

  select coalesce(jsonb_agg(x.pet order by x.ordinality), '[]'::jsonb) into v_remaining_pets
  from jsonb_array_elements(case when jsonb_typeof(v_save -> 'pets') = 'array' then v_save -> 'pets' else '[]'::jsonb end)
    with ordinality as x(pet, ordinality)
  where not (coalesce(x.pet ->> 'uid', '') = any(v_sold_uids));

  select coalesce(jsonb_agg(to_jsonb(x.uid) order by x.ordinality), '[]'::jsonb) into v_remaining_equipped
  from jsonb_array_elements_text(case when jsonb_typeof(v_save -> 'equippedPetUids') = 'array' then v_save -> 'equippedPetUids' else '[]'::jsonb end)
    with ordinality as x(uid, ordinality)
  where not (x.uid = any(v_sold_uids));

  update public.game_saves
  set save_data = jsonb_set(
        jsonb_set(jsonb_set(v_save, '{pets}', v_remaining_pets, true), '{equippedPetUids}', v_remaining_equipped, true),
        '{coins}', to_jsonb(v_new_coins), true
      ),
      updated_at = v_now
  where user_id = v_user_id;

  update public.player_profiles
  set coins = least(v_new_coins, 9223372036854775807)::bigint, updated_at = v_now
  where user_id = v_user_id;

  return jsonb_build_object(
    'success', true, 'sold_count', cardinality(v_sold_uids),
    'coins_added', v_payout, 'coins', v_new_coins,
    'pets', v_remaining_pets, 'equipped_pet_uids', v_remaining_equipped
  );
end;
$$;

revoke all on function public.sell_owned_pets(text[]) from public, anon;
grant execute on function public.sell_owned_pets(text[]) to authenticated;
