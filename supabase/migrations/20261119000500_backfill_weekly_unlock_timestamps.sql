-- Recover actual historical unlock timestamps from the first auto-grant claim.
-- The prior reward function inserted claims at the time a milestone was first processed.
update public.realm_weekly_milestone_unlocks m
set unlocked_at = q.first_claimed_at
from (
  select campaign_start, milestone, min(claimed_at) as first_claimed_at
  from public.realm_weekly_roll_claims
  where campaign_start = date '2026-11-17'
  group by campaign_start, milestone
) q
where m.campaign_start=q.campaign_start
  and m.milestone=q.milestone
  and q.first_claimed_at is not null;
