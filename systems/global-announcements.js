/** Global announcements, rare-roll broadcasts, weather notices, and pet-fusion logs. */
export function createGlobalAnnouncements(dependencies) {
  const {
    getState, getCurrentUser, weatherApi, supabaseClient, toast, isAdmin,
    petById, escapeHTML, format, WEATHER_TYPES, documentRef, timerManager
  } = dependencies;
  let announcementChannel = null;
  let weatherSurgeTimer = null;
  function addGlobalAnnouncement(name, den, at = Date.now()) {
    const list = documentRef.getElementById('globalAnnouncements');
    if (!list) return;
    // 「超有格調」是玩家名稱，不是稀有度標籤；公告固定單列並只顯示最新一筆。
    list.innerHTML = '';
    const line = documentRef.createElement('div');
    line.className = 'announcement-line';
    const safeName = String(name || '玩家').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const stamp = new Date(Number(at) || Date.now()).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    line.innerHTML = `<span class="announcement-message"><span class="announce-player">${safeName}</span> 抽到 <span class="announce-odds">1/${format(Number(den) || 0)}</span>！</span><time class="announcement-time" datetime="${new Date(Number(at) || Date.now()).toISOString()}">${stamp}</time>`;
    list.appendChild(line);
  }

  function triggerWeatherSurge(type) {
    if (!['crystal', 'hell'].includes(type)) return;
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
    const message = type === 'hell' ? `${safeName}玩家召喚了地獄天氣　稀有骰子出現率提高` : `${safeName}玩家召喚了水晶天氣`;
    line.textContent = message;
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
      pet_name: String(petById(p?.id)?.name || ''),
      rarity: String(rarity || ''),
      created_at: new Date().toISOString()
    };
    try {
      const { error } = await supabaseClient.from('pet_fusion_logs').insert(row);
      if (error) throw error;
    } catch (e) {
      console.warn('Pet fusion log write failed (pet_fusion_logs table/policies may need setup):', e.message || e);
    }
    if (rarity === 'secret') {
      const payload = { name: row.username, petName: row.pet_name, at: Date.now() };
      showSecretPetMarquee(payload.name, payload.petName, payload.at);
      try {
        if (announcementChannel) await announcementChannel.send({ type: 'broadcast', event: 'secret_pet', payload });
      } catch (e) {
        console.debug('Secret pet announcement broadcast unavailable', e);
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
        if (payload?.name && Number(payload.den) >= 2048) addGlobalAnnouncement(payload.name, Number(payload.den), payload.at || Date.now());
      });
      announcementChannel.on('broadcast', { event: 'secret_pet' }, ({ payload }) => {
        if (payload?.name && payload?.petName) showSecretPetMarquee(payload.name, payload.petName, payload.at || Date.now());
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
      announcementChannel.subscribe();
    } catch (e) {
      console.warn('Announcement channel unavailable', e);
    }
  }

  async function broadcastRareRoll(d) {
    const state = getState();
    const currentUser = getCurrentUser();
    if (!d || d.den < 2048) return;
    addGlobalAnnouncement(state.name, d.den, Date.now());
    if (announcementChannel) announcementChannel.send({ type: 'broadcast', event: 'rare_roll', payload: { name: state.name || '玩家', den: d.den, diceName: d.name, at: Date.now() } }).catch?.(() => {});
    if (d.den >= 4096 && currentUser && supabaseClient) {
      const record = { user_id: currentUser.id, username: (state.name || '玩家').slice(0, 20), dice_name: d.name, den: Number(d.den) };
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
    recordPetFusion,
    loadAdminPetFusionLogs,
    setupGlobalAnnouncements,
    broadcastRareRoll,
    getAnnouncementChannel
  };
}
