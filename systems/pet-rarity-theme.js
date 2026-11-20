export const ETERNAL_PET_RARITY_CSS = `.pet-rarity-eternal {
  background: linear-gradient(90deg, #0755d9 0%, #ffaddd 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent !important;
  text-shadow: 0 0 7px #0755d966, 0 0 10px #ffaddd55;
  font-weight: 950;
}`;

export function applyEternalPetRarityTheme(documentRef = globalThis.document) {
  if (!documentRef?.head || documentRef.getElementById('eternal-pet-rarity-theme')) return false;
  const style = documentRef.createElement('style');
  style.id = 'eternal-pet-rarity-theme';
  style.textContent = ETERNAL_PET_RARITY_CSS;
  documentRef.head.appendChild(style);
  return true;
}
