export const HEAVEN_MIDDLE_IDS = [
  'd13', 'd14', 'd15', 'd16', 'd29', 'd17', 'd18', 'd19',
  'd67', 'd30', 'd20', 'd21', 'd22', 'd58', 'd65', 'd23',
  'd25', 'd26', 'd31', 'd66', 'd24', 'd27', 'd59', 'd32'
];

export function buildHeavenBaseEntries(byId, heaven2, highLuck) {
  const fixed = heaven2
    ? (highLuck ? { id: 'd15', percent: 17 } : { id: 'd14', percent: 17 })
    : (highLuck ? { id: 'd13', percent: 19 } : { id: 'd12', percent: 20 });
  const errorPercent = heaven2 ? 0.07 : 0.005;
  const middle = HEAVEN_MIDDLE_IDS.filter(id => id !== fixed.id);
  const remaining = 100 - fixed.percent - errorPercent;
  const targetId = heaven2 ? 'd23' : 'd21';
  const targetIndex = middle.indexOf(targetId);
  const targetPercent = 1.5;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 80; iteration++) {
    const ratio = (low + high) / 2;
    let totalWeight = 0;
    let targetWeight = 0;
    let factor = 1;
    for (let index = 0; index < middle.length; index++) {
      totalWeight += factor;
      if (index === targetIndex) targetWeight = factor;
      factor *= ratio;
    }
    const targetShare = remaining * targetWeight / totalWeight;
    if (targetShare < targetPercent) low = ratio;
    else high = ratio;
  }
  const ratio = (low + high) / 2;
  const entries = [
    { dice: byId(fixed.id), weight: fixed.percent },
    { dice: byId('d64'), weight: errorPercent }
  ];
  let totalFactor = 0;
  let factor = 1;
  for (let index = 0; index < middle.length; index++) {
    totalFactor += factor;
    factor *= ratio;
  }
  let allocated = 0;
  factor = 1;
  middle.forEach((id, index) => {
    const weight = index === middle.length - 1
      ? remaining - allocated
      : remaining * factor / totalFactor;
    allocated += weight;
    const dice = byId(id);
    if (dice) entries.push({ dice, weight });
    factor *= ratio;
  });
  return entries.filter(entry => entry.dice);
}

export function heavenWeatherBonus(dice, weatherTypes, heaven2, angel) {
  const den = Number(dice?.den);
  if (!Number.isFinite(den) || den < 1000000 || den > 100000000) return 0;
  let bonus = 0;
  if (weatherTypes.includes('hell')) bonus += heaven2 ? 5 : angel ? 4.5 : 4;
  if (weatherTypes.includes('glitch')) bonus += heaven2 ? 7 : angel ? 6 : 5;
  return bonus;
}

export function applyHeavenWeatherWeights(entries, weatherTypes, heaven2, angel) {
  return entries.map(entry => {
    const bonus = heavenWeatherBonus(entry.dice, weatherTypes, heaven2, angel);
    return {
      dice: entry.dice,
      weight: entry.weight * (1 + bonus / 100)
    };
  });
}
