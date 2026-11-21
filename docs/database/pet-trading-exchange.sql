-- T-0026: secure one-pet-for-one-pet exchange.
-- Apply after docs/database/pet-trading.sql baseline.
-- The live project migration is tracked as:
-- pet_trade_offers_atomic_exchange_and_inventory_lock
-- pet_trade_single_active_room_per_player
-- pet_trade_prevent_overlapping_active_rooms

alter table public.pet_trade_sessions
  add column if not exists offered_pet_uid_a text,
  add column if not exists offered_pet_uid_b text,
  add column if not exists confirmed_a boolean not null default false,
  add column if not exists confirmed_b boolean not null default false,
  add column if not exists revision integer not null default 0;

-- RPC definitions are installed by the tracked Supabase migrations above:
-- public.set_pet_trade_offer(uuid, text)
-- public.confirm_pet_trade(uuid)
-- The first validates ownership and resets both confirmations when an offer changes.
-- The second locks both game_saves rows in deterministic order, verifies the pet UIDs
-- and sale tombstones, exchanges the pet JSON objects atomically, removes equipped
-- references from the previous owners, updates discovery maps, and completes the room.
--
-- A BEFORE UPDATE trigger on game_saves rejects pet/equipped inventory changes while
-- a trade room is active. This prevents stale cloud-save upserts and pet-sale RPCs from
-- overwriting or disposing of locked assets. Cancel/expire/complete releases the lock.
--
-- One active room per player is enforced by an advisory-locking session trigger.
