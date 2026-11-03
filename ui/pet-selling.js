/** Pet selling and pet auto-sale modal interactions. */
export function setupPetSellingUI({
  getState,
  petById,
  petRarity,
  petArt,
  escapeHTML,
  save,
  toast,
  render,
  renderPetsPage,
  coinEarningMultiplier,
  supabaseClient,
  getCurrentUser
}) {
  const ready = callback => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  };

  ready(() => {
    const $ = id => document.getElementById(id);
    const values = { common: 100, rare: 1000, legendary: 10000, mythic: 50000, secret: 100000 };
    const order = { common: 0, rare: 1, legendary: 2, mythic: 3, secret: 4 };
    const listPets = () => {
      const pets = getState().pets;
      return Array.isArray(pets) ? pets : [];
    };
    const rarityOf = item => petById(item && item.id)?.rarity || 'common';

    let selling = false;

    function updateSummary() {
      const summary = $('petSellSummary');
      const confirmButton = $('petSellConfirmBtn');
      if (!summary) return;
      const ids = [...document.querySelectorAll('#petSellChoices .pet-sell-check:checked')].map(input => input.value);
      let total = 0;
      for (const uid of ids) {
        const item = listPets().find(pet => String(pet.uid) === uid);
        if (item) total += values[rarityOf(item)] || 100;
      }
      summary.textContent = `已選擇 ${ids.length} 隻寵物，合計可獲得 ${total.toLocaleString('en-US')}$。`;
      if (confirmButton) confirmButton.disabled = selling || ids.length === 0;
    }

    function renderChoices() {
      const list = $('petSellChoices');
      if (!list) return;
      const pets = [...listPets()].sort((a, b) => (order[rarityOf(a)] ?? 99) - (order[rarityOf(b)] ?? 99));
      list.innerHTML = pets.map(item => {
        const pet = petById(item.id);
        if (!pet) return '';
        const rarity = rarityOf(item);
        const price = values[rarity] || 100;
        return `<label class="pet-sell-choice"><input type="checkbox" class="pet-sell-check" value="${escapeHTML(item.uid)}"><span class="pet-sell-choice-art">${petArt(pet, true)}</span><span class="pet-sell-choice-info"><b class="${petRarity(rarity).cls}">${escapeHTML(pet.name)}</b><small>${petRarity(rarity).name} · 出售可得 ${price.toLocaleString('en-US')}$</small></span></label>`;
      }).join('') || '<div class="empty">目前沒有可出售的寵物。</div>';
      updateSummary();
    }

    function open() {
      const modal = $('petSellModal');
      if (!modal) return;
      renderChoices();
      modal.hidden = false;
      modal.style.display = 'flex';
      document.body.classList.add('pet-sell-open');
    }

    function close() {
      const modal = $('petSellModal');
      if (modal) {
        modal.hidden = true;
        modal.style.display = 'none';
      }
      const autoModal = $('petAutoSellModal');
      if (autoModal) {
        autoModal.hidden = true;
        autoModal.style.display = 'none';
      }
      document.body.classList.remove('pet-sell-open');
    }

    // Capture click ensures this working handler wins over any stale listener registered earlier.
    document.addEventListener('click', async event => {
      const target = event.target;
      if (target.closest('#petSellBtn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        open();
        return;
      }
      if (target.closest('#petAutoSellBtn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const S = getState();
        const modal = $('petAutoSellModal');
        S.petAutoSellRarities = S.petAutoSellRarities || {};
        document.querySelectorAll('[data-auto-pet-rarity]').forEach(input => {
          input.checked = !!S.petAutoSellRarities[input.dataset.autoPetRarity];
        });
        modal.hidden = false;
        modal.style.display = 'flex';
        return;
      }
      if (target.closest('#petAutoSellClose')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        $('petAutoSellModal').hidden = true;
        $('petAutoSellModal').style.display = 'none';
        return;
      }
      if (target.closest('#petAutoSellSave')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const S = getState();
        S.petAutoSellRarities = {};
        document.querySelectorAll('[data-auto-pet-rarity]').forEach(input => {
          S.petAutoSellRarities[input.dataset.autoPetRarity] = input.checked;
        });
        save();
        $('petAutoSellModal').hidden = true;
        $('petAutoSellModal').style.display = 'none';
        toast('自動出售設定已保存');
        return;
      }
      if (target.closest('#petSellCancelBtn') || target.closest('#petSellCancelBtnBottom')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (target.closest('#petSellSelectAllBtn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.querySelectorAll('#petSellChoices .pet-sell-check').forEach(input => input.checked = true);
        updateSummary();
        return;
      }
      if (target.closest('#petSellClearBtn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.querySelectorAll('#petSellChoices .pet-sell-check').forEach(input => input.checked = false);
        updateSummary();
        return;
      }
      if (target.closest('#petSellConfirmBtn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (selling) return;
        const ids = [...document.querySelectorAll('#petSellChoices .pet-sell-check:checked')].map(input => input.value);
        if (!ids.length) {
          toast('請先選擇要出售的寵物');
          return;
        }
        const chosen = listPets().filter(item => ids.includes(String(item.uid)));
        let previewTotal = 0;
        chosen.forEach(item => previewTotal += values[rarityOf(item)] || 100);
        if (!chosen.length) return;
        if (!window.confirm(`確定出售選取的 ${chosen.length} 隻寵物，基本售價共 ${previewTotal.toLocaleString('en-US')}$？實際收益會依目前有效的金錢倍率計算，此操作無法復原。`)) return;

        selling = true;
        updateSummary();
        const S = getState();
        try {
          let soldCount = 0;
          let total = 0;
          if (getCurrentUser?.() && supabaseClient) {
            const { data, error } = await supabaseClient.rpc('sell_owned_pets', { p_pet_uids: ids });
            if (error) throw error;
            const result = Array.isArray(data) ? data[0] : data;
            if (!result || result.success !== true) throw new Error('伺服器未確認出售結果');
            soldCount = Math.max(0, Number(result.sold_count) || 0);
            total = Math.max(0, Number(result.coins_added) || 0);
            S.pets = Array.isArray(result.pets) ? result.pets : [];
            S.equippedPetUids = Array.isArray(result.equipped_pet_uids) ? result.equipped_pet_uids : [];
            S.coins = Math.max(0, Number(result.coins) || 0);
          } else {
            // Offline play remains local-only; signed-in accounts must use the server transaction.
            S.pets = listPets().filter(item => !ids.includes(String(item.uid)));
            S.equippedPetUids = (S.equippedPetUids || []).filter(uid => !ids.includes(String(uid)));
            total = Math.floor(previewTotal * coinEarningMultiplier());
            S.coins = (Number(S.coins) || 0) + total;
            soldCount = chosen.length;
          }

          save();
          close();
          render();
          renderPetsPage();
          if (soldCount > 0) toast(`已出售 ${soldCount} 隻寵物，獲得 +${total.toLocaleString('en-US')}/** Pet selling and pet auto-sale modal interactions. */
export function setupPetSellingUI({
  getState,
  petById,
  petRarity,
  petArt,
  escapeHTML,
  save,
  toast,
  render,
  renderPetsPage,
  coinEarningMultiplier,
  supabaseClient,
  getCurrentUser
}) {
  const ready = callback => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  };

  ready(() => {
    const $ = id => document.getElementById(id);
    const values = { common: 100, rare: 1000, legendary: 10000, mythic: 50000, secret: 100000 };
    const order = { common: 0, rare: 1, legendary: 2, mythic: 3, secret: 4 };
    const listPets = () => {
      const pets = getState().pets;
      return Array.isArray(pets) ? pets : [];
    };
    const rarityOf = item => petById(item && item.id)?.rarity || 'common';

    let selling = false;

    function updateSummary() {
      const summary = $('petSellSummary');
      const confirmButton = $('petSellConfirmBtn');
      if (!summary) return;
      const ids = [...document.querySelectorAll('#petSellChoices .pet-sell-check:checked')].map(input => input.value);
      let total = 0;
      for (const uid of ids) {
        const item = listPets().find(pet => String(pet.uid) === uid);
        if (item) total += values[rarityOf(item)] || 100;
      }
      summary.textContent = `已選擇 ${ids.length} 隻寵物，合計可獲得 ${total.toLocaleString('en-US')}$。`;
      if (confirmButton) confirmButton.disabled = selling || ids.length === 0;
    }

    function renderChoices() {
      const list = $('petSellChoices');
      if (!list) return;
      const pets = [...listPets()].sort((a, b) => (order[rarityOf(a)] ?? 99) - (order[rarityOf(b)] ?? 99));
      list.innerHTML = pets.map(item => {
        const pet = petById(item.id);
        if (!pet) return '';
        const rarity = rarityOf(item);
        const price = values[rarity] || 100;
        return `<label class="pet-sell-choice"><input type="checkbox" class="pet-sell-check" value="${escapeHTML(item.uid)}"><span class="pet-sell-choice-art">${petArt(pet, true)}</span><span class="pet-sell-choice-info"><b class="${petRarity(rarity).cls}">${escapeHTML(pet.name)}</b><small>${petRarity(rarity).name} · 出售可得 ${price.toLocaleString('en-US')}$</small></span></label>`;
      }).join('') || '<div class="empty">目前沒有可出售的寵物。</div>';
      updateSummary();
    }

    function open() {
      const modal = $('petSellModal');
      if (!modal) return;
      renderChoices();
      modal.hidden = false;
      modal.style.display = 'flex';
      document.body.classList.add('pet-sell-open');
    }

    function close() {
      const modal = $('petSellModal');
      if (modal) {
        modal.hidden = true;
        modal.style.display = 'none';
      }
      const autoModal = $('petAutoSellModal');
      if (autoModal) {
        autoModal.hidden = true;
        autoModal.style.display = 'none';
      }
      document.body.classList.remove('pet-sell-open');
    }

    // Capture click ensures this working handler wins over any stale listener registered earlier.
    document.addEventListener('click', event => {
      const target = event.target;
      if (target.closest('#petSellBtn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        open();
        return;
      }
      if (target.closest('#petAutoSellBtn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const S = getState();
        const modal = $('petAutoSellModal');
        S.petAutoSellRarities = S.petAutoSellRarities || {};
        document.querySelectorAll('[data-auto-pet-rarity]').forEach(input => {
          input.checked = !!S.petAutoSellRarities[input.dataset.autoPetRarity];
        });
        modal.hidden = false;
        modal.style.display = 'flex';
        return;
      }
      if (target.closest('#petAutoSellClose')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        $('petAutoSellModal').hidden = true;
        $('petAutoSellModal').style.display = 'none';
        return;
      }
      if (target.closest('#petAutoSellSave')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const S = getState();
        S.petAutoSellRarities = {};
        document.querySelectorAll('[data-auto-pet-rarity]').forEach(input => {
          S.petAutoSellRarities[input.dataset.autoPetRarity] = input.checked;
        });
        save();
        $('petAutoSellModal').hidden = true;
        $('petAutoSellModal').style.display = 'none';
        toast('自動出售設定已保存');
        return;
      }
      if (target.closest('#petSellCancelBtn') || target.closest('#petSellCancelBtnBottom')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (target.closest('#petSellSelectAllBtn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.querySelectorAll('#petSellChoices .pet-sell-check').forEach(input => input.checked = true);
        updateSummary();
        return;
      }
      if (target.closest('#petSellClearBtn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.querySelectorAll('#petSellChoices .pet-sell-check').forEach(input => input.checked = false);
        updateSummary();
        return;
      }
);
          else toast('選取的寵物已不在雲端清單中，已同步最新資料。');
        } catch (error) {
          console.error('Pet sale failed', error);
          toast(error?.message || '寵物出售失敗，請稍後重試');
        } finally {
          selling = false;
          updateSummary();
        }
        return;
      }
      if (target.id === 'petSellModal') close();
    }, true);

    document.addEventListener('change', event => {
      if (event.target.matches('#petSellChoices .pet-sell-check')) updateSummary();
    }, true);

    const modal = $('petSellModal');
    if (modal) {
      modal.hidden = true;
      modal.style.display = 'none';
    }
    const autoModal = $('petAutoSellModal');
    if (autoModal) {
      autoModal.hidden = true;
      autoModal.style.display = 'none';
    }
  });
}
