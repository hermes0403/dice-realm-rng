-- T-0163: rebalance guild level potion rewards.
-- Existing reward events, mailbox entries and player grants are preserved; new values apply only to future level-ups.
create or replace function private.add_guild_xp(p_guild_id uuid, p_amount bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_guild public.guilds%rowtype;
  v_effective_amount bigint;
  v_bonus_count integer := 0;
  v_new_xp bigint;
  v_new_level integer;
  v_level integer;
  v_reward_key text;
  v_reward_type text;
  v_reward_text text;
  v_reward_amount integer;
  v_inserted_guild_id uuid;
  v_member record;
  v_mail_id uuid;
  v_body text;
begin
  if p_guild_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'invalid_guild_xp_award' using errcode = '22023';
  end if;

  select * into v_guild
    from public.guilds
   where id = p_guild_id
   for update;
  if not found then
    raise exception 'guild_not_found' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_bonus_count
    from public.guild_level_reward_events
   where guild_id = p_guild_id
     and reward_key = 'guild_xp_bonus_5'
     and reward_type = 'bonus';
  v_effective_amount := greatest(
    1,
    round(p_amount::numeric * (1 + v_bonus_count * 0.05))::bigint
  );

  v_new_xp := v_guild.xp_total + v_effective_amount;
  v_new_level := private.guild_level_for_xp(v_new_xp);

  update public.guilds
     set xp_total = v_new_xp,
         level = v_new_level
   where id = p_guild_id;

  if v_new_level <= v_guild.level then return; end if;

  for v_level in (v_guild.level + 1)..v_new_level loop
    v_reward_key := '';
    v_reward_type := '';
    v_reward_text := '';
    v_reward_amount := 1;

    case v_level
      when 2 then v_reward_key := 'luck1'; v_reward_type := 'potion'; v_reward_text := '幸運藥水 I ×1';
      when 3 then v_reward_key := 'luck2'; v_reward_type := 'potion'; v_reward_text := '幸運藥水 II ×1';
      when 4 then v_reward_key := 'luck3'; v_reward_type := 'potion'; v_reward_text := '幸運藥水 III ×1';
      when 5 then v_reward_key := 'speed2'; v_reward_type := 'potion'; v_reward_text := '速度藥水 II ×1';
      when 6 then v_reward_key := 'money1'; v_reward_type := 'potion'; v_reward_text := '金錢藥水 I ×1';
      when 7 then v_reward_key := 'luck3'; v_reward_type := 'potion'; v_reward_text := '幸運藥水 III ×2'; v_reward_amount := 2;
      when 8 then v_reward_key := 'angel1'; v_reward_type := 'potion'; v_reward_text := '天堂藥水 I ×1';
      when 9 then v_reward_key := 'name_color'; v_reward_type := 'cosmetic'; v_reward_text := '專屬公會名稱顏色';
      when 10 then v_reward_key := 'angel1'; v_reward_type := 'potion'; v_reward_text := '天堂藥水 I ×1';
      when 11 then v_reward_key := 'guild_xp_bonus_5'; v_reward_type := 'bonus'; v_reward_text := '公會 XP 加成 +5%';
      when 12 then v_reward_key := 'speed2'; v_reward_type := 'potion'; v_reward_text := '速度藥水 II ×5'; v_reward_amount := 5;
      when 13 then v_reward_key := 'guild_xp_bonus_5'; v_reward_type := 'bonus'; v_reward_text := '公會 XP 加成 +5%';
      when 14 then v_reward_key := 'money2'; v_reward_type := 'potion'; v_reward_text := '金錢藥水 II ×1';
      when 15 then v_reward_key := 'badge_effect'; v_reward_type := 'cosmetic'; v_reward_text := '公會徽章特效';
      when 16 then v_reward_key := 'luck3'; v_reward_type := 'potion'; v_reward_text := '幸運藥水 III ×5'; v_reward_amount := 5;
      when 17 then v_reward_key := 'angel1'; v_reward_type := 'potion'; v_reward_text := '天堂藥水 I ×1';
      when 18 then v_reward_key := 'angel1'; v_reward_type := 'potion'; v_reward_text := '天堂藥水 I ×2'; v_reward_amount := 2;
      when 19 then v_reward_key := 'guild_background'; v_reward_type := 'cosmetic'; v_reward_text := '專屬公會背景';
      when 20 then v_reward_key := 'angel2'; v_reward_type := 'potion'; v_reward_text := '天堂藥水 II ×1';
      else raise exception 'guild_level_reward_missing';
    end case;

    insert into public.guild_level_reward_events (
      guild_id, guild_level, reward_key, reward_type, reward_text
    ) values (
      p_guild_id, v_level, v_reward_key, v_reward_type, v_reward_text
    )
    on conflict (guild_id, guild_level) do nothing
    returning guild_id into v_inserted_guild_id;
    if not found then continue; end if;

    for v_member in
      select user_id from public.guild_members
       where guild_id = p_guild_id
       order by joined_at, user_id
    loop
      v_body := format(
        E'你的公會「%s」已升級至 Lv.%s。\n本次升級獎勵：%s。%s',
        v_guild.name,
        v_level,
        v_reward_text,
        case v_reward_type
          when 'potion' then '獎勵已發放至你的藥水庫存。'
          when 'bonus' then '公會 XP 加成已啟用。'
          else '此為公會共享解鎖，所有成員均可使用。'
        end
      );

      insert into public.guild_level_reward_mail (
        guild_id, guild_level, recipient_id, subject, body, reward_text
      ) values (
        p_guild_id, v_level, v_member.user_id,
        format('公會已升級至 Lv.%s！', v_level),
        v_body,
        v_reward_text
      )
      on conflict (guild_id, guild_level, recipient_id) do nothing
      returning id into v_mail_id;

      if found and v_reward_type = 'potion' then
        insert into public.player_grants (user_id)
        values (v_member.user_id)
        on conflict (user_id) do nothing;

        update public.player_grants
           set luck1_total = luck1_total + case when v_reward_key = 'luck1' then v_reward_amount else 0 end,
               luck2_total = luck2_total + case when v_reward_key = 'luck2' then v_reward_amount else 0 end,
               luck3_total = luck3_total + case when v_reward_key = 'luck3' then v_reward_amount else 0 end,
               speed1_total = speed1_total + case when v_reward_key = 'speed1' then v_reward_amount else 0 end,
               speed2_total = speed2_total + case when v_reward_key = 'speed2' then v_reward_amount else 0 end,
               money1_total = money1_total + case when v_reward_key = 'money1' then v_reward_amount else 0 end,
               money2_total = money2_total + case when v_reward_key = 'money2' then v_reward_amount else 0 end,
               angel1_total = angel1_total + case when v_reward_key = 'angel1' then v_reward_amount else 0 end,
               angel2_total = angel2_total + case when v_reward_key = 'angel2' then v_reward_amount else 0 end,
               updated_at = now()
         where user_id = v_member.user_id;
      end if;
    end loop;
  end loop;
end;
$function$;
