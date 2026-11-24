-- Preserve enough detail to distinguish a retained fused pet from one
-- immediately sold by the player's auto-sell preference.
alter table public.pet_fusion_logs
  add column if not exists pet_kg bigint,
  add column if not exists pet_variant text,
  add column if not exists pet_mutation text,
  add column if not exists pet_source_tier integer,
  add column if not exists auto_sold boolean not null default false;

create index if not exists pet_fusion_logs_user_created_uid_idx
  on public.pet_fusion_logs (user_id, created_at desc, pet_uid)
  where pet_uid is not null and pet_uid <> '';
