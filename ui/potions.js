/** Potion inventory, materials, crafting, use, and auto-add UI. */
export function createPotionUI(deps) {
  const {
    getState, POTIONS, activePotion, luck, speed, format, fresh, save, render,
    toast, checkAchievements, logCraft, logPotionAction, documentRef,
    restartAutoInterval, byId, chanceText, getCurrentUser
  } = deps;
  function potionMaterialTotal() {
    const materials = getState().potions?.materials || {};
    return Object.values(materials).reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0);
  }

  function renderPotionAutoAddChoices() {
    const state = getState();
    state.potions = state.potions || fresh().potions;
    state.potions.materials = state.potions.materials || {};
    let left = 4;
    for (const id of Object.keys(state.potions.materials)) {
      const count = Math.max(0, Number(state.potions.materials[id]) || 0);
      const keep = Math.min(count, left);
      if (keep) state.potions.materials[id] = keep;
      else delete state.potions.materials[id];
      left -= keep;
    }
    state.potions.autoAddPotions = Array.isArray(state.potions.autoAddPotions)
      ? state.potions.autoAddPotions.slice(0, 2)
      : [];
    state.potions.autoAdd = state.potions.autoAddPotions.length > 0;
  }

  function potionIngredientInfo(diceId, needed) {
    const state = getState();
    if (String(diceId).startsWith('potion:')) {
      const potionId = diceId.slice(7);
      const potion = POTIONS.find(item => item.id === potionId);
      return {
        name: potion?.name || potionId,
        icon: potion?.icon || '🧪',
        odds: '藥水',
        have: Number(state.potions.inventory?.[potionId]) || 0,
        need: needed,
        isPotion: true,
        pid: potionId
      };
    }
    const dice = byId(diceId);
    return {
      name: dice?.name || diceId,
      icon: dice?.icon || '🎲',
      odds: dice ? chanceText(dice) : '',
      have: (Number(state.bag[diceId]) || 0) + (Number(state.potions.materials?.[diceId]) || 0),
      need: needed,
      isPotion: false,
      did: diceId,
      d: dice
    };
  }

  function renderPotions() {
    const state = getState();
    const potionList = documentRef.getElementById('potionList');
    renderPotionAutoAddChoices();
    const luckPotion = activePotion('luck');
    const speedPotion = activePotion('speed');
    documentRef.getElementById('potionLuckNow').textContent = '+' + luck() + '%';
    documentRef.getElementById('potionSpeedNow').textContent = '+' + speed() + '%';

    const remaining = [];
    if (luckPotion) remaining.push(`${luckPotion.name}：${Math.ceil(Math.max(0, Number(state.potions.active.expiresAt) - Date.now()) / 1000)} 秒`);
    if (speedPotion) remaining.push(`${speedPotion.name}：${Math.ceil(Math.max(0, Number(state.potions.activeSpeed.expiresAt) - Date.now()) / 1000)} 秒`);
    documentRef.getElementById('potionTimer').textContent = remaining.join(' · ') || '未啟用';

    const statuses = [];
    if (luckPotion) statuses.push(`${luckPotion.name}：運氣 +${luckPotion.luck || 0}%`);
    if (speedPotion) statuses.push(`${speedPotion.name}：擲骰速度 +${speedPotion.speed || 0}%`);
    if (state.potions.angelCharges > 0) {
      statuses.push(state.potions.angelMode === 'angel2'
        ? '天堂藥水 II 已準備好，下一抽機率已提升。'
        : '天堂藥水 I 已準備好，下一抽可使用。');
    }
    documentRef.getElementById('potionStatus').textContent = statuses.join('｜') || '目前沒有生效中的藥水。';

    potionList.innerHTML = POTIONS.map(potion => {
      const count = Number(state.potions.inventory[potion.id]) || 0;
      const active = (potion.speed ? speedPotion : luckPotion)?.id === potion.id;
      const autoSelected = (state.potions.autoAddPotions || []).includes(potion.id);
      const materials = potion.recipe.map(([diceId, needed]) => {
        const material = potionIngredientInfo(diceId, needed);
        const enough = material.have >= needed;
        return `<div class="potion-material-line" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 10px;border:1px solid ${enough ? '#286b57' : '#543247'};border-radius:9px;background:${enough ? '#102c27' : '#211622'};margin:5px 0"><div style="min-width:0"><b>${material.icon} ${material.name}</b><div class="mini" style="margin-top:3px">${material.odds === '藥水' ? '藥水材料' : material.odds} · 需要 ×${needed} · 持有 ${format(material.have)}</div></div><strong style="color:${enough ? '#65e6b2' : '#ff829d'};white-space:nowrap">${enough ? '✓ 足夠' : '✕ 缺少 ' + format(needed - material.have)}</strong></div>`;
      }).join('');
      const canMake = potion.recipe.every(([diceId, needed]) => potionIngredientInfo(diceId, needed).have >= needed);
      return `<div class="potion-card" data-potion-card="${potion.id}"><span class="potion-card-icon">${potion.icon}</span><div class="potion-summary-main" style="cursor:default"><b>${potion.name}</b><small style="display:block;color:var(--muted);font-size:12px;margin-top:3px">${potion.desc}</small><span class="potion-owned">持有 ×${count}${active ? ' · 生效中' : ''}</span></div><div class="potion-action-buttons"><button data-craft-potion="${potion.id}" ${canMake ? '' : 'disabled'}>合成</button><button class="primary" data-use-potion="${potion.id}" ${count < 1 ? 'disabled' : ''}>使用</button><button class="potion-auto-add ${autoSelected ? 'active' : ''}" data-toggle-auto-add="${potion.id}">${autoSelected ? '✓ 自動添加中' : '自動添加'}</button></div><div class="potion-row-recipe" style="display:block;flex-basis:100%;width:100%"><div class="potion-recipe-list">${materials}</div></div></div>`;
    }).join('');
  }

  function craftPotion(id) {
    const state = getState();
    const potion = POTIONS.find(item => item.id === id);
    if (!potion) return;
    state.potions = state.potions || fresh().potions;
    state.potions.materials = state.potions.materials || {};
    for (const [diceId, needed] of potion.recipe) {
      if (potionIngredientInfo(diceId, needed).have < needed) {
        toast('材料不足');
        return;
      }
    }
    for (const [diceId, needed] of potion.recipe) {
      if (String(diceId).startsWith('potion:')) {
        const potionId = diceId.slice(7);
        state.potions.inventory[potionId] = Math.max(0, (Number(state.potions.inventory[potionId]) || 0) - needed);
        continue;
      }
      let need = needed;
      const stash = Number(state.potions.materials[diceId]) || 0;
      const take = Math.min(stash, need);
      if (take) {
        state.potions.materials[diceId] = stash - take;
        need -= take;
      }
      if (!state.potions.materials[diceId]) delete state.potions.materials[diceId];
      if (need) {
        state.bag[diceId] = (Number(state.bag[diceId]) || 0) - need;
        if (state.bag[diceId] <= 0) delete state.bag[diceId];
      }
    }
    state.potions.inventory[id] = (Number(state.potions.inventory[id]) || 0) + 1;
    if (getCurrentUser()) {
      logCraft('potion', id, potion.name);
      logPotionAction(id, potion.name, 'craft', { cost: potion.cost, recipe: potion.recipe });
    }
    state.quest = state.quest || { rolls: 0, rare: 0, craft: 0 };
    state.quest.craft = (Number(state.quest.craft) || 0) + 1;
    checkAchievements();
    save();
    render();
    toast('合成成功：' + potion.name);
  }

  function usePotion(id) {
    const state = getState();
    const potion = POTIONS.find(item => item.id === id);
    if (!potion) return;
    state.potions = state.potions || fresh().potions;
    state.potions.inventory = state.potions.inventory || {};
    state.potions.activeSpeed = state.potions.activeSpeed || { type: '', expiresAt: 0 };
    const count = Number(state.potions.inventory[id]) || 0;
    if (count < 1) {
      toast('沒有這瓶藥水');
      return;
    }
    if (id === 'angel1' || id === 'angel2') {
      state.potions.inventory[id] = count - 1;
      state.potions.angelCharges = (Number(state.potions.angelCharges) || 0) + 1;
      state.potions.angelMode = id;
      if (getCurrentUser()) logPotionAction(id, potion.name, 'use', { mode: 'next_roll', charges: state.potions.angelCharges });
      save();
      render();
      toast(id === 'angel2'
        ? '天堂藥水 II 已準備好：更大幅度提升下一抽的機率'
        : '天堂藥水 I 已準備好：大幅提升下一抽的機率');
      return;
    }

    const slot = potion.speed ? 'activeSpeed' : 'active';
    const current = activePotion(potion.speed ? 'speed' : 'luck');
    const stored = state.potions[slot] || { type: '', expiresAt: 0 };
    let nextExpiry = Date.now() + potion.duration;
    if (current && stored.type === id) {
      nextExpiry = Math.max(Date.now(), Number(stored.expiresAt) || 0) + potion.duration;
    } else if (current && stored.type !== id) {
      if (!confirmAction(`目前的${current.name}仍在生效。使用${potion.name}會取代同類藥水效果與剩餘時間，另一類藥水不受影響。確定要更換嗎？`)) return;
    }
    state.potions.inventory[id] = count - 1;
    state.potions[slot] = { type: id, expiresAt: nextExpiry };
    if (getCurrentUser()) logPotionAction(id, potion.name, 'use', { expiresAt: new Date(nextExpiry).toISOString(), slot });
    restartAutoInterval();
    save();
    render();
    toast(current && current.id === id
      ? `${potion.name}時間已延長，剩餘 ${Math.ceil((nextExpiry - Date.now()) / 1000)} 秒`
      : `${potion.name}已生效 5 分鐘`);
  }
  let potionUISetup = false;
  function setupPotionUI() {
    if (potionUISetup) return false;
    potionUISetup = true;
    documentRef.addEventListener('click', event => {
      const target = event.target;
      const craftPotionButton = target.closest('[data-craft-potion]');
      const usePotionButton = target.closest('[data-use-potion]');
      const toggleAutoAddButton = target.closest('[data-toggle-auto-add]');
      if (toggleAutoAddButton) {
        const state = getState();
        state.potions = state.potions || fresh().potions;
        const id = toggleAutoAddButton.dataset.toggleAutoAdd;
        state.potions.autoAddPotions = Array.isArray(state.potions.autoAddPotions) ? state.potions.autoAddPotions : [];
        if (state.potions.autoAddPotions.includes(id)) {
          state.potions.autoAddPotions = state.potions.autoAddPotions.filter(value => value !== id);
        } else if (state.potions.autoAddPotions.length < 2) {
          state.potions.autoAddPotions.push(id);
        } else {
          toast('自動添加最多只能選擇 2 種藥水');
          return;
        }
        state.potions.autoAdd = state.potions.autoAddPotions.length > 0;
        save();
        renderPotions();
        return;
      }
      if (craftPotionButton) craftPotion(craftPotionButton.dataset.craftPotion);
      if (usePotionButton) usePotion(usePotionButton.dataset.usePotion);
    });

    documentRef.addEventListener('change', event => {
      const checkbox = event.target.closest('[data-auto-add-potion]');
      if (!checkbox) return;
      const state = getState();
      state.potions = state.potions || fresh().potions;
      state.potions.autoAddPotions = Array.isArray(state.potions.autoAddPotions) ? state.potions.autoAddPotions : [];
      const id = checkbox.dataset.autoAddPotion;
      if (checkbox.checked) {
        if (state.potions.autoAddPotions.length >= 2) {
          checkbox.checked = false;
          toast('自動添加最多只能選擇 2 種藥水');
          return;
        }
        if (!state.potions.autoAddPotions.includes(id)) state.potions.autoAddPotions.push(id);
      } else {
        state.potions.autoAddPotions = state.potions.autoAddPotions.filter(value => value !== id);
      }
      state.potions.autoAdd = state.potions.autoAddPotions.length > 0;
      save();
      renderPotions();
    });
    return true;
  }

  return {
    potionMaterialTotal,
    renderPotionAutoAddChoices,
    potionIngredientInfo,
    renderPotions,
    craftPotion,
    usePotion,
    setupPotionUI
  };
}
