/** Dice and pet codex category state, rendering, and category navigation. */
export function createCodexUI(dependencies) {
  const {
    D, getState, format, chanceText, renderPetCodex,
    weatherDiceStats, loadWeatherDiceExistCounts, documentRef
  } = dependencies;
  let codexCategory = 'normal';
  let codexUISetup = false;

  function renderCodex() {
    const S = getState();
    if (codexCategory === 'pets') { renderPetCodex(); return; }
    documentRef.getElementById('codexGrid').className = '';
    if (codexCategory === 'weather' && Date.now() - weatherDiceStats.loadedAt > 60000) loadWeatherDiceExistCounts();
    const isHalloweenCategory = codexCategory === 'halloween';
    const allDice = [...D].filter(d => isHalloweenCategory
      ? ['d33', 'd34', 'd35', 'd36'].includes(d.id)
      : codexCategory === 'weather' ? !!d.weather : !d.weather && !['d33', 'd34', 'd35', 'd36'].includes(d.id)
    ).sort((a, b) => {
      if (codexCategory === 'weather') {
        const order = { rain: 0, snow: 1, thunder: 2, crystal: 3, hell: 4 };
        return (order[a.weather] ?? 9) - (order[b.weather] ?? 9) || a.den - b.den;
      }
      return a.den - b.den;
    });
    const discoveredCount = allDice.filter(d => !!S.first[d.id] || !!S.bag[d.id]).length;
    const pct = Math.round(discoveredCount / Math.max(1, allDice.length) * 100);
    documentRef.getElementById('codexPct').textContent = pct + '% · 已發現 ' + discoveredCount + '/' + allDice.length;
    documentRef.getElementById('codexBar').style.width = pct + '%';
    documentRef.querySelectorAll('[data-codex-category]').forEach(button => button.classList.toggle('active', button.dataset.codexCategory === codexCategory));
    const weatherDiceExistCounts = weatherDiceStats.counts;
    documentRef.getElementById('codexGrid').innerHTML = allDice.map(dice => {
      const discovered = !!S.first[dice.id] || !!S.bag[dice.id];
      const rolls = Number(S.rollCounts?.[dice.id]) || 0;
      const isHalloween = ['d33', 'd34', 'd35', 'd36'].includes(dice.id);
      const codexColor = isHalloween ? '#ff8a3d' : dice.weather
        ? ({ rain: '#75baff', snow: '#f4fbff', thunder: '#fff000', crystal: '#ed75ff', hell: '#ff6038' }[dice.weather] || '#9b9aff')
        : '#9b9aff';
      const exist = dice.weather && weatherDiceExistCounts && Object.prototype.hasOwnProperty.call(weatherDiceExistCounts, dice.id)
        ? Number(weatherDiceExistCounts[dice.id]) : null;
      return `<div class="codex-entry"><div class="codex-row ${discovered ? '' : 'missing'} ${isHalloween ? 'codex-halloween' : dice.weather ? 'codex-weather-' + dice.weather : 'codex-standard'}" style="--rarity-color:${codexColor}"><div class="codex-chance" style="color:${discovered ? codexColor : '#525873'}!important">${discovered ? chanceText(dice) : '???'}</div><div class="codex-name" style="color:${discovered ? codexColor : '#525873'}!important"><span class="codex-icon" style="color:${discovered ? codexColor : '#525873'}!important">${discovered ? dice.icon : '???'}</span>${discovered ? dice.name : '???'}</div><div class="codex-count">${dice.weather ? `抽到 ${format(rolls)} 次 · exist: ${exist === null ? '統計未載入' : format(exist)}` : discovered ? (rolls ? `抽到 ${format(rolls)} 次` : '已獲得') : '???'}</div></div></div>`;
    }).join('');
  }

  function setupCodexUI() {
    if (codexUISetup) return false;
    codexUISetup = true;
    documentRef.addEventListener('click', event => {
      const button = event.target.closest('[data-codex-category]');
      if (!button) return;
      codexCategory = button.dataset.codexCategory;
      if (codexCategory !== 'pets') {
        documentRef.querySelector('#page-codex .hero .eyebrow').textContent = 'ARCHIVE DATABASE';
        documentRef.querySelector('#page-codex .hero h1').textContent = '記錄每一次奇蹟。';
        documentRef.querySelector('#page-codex .hero .muted').textContent = '未發現的骰子將以未知檔案顯示。部分高階骰子擁有專屬視覺。';
        documentRef.getElementById('codexGrid').className = 'codex-list';
      }
      renderCodex();
    });
    return true;
  }

  return { renderCodex, setupCodexUI };
}
