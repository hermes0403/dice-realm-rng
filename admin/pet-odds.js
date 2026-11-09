/** Admin controls for editing and viewing global pet-fusion odds. */
export function setupAdminPetOddsUI({
  PET_TIER_RATES,
  PET_TIER_CONFIG,
  PET_RARITIES,
  supabaseClient,
  isAdmin,
  isCloudSyncBlocked = () => false,
  markCloudSyncBlocked = () => false,
  toast,
  loadAdminPetFusionLogs,
  renderPetChance,
  dicePairTier,
  byId,
  escapeHTML
}) {
  function petTierRangeLabel(tier) {
    const min = Number(tier.min_den || 2);
    const max = tier.max_den == null ? null : Number(tier.max_den);
    return max
      ? `1/${min.toLocaleString('en-US')}–1/${max.toLocaleString('en-US')}`
      : `1/${min.toLocaleString('en-US')} 以上`;
  }

  function petTierEntries() {
    return Object.keys(PET_TIER_RATES).map(key => ({
      tier: Number(key),
      min_den: Number(PET_TIER_CONFIG[key]?.min_den ?? (key == 1 ? 2 : 2)),
      max_den: PET_TIER_CONFIG[key]?.max_den ?? null,
      rates: PET_TIER_RATES[key]
    })).sort((a, b) => a.min_den - b.min_den);
  }

  function renderAdminPetTierOdds() {
    const box = document.getElementById('adminPetTierOdds');
    if (!box) return;
    const heads = PET_RARITIES.map(rarity =>
      `<th style="padding:7px;text-align:right;white-space:nowrap">${escapeHTML(rarity.name)}</th>`
    ).join('');
    const rows = petTierEntries().map(tier =>
      `<tr><td style="padding:7px;white-space:nowrap">第 ${tier.tier} 區</td><td style="padding:7px;white-space:nowrap">${petTierRangeLabel(tier)}</td>${PET_RARITIES.map(rarity => `<td style="padding:7px;text-align:right">${Number(tier.rates[rarity.id] || 0)}%</td>`).join('')}</tr>`
    ).join('');
    box.innerHTML = `<table style="width:100%;border-collapse:collapse;min-width:600px"><thead><tr><th style="padding:7px;text-align:left">區間</th><th style="padding:7px;text-align:left">骰子機率範圍</th>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
    const select = document.getElementById('adminPetOddsTier');
    if (select) {
      const current = select.value;
      select.innerHTML = petTierEntries().map(tier =>
        `<option value="${tier.tier}">第 ${tier.tier} 區｜${petTierRangeLabel(tier)}</option>`
      ).join('');
      if (PET_TIER_RATES[current]) select.value = current;
    }
  }

  function updateAdminPetOddsTotal() {
    const keys = ['common', 'rare', 'legendary', 'mythic', 'secret'];
    const sum = keys.reduce((total, key) => total + (Number(document.getElementById('adminPetOdds_' + key)?.value) || 0), 0);
    const output = document.getElementById('adminPetOddsTotal');
    if (output) output.textContent = `總和：${Number(sum.toFixed(4))}%${Math.abs(sum - 100) < 0.0001 ? '（符合）' : '（必須等於 100%）'}`;
    return sum;
  }

  function fillAdminPetOddsEditor() {
    const tier = Number(document.getElementById('adminPetOddsTier')?.value) || 1;
    const rates = PET_TIER_RATES[tier] || PET_TIER_RATES[1];
    const config = PET_TIER_CONFIG[tier] || {};
    for (const key of ['common', 'rare', 'legendary', 'mythic', 'secret']) {
      const input = document.getElementById('adminPetOdds_' + key);
      if (input) input.value = Number(rates[key] || 0);
    }
    const min = document.getElementById('adminPetOddsMin');
    const max = document.getElementById('adminPetOddsMax');
    if (min) min.value = config.min_den ?? '';
    if (max) max.value = config.max_den ?? '';
    updateAdminPetOddsTotal();
  }

  async function loadPetFusionOdds() {
    if (!supabaseClient || isCloudSyncBlocked()) return;
    try {
      const { data, error } = await supabaseClient.from('pet_fusion_odds')
        .select('tier,min_den,max_den,rates').order('min_den', { ascending: true });
      if (error) throw error;
      (data || []).forEach(row => {
        const tier = Number(row.tier);
        const rates = row.rates;
        if (tier >= 1 && tier <= 100 && rates && typeof rates === 'object') {
          PET_TIER_CONFIG[tier] = { min_den: Number(row.min_den), max_den: row.max_den == null ? null : Number(row.max_den) };
          PET_TIER_RATES[tier] = Object.fromEntries(['common', 'rare', 'legendary', 'mythic', 'secret'].map(key => [key, Number(rates[key]) || 0]));
        }
      });
      const slotA = document.getElementById('petDiceSlotA')?.value;
      const slotB = document.getElementById('petDiceSlotB')?.value;
      renderPetChance(slotA && slotB ? dicePairTier(byId(slotA), byId(slotB)) : 0);
      renderAdminPetTierOdds();
      if (isAdmin()) fillAdminPetOddsEditor();
    } catch (error) {
      markCloudSyncBlocked(error);
      console.warn('讀取全服寵物機率失敗，暫用內建預設值：', error.message || error);
    }
  }

  document.getElementById('adminPetOddsTier')?.addEventListener('change', fillAdminPetOddsEditor);
  for (const key of ['common', 'rare', 'legendary', 'mythic', 'secret']) {
    document.getElementById('adminPetOdds_' + key)?.addEventListener('input', updateAdminPetOddsTotal);
  }
  document.getElementById('adminPetOddsAdd')?.addEventListener('click', () => {
    if (!isAdmin()) return;
    const tiers = petTierEntries();
    const tier = Math.max(0, ...tiers.map(item => item.tier)) + 1;
    if (tier > 100) {
      toast('最多只能設定 100 個區間');
      return;
    }
    const last = tiers.at(-1);
    const min = last?.max_den == null ? ((last?.min_den || 1) + 1) : last.max_den + 1;
    if (last?.max_den == null && last) PET_TIER_CONFIG[last.tier].max_den = min - 1;
    PET_TIER_CONFIG[tier] = { min_den: min, max_den: null };
    PET_TIER_RATES[tier] = { ...(last?.rates || { common: 0, rare: 0, legendary: 100, mythic: 0, secret: 0 }) };
    renderAdminPetTierOdds();
    document.getElementById('adminPetOddsTier').value = String(tier);
    fillAdminPetOddsEditor();
    document.getElementById('adminPetOddsStatus').textContent = '已新增未儲存區間；請設定骰子分母範圍與品質機率後儲存。';
  });
  document.getElementById('adminPetOddsSave')?.addEventListener('click', async () => {
    const status = document.getElementById('adminPetOddsStatus');
    const button = document.getElementById('adminPetOddsSave');
    const tier = Number(document.getElementById('adminPetOddsTier')?.value);
    const min = Number(document.getElementById('adminPetOddsMin')?.value);
    const maxRaw = document.getElementById('adminPetOddsMax')?.value.trim();
    const max = maxRaw === '' ? null : Number(maxRaw);
    const rates = Object.fromEntries(['common', 'rare', 'legendary', 'mythic', 'secret'].map(key => [key, Number(document.getElementById('adminPetOdds_' + key)?.value)]));
    const sum = Object.values(rates).reduce((total, value) => total + value, 0);
    if (!isAdmin()) { status.textContent = '沒有管理員權限'; return; }
    if (isCloudSyncBlocked()) { status.textContent = '雲端服務受限，暫時無法儲存。'; return; }
    if (!Number.isSafeInteger(min) || min < 2 || (max !== null && (!Number.isSafeInteger(max) || max < min))) {
      status.textContent = '骰子分母範圍格式錯誤';
      return;
    }
    if (Object.values(rates).some(value => !Number.isFinite(value) || value < 0 || value > 100) || Math.abs(sum - 100) > 0.0001) {
      status.textContent = `儲存失敗：五項機率總和必須等於 100%（目前 ${sum}%）`;
      return;
    }
    button.disabled = true;
    status.textContent = '正在儲存全服機率…';
    try {
      const { error } = await supabaseClient.rpc('admin_save_pet_fusion_tier', {
        p_tier: tier, p_min_den: min, p_max_den: max, p_rates: rates
      });
      if (error) throw error;
      PET_TIER_CONFIG[tier] = { min_den: min, max_den: max };
      PET_TIER_RATES[tier] = rates;
      renderAdminPetTierOdds();
      const a = document.getElementById('petDiceSlotA')?.value;
      const b = document.getElementById('petDiceSlotB')?.value;
      if (a && b) renderPetChance(dicePairTier(byId(a), byId(b)));
      status.textContent = `第 ${tier} 區範圍與機率已儲存並套用全服。`;
      toast(`第 ${tier} 區寵物合成設定已更新`);
    } catch (error) {
      markCloudSyncBlocked(error);
      status.textContent = '儲存失敗：' + (error.message || '未知錯誤');
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('adminPetFusionRefresh')?.addEventListener('click', loadAdminPetFusionLogs);
  document.getElementById('adminPetFusionLogsFold')?.addEventListener('toggle', event => {
    if (event.target.open) {
      loadAdminPetFusionLogs();
      renderAdminPetTierOdds();
    }
  });

  return { petTierEntries, renderAdminPetTierOdds, fillAdminPetOddsEditor, updateAdminPetOddsTotal, loadPetFusionOdds };
}
