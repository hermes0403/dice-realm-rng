export const WEATHER_SUMMON_ODDS = Object.freeze([
  Object.freeze({ type: 'crystal', percent: 60, upperBound: 0.60 }),
  Object.freeze({ type: 'hell', percent: 27, upperBound: 0.87 }),
  Object.freeze({ type: 'glitch', percent: 13, upperBound: 1 })
]);

export function pickWeatherSummonType(roll) {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('roll must be in the range [0, 1)');
  }
  return WEATHER_SUMMON_ODDS.find(entry => roll < entry.upperBound).type;
}
