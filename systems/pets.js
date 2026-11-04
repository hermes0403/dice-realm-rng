/** Pet gameplay, inventory, fusion preview, and pet-related skill calculations. */
import { petWeightSkillMultiplier } from './pet-skills.js';

/** Returns safe, individually styled tags for appearance and weather mutations. */
export function formatPetMutationTags(pet, PET_MUTATIONS = {}) {
  if (!pet || typeof pet !== 'object') return [];
  const tags = [];
  const seen = new Set();
  const add = (key, label, className) => {
    if (!label || seen.has(key)) return;
    seen.add(key);
    tags.push({ label, className });
  };
  const variantStyles = {
    golden: { label: '黃金', className: 'pet-mutation-golden' },
    diamond: { label: '鑽石', className: 'pet-mutation-diamond' },
    rainbow: { label: '彩虹', className: 'pet-mutation-rainbow' }
  };
  const variants = Array.isArray(pet.variants) ? pet.variants : (Array.isArray(pet.variant) ? pet.variant : [pet.variant]);
  for (const variant of variants) {
    const style = variantStyles[variant];
    if (style) add(`variant:${variant}`, style.label, style.className);
  }
  const mutations = Array.isArray(pet.mutations) ? pet.mutations : (Array.isArray(pet.mutation) ? pet.mutation : [pet.mutation]);
  for (const key of mutations) {
    const mutation = PET_MUTATIONS[key];
    const label = mutation?.name?.replace(/變異$/, '');
    if (label) add(`weather:${key}`, label, `pet-mutation-weather-${key}`);
  }
  return tags;
}

/** Plain-text compatibility helper for prompts and tests. */
export function formatPetMutationLabels(pet, PET_MUTATIONS = {}) {
  return formatPetMutationTags(pet, PET_MUTATIONS).map(tag => tag.label).join('、');
}

export function createPetSystem({
  getState,
  PETS,
  PET_RARITIES,
  PET_TIER_CONFIG,
  PET_TIER_RATES,
  PET_MUTATIONS,
  PET_IMAGE_ASSETS,
  D,
  petById,
  getDiceById,
  randomPet,
  petIncomePerSecond,
  rollPetVariant,
  renderPetIncome,
  format,
  escapeHTML,
  save,
  render,
  toast,
  getCurrentUser,
  openAuth,
  recordPetFusion,
  showPetAutoSellNotice,
  documentRef,
  confirmAction
}) {
  let petSortMode = 'rarity-desc';

  function petRarity(id) {
    return PET_RARITIES.find(rarity => rarity.id === id) || PET_RARITIES[0];
  }

  function equippedPetHas(id) {
    const S = getState();
    const equipped = new Set(Array.isArray(S.equippedPetUids) ? S.equippedPetUids : []);
    return (S.pets || []).some(pet => pet.id === id && equipped.has(pet.uid));
  }

  function applyPetSkillDailyReset() {
    const S = getState();
    const today = new Date().toLocaleDateString('en-CA');
    S.petSkillDaily = S.petSkillDaily || { date: today, s3: 0, s5: 0 };
    if (S.petSkillDaily.date !== today) S.petSkillDaily = { date: today, s3: 0, s5: 0 };
  }

  function petBonusTotals() {
    const S = getState();
    const rarityBonus = {
      common: { luck: 1, speed: 0 },
      rare: { luck: 1, speed: 1 },
      legendary: { luck: 2, speed: 1 },
      mythic: { luck: 3, speed: 3 },
      secret: { luck: 7, speed: 7 }
    };
    const mutationMultiplier = { rain: 1.2, snow: 1.3, thunder: 1.4, crystal: 1.7, hell: 2 };
    let luck = 0;
    let speed = 0;
    const owned = Array.isArray(S.pets) ? S.pets : [];
    const equipped = new Set(Array.isArray(S.equippedPetUids) ? S.equippedPetUids : []);
    for (const item of owned) {
      if (!equipped.has(item.uid)) continue;
      const pet = petById(item.id);
      const bonus = rarityBonus[pet?.rarity];
      if (bonus) {
        const multiplier = (mutationMultiplier[item.mutation] || 1) * petWeightSkillMultiplier(item.kg);
        luck += bonus.luck * multiplier;
        speed += bonus.speed * multiplier;
      }
    }
    return { luck, speed };
  }

  function applyPetRollSkills(dice) {
    const S = getState();
    const petLuckWasUsed = (Number(S.petSkillLuckCharges) || 0) > 0;
    if (petLuckWasUsed) S.petSkillLuckCharges = Math.max(0, (Number(S.petSkillLuckCharges) || 0) - 1);
    applyPetSkillDailyReset();
    let petSkillReward = 0;
    if (equippedPetHas('s3') && Number(dice.den) >= 10000 && Math.random() < 0.10 && Number(S.petSkillDaily.s3 || 0) < 500000) {
      petSkillReward = Math.min(10000, 500000 - Number(S.petSkillDaily.s3 || 0));
      S.petSkillDaily.s3 = Number(S.petSkillDaily.s3 || 0) + petSkillReward;
    }
    if (equippedPetHas('s5') && Math.random() < 0.01 && Number(S.petSkillDaily.s5 || 0) < 500000) {
      const reward = Math.min(5000, 500000 - Number(S.petSkillDaily.s5 || 0));
      petSkillReward += reward;
      S.petSkillDaily.s5 = Number(S.petSkillDaily.s5 || 0) + reward;
    }
    if (equippedPetHas('m1') && Number(S.rolls) % 1000 === 0) S.petSkillLuckCharges = 1;
    return petSkillReward;
  }

  function populateAdminPetSelects() {
    const options = PETS.map(pet => `<option value="${pet.id}">${pet.name}（${petRarity(pet.rarity).name}）</option>`).join('');
    for (const id of ['adminSinglePetId', 'adminAllPetId']) {
      const element = documentRef.getElementById(id);
      if (element && !element.options.length) element.innerHTML = options;
    }
  }

  function petArt(pet, small = false) {
    if (!pet) return '◈';
    const rarity = petRarity(pet.rarity);
    const special = pet.rarity === 'secret' ? '0 0 20px #ffffff88'
      : pet.rarity === 'mythic' ? '0 0 16px #ff334f88'
        : pet.rarity === 'legendary' ? '0 0 13px #ffc53377'
          : '0 0 9px ' + rarity.a + '66';
    const index = Math.max(0, PETS.findIndex(item => item.id === pet.id)) % PET_IMAGE_ASSETS.length;
    const src = PET_IMAGE_ASSETS[index];
    return `<span role="img" aria-label="${pet.name}" title="${pet.name}" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:${small ? '72px' : '100px'};overflow:hidden;filter:drop-shadow(${special});user-select:none"><img src="${src}" alt="${pet.name}" loading="lazy" style="display:block;width:100%;height:${small ? '82px' : '120px'};object-fit:contain;border-radius:8px;background:transparent"></span>`;
  }

  function petTierFromDen(den) {
    const value = Number(den) || 0;
    for (const tier of Object.keys(PET_TIER_CONFIG).map(Number).sort((a, b) => a - b)) {
      const range = PET_TIER_CONFIG[tier];
      if (value >= Number(range.min_den) && (range.max_den == null || value <= Number(range.max_den))) return tier;
    }
    return 0;
  }

  function weightedPetRarity(tier) {
    const rates = PET_TIER_RATES[tier] || PET_TIER_RATES[1];
    const roll = Math.random() * 100;
    let cumulative = 0;
    for (const rarity of PET_RARITIES) {
      cumulative += rates[rarity.id] || 0;
      if (roll < cumulative) return rarity.id;
    }
    return 'common';
  }

  function ensurePetData(pets) {
    if (!Array.isArray(pets)) return;
    for (const pet of pets) {
      if (!pet || typeof pet !== 'object') continue;
      if (!Number.isFinite(Number(pet.kg)) || Number(pet.kg) <= 0) pet.kg = rollPetWeightKg();
      if (!Object.prototype.hasOwnProperty.call(pet, 'mutation')) pet.mutation = null;
    }
  }

  function petMutationForDice(da, db) {
    const wa = da?.weather && PET_MUTATIONS[da.weather] ? da.weather : null;
    const wb = db?.weather && PET_MUTATIONS[db.weather] ? db.weather : null;
    if (wa && wb && wa === wb) return Math.random() < 0.8 ? wa : null;
    if (wa && wb && wa !== wb) {
      const roll = Math.random();
      if (roll < 0.4) return wa;
      if (roll < 0.8) return wb;
      return null;
    }
    const weather = wa || wb;
    return weather && Math.random() < 0.4 ? weather : null;
  }

  function petMutationLabel(pet) {
    return formatPetMutationLabels(pet, PET_MUTATIONS);
  }

  function rollPetWeightKg() {
    // 重量越高越稀有；1 AU 約為 149,597,870,700 kg，僅作極端彩蛋重量。
    const roll = Math.random() * 100;
    let lo;
    let hi;
    if (roll < 70) { lo = 1; hi = 50; }
    else if (roll < 90) { lo = 51; hi = 99; }
    else if (roll < 98) { lo = 100; hi = 200; }
    else if (roll < 99.5) { lo = 201; hi = 500; }
    else if (roll < 99.75) { lo = 501; hi = 1000; }
    else if (roll < 99.87) { lo = 1001; hi = 2000; }
    else if (roll < 99.93) { lo = 2001; hi = 5000; }
    else if (roll < 99.955) { lo = 5001; hi = 10000; }
    else if (roll < 99.975) { lo = 10001; hi = 40000; }
    else if (roll < 99.985) { lo = 40001; hi = 100000; }
    else if (roll < 99.990) { lo = 100001; hi = 500000; }
    else if (roll < 99.993) { lo = 500001; hi = 3000000; }
    else if (roll < 99.995) { lo = 3000001; hi = 8000000; }
    else if (roll < 99.996) { lo = 8000001; hi = 10000000; }
    else if (roll < 99.999) { lo = 10000001; hi = 1000000000; }
    else if (roll < 99.9999) { lo = 1000000001; hi = 149597870699; }
    else if (roll < 99.999999) return 149597870700;
    else { lo = 1; hi = 50; }
    return Math.floor(lo + Math.random() * (hi - lo + 1));
  }

  function addPet(rarity, tier) {
    const S = getState();
    S.pets = Array.isArray(S.pets) ? S.pets : [];
    if (S.pets.length >= 20) return null;
    S.petDiscovered = S.petDiscovered || {};
    const definition = randomPet(rarity);
    const pet = {
      uid: 'pet-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      id: definition.id,
      sourceTier: tier,
      createdAt: new Date().toISOString(),
      kg: rollPetWeightKg()
    };
    S.pets.push(pet);
    S.petDiscovered[definition.id] = true;
    return pet;
  }

  function applyPetAutoSell(pet) {
    const S = getState();
    const rarity = petRarity(petById(pet.id)?.rarity).id;
    const selected = S.petAutoSellRarities || {};
    if (!selected[rarity] || rarity === 'secret') return false;
    const values = { common: 100, rare: 1000, legendary: 10000, mythic: 50000 };
    S.pets = (S.pets || []).filter(item => item.uid !== pet.uid);
    S.equippedPetUids = (S.equippedPetUids || []).filter(uid => uid !== pet.uid);
    S.coins = (Number(S.coins) || 0) + (values[rarity] || 0);
    showPetAutoSellNotice(petRarity(rarity).name, petById(pet.id)?.name || '寵物');
    return true;
  }

  function ownedPetName(item) {
    const pet = petById(item?.id);
    return pet ? pet.name : '未知寵物';
  }

  function renderPetsPage() {
    const S = getState();
    const pets = Array.isArray(S.pets) ? S.pets : [];
    const grid = documentRef.getElementById('petInventoryGrid');
    const count = documentRef.getElementById('petInventoryCount');
    const owned = documentRef.getElementById('petOwnedCount');
    if (count) count.textContent = pets.length + ' 隻';
    if (owned) owned.textContent = '持有 ' + pets.length + ' 隻寵物';
    const sortSelect = documentRef.getElementById('petSortMode');
    if (sortSelect && sortSelect.value !== petSortMode) sortSelect.value = petSortMode;
    if (grid) {
      if (!pets.length) {
        grid.innerHTML = '<div class="empty">尚未擁有寵物，先使用兩顆骰子合成。</div>';
      } else {
        const rarityOrder = PET_RARITIES.map(rarity => rarity.id);
        const sorted = [...pets].sort((a, b) => {
          const da = petById(a.id) || { rarity: 'common', name: '未知寵物' };
          const db = petById(b.id) || { rarity: 'common', name: '未知寵物' };
          const ra = rarityOrder.indexOf(da.rarity);
          const rb = rarityOrder.indexOf(db.rarity);
          const nameOrder = da.name.localeCompare(db.name, 'zh-Hant');
          const weightOrder = (Number(a.kg) || 0) - (Number(b.kg) || 0);
          if (petSortMode === 'income-asc') return petIncomePerSecond(a) - petIncomePerSecond(b) || ra - rb || nameOrder || weightOrder;
          if (petSortMode === 'income-desc') return petIncomePerSecond(b) - petIncomePerSecond(a) || rb - ra || nameOrder || weightOrder;
          const direction = petSortMode === 'rarity-asc' ? 1 : -1;
          return direction * (ra - rb) || nameOrder || weightOrder;
        });
        grid.innerHTML = sorted.map(pet => {
          const definition = petById(pet.id) || { id: pet.id, name: '未知寵物', icon: '❔', rarity: 'common' };
          const rarity = petRarity(definition.rarity);
          const equipped = (S.equippedPetUids || []).includes(pet.uid);
          const income = petIncomePerSecond(pet);
          const mutationTags = formatPetMutationTags(pet, PET_MUTATIONS);
          const mutationColors = {
            'pet-mutation-golden': '#ffe69a',
            'pet-mutation-diamond': '#b9e8ff',
            'pet-mutation-rainbow': 'rainbow',
            'pet-mutation-weather-thunder': '#fff12d',
            'pet-mutation-weather-crystal': '#ff9bd5',
            'pet-mutation-weather-hell': '#ff5364',
            'pet-mutation-weather-snow': '#fff4e8',
            'pet-mutation-weather-rain': '#72baff'
          };
          return `<div class="pet-card"><div class="pet-art">${petArt(definition, true)}</div><div class="pet-name ${rarity.cls}">${escapeHTML(definition.name)}</div><div class="pet-meta">${rarity.name} · ${Math.round(Number(pet.kg) || 0)} kg · ${format(income)}$/秒</div>${mutationTags.length ? `<div class="pet-mutations">${mutationTags.map(tag => {
            const color = mutationColors[tag.className] || '#ffffff';
            const rainbowStyle = color === 'rainbow' ? 'color:transparent!important;background:linear-gradient(90deg,#ff6b6b,#ffd166,#7ee787,#70c7ff,#c69bff,#ff8bd1);background-clip:text;-webkit-background-clip:text;' : `color:${color}!important;`;
            return `<span class="pet-mutation-tag ${tag.className}" style="${rainbowStyle}border-color:${color === 'rainbow' ? '#c69bff' : color}!important;text-shadow:0 0 7px ${color === 'rainbow' ? '#c69bff88' : color + '88'}">${escapeHTML(tag.label)}</span>`;
          }).join('')}</div>` : ''}<button type="button" class="${equipped ? 'quiet' : 'primary'}" data-pet-equip="${escapeHTML(pet.uid)}">${equipped ? '卸下' : '裝備'}</button></div>`;
        }).join('');
      }
    }
    renderPetIncome();
    refreshPetDiceSelects();
    updatePetDicePreview();
  }

  function renderPetCodex() {
    const S = getState();
    const all = PETS;
    const owned = new Set(Object.keys(S.petDiscovered || {}));
    const count = all.filter(pet => owned.has(pet.id)).length;
    const percentage = Math.round(count / all.length * 100);
    documentRef.getElementById('codexPct').textContent = percentage + '% · 已發現 ' + count + '/' + all.length;
    documentRef.getElementById('codexBar').style.width = percentage + '%';
    documentRef.querySelectorAll('[data-codex-category]').forEach(button => button.classList.toggle('active', button.dataset.codexCategory === 'pets'));
    documentRef.querySelector('#page-codex .hero .eyebrow').textContent = 'PET ARCHIVE DATABASE';
    documentRef.querySelector('#page-codex .hero h1').textContent = '記錄每一個生命。';
    documentRef.querySelector('#page-codex .hero .muted').textContent = '共 43 種寵物；未發現的寵物會顯示為未知剪影。';
    const grid = documentRef.getElementById('codexGrid');
    grid.className = 'pet-catalog-grid';
    grid.innerHTML = all.map(pet => {
      const discovered = owned.has(pet.id);
      const rarity = petRarity(pet.rarity);
      return `<div class="pet-card ${discovered ? '' : 'undiscovered'}" style="--rarity-color:${rarity.a}"><div class="pet-art">${discovered ? petArt(pet, true) : '<span style="font-size:42px;color:#50566e">?</span>'}</div><div class="pet-name ${rarity.cls}">${discovered ? pet.name : '???'}</div><div class="pet-meta ${rarity.cls}">${discovered ? rarity.name : '尚未發現'}</div></div>`;
    }).join('');
  }

  function renderPetChance(tier) {
    const rows = documentRef.getElementById('petChanceRows');
    const bar = documentRef.getElementById('petChanceBar');
    if (bar) bar.innerHTML = '';
    if (!tier) {
      rows.innerHTML = '<div class="empty">放入兩顆骰子後顯示機率。</div>';
      return;
    }
    const rates = PET_TIER_RATES[tier] || PET_TIER_RATES[1];
    rows.innerHTML = PET_RARITIES.map(rarity => {
      const value = rates[rarity.id] || 0;
      return `<div class="pet-prob-row" style="display:grid;grid-template-columns:64px minmax(0,1fr) 48px;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid #ffffff12"><b class="${rarity.cls}" style="background:linear-gradient(90deg,${rarity.a},${rarity.b});-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 10px ${rarity.a}33">${rarity.name}</b><div class="pet-prob-track" aria-label="${rarity.name} ${value}%" style="background:linear-gradient(90deg,#171c30,#252b43)"><span style="width:${Math.max(0, Math.min(100, value))}%;--prob-a:${rarity.a};--prob-b:${rarity.b};background:linear-gradient(90deg,${rarity.a},${rarity.b});box-shadow:0 0 8px ${rarity.a}66"></span></div><strong style="text-align:right">${value}%</strong></div>`;
    }).join('');
  }

  function dicePairAllowed(da, db) {
    if (!da || !db) return false;
    const x = Number(da.den) || 0;
    const y = Number(db.den) || 0;
    if (x <= 0 || y <= 0) return false;
    return Math.max(x, y) / Math.min(x, y) <= 1000;
  }

  function dicePairTier(da, db) {
    if (!dicePairAllowed(da, db)) return 0;
    return petTierFromDen((Number(da.den) || 0) + (Number(db.den) || 0));
  }

  function refreshPetDiceSelects() {
    const S = getState();
    const a = documentRef.getElementById('petDiceSlotA');
    const b = documentRef.getElementById('petDiceSlotB');
    if (!a || !b) return;
    const all = D.filter(die => (Number(S.bag[die.id]) || 0) >= 1).sort((x, y) => x.den - y.den);
    const oldA = a.value;
    const oldB = b.value;
    const optionsFor = otherId => all.filter(die => {
      if (!otherId) return true;
      if (die.id === otherId) return (Number(S.bag[die.id]) || 0) >= 2;
      return dicePairAllowed(die, getDiceById(otherId));
    });
    const make = (items, placeholder) => '<option value="">' + placeholder + '</option>' + items.map(die => `<option value="${die.id}">${die.name}（1/${die.den.toLocaleString('en-US')}）×${S.bag[die.id]}</option>`).join('');
    const listA = optionsFor(oldB);
    const listB = optionsFor(oldA);
    a.innerHTML = make(listA, '選擇骰子');
    b.innerHTML = make(listB, '選擇骰子');
    if (listA.some(die => die.id === oldA)) a.value = oldA;
    if (listB.some(die => die.id === oldB)) b.value = oldB;
  }

  function updatePetDicePreview() {
    const S = getState();
    const a = documentRef.getElementById('petDiceSlotA');
    const b = documentRef.getElementById('petDiceSlotB');
    const idA = a?.value;
    const idB = b?.value;
    const da = getDiceById(idA);
    const db = getDiceById(idB);
    const same = !!(da && db && idA === idB);
    const countA = Number(S.bag[idA]) || 0;
    const countB = Number(S.bag[idB]) || 0;
    const button = documentRef.getElementById('petDiceCraftBtn');
    for (const [die, artId, infoId] of [[da, 'petDiceArtA', 'petDiceInfoA'], [db, 'petDiceArtB', 'petDiceInfoB']]) {
      documentRef.getElementById(artId).textContent = die ? (die.icon || '🎲') : '🎲';
      documentRef.getElementById(infoId).textContent = die ? `${die.name} · 1/${Number(die.den).toLocaleString('en-US')} · 持有 ${Number(S.bag[die.id]) || 0} 顆` : '尚未選擇';
    }
    const ratioOK = dicePairAllowed(da, db);
    const enough = same ? countA >= 2 : (countA >= 1 && countB >= 1);
    const petFull = (Array.isArray(S.pets) ? S.pets.length : 0) >= 20;
    const valid = !!(da && db && ratioOK && enough && !petFull);
    button.disabled = !valid;
    const tier = valid ? dicePairTier(da, db) : 0;
    renderPetChance(tier);
    const info = documentRef.getElementById('petDiceCraftInfo');
    const wa = da?.weather && PET_MUTATIONS[da.weather] ? da.weather : null;
    const wb = db?.weather && PET_MUTATIONS[db.weather] ? db.weather : null;
    const weatherInfo = !wa && !wb ? '天氣變異：0%'
      : (wa && wb && wa === wb ? `${PET_MUTATIONS[wa].name}：80%`
        : wa && wb && wa !== wb ? `${PET_MUTATIONS[wa].name}：40%、${PET_MUTATIONS[wb].name}：40%`
          : `${PET_MUTATIONS[wa || wb].name}：40%`);
    info.textContent = petFull ? '寵物背包已滿（20/20），請先出售寵物才能繼續合成。'
      : (da && db && !ratioOK ? '兩顆骰子的機率分母比例不可超過 1,000 倍。'
        : (valid ? `已放入「${da.name}」＋「${db.name}」。合成區間依兩顆骰子的分母相加計算（${(Number(da.den) + Number(db.den)).toLocaleString('en-US')}）。${same ? '合成會消耗同種骰子 2 顆。' : '合成會各消耗 1 顆骰子。'}｜${weatherInfo}；黃金、鑽石、彩虹等外觀變異仍會另外獨立判定。`
          : '請選擇兩顆骰子，且確認持有數量足夠。'));
  }

  function onPetDiceSelectionChange(changed) {
    const a = documentRef.getElementById('petDiceSlotA');
    const b = documentRef.getElementById('petDiceSlotB');
    if (changed === 'a' && a.value && b.value && !dicePairAllowed(getDiceById(a.value), getDiceById(b.value))) b.value = '';
    if (changed === 'b' && a.value && b.value && !dicePairAllowed(getDiceById(a.value), getDiceById(b.value))) a.value = '';
    refreshPetDiceSelects();
    updatePetDicePreview();
  }

  async function craftPetFromDice() {
    const S = getState();
    if (!getCurrentUser()) {
      openAuth();
      toast('請先登入帳號才能合成寵物');
      return;
    }
    if ((S.pets || []).length >= 20) {
      toast('寵物背包已滿（20/20），請先出售寵物');
      return;
    }
    const idA = documentRef.getElementById('petDiceSlotA').value;
    const idB = documentRef.getElementById('petDiceSlotB').value;
    const da = getDiceById(idA);
    const db = getDiceById(idB);
    const same = idA === idB;
    const countA = Number(S.bag[idA]) || 0;
    const countB = Number(S.bag[idB]) || 0;
    if (!da || !db || !dicePairAllowed(da, db) || (same ? countA < 2 : (countA < 1 || countB < 1))) {
      toast('骰子種類、持有數量或 1,000 倍比例限制不符合');
      return;
    }
    const tier = dicePairTier(da, db);
    const rates = PET_TIER_RATES[tier];
    const preview = PET_RARITIES.map(rarity => `${rarity.name} ${rates[rarity.id] || 0}%`).join('、');
    const wa = da.weather && PET_MUTATIONS[da.weather] ? da.weather : null;
    const wb = db.weather && PET_MUTATIONS[db.weather] ? db.weather : null;
    const weatherInfo = !wa && !wb ? '天氣變異：0%'
      : (wa && wb && wa === wb ? `${PET_MUTATIONS[wa].name}：80%`
        : wa && wb && wa !== wb ? `${PET_MUTATIONS[wa].name}：40%、${PET_MUTATIONS[wb].name}：40%`
          : `${PET_MUTATIONS[wa || wb].name}：40%`);
    const denSum = Number(da.den) + Number(db.den);
    if (!confirmAction(`確定消耗「${da.name}」＋「${db.name}」合成寵物？\n兩顆骰子分母相加：${denSum.toLocaleString('en-US')}\n合成品質機率：${preview}\n${weatherInfo}\n黃金、鑽石、彩虹等外觀變異另外獨立判定，可與天氣變異同時取得。\n此操作會消耗${same ? '同種骰子 2 顆' : '兩種骰子各 1 顆'}。`)) return;
    const rarity = weightedPetRarity(tier);
    const pet = addPet(rarity, tier);
    if (pet) {
      pet.variant = rollPetVariant();
      pet.mutation = petMutationForDice(da, db);
      pet.autoSold = applyPetAutoSell(pet);
    }
    if (!pet) {
      toast('寵物背包已滿（20/20），請先出售寵物');
      return;
    }
    S.bag[idA] -= 1;
    if (S.bag[idA] <= 0) delete S.bag[idA];
    S.bag[idB] -= 1;
    if (S.bag[idB] <= 0) delete S.bag[idB];
    save();
    render();
    renderPetsPage();
    renderPetCodex();
    toast(pet.autoSold
      ? `合成成功：${petById(pet.id).name}（${petRarity(rarity).name}），已自動出售`
      : `合成成功：${petById(pet.id).name}（${petRarity(rarity).name}）`);
    recordPetFusion({ ...da, name: same ? da.name : `${da.name} + ${db.name}`, den: Number(da.den) + Number(db.den) }, pet, rarity);
  }

  let petSystemUISetup = false;
  function setupPetSystemUI() {
    if (petSystemUISetup) return false;
    documentRef.getElementById('petSortMode')?.addEventListener('change', event => {
      petSortMode = event.target.value;
      renderPetsPage();
    });
    documentRef.getElementById('petAutoEquipBestBtn')?.addEventListener('click', () => {
      const S = getState();
      const best = [...(Array.isArray(S.pets) ? S.pets : [])].sort((a, b) => {
        const incomeDiff = petIncomePerSecond(b) - petIncomePerSecond(a);
        if (incomeDiff) return incomeDiff;
        const weightDiff = (Number(b.kg) || 0) - (Number(a.kg) || 0);
        if (weightDiff) return weightDiff;
        return String(a.uid).localeCompare(String(b.uid));
      }).slice(0, 3);
      S.equippedPetUids = best.map(pet => pet.uid);
      save();
      renderPetsPage();
      toast(best.length ? `已自動裝備收益最高的 ${best.length} 隻寵物` : '目前沒有可裝備的寵物');
    });
    documentRef.getElementById('petInventoryGrid')?.addEventListener('click', event => {
      const button = event.target.closest('[data-pet-equip]');
      if (!button) return;
      const S = getState();
      const uid = button.dataset.petEquip;
      S.equippedPetUids = Array.isArray(S.equippedPetUids) ? S.equippedPetUids : [];
      if (S.equippedPetUids.includes(uid)) {
        S.equippedPetUids = S.equippedPetUids.filter(value => value !== uid);
        toast('已卸下寵物');
      } else {
        if (S.equippedPetUids.length >= 3) {
          toast('最多只能裝備 3 隻寵物');
          return;
        }
        if (!S.pets.some(pet => pet.uid === uid)) return;
        S.equippedPetUids.push(uid);
        toast('已裝備寵物');
      }
      save();
      renderPetsPage();
    });
    documentRef.getElementById('petDiceSlotA')?.addEventListener('change', () => onPetDiceSelectionChange('a'));
    documentRef.getElementById('petDiceSlotB')?.addEventListener('change', () => onPetDiceSelectionChange('b'));
    documentRef.getElementById('petDiceCraftBtn')?.addEventListener('click', craftPetFromDice);
    petSystemUISetup = true;
    return true;
  }

  return {
    equippedPetHas,
    applyPetSkillDailyReset,
    applyPetRollSkills,
    petBonusTotals,
    populateAdminPetSelects,
    petById,
    petRarity,
    petArt,
    petTierFromDen,
    weightedPetRarity,
    ensurePetData,
    petMutationForDice,
    petMutationLabel,
    formatPetMutationTags,
    rollPetWeightKg,
    petWeightSkillMultiplier,
    addPet,
    applyPetAutoSell,
    ownedPetName,
    renderPetsPage,
    renderPetCodex,
    renderPetChance,
    dicePairAllowed,
    dicePairTier,
    refreshPetDiceSelects,
    updatePetDicePreview,
    onPetDiceSelectionChange,
    craftPetFromDice,
    setupPetSystemUI
  };
}
