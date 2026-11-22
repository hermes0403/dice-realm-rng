/** Shared pet-weight multiplier used by passive income and equipped-pet bonuses. */
export function petWeightSkillMultiplier(kg) {
  const weight = Number(kg) || 1;
  if (weight < 100) return 1;
  if (weight <= 200) return 1.2;
  if (weight <= 500) return 1.5;
  if (weight <= 1000) return 1.8;
  if (weight <= 2000) return 2;
  if (weight <= 5000) return 2.5;
  if (weight <= 10000) return 2.8;
  if (weight <= 40000) return 3;
  if (weight <= 100000) return 3.5;
  if (weight <= 500000) return 3.8;
  if (weight <= 3000000) return 4;
  return 4.5;
}
