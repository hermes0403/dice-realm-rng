const DAY_MS = 24 * 60 * 60 * 1000;
const LOGIN_BASE = 10_000_000;
const LOGIN_STEP = 3_000_000;
const LOGIN_CAP = 100_000_000;
const DAILY_CAP = 100_000_000;

export function taipeiDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = {};
  for (const part of parts) values[part.type] = part.value;
  return values.year + '-' + values.month + '-' + values.day;
}

function previousTaipeiDateKey(today) {
  const [year, month, day] = String(today).split('-').map(Number);
  return taipeiDateKey(new Date(Date.UTC(year, month - 1, day) - DAY_MS + 12 * 60 * 60 * 1000));
}

export function resolveSecretLoginReward(previous = {}, today = taipeiDateKey()) {
  if (previous.lastDate === today) return { claimed: false, reward: 0, state: previous };
  const streak = previous.lastDate === previousTaipeiDateKey(today)
    ? Math.max(0, Number(previous.streak) || 0) + 1 : 1;
  const reward = streak >= 30 ? LOGIN_CAP : Math.min(LOGIN_CAP, LOGIN_BASE + (streak - 1) * LOGIN_STEP);
  return { claimed: true, reward, state: { lastDate: today, streak, reward } };
}

export function resolveSecretRollRewards({ den, daily = {}, hasS3 = false, hasS5 = false, random = Math.random } = {}) {
  const next = {
    date: daily.date || '',
    s3: Math.min(DAILY_CAP, Math.max(0, Number(daily.s3) || 0)),
    s5: Math.min(DAILY_CAP, Math.max(0, Number(daily.s5) || 0))
  };
  let reward = 0;
  if (hasS3 && Number(den) >= 10_000 && next.s3 < DAILY_CAP) {
    const base = Math.min(1_000_000, DAILY_CAP - next.s3);
    next.s3 += base;
    reward += base;
    if (next.s3 < DAILY_CAP && random() < 0.1) {
      const extra = Math.min(1_000_000, DAILY_CAP - next.s3);
      next.s3 += extra;
      reward += extra;
    }
  }
  if (hasS5 && next.s5 < DAILY_CAP && random() < 0.01) {
    const extra = Math.min(500_000, DAILY_CAP - next.s5);
    next.s5 += extra;
    reward += extra;
  }
  return { daily: next, reward };
}

export function resolveSecretSpeedSkill(skill = {}, now = Date.now(), localLastUse = 0) {
  const cooldownUntil = Math.max(Number(skill.cooldownUntil) || 0, (Number(localLastUse) || 0) + 12 * 60 * 60 * 1000);
  if (cooldownUntil > now) return { activated: false, cooldownUntil };
  return {
    activated: true,
    state: { activatedAt: now, expiresAt: now + 10 * 60 * 1000, cooldownUntil: now + 12 * 60 * 60 * 1000 }
  };
}
