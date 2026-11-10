/** Shark Emperor limited-event panel. The server is authoritative for balances and egg opening. */
export function createSharkEventUI({
  supabaseClient,
  getCurrentUser,
  isAdmin,
  loadCloudSave,
  render,
  toast,
  documentRef = document
}) {
  let busy = false;
  let lastState = null;

  const byId = id => documentRef.getElementById(id);
  const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number(value) || 0);

  function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = value;
  }

  function renderState(state) {
    lastState = state;
    setText('sharkCoinBalance', number(state.shark_coins) + ' 枚');
    setText('dragonEggBalance', number(state.dragon_eggs) + ' 顆');
    setText('sharkTaskCount', number(state.completed_tasks) + ' / ' + number(state.total_tasks));
    const task = state.current_task;
    const title = byId('sharkCurrentTaskTitle');
    const progress = byId('sharkTaskProgress');
    const reward = byId('sharkTaskReward');
    const bar = byId('sharkTaskProgressBar');
    const status = byId('sharkEventStatus');
    if (!task) {
      if (title) title.textContent = '所有活動任務已完成';
      if (progress) progress.textContent = number(state.total_tasks) + ' 項任務已全部完成，後續新增任務將自動接續。';
      if (reward) reward.textContent = '活動完成';
      if (bar) bar.style.width = '100%';
      if (status) status.textContent = 'SHARK EMPEROR · ALL TASKS CLEARED';
    } else {
      if (title) title.textContent = task.order + '. ' + task.title;
      if (progress) progress.textContent = number(task.progress) + ' / ' + number(task.target);
      if (reward) reward.textContent = '+' + number(task.reward) + ' 鯊皇幣';
      if (bar) bar.style.width = Math.min(100, Math.max(0, (Number(task.progress) || 0) / Math.max(1, Number(task.target) || 1) * 100)) + '%';
      if (status) {
        const serverTracked = ['weather_summon_special', 'pet_sale'].includes(task.event_key);
        status.textContent = serverTracked
          ? '目前任務進度由伺服器驗證並保存。'
          : '此項目等待對應的伺服器權威遊戲事件接通；接通前不接受前端自行回報的進度。';
      }
    }
    const openButton = byId('openDragonCrystalEggBtn');
    if (openButton) openButton.disabled = busy || Number(state.dragon_eggs) < 1;
    const count = byId('dragonEggOpenHint');
    if (count) count.textContent = Number(state.dragon_eggs) > 0
      ? '持有 ' + number(state.dragon_eggs) + ' 顆龍晶蛋'
      : '目前沒有龍晶蛋';
  }

  async function load() {
    if (!isAdmin()) return false;
    if (!getCurrentUser() || !supabaseClient) {
      setText('sharkEventStatus', '請先登入管理員帳號。');
      return false;
    }
    if (busy) return false;
    const status = byId('sharkEventStatus');
    if (status) status.textContent = '正在同步活動資料…';
    try {
      const { data, error } = await supabaseClient.rpc('get_shark_event_state');
      if (error) throw error;
      if (!data) throw new Error('伺服器沒有回傳活動資料');
      renderState(data);
      return true;
    } catch (error) {
      console.error('Shark event state load failed', error);
      setText('sharkEventStatus', '活動資料載入失敗：' + (error.message || '請稍後再試'));
      return false;
    }
  }

  async function grantCoins() {
    if (!isAdmin() || busy) return false;
    const userId = byId('sharkGrantUserId')?.value?.trim();
    const amount = Number(byId('sharkGrantAmount')?.value);
    const reason = byId('sharkGrantReason')?.value?.trim() || '管理員活動獎勵';
    const status = byId('sharkGrantStatus');
    if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      if (status) status.textContent = '請輸入正確的玩家 UUID。';
      return false;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      if (status) status.textContent = '發放數量需大於 0，且不可超過 1,000,000。';
      return false;
    }
    busy = true;
    const button = byId('grantSharkCoinsBtn');
    if (button) button.disabled = true;
    if (status) status.textContent = '正在送出發放請求…';
    try {
      const { data, error } = await supabaseClient.rpc('admin_grant_shark_coins', {
        p_target_user_id: userId,
        p_amount: amount,
        p_idempotency_key: crypto.randomUUID(),
        p_reason: reason
      });
      if (error) throw error;
      if (status) status.textContent = '發放成功；該玩家目前餘額：' + number(data?.shark_coins) + ' 枚。';
      toast('已發放 ' + number(amount) + ' 枚鯊皇幣');
      busy = false;
      await load();
      return true;
    } catch (error) {
      console.error('Shark Coin admin grant failed', error);
      if (status) status.textContent = '發放失敗：' + (error.message || '請稍後再試');
      return false;
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }

  async function openEgg() {
    if (!isAdmin() || busy) return false;
    if (!getCurrentUser() || !supabaseClient) {
      toast('請先登入管理員帳號');
      return false;
    }
    if (Number(lastState?.dragon_eggs) < 1) {
      toast('目前沒有龍晶蛋');
      return false;
    }
    const button = byId('openDragonCrystalEggBtn');
    busy = true;
    if (button) {
      button.disabled = true;
      button.textContent = '正在開啟…';
    }
    try {
      const { data, error } = await supabaseClient.rpc('open_dragon_crystal_egg', {
        p_idempotency_key: crypto.randomUUID()
      });
      if (error) throw error;
      if (!data?.pet?.id) throw new Error('伺服器沒有回傳寵物資料');
      await loadCloudSave();
      render();
      busy = false;
      await load();
      const petNames = {
        event_crystal_bronze_beast: '晶銅獸',
        event_mirror_ice_spirit: '鏡冰靈',
        event_crystal_dragon_sentinel: '晶龍哨兵',
        event_dual_core_dragon: '異核雙子龍',
        event_moonlight_dragon: '月光龍',
        event_shark_emperor: '鯊皇'
      };
      const name = petNames[data.pet.id] || '活動寵物';
      const result = byId('dragonEggResult');
      if (result) {
        result.hidden = false;
        result.textContent = '✦ 開啟成功：' + name;
      }
      toast('龍晶蛋開啟成功：' + name);
      return true;
    } catch (error) {
      console.error('Dragon Crystal Egg opening failed', error);
      toast('開啟失敗：' + (error.message || '請稍後再試'));
      return false;
    } finally {
      busy = false;
      if (button) {
        button.textContent = '✦ 開啟龍晶蛋';
        button.disabled = Number(lastState?.dragon_eggs) < 1;
      }
    }
  }

  function setup() {
    const openButton = byId('openDragonCrystalEggBtn');
    if (openButton) openButton.addEventListener('click', openEgg);
    const grantButton = byId('grantSharkCoinsBtn');
    if (grantButton) grantButton.addEventListener('click', grantCoins);
    const refreshButton = byId('refreshSharkEventBtn');
    if (refreshButton) refreshButton.addEventListener('click', load);
    const oddsButton = byId('sharkEggOddsToggle');
    const oddsPanel = byId('sharkEggOddsPanel');
    if (oddsButton && oddsPanel) {
      oddsButton.addEventListener('click', () => {
        const expanded = oddsButton.getAttribute('aria-expanded') === 'true';
        oddsButton.setAttribute('aria-expanded', String(!expanded));
        oddsPanel.hidden = expanded;
      });
    }
  }

  setup();
  return { load, openEgg, renderState };
}
