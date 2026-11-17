-- Preserve the identity of each fused pet in future fusion history.
-- Existing rows remain valid; their historical pet UID cannot be reconstructed.
alter table public.pet_fusion_logs
  add column if not exists pet_uid text;

create index if not exists pet_fusion_logs_user_pet_uid_idx
  on public.pet_fusion_logs (user_id, pet_uid)
  where pet_uid is not null and pet_uid <> '';
