/** Global announcements, rare-roll broadcasts, weather notices, and pet-fusion logs. */
export function createGlobalAnnouncements(dependencies) {
  const {
    getState, getCurrentUser, weatherApi, supabaseClient, toast, isAdmin,
    petById, escapeHTML, format, WEATHER_TYPES, documentRef, timerManager
  } = dependencies;
  const RARE_ROLL_ANNOUNCEMENT_MIN_DENOMINATOR = 4096;
  let announcementChannel = null;
  let weatherSurgeTimer = null;
  function addGlobalAnnouncement(name, den, at = Date.now(), diceName = '') {
    const list = documentRef.getElementById('globalAnnouncements');
    if (!list) return;
    // 「超有格調」是玩家名稱，不是稀有度標籤；公告固定單列並只顯示最新一筆。
    list.innerHTML = '';
    const line = documentRef.createElement('div');
    line.className = 'announcement-line';
    const rawName = String(name || '').trim();
    const nameCharacters = Array.from(rawName);
    const displayName = nameCharacters.length > 4 ? nameCharacters.slice(0, 4).join('') + '..' : rawName;
    const safeName = displayName.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const safeDiceName = String(diceName || '稀有骰子').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const stamp = new Date(Number(at) || Date.now()).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    line.innerHTML = `<span class="announcement-message"><span class="announce-player">玩家${safeName}</span>抽到了<span class="announce-odds">1/${format(Number(den) || 0)}</span> <span class="announce-dice">${safeDiceName}</span></span><time class="announcement-time" datetime="${new Date(Number(at) || Date.now()).toISOString()}">${stamp}</time>`;
    list.appendChild(line);
  }

  function triggerWeatherSurge(type) {
    if (!['crystal', 'hell', 'glitch'].includes(type)) return;
    timerManager.clearTimeout(weatherSurgeTimer);
    weatherSurgeTimer = null;
    const old = documentRef.querySelector('.weather-surge');
    if (old) old.remove();
    const overlay = documentRef.createElement('div');
    overlay.className = 'weather-surge ' + type;
    overlay.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 22; i++) {
      const spark = documentRef.createElement('i');
      spark.style.setProperty('--x', (Math.random() * 100).toFixed(2) + '%');
      spark.style.setProperty('--y', (35 + Math.random() * 65).toFixed(2) + '%');
      spark.style.setProperty('--size', (3 + Math.random() * 7).toFixed(1) + 'px');
      spark.style.animationDelay = (Math.random() * .6).toFixed(2) + 's';
      overlay.appendChild(spark);
    }
    documentRef.body.appendChild(overlay);
    const timer = timerManager.setTimeout(() => {
      overlay.remove();
      if (weatherSurgeTimer === timer) weatherSurgeTimer = null;
    }, 3600, 'weather-surge-overlay');
    weatherSurgeTimer = timer;
  }

  function announceWeatherSummon(type, by, at = Date.now()) {
    const list = documentRef.getElementById('globalAnnouncements');
    if (!list) return;
    const meta = WEATHER_TYPES[type];
    if (!meta) return;
    list.innerHTML = '';
    const line = documentRef.createElement('div');
    line.className = 'announcement-line weather-summon-announcement ' + type;
    const safeName = String(by || '玩家').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const message = type === 'shark' ? `${safeName}管理員啟動了鯊鯊天氣　擲骰速度提高 100%` : type === 'hell' ? `${safeName}玩家召喚了地獄天氣　稀有骰子出現率提高` : type === 'glitch' ? `${safeName}玩家召喚了故障天氣　四顆故障骰子權重提高 10 倍` : `${safeName}玩家召喚了水晶天氣`;
    line.textContent = message;
    let playCount = 1;
    line.addEventListener('animationend', () => {
      if (line.parentNode !== list) return;
      if (playCount >= 2) {
        line.remove();
        return;
      }
      playCount += 1;
      line.style.animation = 'none';
      void line.offsetWidth;
      line.style.animation = '';
    });
    list.appendChild(line);
  }

  function showSecretPetMarquee(playerName, petName, at = Date.now()) {
    let el = documentRef.getElementById('secretPetMarquee');
    if (!el) {
      el = documentRef.createElement('div');
      el.id = 'secretPetMarquee';
      el.className = 'secret-pet-marquee';
      el.innerHTML = '<div class="secret-pet-marquee-inner"></div>';
      documentRef.body.appendChild(el);
    }
    const safe = v => String(v || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    el.querySelector('.secret-pet-marquee-inner').innerHTML = `✦ 秘密階級降臨 ✦ ${safe(playerName)} 合成出 ${safe(petName)}！ ✦`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function showPetFusionMarquee(playerName, petName, rarity, at = Date.now()) {
    const rarityLabels = { mythic: '神話', secret: '秘密', eternal: '永恆' };
    const rarityLabel = rarityLabels[rarity];
    if (!rarityLabel) return false;
    let el = documentRef.getElementById('secretPetMarquee');
    if (!el) {
      el = documentRef.createElement('div');
      el.id = 'secretPetMarquee';
      el.className = 'secret-pet-marquee';
      el.innerHTML = '<div class="secret-pet-marquee-inner"></div>';
      documentRef.body.appendChild(el);
    }
    const inner = el.querySelector('.secret-pet-marquee-inner');
    if (!inner) return false;
    inner.textContent = `玩家${String(playerName || '玩家')} 召喚到${rarityLabel}寵物 ${String(petName || '未知寵物')}`;
    el.dataset.rarity = rarity;
    el.dataset.announcedAt = String(Number(at) || Date.now());
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    return true;
  }

  async function recordPetFusion(d, p, rarity) {
    const currentUser = getCurrentUser();
    if (!currentUser || !supabaseClient) return;
    const state = getState();
    const row = {
      user_id: currentUser.id,
      username: String(state.name || currentUser.email || '玩家').slice(0, 40),
      dice_name: String(d?.name || ''),
      dice_den: Number(d?.den) || 0,
      pet_id: String(p?.id || ''),
      pet_uid: String(p?.uid || ''),
      pet_name: String(petById(p?.id)?.name || ''),
      rarity: String(rarity || ''),
      pet_kg: Number.isFinite(Number(p?.kg)) ? Math.max(1, Math.floor(Number(p.kg))) : null,
      pet_variant: p?.variant == null ? null : String(p.variant),
      pet_mutation: p?.mutation == null ? null : String(p.mutation),
      pet_source_tier: Number.isFinite(Number(p?.sourceTier)) ? Math.floor(Number(p.sourceTier)) : null,
      auto_sold: p?.autoSold === true,
      created_at: new Date().toISOString()
    };
    try {
      const { error } = await supabaseClient.from('pet_fusion_logs').insert(row);
      if (error) throw error;
    } catch (e) {
      console.warn('Pet fusion log write failed (pet_fusion_logs table/policies may need setup):', e.message || e);
    }
    if (['mythic', 'secret', 'eternal'].includes(rarity)) {
      const payload = { name: row.username, petName: row.pet_name, rarity, at: Date.now(), announcementVersion: 2 };
      showPetFusionMarquee(payload.name, payload.petName, payload.rarity, payload.at);
      try {
        if (announcementChannel) {
          await announcementChannel.send({ type: 'broadcast', event: 'rare_pet_fusion', payload });
          // Keep old clients' secret-pet marquee working; v2 clients ignore this compatibility event.
          if (rarity === 'secret') {
            await announcementChannel.send({ type: 'broadcast', event: 'secret_pet', payload: { name: payload.name, petName: payload.petName, at: payload.at, announcementVersion: 2 } });
          }
        }
      } catch (e) {
        console.debug('Rare pet announcement broadcast unavailable', e);
      }
    }
  }

  async function loadAdminPetFusionLogs() {
    if (!isAdmin()) return;
    const box = documentRef.getElementById('adminPetFusionLogsList');
    if (!box) return;
    box.innerHTML = '<div class="empty">正在載入所有玩家的合成紀錄…</div>';
    try {
      const { data, error } = await supabaseClient.from('pet_fusion_logs').select('username,dice_name,dice_den,pet_name,rarity,created_at').order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) {
        box.innerHTML = '<div class="empty">目前沒有合成紀錄。</div>';
        return;
      }
      const labels = { common: '普通', rare: '稀有', legendary: '傳奇', mythic: '神話', secret: '秘密' };
      box.innerHTML = rows.map(r => `<div class="admin-player"><div><b>${escapeHTML(r.username || '玩家')}　<span class="${r.rarity === 'secret' ? 'pet-rarity-secret' : ''}">${escapeHTML(labels[r.rarity] || r.rarity || '未知')} · ${escapeHTML(r.pet_name || '未知寵物')}</span></b><div class="mini">材料：${escapeHTML(r.dice_name || '未知骰子')}（1/${format(Number(r.dice_den) || 0)}）</div></div><time class="mini">${escapeHTML(r.created_at ? new Date(r.created_at).toLocaleString('zh-TW') : '時間未知')}</time></div>`).join('');
    } catch (e) {
      box.innerHTML = `<div class="empty">讀取失敗：${escapeHTML(e.message || '未知錯誤')}<br>若顯示資料表不存在，需先在 Supabase 建立 pet_fusion_logs 資料表與存取政策。</div>`;
    }
  }

  function setupGlobalAnnouncements() {
    if (!supabaseClient || announcementChannel) return;
    try {
      announcementChannel = supabaseClient.channel('dice-realm-global-announcements');
      announcementChannel.on('broadcast', { event: 'rare_roll' }, ({ payload }) => {
        const den = Number(payload?.den);
        if (payload && Number.isFinite(den) && den >= RARE_ROLL_ANNOUNCEMENT_MIN_DENOMINATOR) {
          addGlobalAnnouncement(payload.name || '', den, payload.at || Date.now(), payload.diceName);
        }
      });
      announcementChannel.on('broadcast', { event: 'rare_pet_fusion' }, ({ payload }) => {
        if (payload?.name && payload?.petName && ['mythic', 'secret', 'eternal'].includes(payload.rarity)) {
          showPetFusionMarquee(payload.name, payload.petName, payload.rarity, payload.at || Date.now());
        }
      });
      announcementChannel.on('broadcast', { event: 'secret_pet' }, ({ payload }) => {
        if (payload?.name && payload?.petName && payload.announcementVersion !== 2) {
          showSecretPetMarquee(payload.name, payload.petName, payload.at || Date.now());
        }
      });
      announcementChannel.on('broadcast', { event: 'weather_changed' }, ({ payload }) => {
        if (payload?.type && Number(payload.until) > Date.now()) {
          weatherApi.applyForcedWeather(payload);
          toast('全服天氣已轉換：' + (WEATHER_TYPES[payload.type]?.label || '晴天') + (payload.type2 ? '＋' + (WEATHER_TYPES[payload.type2]?.label || payload.type2) : ''));
        }
      });
      announcementChannel.on('broadcast', { event: 'weather_summoned' }, ({ payload }) => {
        if (payload?.weather_type && payload?.ends_at) weatherApi.applyServerWeatherRow({ weather_type: payload.weather_type, weather_type_2: payload.weather_type_2, ends_at: payload.ends_at, summoned_by: payload.summoned_by, updated_at: payload.updated_at }, true);
      });
      announcementChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'realm_weather_state' }, ({ new: row }) => {
        if (row) weatherApi.applyServerWeatherRow(row, true);
      });
      announcementChannel.subscribe();
    } catch (e) {
      console.warn('Announcement channel unavailable', e);
    }
  }

  async function broadcastRareRoll(d, weatherType = 'sunny') {
    const baseDen = Number(d?.den);
    if (!d || !Number.isFinite(baseDen) || baseDen < RARE_ROLL_ANNOUNCEMENT_MIN_DENOMINATOR) return;
    // 故障骰在地獄天氣下，百萬至一億分母的實際權重提升 4%；公告與歷史紀錄顯示有效分母。
    const den = weatherType === 'hell' && d.glitchBonus && baseDen >= 1000000 && baseDen <= 100000000
      ? Math.floor(baseDen / 1.04)
      : baseDen;
    const state = getState();
    const currentUser = getCurrentUser();
    const at = Date.now();
    addGlobalAnnouncement(state.name, den, at, d.name);
    if (announcementChannel) announcementChannel.send({ type: 'broadcast', event: 'rare_roll', payload: { name: state.name || '', den, diceName: d.name, at } }).catch?.(() => {});
    if (currentUser && supabaseClient) {
      const record = { user_id: currentUser.id, username: (state.name || '玩家').slice(0, 20), dice_name: d.name, den };
      try {
        const { error } = await supabaseClient.from('roll_announcements').insert(record);
        if (error) throw error;
      } catch (error) {
        console.error('Rare roll history insert failed', error);
        toast('稀有擲骰紀錄未能寫入雲端：' + (error.message || '請檢查資料表權限'));
      }
    }
  }
  function getAnnouncementChannel() { return announcementChannel; }

  return {
    addGlobalAnnouncement,
    triggerWeatherSurge,
    announceWeatherSummon,
    showSecretPetMarquee,
    showPetFusionMarquee,
    recordPetFusion,
    loadAdminPetFusionLogs,
    setupGlobalAnnouncements,
    broadcastRareRoll,
    getAnnouncementChannel
  };
}
