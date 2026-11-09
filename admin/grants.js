/** Admin edge-function requests and grant-history presentation. */
export function createAdminGrantService({
  supabaseClient,
  isAdmin,
  SUPABASE_URL,
  SUPABASE_KEY,
  D,
  ADMIN_GRANT_LABELS,
  escapeHTML,
  format,
  fetchRef = globalThis.fetch,
  isCloudSyncBlocked = () => false,
  markCloudSyncBlocked = () => false
}) {
  async function adminApi(payload) {
    if (!isAdmin()) throw new Error('沒有管理員權限');
    if (isCloudSyncBlocked()) throw new Error('雲端服務受限，管理功能暫停。');
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) throw new Error('登入狀態已失效，請重新登入');
      const response = await fetchRef(SUPABASE_URL + '/functions/v1/dice-rng-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + session.access_token
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({ error: '伺服器回應格式錯誤' }));
      if (!response.ok) {
        const error = new Error((data.error || '管理操作失敗') + '（HTTP ' + response.status + '）');
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      markCloudSyncBlocked(error);
      throw error;
    }
  }

  async function writeAdminGrantLog() {
    // dice-rng-admin writes the authoritative record to public.admin_actions.
    // Do not write to the legacy admin_grant_logs table.
  }

  async function loadAdminGrantHistory() {
    if (isCloudSyncBlocked()) return;
    const list = document.getElementById('adminGrantHistoryList');
    const status = document.getElementById('adminGrantHistoryStatus');
    if (!isAdmin()) {
      list.innerHTML = '<div class="empty">沒有管理員權限。</div>';
      return;
    }
    list.innerHTML = '<div class="empty">正在讀取雲端發放紀錄…</div>';
    status.textContent = '正在載入…';
    try {
      const { data, error } = await supabaseClient.from('admin_actions')
        .select('admin_email,action_type,details,affected_count,created_at')
        .order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      const rows = (data || []).filter(row => String(row.action_type || '').startsWith('grant_')).slice(0, 200);
      if (!rows.length) {
        list.innerHTML = '<div class="empty">目前沒有發放紀錄。</div>';
        status.textContent = '讀取完成；0 筆紀錄。';
        return;
      }
      list.innerHTML = rows.map(row => {
        const details = row.details || {};
        const date = row.created_at ? new Date(row.created_at).toLocaleString('zh-TW', { hour12: false }) : '時間未知';
        const type = details.type || '';
        const item = type === 'coins' ? '遊戲幣 ($)'
          : type === 'aura' ? (D.find(dice => dice.id === details.auraId)?.name || details.auraName || details.auraId || '光環／骰子')
          : type === 'potion' ? (ADMIN_GRANT_LABELS[details.potionId] || details.potionName || details.potionId || '藥水')
          : (details.itemName || details.itemId || row.action_type);
        const target = details.scope === 'all' ? '全體玩家' : (details.username || details.targetUsername || '指定玩家');
        const amount = (Number(details.amount) || 0).toLocaleString('en-US');
        const detail = details.scope === 'all' ? `每位 ${amount}；影響 ${Number(row.affected_count) || 0} 位` : `數量 ${amount}`;
        return `<div class="card" style="margin:8px 0;padding:12px"><b>${escapeHTML(date)}</b><div style="margin-top:5px">管理員：${escapeHTML(row.admin_email || '未知')}</div><div>對象：${escapeHTML(target)}</div><div>項目：${escapeHTML(item)}</div><div>數量：${escapeHTML(detail)}</div><div class="mini">紀錄類型：${escapeHTML(row.action_type || '')}</div></div>`;
      }).join('');
      status.textContent = `已從雲端載入 ${rows.length} 筆發放紀錄（最多顯示最近 200 筆）。`;
    } catch (error) {
      markCloudSyncBlocked(error);
      list.innerHTML = '<div class="empty">讀取失敗：' + escapeHTML(error.message || '請確認管理員是否有權限讀取 admin_actions') + '</div>';
      status.textContent = '無法讀取雲端發放紀錄。';
    }
  }

  return { adminApi, writeAdminGrantLog, loadAdminGrantHistory };
}
