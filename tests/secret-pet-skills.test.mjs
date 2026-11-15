import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSecretLoginReward, resolveSecretRollRewards, resolveSecretSpeedSkill } from '../systems/secret-pet-skills.js';

test('混沌祝福：首日10M、連續登入每日增加3M、第30天封頂100M', () => {
  const day1 = resolveSecretLoginReward({}, '2026-11-01');
  assert.equal(day1.reward, 10_000_000);
  const day2 = resolveSecretLoginReward(day1.state, '2026-11-02');
  assert.equal(day2.reward, 13_000_000);
  const day30 = resolveSecretLoginReward({ lastDate: '2026-11-29', streak: 29 }, '2026-11-30');
  assert.equal(day30.state.streak, 30);
  assert.equal(day30.reward, 100_000_000);
});

test('混沌祝福同一天不重複領取，漏一天後連續天數重置', () => {
  const sameDay = resolveSecretLoginReward({ lastDate: '2026-11-14', streak: 7 }, '2026-11-14');
  assert.equal(sameDay.claimed, false);
  assert.equal(sameDay.reward, 0);
  const reset = resolveSecretLoginReward({ lastDate: '2026-11-12', streak: 7 }, '2026-11-14');
  assert.equal(reset.state.streak, 1);
  assert.equal(reset.reward, 10_000_000);
});

test('終焉財藏：合資格擲骰固定1M，額外10%再得1M', () => {
  const result = resolveSecretRollRewards({
    den: 10_000, hasS3: true, daily: { date: '2026-11-14', s3: 0, s5: 0 }, random: () => 0.05
  });
  assert.equal(result.reward, 2_000_000);
  assert.equal(result.daily.s3, 2_000_000);
});

test('終焉財藏：分母門檻及每日100M上限', () => {
  const below = resolveSecretRollRewards({ den: 9_999, hasS3: true, daily: { s3: 0, s5: 0 } });
  assert.equal(below.reward, 0);
  const capped = resolveSecretRollRewards({
    den: 10_000, hasS3: true, daily: { s3: 99_500_000, s5: 0 }, random: () => 0
  });
  assert.equal(capped.reward, 500_000);
  assert.equal(capped.daily.s3, 100_000_000);
});

test('虛無回饋：1%獲得500K，且每日100M上限不超額', () => {
  const hit = resolveSecretRollRewards({
    den: 2, hasS5: true, daily: { s3: 0, s5: 99_750_000 }, random: () => 0
  });
  assert.equal(hit.reward, 250_000);
  assert.equal(hit.daily.s5, 100_000_000);
  const miss = resolveSecretRollRewards({
    den: 2, hasS5: true, daily: { s3: 0, s5: 0 }, random: () => 0.02
  });
  assert.equal(miss.reward, 0);
});

test('永寂恩賜：技能持續10分鐘、冷卻12小時', () => {
  const now = 1_800_000_000_000;
  const activated = resolveSecretSpeedSkill({}, now, 0);
  assert.equal(activated.activated, true);
  assert.equal(activated.state.expiresAt - now, 10 * 60 * 1000);
  assert.equal(activated.state.cooldownUntil - now, 12 * 60 * 60 * 1000);
  const cooling = resolveSecretSpeedSkill(activated.state, now + 11 * 60 * 60 * 1000, 0);
  assert.equal(cooling.activated, false);
  const ready = resolveSecretSpeedSkill(activated.state, now + 12 * 60 * 60 * 1000, 0);
  assert.equal(ready.activated, true);
});
