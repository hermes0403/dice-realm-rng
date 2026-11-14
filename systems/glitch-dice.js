export function applyGlitchWeight(dice, weight, isGlitchWeather) {
  return isGlitchWeather && dice?.glitchBonus ? weight * 10 : weight;
}

export function addGlitchDiceOdds(entries, pool, isGlitchWeather, weather = 'sunny') {
  const result = entries.map(entry => ({ ...entry }));
  const baseTotal = result.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight) || 0), 0);
  const poolBaseTotal = pool.reduce((sum, dice) => {
    const den = Math.max(2, Number(dice.den) || 2);
    const adjustedDen = weather === 'hell' && den >= 1000000 && den <= 100000000 ? den / 1.04 : den;
    return sum + 1 / adjustedDen;
  }, 0);
  if (baseTotal <= 0 || poolBaseTotal <= 0) return result;

  for (const dice of pool.filter(item => item?.glitchBonus)) {
    const existing = result.find(entry => entry.dice?.id === dice.id);
    if (existing) {
      if (isGlitchWeather) existing.weight *= 10;
      continue;
    }
    const den = Math.max(2, Number(dice.den) || 2);
    const adjustedDen = weather === 'hell' && den >= 1000000 && den <= 100000000 ? den / 1.04 : den;
    const baseWeight = baseTotal * (1 / adjustedDen) / poolBaseTotal;
    result.push({ dice, weight: baseWeight * (isGlitchWeather ? 10 : 1) });
  }
  return result;
}
