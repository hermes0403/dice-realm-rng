import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PET_BASE_INCOME, SECRET_PET_SKILLS, petById } from '../data/pets.js';
import { ETERNAL_PET_INCOME } from '../data/eternal-update.js';
import { resolveSecretRollRewards } from '../systems/secret-pet-skills.js';

test('秘密與永恆寵物收益調整正確', () => {
  assert.equal(PET_BASE_INCOME.s5, 15000);
  assert.equal(PET_BASE_INCOME.s6, 17500);
  assert.equal(ETERNAL_PET_INCOME.eternal_dawn_guardian, 50000);
  assert.equal(ETERNAL_PET_INCOME.eternal_starwish_deer, 62500);
});

test('秘密寵物技能依指定順序交換，第二與第五隻不變', () => {
  assert.match(SECRET_PET_SKILLS.s1.skill, /每 24 小時.*幸運藥水 III/);
  assert.match(SECRET_PET_SKILLS.s6.skill, /每累積 1,000 次擲骰.*\+500%/);
  assert.match(SECRET_PET_SKILLS.s3.skill, /速度 \+100%.*10 分鐘/);
  assert.match(SECRET_PET_SKILLS.s4.skill, /分母達 10,000.*1M\$/);
  assert.match(SECRET_PET_SKILLS.s2.skill, /每日登入領取 10M\$/);
  assert.match(SECRET_PET_SKILLS.s5.skill, /1% 機率額外獲得 500K\$/);
  assert.equal(petById('s1').skill, SECRET_PET_SKILLS.s1.skill);
  assert.equal(petById('s6').skill, SECRET_PET_SKILLS.s6.skill);
});

test('永寂環蛇的新擲骰技能由持有者觸發，且每日上限100M', () => {
  const hit = resolveSecretRollRewards({
    den: 10000, hasS4: true, daily: { s4: 0, s5: 0 }, random: () => 0.05
  });
  assert.equal(hit.reward, 2000000);
  assert.equal(hit.daily.s4, 2000000);
  const capped = resolveSecretRollRewards({
    den: 10000, hasS4: true, daily: { s4: 99500000, s5: 0 }, random: () => 0
  });
  assert.equal(capped.reward, 500000);
  assert.equal(capped.daily.s4, 100000000);
});

test('技能實作已改為星界之狼每日領藥水、終焉渡鴉啟動速度、原初奇點觸發幸運', async () => {
  const source = await readFile(new URL('../systems/pets.js', import.meta.url), 'utf8');
  assert.match(source, /item\.id === 's1'/);
  assert.match(source, /item\.id === 's3'/);
  assert.match(source, /equippedPetHas\('s6'\).*petSkillLuckBonus = 500/s);
  assert.match(source, /hasS4: equippedPetHas\('s4'\)/);
});
