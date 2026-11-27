-- T-0147: restrict current guild cosmetic unlocks to their intended initial options.
-- Remaining cosmetic IDs stay in the UI/CSS for future level rewards, but cannot be selected yet.

alter table public.guilds
  drop constraint if exists guilds_name_color_check,
  drop constraint if exists guilds_badge_effect_check,
  drop constraint if exists guilds_background_theme_check;

alter table public.guilds
  add constraint guilds_name_color_check
    check (name_color in ('default', 'nebula', 'ice')),
  add constraint guilds_badge_effect_check
    check (badge_effect in ('none', 'orbit')),
  add constraint guilds_background_theme_check
    check (background_theme in ('default', 'aurora'));

create or replace function private.guild_update_cosmetics(
  p_name_color text,
  p_badge_effect text,
  p_background_theme text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_role text;
  v_name_color text := coalesce(p_name_color, 'default');
  v_badge_effect text := coalesce(p_badge_effect, 'none');
  v_background_theme text := coalesce(p_background_theme, 'default');
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select gm.guild_id, gm.role
    into v_guild_id, v_role
  from public.guild_members gm
  where gm.user_id = v_uid;

  if v_guild_id is null or v_role not in ('leader','vice_leader') then
    raise exception 'guild_cosmetics_permission_denied' using errcode = '42501';
  end if;

  perform 1
    from public.guilds g
   where g.id = v_guild_id
   for update;
  if not found then
    raise exception 'guild_not_found' using errcode = 'P0002';
  end if;

  if v_name_color not in ('default','nebula','ice') then
    raise exception 'guild_name_color_invalid' using errcode = '22023';
  end if;
  if v_badge_effect not in ('none','orbit') then
    raise exception 'guild_badge_effect_invalid' using errcode = '22023';
  end if;
  if v_background_theme not in ('default','aurora') then
    raise exception 'guild_background_invalid' using errcode = '22023';
  end if;

  if v_name_color <> 'default' and not exists (
    select 1 from public.guild_level_reward_events e
    where e.guild_id = v_guild_id
      and e.reward_key = 'name_color'
      and e.reward_type = 'cosmetic'
  ) then
    raise exception 'guild_name_color_locked' using errcode = '42501';
  end if;

  if v_badge_effect <> 'none' and not exists (
    select 1 from public.guild_level_reward_events e
    where e.guild_id = v_guild_id
      and e.reward_key = 'badge_effect'
      and e.reward_type = 'cosmetic'
  ) then
    raise exception 'guild_badge_effect_locked' using errcode = '42501';
  end if;

  if v_background_theme <> 'default' and not exists (
    select 1 from public.guild_level_reward_events e
    where e.guild_id = v_guild_id
      and e.reward_key = 'guild_background'
      and e.reward_type = 'cosmetic'
  ) then
    raise exception 'guild_background_locked' using errcode = '42501';
  end if;

  update public.guilds
     set name_color = v_name_color,
         badge_effect = v_badge_effect,
         background_theme = v_background_theme
   where id = v_guild_id;

  return jsonb_build_object(
    'name_color', v_name_color,
    'badge_effect', v_badge_effect,
    'background_theme', v_background_theme
  );
end;
$function$;

revoke all on function private.guild_update_cosmetics(text,text,text) from public, anon, authenticated;
grant execute on function private.guild_update_cosmetics(text,text,text) to authenticated;
