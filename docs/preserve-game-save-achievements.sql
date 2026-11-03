-- Preserve permanent achievement unlocks when an older browser tab uploads
-- a stale full game_saves snapshot. This is intentionally SECURITY INVOKER:
-- it only combines OLD/NEW row values and does not bypass RLS.
create or replace function public.preserve_game_save_achievements()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_old_achievements jsonb := '{}'::jsonb;
  v_new_achievements jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(old.save_data -> 'achievements') = 'object' then
    v_old_achievements := old.save_data -> 'achievements';
  end if;

  if jsonb_typeof(new.save_data -> 'achievements') = 'object' then
    v_new_achievements := new.save_data -> 'achievements';
  end if;

  if jsonb_typeof(new.save_data) = 'object' then
    new.save_data := jsonb_set(
      new.save_data,
      '{achievements}',
      v_old_achievements || v_new_achievements,
      true
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_preserve_game_save_achievements on public.game_saves;

create trigger trg_preserve_game_save_achievements
before update of save_data on public.game_saves
for each row
execute function public.preserve_game_save_achievements();
