export const NEW_DICE = [
  { id: 'd68', name: '星界殘片', den: 24888888, icon: '✧', color: '#9bdcff', desc: '星界邊緣剝落的碎片，仍保留著古老星光。', effect: '星界殘片' },
  { id: 'd69', name: '深空裂隙', den: 8050000, icon: '⟡', color: '#b8a5ff', desc: '深空裂隙短暫顯現，吞沒周圍的微光。', effect: '深空裂隙' },
  { id: 'd70', name: '永劫核心', den: 110050000, icon: '◉', color: '#ff9bd5', desc: '跨越永劫仍持續運轉的核心。', effect: '永劫核心' },
  { id: 'd71', name: '量子悖論', den: 8255000, icon: '⌘', color: '#9bceff', desc: '同時存在於多種可能中的量子骰子。', effect: '量子悖論' },
  { id: 'd72', name: '原初之眼', den: 974000, icon: '◉', color: '#ffd58f', desc: '凝視骰界最初的光，窺見尚未發生的結果。', effect: '原初之眼' }
];

export const ETERNAL_PET_WEIGHTS = [60, 40];
export const ETERNAL_PET_INCOME = { eternal_dawn_guardian: 95000, eternal_starwish_deer: 120000 };

export const ETERNAL_PETS = [
  { id: 'eternal_dawn_guardian', name: '曙光守望者', icon: '🪽', rarity: 'eternal', skill: '裝備後運氣 +35%、擲骰速度 +35%。' },
  { id: 'eternal_starwish_deer', name: '星願靈鹿', icon: '🦌', rarity: 'eternal', skill: '裝備後每 24 小時可隨機獲得天堂藥水 I（40%）或幸運藥水 III（60%）。' }
];

export const ETERNAL_TIER_CONFIG = {
  10: { min_den: 1100001, max_den: 5000001 },
  11: { min_den: 5000002, max_den: 10000000 },
  12: { min_den: 10000001, max_den: 25000000 },
  13: { min_den: 25000001, max_den: 40000000 },
  14: { min_den: 40000001, max_den: 60000000 },
  15: { min_den: 60000001, max_den: 80000000 },
  16: { min_den: 80000001, max_den: 100000000 },
  17: { min_den: 100000001, max_den: 119999999 },
  18: { min_den: 120000000, max_den: null }
};

export const ETERNAL_TIER_RATES = {
  10: { common: 0, rare: 0, legendary: 73, mythic: 25, secret: 2, eternal: 0 },
  11: { common: 0, rare: 0, legendary: 70, mythic: 27, secret: 3, eternal: 0 },
  12: { common: 0, rare: 0, legendary: 67, mythic: 28, secret: 5, eternal: 0 },
  13: { common: 0, rare: 0, legendary: 60, mythic: 23, secret: 16, eternal: 1 },
  14: { common: 0, rare: 0, legendary: 0, mythic: 49, secret: 45, eternal: 6 },
  15: { common: 0, rare: 0, legendary: 0, mythic: 7, secret: 75, eternal: 18 },
  16: { common: 0, rare: 0, legendary: 0, mythic: 0, secret: 35, eternal: 65 },
  17: { common: 0, rare: 0, legendary: 0, mythic: 0, secret: 5, eternal: 95 },
  18: { common: 0, rare: 0, legendary: 0, mythic: 0, secret: 0, eternal: 100 }
};
