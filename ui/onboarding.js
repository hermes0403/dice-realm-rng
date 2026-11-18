/** First-login guide and admin-only preview for Dice Realm. */
const STEPS = [
  {
    title: '擲骰大廳｜開始探索',
    kicker: '01 · ROLL THE UNKNOWN',
    body: '按「擲骰」抽取骰子，也可以開啟「自動擲骰」連續探索。每次結果會顯示骰子名稱、稀有度與機率；上方統計則記錄累積擲骰、已發現種類及目前運氣。一般擲骰的稀有骰權重會受到運氣影響，部分天氣與特殊效果也可能改變結果。',
    tip: '背包有容量上限。接近滿格時，先整理背包或提高容量，避免無法繼續獲得骰子。'
  },
  {
    title: '骰子背包｜管理收藏',
    kicker: '02 · INVENTORY CONTROL',
    body: '抽到的骰子會存進背包。你可以選取骰子出售，也能鎖定重要收藏，降低整理時誤售的風險；背包容量可使用金錢升級。自動出售只會處理系統允許自動出售的骰子，特殊活動骰不一定適用。',
    tip: '稀有骰先確認是否已鎖定，再進行批次整理；出售前也請再次檢查選取數量。'
  },
  {
    title: '圖鑑、寵物與融合機',
    kicker: '03 · ARCHIVE & PET CORE',
    body: '收藏圖鑑會記錄你曾經發現的骰子，尚未解鎖的項目會以未知檔案呈現。融合機可投入兩顆符合條件的骰子合成寵物；不同材料組合會影響可獲得的寵物與品質機率。取得寵物後，可在寵物區管理與裝備，裝備寵物會在帳號在線時提供每秒收益。',
    tip: '融合前先看清楚材料需求、成功機率與可能結果，確認投入的骰子可以消耗再開始。'
  },
  {
    title: '工坊與特殊天氣',
    kicker: '04 · WORKSHOP & WEATHER',
    body: '工坊集中管理手套、藥水及其他道具；各項物品的取得方式與效果不同，請以項目頁面顯示的條件為準。天氣召喚需要投入指定種類與數量的天氣骰子，達成需求後才能觸發對應的全服天氣效果。',
    tip: '製作或召喚前先核對配方、材料數量與效果說明；已投入的天氣骰子無法取回。'
  },
  {
    title: '任務、成就與全服進度',
    kicker: '05 · PROGRESSION',
    body: '每日任務提供短期目標，成就記錄收藏與遊玩里程碑；達成條件後，依畫面提示領取或接收獎勵。排行榜用來查看玩家排名，全服活動則會顯示共同進度與階段獎勵。完成這五頁後，就能依自己的目標探索各個系統。',
    tip: '任務與活動可能有不同重置或結算時間，領獎前請確認活動頁顯示的期限與條件。'
  }
];

export function setupOnboardingUI({ documentRef = document, getCurrentUser, isAdmin, toast }) {
  let index = 0;
  let previewMode = false;
  const overlay = documentRef.getElementById('onboardingOverlay');
  const el = id => documentRef.getElementById(id);

  function markSeen() {
    const user = getCurrentUser();
    if (!previewMode && user?.id) {
      try { localStorage.setItem('diceRealmTutorialSeen_v1_' + user.id, '1'); } catch {}
    }
  }

  function close() {
    if (!overlay) return;
    markSeen();
    overlay.hidden = true;
    documentRef.body.classList.remove('tutorial-open');
    previewMode = false;
  }

  function render() {
    const step = STEPS[index];
    el('onboardingKicker').textContent = step.kicker;
    el('onboardingTitle').textContent = step.title;
    el('onboardingBody').textContent = step.body;
    el('onboardingTip').textContent = step.tip;
    el('onboardingCounter').textContent = (index + 1) + ' / ' + STEPS.length;
    el('onboardingProgress').style.width = ((index + 1) / STEPS.length * 100) + '%';
    el('onboardingPrevious').disabled = index === 0;
    el('onboardingNext').textContent = index === STEPS.length - 1 ? '完成教學' : '下一步';
  }

  function show({ preview = false } = {}) {
    if (!getCurrentUser()) {
      toast('請先登入再查看新手教學');
      return false;
    }
    if (preview && !isAdmin()) {
      toast('沒有管理員權限');
      return false;
    }
    previewMode = preview;
    index = 0;
    render();
    overlay.hidden = false;
    documentRef.body.classList.add('tutorial-open');
    return true;
  }

  function maybeShowForCurrentUser() {
    const user = getCurrentUser();
    if (!user?.id || !overlay) return false;
    try {
      if (localStorage.getItem('diceRealmTutorialSeen_v1_' + user.id) === '1') return false;
    } catch {}
    return show();
  }

  el('onboardingPrevious').addEventListener('click', () => {
    if (index > 0) { index--; render(); }
  });
  el('onboardingNext').addEventListener('click', () => {
    if (index === STEPS.length - 1) { close(); return; }
    index++;
    render();
  });
  el('onboardingClose').addEventListener('click', close);
  el('onboardingSkip').addEventListener('click', close);
  el('replayTutorialBtn').addEventListener('click', () => { if (show()) toast('新手教學已開啟'); });
  el('adminTutorialTestBtn').addEventListener('click', () => show({ preview: true }));

  return { show, close, maybeShowForCurrentUser };
}
