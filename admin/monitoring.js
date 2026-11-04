/** Aggregate owned pet instances without returning player identifiers. */
export function aggregatePetInventoryCounts(saves = [], petDefinitions = []) {
  const entries = new Map();
  for (const pet of petDefinitions) {
    if (!pet?.id) continue;
    entries.set(String(pet.id), { petId: String(pet.id), name: String(pet.name || pet.id), rarity: String(pet.rarity || 'unknown'), count: 0, owners: new Set() });
  }
  const playersWithPets = new Set();
  let totalPets = 0;
  for (let index = 0; index < saves.length; index++) {
    const row = saves[index] || {};
    const ownedPets = Array.isArray(row.save_data?.pets) ? row.save_data.pets : [];
    const playerKey = String(row.user_id || 'save-' + index);
    let hasPets = false;
    for (const pet of ownedPets) {
      const id = String(pet?.id || '').trim();
      if (!id) continue;
      hasPets = true;
      totalPets++;
      if (!entries.has(id)) entries.set(id, { petId: id, name: '未知寵物 (' + id + ')', rarity: 'unknown', count: 0, owners: new Set() });
      const entry = entries.get(id);
      entry.count++;
      entry.owners.add(playerKey);
    }
    if (hasPets) playersWithPets.add(playerKey);
  }
  const counts = [...entries.values()].map(({ owners, ...entry }) => ({ ...entry, playerCount: owners.size }));
  return { totalPets, playersWithPets: playersWithPets.size, speciesWithOwners: counts.filter(entry => entry.count > 0).length, counts };
}

/** Admin weather, analytics, activity logs, and moderation monitoring. */
export function createAdminMonitoringSystem(dependencies) {
  const {
    adminApi, supabaseClient, isAdmin, format, formatWalletScientific,
    escapeHTML, toast, petIncomePerSecond, loadAdminDashboard, documentRef, PETS = []
  } = dependencies;
  const document = documentRef;
  let weatherHistoryLoaded = false;
  let incomeMonitorBusy = false;
  let petInventoryCountsBusy = false;
async function loadAdminWeatherHistory(){
 if(!isAdmin())return;const box=document.getElementById('adminWeatherHistoryList');if(!box)return;box.innerHTML='<div class="empty">正在載入天氣紀錄…</div>';
 try{const {data,error}=await supabaseClient.rpc('get_realm_weather_history');if(error)throw error;const rows=Array.isArray(data)?data:[];const labels={sunny:'晴天',rain:'雨天',snow:'雪天',thunder:'打雷',crystal:'水晶天氣',hell:'地獄天氣',dumpling:'水餃天氣'};box.innerHTML=rows.map(r=>`<div class="admin-log"><div><b>${escapeHTML(labels[r.weather_type]||r.weather_type)}${r.source==='summon'?' · 召喚':r.source==='admin'?' · 管理員設定':''}</b><div class="mini">開始：${r.started_at?new Date(r.started_at).toLocaleString():'—'} · 結束：${r.ends_at?new Date(r.ends_at).toLocaleString():'未設定'}</div><div class="mini">發起者：${escapeHTML(r.summoned_by||'系統')} · 類型：${escapeHTML(r.source||'system')}</div></div><span class="pill">#${r.id}</span></div>`).join('')||'<div class="empty">尚無天氣紀錄</div>';weatherHistoryLoaded=true}catch(e){box.innerHTML=`<div class="empty">載入失敗：${escapeHTML(e.message||'權限或連線錯誤')}</div>`}
}

function renderOnlineCurve(points){const host=document.getElementById('adminOnlineCurveChart');if(!host)return;const rows=points.map(p=>{const time=new Date(p.hour).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});const value=p.count===null||p.count===undefined?'—':String(Math.max(0,Number(p.count)||0));return `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border-bottom:1px solid #29314b;font-size:13px"><span>${time}</span><b style="color:#9edcff">${value} 位／瀏覽器</b></div>`}).join('');const valid=points.filter(p=>p.count!==null&&p.count!==undefined).map(p=>Number(p.count)||0);host.innerHTML=`<div style="border:1px solid #29314b;border-radius:10px;overflow:hidden">${rows}</div><div class="mini" style="margin-top:8px">單小時最高：${Math.max(0,...valid)} 位 · 已顯示最近 ${points.length} 小時（「—」代表尚無歷史資料）</div>`}
async function loadAdminOnlineCurve(){if(!isAdmin())return;const chart=document.getElementById('adminOnlineCurveChart'),status=document.getElementById('adminOnlineCurveStatus');if(!chart||!status)return;chart.innerHTML='<div class="empty">正在載入曲線圖…</div>';status.textContent='正在讀取雲端訪問紀錄…';try{const data=await adminApi({action:'online_hourly'});if(!Array.isArray(data.hours)||!data.hours.length)throw new Error('後端沒有回傳每小時資料');const points=data.hours.slice(-24).map(p=>({hour:p.hour,count:p.count}));renderOnlineCurve(points);const usable=points.filter(p=>p.count!==null).length;status.textContent=`已載入最近 ${points.length} 個小時區間；目前可用 ${usable} 個小時。統計開始時間：${new Date(data.trackingStartedAt||Date.now()).toLocaleString('zh-TW')}。每小時為不同登入玩家／匿名瀏覽器數，不代表同一瞬間同時在線人數。`; }catch(e){chart.innerHTML=`<div class="empty">每小時資料載入失敗：${escapeHTML(e.message||'未知錯誤')}</div>`;status.textContent='請確認管理後端 online_hourly 動作與 game_visit_events 資料表已更新。'}}

async function loadAdminAchievementCounts(){if(!isAdmin())return;const box=document.getElementById('adminAchievementCountsList');if(!box)return;box.innerHTML='<div class="empty">正在載入各項成就完成數…</div>';try{const data=await adminApi({action:'achievement_counts'});const rows=Array.isArray(data.achievements)?data.achievements:(Array.isArray(data.counts)?data.counts:[]);if(!rows.length){box.innerHTML='<div class="empty">管理後端目前沒有回傳成就統計資料。需要在 dice-rng-admin 後端新增 achievement_counts，讀取所有玩家 game_saves.save_data.achievements 後統計；目前不會顯示不可靠的估算數字。</div>';return}box.innerHTML=rows.map(a=>`<div class="admin-player"><div><b>${escapeHTML(a.name||a.title||a.id||'未命名成就')}</b><div class="mini">${escapeHTML(a.id||'')}</div></div><span class="pill">${format(Number(a.players??a.count)||0)} 位玩家</span></div>`).join('')}catch(e){box.innerHTML=`<div class="empty">目前無法取得成就統計：${escapeHTML(e.message||'管理後端尚未支援 achievement_counts')}。要顯示正確人數，需同步新增後端統計動作。</div>`}}

async function loadAdminPotionLogs(){if(!isAdmin())return;const box=document.getElementById('adminPotionLogsList');if(!box)return;box.innerHTML='<div class="empty">正在載入藥水紀錄…</div>';try{const data=await adminApi({action:'potion_logs'});const rows=Array.isArray(data.records)?data.records:[];box.innerHTML=rows.map(r=>`<div class="admin-log"><div><b>${escapeHTML(r.username||'玩家')} · ${escapeHTML(r.potion_name||r.potion_id||'藥水')}</b><div class="mini">${r.action_type==='use'?'使用藥水':'合成藥水'} · ${new Date(r.created_at).toLocaleString()}</div><div class="mini">玩家 ID：${escapeHTML(String(r.user_id||'').slice(0,8))} · 操作：${escapeHTML(r.action_type||'未知')}</div></div><span class="pill">#${r.id}</span></div>`).join('')||'<div class="empty">目前沒有藥水使用／合成紀錄</div>'}catch(e){box.innerHTML=`<div class="empty">載入藥水紀錄失敗：${escapeHTML(e.message||'後端查詢失敗')}</div>`}}

async function loadAdminDeletedAccounts(){if(!isAdmin())return;const box=document.getElementById('adminDeletedAccountsList');if(box)box.innerHTML='<div class="empty">已停用個人資料封存檢視。更新後刪除的玩家資料不會保留封存副本。</div>'}

async function loadAdminIncomeMonitor(){if(incomeMonitorBusy||!isAdmin()||!supabaseClient)return;const status=document.getElementById('adminIncomeMonitorStatus'),list=document.getElementById('adminIncomeMonitorList'),summary=document.getElementById('adminIncomeMonitorSummary');if(!status||!list||!summary)return;incomeMonitorBusy=true;status.textContent='正在讀取全服存檔…';try{const result=await adminApi({action:'pet_income_monitor'});if(result.success!==true)throw new Error(result.error||'後端未回傳完整玩家資料');const saves=result.saves||[],profiles=result.profiles||[],profileMap=new Map(profiles.map(p=>[p.user_id,p]));const rows=saves.map(row=>{const d=row.save_data||{},pets=Array.isArray(d.pets)?d.pets:[],equipped=new Set(Array.isArray(d.equippedPetUids)?d.equippedPetUids:[]);let rate=0;for(const pet of pets)if(pet&&equipped.has(pet.uid))rate+=petIncomePerSecond(pet);const profile=profileMap.get(row.user_id)||{};return{name:String(profile.username||d.name||'未知玩家'),rate,coins:Number(d.coins??profile.coins??0),updated:row.updated_at||''}}).sort((a,b)=>b.rate-a.rate);const total=rows.reduce((n,r)=>n+r.rate,0),active=rows.filter(r=>r.rate>0).length,abnormal=rows.filter(r=>!Number.isSafeInteger(r.coins)||r.coins<0);summary.innerHTML=`<div class="stat"><b>${format(total)}$/秒</b><span>全服裝備寵物每秒收益</span></div><div class="stat"><b>${format(active)}</b><span>有收益玩家</span></div>`;list.innerHTML=rows.length?`<div style="overflow-x:auto"><table class="admin-table" style="width:100%"><thead><tr><th>玩家</th><th>每秒收益</th><th>目前金錢</th><th>資料更新</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHTML(r.name)}</td><td>${format(r.rate)}$/秒</td><td>${Number.isFinite(r.coins)?formatWalletScientific(r.coins):'異常數值'}</td><td>${r.updated?new Date(r.updated).toLocaleString():'—'}</td></tr>`).join('')}</tbody></table></div>${abnormal.length?`<p class="mini" style="color:#ff626f">偵測到 ${abnormal.length} 筆非安全整數或負數金額，請檢查玩家存檔。</p>`:''}`:'<div class="empty">目前沒有玩家雲端存檔。</div>';status.textContent=`已載入 ${rows.length} 位玩家 · ${new Date().toLocaleTimeString()}`;}catch(e){status.textContent='讀取失敗：'+(e.message||'未知錯誤');list.innerHTML='<div class="empty">無法讀取全服收益資料：'+escapeHTML(e.message||'未知錯誤')+'</div>';}finally{incomeMonitorBusy=false;}}

async function loadAdminPetInventoryCounts(){
 if(petInventoryCountsBusy||!isAdmin()||!supabaseClient)return;
 const status=document.getElementById('adminPetInventoryCountsStatus');
 const summary=document.getElementById('adminPetInventoryCountsSummary');
 const list=document.getElementById('adminPetInventoryCountsList');
 if(!status||!summary||!list)return;
 petInventoryCountsBusy=true;
 status.textContent='正在讀取全服寵物存檔…';
 try{
  // Reuse the existing admin-only save-monitor endpoint; aggregate in memory and render no player identifiers.
  const result=await adminApi({action:'pet_income_monitor'});
  if(result.success!==true)throw new Error(result.error||'管理後端未回傳完整玩家資料');
  const stats=aggregatePetInventoryCounts(Array.isArray(result.saves)?result.saves:[],PETS);
  summary.innerHTML='<div class="stat"><b>'+format(stats.totalPets)+'</b><span>全服寵物總數</span></div><div class="stat"><b>'+format(stats.playersWithPets)+'</b><span>持有寵物玩家</span></div><div class="stat"><b>'+format(stats.speciesWithOwners)+'</b><span>有持有紀錄的種類</span></div>';
  const rarityNames={common:'普通',rare:'稀有',legendary:'傳奇',mythic:'神話',secret:'秘密',unknown:'未分類'};
  const rows=stats.counts.map(row=>'<tr><td>'+escapeHTML(row.name)+'</td><td>'+escapeHTML(rarityNames[row.rarity]||row.rarity)+'</td><td>'+format(row.count)+'</td><td>'+format(row.playerCount)+'</td></tr>').join('');
  list.innerHTML=stats.counts.length?'<div style="overflow-x:auto"><table class="admin-table" style="width:100%"><thead><tr><th>寵物</th><th>稀有度</th><th>全服持有數</th><th>持有人數</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class="empty">目前沒有寵物持有紀錄。</div>';
  status.textContent='已統計 '+format(Array.isArray(result.saves)?result.saves.length:0)+' 份雲端存檔 · '+new Date().toLocaleTimeString();
 }catch(e){
  status.textContent='讀取失敗：'+(e.message||'未知錯誤');
  list.innerHTML='<div class="empty">無法讀取全服寵物統計：'+escapeHTML(e.message||'未知錯誤')+'</div>';
 }finally{petInventoryCountsBusy=false;}
}

async function setPlayerBan(banned){if(!isAdmin()){toast('沒有管理員權限');return}const target=document.getElementById('adminBanTarget'),msg=document.getElementById('adminBanMessage'),userId=target.value;if(!userId){msg.textContent='請先選擇一位玩家';return}const label=target.selectedOptions[0]?.text||'選定玩家';if(!confirm(`確定要${banned?'停權':'解除停權'}「${label}」？`))return;const btn=document.getElementById(banned?'adminBanBtn':'adminUnbanBtn');btn.disabled=true;msg.textContent='正在向管理後端送出請求…';try{const result=await adminApi({action:'set_player_ban',targetUserId:userId,banned});msg.textContent=result.message||(banned?'停權完成。':'已解除停權。');toast(banned?'玩家已停權':'玩家已解封');await loadAdminDashboard()}catch(e){msg.textContent='操作失敗：'+(e.message||'管理後端未完成此功能設定');}finally{btn.disabled=false}}

  return {
    loadAdminWeatherHistory,
    loadAdminOnlineCurve,
    loadAdminAchievementCounts,
    loadAdminPotionLogs,
    loadAdminDeletedAccounts,
    loadAdminIncomeMonitor,
    loadAdminPetInventoryCounts,
    setPlayerBan
  };
}
