import { D, G } from './data/dice.js?v=20261117-t0102-void-startrail-gloves';
import { POTIONS } from './data/equipment.js?v=20261121-t0123-money-potions';
import { PET_RARITIES, PETS, PET_BASE_INCOME, PET_INCOME_ROLLS, PET_TIER_CONFIG, PET_TIER_RATES, SECRET_PET_SKILLS, MYTHIC_PET_SKILLS, PET_IMAGE_ASSETS, PET_INDIVIDUAL_ODDS, PET_MUTATIONS, petBaseIncome, randomPet, petById } from './data/pets.js?v=20261122-pet-skill-swap-v1';
import { NEW_DICE, ETERNAL_PETS, ETERNAL_PET_WEIGHTS, ETERNAL_PET_INCOME, ETERNAL_TIER_CONFIG, ETERNAL_TIER_RATES } from './data/eternal-update.js?v=20261122-eternal-income-v1';
import { DAILY_TASKS } from './data/progression.js';
import { KEY, SUPABASE_URL, SUPABASE_KEY, WEATHER_TYPES, DEVICE_ACCOUNT_LIMIT, pages, ADMIN_GRANT_LABELS } from './config.js?v=20261123-daily-shop-v1';
import { supabaseClient } from './services/supabase.js';
import { format, formatWalletScientific, compactNum, escapeHTML } from './core/format.js';
import { createNavigationUI } from './ui/navigation.js?v=20261123-daily-shop-v1';
import { createInventoryUI } from './ui/inventory.js?v=20261126-t0142-inventory-selection';
import { createPetIncomeSystem } from './systems/pet-income.js?v=20261118-pet-income-mutation-v2';
import { setupAdminPetOddsUI } from './admin/pet-odds.js?v=20261115-t0100-eternal-odds-db-guard';
import { createDeviceLockService } from './services/device-lock.js';
import { createVisitTrackingService } from './services/visit-tracking.js';
import { setupPetSellingUI } from './ui/pet-selling.js?v=20261121-pet-inventory-sync-guard';
import { createProgressionSystem } from './systems/progression.js?v=20261118-roll-milestones-v2';
import { createAdminGrantService } from './admin/grants.js';

import { createWeatherSystem, getWeatherSpeedBonus } from './systems/weather.js?v=20261120-t0110-crystal-weather-purple';
import { createGlitchWeatherDropSystem } from './systems/glitch-weather-drops.js?v=20261114-t0089-glitch-potion-drops';
import { createCloudSaveService } from './services/cloud-save.js?v=20261126-t0141-guild-rewards-mailbox';
import { createCoinBoostService } from './systems/coin-boost.js';
import { createLeaderboardSystem } from './systems/leaderboards.js';
import { createAuthService } from './services/auth.js?v=20261126-t0139-account-isolation';
import { createPetSystem } from './systems/pets.js?v=20261122-secret-skill-swap-v1';
import { createPetTradingSearch } from './services/pet-trading-search.js?v=20261122-trade-slot-picker-v2';
import { applyEternalPetRarityTheme } from './systems/pet-rarity-theme.js?v=20261120-t0113-eternal-blue-pink';
import { petWeightSkillMultiplier } from './systems/pet-skills.js';
import { createDiceSystem } from './systems/dice.js?v=20261122-auto-roll-rare-continue-v1';
import { createWeeklyRealmEvent } from './systems/weekly-realm-event.js?v=20261122-weekly-claim-only-v1';
import { heavenWeatherBonus, HEAVEN_MIDDLE_IDS } from './systems/heaven-potion-odds.js?v=20261121-t0121-heaven-mode-persistence';
import { createGlobalBoostSystem } from './systems/global-boost.js?v=20261117-realtime-boost-polling';
import { createRealmSocialSystem } from './systems/realm-social.js?v=20261120-t0113-rare-pet-fusion';
import { createEquipmentUI } from './ui/equipment.js?v=20261123-t0126-click-capture-fix';
import { createDailyShopSystem } from './systems/daily-shop.js?v=20261123-t0126-click-capture-fix';
import { createAdminPlayerManagement } from './admin/player-management.js?v=20261124-t0127-ai-npc-v1';
import { createAdminMonitoringSystem } from './admin/monitoring.js?v=20261118-shark-weather-history';
import { createGameStateService } from './core/game-state.js?v=20261123-daily-shop-v1';
import { createPresenceService } from './services/presence.js';
import { createActivityLogService } from './services/activity-logs.js';
import { createPetNoticeUI } from './ui/pet-notices.js';
import { createCodexUI } from './ui/codex.js';
import { createMainRenderUI } from './ui/main-render.js';
import { setupAdminUIBindings } from './admin/ui-bindings.js?v=20261118-t0114-login-name-management';
import { setupAccountActions } from './services/account-actions.js?v=20261119-settings-rpc-fix';
import { setupDisplayControls } from './ui/display-controls.js?v=20261126-t0149-guild-module-refresh';
import { createTimerManager } from './core/timer-manager.js';
import { setupOnboardingUI } from './ui/onboarding.js?v=20261119-settings-buttons-v2';

// T-0098：新增五顆骰子與永恆寵物；沿用既有本機／雲端存檔結構，不新增輪詢或資料表。
for (const die of NEW_DICE) if (!D.some(existing => existing.id === die.id)) D.push(die);
if (!PET_RARITIES.some(rarity => rarity.id === 'eternal')) PET_RARITIES.push({ id: 'eternal', name: '永恆', cls: 'pet-rarity-eternal', a: '#0755d9', b: '#ffaddd' });
applyEternalPetRarityTheme(document);
for (const pet of ETERNAL_PETS) if (!PETS.some(existing => existing.id === pet.id)) PETS.push(pet);
Object.assign(PET_BASE_INCOME, ETERNAL_PET_INCOME);
PET_INDIVIDUAL_ODDS.eternal = ETERNAL_PET_WEIGHTS.slice();
// 永恆融合區間完整取代舊版 1,100,001 以上的分段，避免舊區間殘留或重疊。
for (const [tier, range] of Object.entries(PET_TIER_CONFIG)) {
  if (Number(range?.max_den) >= 1100001 || Number(range?.min_den) >= 1100001) {
    delete PET_TIER_CONFIG[tier];
    delete PET_TIER_RATES[tier];
  }
}
Object.assign(PET_TIER_CONFIG, ETERNAL_TIER_CONFIG);
Object.assign(PET_TIER_RATES, ETERNAL_TIER_RATES);
for (const die of NEW_DICE) if (!HEAVEN_MIDDLE_IDS.includes(die.id)) HEAVEN_MIDDLE_IDS.push(die.id);

const timerManager = createTimerManager();
let globalBoostState=null;
let globalBoostSystem=null;
let realmSocialSystem=null;
let equipmentUI=null;
let dailyShopSystem=null;
function renderDailyShop(){return dailyShopSystem?.renderDailyShop()}
let adminPetOddsUI=null;
let adminPlayerManagement=null;
let adminMonitoringSystem=null;
let presenceService=null;
let activityLogService=null;
let codexUI=null;
let mainRenderUI=null;
const { showPetAutoSellNotice } = createPetNoticeUI({ documentRef: document, timerManager });
let restartAutoInterval=()=>{};
function triggerWeatherSurge(type){return realmSocialSystem?.triggerWeatherSurge(type)}
function announceWeatherSummon(type,by,at){return realmSocialSystem?.announceWeatherSummon(type,by,at)}
function recordPetFusion(d,p,rarity){return realmSocialSystem?.recordPetFusion(d,p,rarity)}
function loadAdminPetFusionLogs(){return realmSocialSystem?.loadAdminPetFusionLogs()}
function setupGlobalAnnouncements(){return realmSocialSystem?.setupGlobalAnnouncements()}
function broadcastRareRoll(d){return realmSocialSystem?.broadcastRareRoll(d)}
function loadPetFusionOdds(){return adminPetOddsUI?.loadPetFusionOdds()}
function renderGloves(){return equipmentUI?.renderGloves()}
function renderPotions(){return equipmentUI?.renderPotions()}
function potionMaterialTotal(){return equipmentUI?.potionMaterialTotal() ?? 0}
function heartbeat(){return presenceService?.heartbeat()}
function logCraft(...args){return activityLogService?.logCraft(...args)}
function logPotionAction(...args){return activityLogService?.logPotionAction(...args)}
function renderCodex(){return codexUI?.renderCodex()}
function render(){return mainRenderUI?.render()}
const weatherDiceStats={counts:{},loadedAt:0};
let currentUser=null,cloudSaveService=null;
let petSystem=null;
function ensurePetData(pets){if(petSystem)return petSystem.ensurePetData(pets)}
let S;
const gameStateService = createGameStateService({ KEY, D, G, POTIONS, ensurePetData, getCurrentUser: () => currentUser, getState: () => S, localStorageRef: localStorage });
const { fresh, normalizeGloves, migrateCurrency, load, persistAutoSellPrefs, restoreAutoSellPrefs } = gameStateService;
S=load();

// T-0145: bootstrap authentication before optional game UI modules.
// Regression contract: authentication bindings must precede optional UI initialization.
// Late dependencies are wrapped so the auth controls remain usable even if a
// later page/widget initializer throws during startup.
let authService=null;
authService=createAuthService({
  supabaseClient, DEVICE_ACCOUNT_LIMIT, KEY,
  getCurrentUser:()=>currentUser,
  setCurrentUser:value=>{currentUser=value; if(value){try{weeklyRealmEvent.refresh()}catch(error){console.warn('Weekly event refresh deferred',error)}}},
  getState:()=>S,
  releaseDeviceLock:(...args)=>{try{return releaseDeviceLock(...args)}catch(error){console.warn('Device lock service not ready',error)}},
  recordGameVisit:(...args)=>{try{return recordGameVisit(...args)}catch(error){console.warn('Visit tracking not ready',error)}},
  setupPlayerWeatherSubscription:(...args)=>{try{return setupPlayerWeatherSubscription(...args)}catch(error){console.warn('Weather subscription not ready',error)}},
  updateAdminVisibility:(...args)=>{try{return updateAdminVisibility(...args)}catch(error){console.warn('Admin visibility not ready',error)}},
  toast,
  loadCloudSave:async (...args)=>{const result=await loadCloudSave(...args); try{renderDailyShop()}catch{} return result},
  loadPetFusionOdds,
  heartbeat,
  refreshLeaderboards:(...args)=>{try{return refreshLeaderboards(...args)}catch(error){console.warn('Leaderboard service not ready',error)}},
  loadWeatherSummonData:(...args)=>{try{return loadWeatherSummonData(...args)}catch(error){console.warn('Weather data not ready',error)}},
  applyPetLoginSkill:(...args)=>{try{return applyPetLoginSkill(...args)}catch(error){console.warn('Pet login skill not ready',error);return 0}},
  isCloudSaveReady:userId=>{try{return !!cloudSaveService?.isLoadedFor(userId)}catch{return false}},
  getCloudLoadError:()=>{try{return cloudSaveService?.getLastCloudLoadError?.()||null}catch{return null}},
  resetAccountSession:(...args)=>{try{return cloudSaveService?.resetAccountSession(...args)??gameStateService.load()}catch(error){console.warn('Cloud session reset not ready',error)}},
  onboardingMaybeShow:()=>{try{return onboardingUI?.maybeShowForCurrentUser()||false}catch{return false}},
  timerManager
});
const bindAuthClick=(id,handler)=>document.getElementById(id)?.addEventListener('click',event=>{
  event.preventDefault();
  try{handler()}catch(error){console.error('Authentication control failed:',id,error);const message=document.getElementById('authMessage');if(message)message.textContent='登入介面發生錯誤，請稍後再試。'}
});
bindAuthClick('authOpenBtn',openAuth);
bindAuthClick('authCloseBtn',closeAuth);
bindAuthClick('authLoginBtn',()=>authAction('login'));
bindAuthClick('authSignupBtn',()=>authService?.openUsernameSignup());
bindAuthClick('authUsernameSignupSubmitBtn',()=>authAction('usernameSignup'));
bindAuthClick('authUsernameSignupCancelBtn',()=>authService?.closeUsernameSignup());
bindAuthClick('authResendBtn',()=>authAction('resend'));
bindAuthClick('authResetBtn',()=>authAction('reset'));
bindAuthClick('authPasswordUpdateBtn',()=>authService?.updateRecoveredPassword());
bindAuthClick('authPasswordCancelBtn',()=>authService?.cancelPasswordRecovery());
bindAuthClick('authRetryCloudBtn',()=>authService?.retryCloudLoad());
authService.registerAuthStateListener();
const weeklyRealmEvent = createWeeklyRealmEvent({ supabaseClient, getCurrentUser: () => currentUser, documentRef: document, toast, onRewardClaimed: async () => { await loadCloudSave(); render(); } });
activityLogService = createActivityLogService({ supabaseClient, getCurrentUser: () => currentUser, getState: () => S });
const { coinEarningMultiplier, refreshCoinBoosts, activeGlobalCoinBoost } = createCoinBoostService({ getCurrentUser: () => currentUser, getMoneyPotionMultiplier: () => activePotion('money')?.multiplier || 1, supabaseClient, SUPABASE_URL, SUPABASE_KEY });
const { refreshLeaderboards } = createLeaderboardSystem({ supabaseClient, getCurrentUser: () => currentUser, escapeHTML, format, compactNum });
const { releaseDeviceLock, isLockHeld, isHeartbeatActive, scheduleUnlock } = createDeviceLockService({ getCurrentUser: () => currentUser, supabaseClient, toast, timerManager });
const { recordGameVisit, startGameVisitTracking } = createVisitTrackingService({ getCurrentUser: () => currentUser, getState: () => S, supabaseClient, timerManager });
const { checkAchievements, checkDailyReward, renderQuests, renderProfile, closeAchievementPopup, rewardText, grantAchievementReward, showAchievementPopup } = createProgressionSystem({
  getState: () => S, D, DAILY_TASKS, POTIONS, format, compactNum, totalUnique,
  coinEarningMultiplier, fresh, save, toast, timerManager
});
const { adminApi, writeAdminGrantLog, loadAdminGrantHistory } = createAdminGrantService({ supabaseClient, isAdmin, SUPABASE_URL, SUPABASE_KEY, D, ADMIN_GRANT_LABELS, escapeHTML, format });
adminPlayerManagement = createAdminPlayerManagement({ adminApi, supabaseClient, isAdmin, format, escapeHTML, documentRef: document });
async function flushCloudSave(){if(cloudSaveService)return cloudSaveService.flushCloudSave()}
const weatherSystem = createWeatherSystem({
 D, WEATHER_TYPES, format, escapeHTML, chanceText, byId, supabaseClient,
 timerManager,
 getState: () => S, getCurrentUser: () => currentUser,
 getAnnouncementChannel: () => realmSocialSystem?.getAnnouncementChannel() || null, openAuth, toast, save,
 render, renderCodex, renderGloves, flushCloudSave,
 announceWeatherSummon, triggerWeatherSurge
});
const { getWeather, activeWeatherDice, applyServerWeatherRow, applyForcedWeather, refreshServerWeather, setupPlayerWeatherSubscription, loadWeatherSummonData, autoDepositRolledWeatherDice, renderWeatherSummon, refreshPlayerWeatherOverride, updateWeatherUI } = weatherSystem;
realmSocialSystem = createRealmSocialSystem({
  getState: () => S,
  getCurrentUser: () => currentUser,
  weatherApi: weatherSystem,
  timerManager,
  supabaseClient,
  toast,
  isAdmin,
  petById,
  escapeHTML,
  format,
  WEATHER_TYPES,
  documentRef: document
});
cloudSaveService=createCloudSaveService({
 KEY, D, POTIONS, supabaseClient,
 getState:()=>S, setState:value=>{S=value}, getCurrentUser:()=>currentUser,
 timerManager,
 fresh, normalizeGloves, migrateCurrency, ensurePetData,
 restoreAutoSellPrefs, totalUnique, getPetIncomePerSecond: () => equippedPetIncomePerSecond(), render, refreshLeaderboards,
 toast, openAuth, showAuthMessage, localStorageRef: localStorage, documentRef: document
});
const { scheduleSync } = cloudSaveService;
dailyShopSystem=createDailyShopSystem({getState:()=>S,getCurrentUser:()=>currentUser,isCloudSaveReady:userId=>cloudSaveService.isLoadedFor(userId),save,render,toast,format,documentRef:document,timerManager});
dailyShopSystem.setup();
presenceService = createPresenceService({ supabaseClient, getCurrentUser: () => currentUser, getState: () => S, totalUnique, achievementStats, applyPendingGrants, scheduleSync });
function save(){return cloudSaveService.save()}
function userSaveKey(userId){return cloudSaveService.userSaveKey(userId)}
function savePayload(){return cloudSaveService.savePayload()}
function achievementStats(){return cloudSaveService.achievementStats()}
function applyPendingGrants(){return cloudSaveService.applyPendingGrants()}
function syncCloudSave(){return cloudSaveService.syncCloudSave()}
function loadCloudSave(){return cloudSaveService.loadCloudSave()}

function showAuthMessage(message){return authService?.showAuthMessage(message)}
function openAuth(){return authService?.openAuth()}
function closeAuth(){return authService?.closeAuth()}
function authAction(mode){return authService?.authAction(mode)}
setupGlobalAnnouncements();weatherSystem.setupServerWeatherSubscription();loadWeatherSummonData(false);
function byId(id){return D.find(x=>x.id===id)}
function glove(id){return G.find(x=>x.id===id)||G[0]}
function totalUnique(){return new Set([...Object.keys(S.first||{}),...Object.keys(S.bag||{}).filter(k=>S.bag[k]>0)]).size}
function totalDice(){return Object.values(S.bag).reduce((a,b)=>a+Math.max(0,Number(b)||0),0)}
function currentGlove(){return S.equipped==='g7'?glove('g0'):glove(S.equipped)}
function activePotion(category='luck'){const slot=category==='speed'?'activeSpeed':category==='money'?'activeMoney':'active';const a=S.potions?.[slot];if(a&&a.type&&Number(a.expiresAt)>Date.now())return POTIONS.find(p=>p.id===a.type)||null;return null}
function potionLuck(){return activePotion('luck')?.luck||0}
function potionSpeed(){return activePotion('speed')?.speed||0}
function luck(){return Math.min(500,currentGlove().luck+potionLuck()+petBonusTotals().luck+Number(activeGlobalBoost().luck_percent||0)+((Number(S.petSkillLuckCharges)||0)>0?(Number(S.petSkillLuckBonus)||100):0))}
function speed(){return Math.min(500,currentGlove().speed+potionSpeed()+petBonusTotals().speed+Number(activeGlobalBoost().speed_percent||0)+(Number(S.petSkillSpeed?.expiresAt)>Date.now()?100:0)+getWeatherSpeedBonus(getWeather()))}
function effectiveDen(d){const den=Number(d?.den)||0;if(!d||den<1000000||den>100000000||(Number(S.potions?.angelCharges)||0)>0)return den;const w=getWeather(),types=w.types||[w.type];const bonus=heavenWeatherBonus(d,types,false,false);return Math.floor(den/(1+bonus/100))}
function chanceText(d){return d.id==='d1'?'1/2':'1/'+format(effectiveDen(d))}
// 天堂藥水 I／II 機率表僅用於內部抽選，不顯示於玩家介面。
function toast(t){let e=document.getElementById('toast');e.textContent=t;e.classList.add('show');timerManager.clearTimeout(e._t);const timer=timerManager.setTimeout(()=>{e.classList.remove('show');if(e._t===timer)e._t=null},2100,'toast-hide');e._t=timer}

// Keep the optional guild module outside the core app's static import graph.
// A guild asset failure must not stop authentication controls from booting.
let guildSystem=null;
async function loadGuildPage(){
  const guildRoot=document.getElementById('guildContent');
  if(!guildRoot)return false;
  guildRoot.innerHTML='<div class="card"><p class="muted">正在啟動公會功能…</p></div>';
  try{
    if(!guildSystem){
      const { createGuildSystem } = await import('./ui/guild.js?v=20261126-t0150-guild-import-cache');
      guildSystem=createGuildSystem({supabaseClient,getCurrentUser:()=>currentUser,documentRef:document,toast});
    }
    return await guildSystem.load();
  }catch(error){
    console.error('[Guild] 公會模組啟動失敗：',error);
    guildSystem=null;
    guildRoot.innerHTML='<div class="card"><p class="muted" role="alert">公會模組啟動失敗，錯誤：<span id="guildBootError"></span></p><button type="button" id="guildBootRetryBtn">重新載入公會</button></div>';
    const errorNode=document.getElementById('guildBootError');
    if(errorNode)errorNode.textContent=String(error?.message||error||'未知錯誤');
    const retryButton=document.getElementById('guildBootRetryBtn');
    retryButton?.addEventListener('click',()=>{
      retryButton.disabled=true;
      void loadGuildPage();
    },{once:true});
    return false;
  }
}
function isAdmin(){return (currentUser?.email||'').toLowerCase()==='toby110403@gmail.com'}
realmSocialSystem.setupRealmSocialUI();
const { itemHTML, renderAutoSellOptions, renderAutoDepositOptions, updateInventorySelectedCount, renderInventory, sellMany, bagUpgradeCost } = createInventoryUI({
  D,
  getState: () => S,
  format,
  escapeHTML,
  chanceText,
  persistAutoSellPrefs,
  save,
  toast,
  totalDice,
  byId,
  coinEarningMultiplier,
  checkDailyReward,
  render
});



async function loadWeatherDiceExistCounts(){
 weatherDiceStats.loadedAt=Date.now();if(!supabaseClient){weatherDiceStats.counts={};return}
 try{const {data,error}=await supabaseClient.rpc('get_weather_dice_exist_counts');if(error)throw error;const normalized={};if(Array.isArray(data)){for(const row of data){const id=row.dice_id||row.die_id||row.id;if(id)normalized[id]=Number(row.player_count??row.exist_count??row.count??row.total)||0}}else if(data&&typeof data==='object'){for(const [id,value] of Object.entries(data))normalized[id]=Number(typeof value==='object'?(value.player_count??value.exist_count??value.count??value.total):value)||0}weatherDiceStats.counts=normalized;renderCodex()}catch(e){console.warn('Weather dice exist counts unavailable',e);weatherDiceStats.counts=null;renderCodex()}
}
function loadAdminWeatherHistory(){return adminMonitoringSystem?.loadAdminWeatherHistory()}
const { petIncomeMultiplier, rollPetVariant, petIncomePerSecond, equippedPetIncomePerSecond, renderPetIncome } = createPetIncomeSystem({
  getState: () => S,
  getCurrentUser: () => currentUser,
  PET_MUTATIONS,
  petBaseIncome,
  petWeightSkillMultiplier,
  coinEarningMultiplier,
  format,
  formatWalletScientific,
  KEY,
  refreshCoinBoosts,
  save,
  timerManager
});
petSystem=createPetSystem({
 getState:()=>S, PETS, PET_RARITIES, PET_TIER_CONFIG, PET_TIER_RATES, PET_MUTATIONS, PET_IMAGE_ASSETS, D,
 petById, getDiceById:byId, randomPet, petIncomePerSecond, rollPetVariant, renderPetIncome,
 format, escapeHTML, save, render, toast, getCurrentUser:()=>currentUser, openAuth, recordPetFusion,
 getFusionLuckBoost:()=>globalBoostSystem?.activeFusionLuckBoost?.()||null,
 showPetAutoSellNotice, documentRef:document, confirmAction:message=>confirm(message), localStorageRef:localStorage
});
const {
 equippedPetHas, applyPetSkillDailyReset, applyPetRollSkills, applyPetLoginSkill, petBonusTotals, populateAdminPetSelects,
 petRarity, petArt, petTierFromDen, weightedPetRarity, petMutationForDice, petMutationLabel,
 rollPetWeightKg, addPet, applyPetAutoSell, ownedPetName, renderPetsPage, renderPetCodex,
 renderPetChance, dicePairAllowed, dicePairTier, refreshPetDiceSelects, updatePetDicePreview,
 onPetDiceSelectionChange, craftPetFromDice
} = petSystem;
const petTradingSearch = createPetTradingSearch({
  supabaseClient, getCurrentUser: () => currentUser, getState: () => S, petById, petArt,
  onTradeCompleted: async () => {
    await loadCloudSave({ renderAfterLoad: false });
    renderPetsPage();
    renderPetCodex();
  },
  flushCloudSave: () => flushCloudSave(), escapeHTML, documentRef: document, toast
});
petTradingSearch.setup();
const { updateAdminVisibility, navHTML, go } = createNavigationUI({
  pages, isAdmin, toast, loadAdminDashboard, refreshLeaderboards, loadWeatherSummonData, renderPetsPage, renderDailyShop,
  loadGuildPage, refreshWeeklyEvent: () => weeklyRealmEvent.refresh()
});
const onboardingUI = setupOnboardingUI({ documentRef: document, getCurrentUser: () => currentUser, isAdmin, go, toast });
// Authentication is bootstrapped above, before optional game UI initialization.
timerManager.setInterval(heartbeat,60000,'presence-heartbeat');
codexUI = createCodexUI({
  D, getState: () => S, format, chanceText, renderPetCodex,
  weatherDiceStats, loadWeatherDiceExistCounts, documentRef: document
});
codexUI.setupCodexUI();
adminPetOddsUI = setupAdminPetOddsUI({
  PET_TIER_RATES, PET_TIER_CONFIG, PET_RARITIES, supabaseClient, isAdmin, toast,
  loadAdminPetFusionLogs, renderPetChance, dicePairTier, byId, escapeHTML
});
adminMonitoringSystem = createAdminMonitoringSystem({
  adminApi, supabaseClient, isAdmin, format, formatWalletScientific, escapeHTML,
  toast, petIncomePerSecond, loadAdminDashboard, documentRef: document, PETS
});
const { doRoll, stopAuto, restartAutoInterval: restartAutoIntervalImpl, isRolling, isAutoRolling, setupAutoRollUI } = createDiceSystem({
 D, POTIONS, KEY, supabaseClient, timerManager, getState:()=>S, getCurrentUser:()=>currentUser,
 getWeather, luck, speed, byId, format, chanceText, totalDice, go, toast,
 isLockHeld, isHeartbeatActive, scheduleUnlock, applyPetRollSkills, potionMaterialTotal, coinEarningMultiplier,
 checkAchievements, checkDailyReward, save, autoDepositRolledWeatherDice, broadcastRareRoll,
 render, documentRef:document, recordWeeklyRoll: () => weeklyRealmEvent.recordRoll()
});
restartAutoInterval = restartAutoIntervalImpl;
equipmentUI = createEquipmentUI({
  getState: () => S, D, G, POTIONS, supabaseClient,
  getCurrentUser: () => currentUser, byId, glove, currentGlove, activePotion,
  luck, speed, format, formatWalletScientific, fresh, save, flushCloudSave,
  render, toast, achievementStats, rewardText, grantAchievementReward,
  showAchievementPopup, checkAchievements, logCraft, logPotionAction,
  KEY, userSaveKey, documentRef: document, confirmAction: message => confirm(message),
  adoptServerBag: (bag, updatedAt) => cloudSaveService?.adoptServerBag(bag, updatedAt) || false,
  openAuth, totalUnique, restartAutoInterval, chanceText, timerManager, escapeHTML, localStorageRef: localStorage
});
equipmentUI.setupEquipmentUI();
mainRenderUI = createMainRenderUI({
  getState: () => S, documentRef: document, updateWeatherUI, checkAchievements, save,
  format, totalUnique, luck, formatWalletScientific, totalDice, renderAutoDepositOptions,
  isRolling, isAutoRolling, bagUpgradeCost, renderAutoSellOptions, renderInventory,
  renderCodex, renderGloves, renderPotions, renderQuests, renderProfile, D
});
const glitchWeatherDropSystem = createGlitchWeatherDropSystem({
  getState: () => S,
  getCurrentUser: () => currentUser,
  getWeather,
  isReady: userId => cloudSaveService.isLoadedFor(userId),
  POTIONS,
  save,
  render,
  toast,
  timerManager,
  navigatorRef: navigator,
  localStorageRef: localStorage
});
glitchWeatherDropSystem.start();
setupAutoRollUI();
weeklyRealmEvent.setup();
globalBoostSystem = createGlobalBoostSystem({
 supabaseClient, timerManager, getBoostState:()=>globalBoostState, setBoostState:value=>{globalBoostState=value},
 render, restartAutoInterval, loadAdminIncomeMonitor, getCoinBoost:activeGlobalCoinBoost, documentRef:document,
 onFusionLuckChanged:()=>petSystem?.updatePetDicePreview?.()
});
const { activeGlobalBoost, activeFusionLuckBoost, refreshGlobalBoost, updateGlobalBoostStatus, renderRealmActivity, setupGlobalBoostUI } = globalBoostSystem;
setupGlobalBoostUI();
ensurePetData(S.pets);
petSystem.setupPetSystemUI();
setupAdminUIBindings({
  documentRef: document, loadAdminDashboard, loadAdminRareRolls, analyzeSuspiciousRolls,
  loadAdminOnlineCurve, loadAdminAchievementCounts, loadAdminPotionLogs,
  loadAdminDeletedAccounts, loadAdminIncomeMonitor, loadAdminPetInventoryCounts, loadAdminWeatherHistory,
  loadAdminGrantHistory, adminApi, isAdmin, toast, applyServerWeatherRow,
  supabaseClient, format, escapeHTML, D, populateAdminPetSelects, petById,
  writeAdminGrantLog, refreshLeaderboards, refreshCoinBoosts,
  applyPendingGrants, save, flushCloudSave,
  updateGlobalBoostStatus, renderRealmActivity, render, restartAutoInterval,
  setGlobalBoostState: value => { globalBoostState = value; }, updateAdminVisibility,
  setPlayerBan, getCurrentUser: () => currentUser
});

function loadAdminDashboard(){return adminPlayerManagement?.loadAdminDashboard()}
function loadAdminRareRolls(){return adminPlayerManagement?.loadAdminRareRolls()}
function analyzeSuspiciousRolls(){return adminPlayerManagement?.analyzeSuspiciousRolls()}

document.getElementById('upgradeBagBtn').onclick=()=>{const cap=Number(S.bagCapacity)||35;if(cap>=200){toast('背包已達目前上限 200 顆');return}const cost=bagUpgradeCost(cap);if((Number(S.coins)||0)<cost){toast(`$ 不足，擴充需要 ${format(cost)}$`);return}S.coins-=cost;S.bagCapacity=cap+1;save();render();toast(`背包容量已擴充至 ${S.bagCapacity} 顆`)};
document.getElementById('rollBtn').onclick=doRoll;
document.getElementById('refreshLeaderboardBtn').onclick=refreshLeaderboards;

function loadAdminOnlineCurve(){return adminMonitoringSystem?.loadAdminOnlineCurve()}


function loadAdminAchievementCounts(){return adminMonitoringSystem?.loadAdminAchievementCounts()}
function loadAdminPotionLogs(){return adminMonitoringSystem?.loadAdminPotionLogs()}
function loadAdminDeletedAccounts(){return adminMonitoringSystem?.loadAdminDeletedAccounts()}
function loadAdminIncomeMonitor(){return adminMonitoringSystem?.loadAdminIncomeMonitor()}
function loadAdminPetInventoryCounts(){return adminMonitoringSystem?.loadAdminPetInventoryCounts()}
function setPlayerBan(banned){return adminMonitoringSystem?.setPlayerBan(banned)}
setupAccountActions({
  documentRef: document, getState: () => S, setState: value => { S = value; },
  getCurrentUser: () => currentUser, setCurrentUser: value => { currentUser = value; },
  supabaseClient, SUPABASE_URL, SUPABASE_KEY, totalUnique, achievementStats,
  save, render, flushCloudSave, syncCloudSave, toast, stopAuto, KEY, localStorageRef: localStorage,
  fresh, refreshLeaderboards
});
save();render();refreshGlobalBoost();renderRealmActivity();refreshLeaderboards();startGameVisitTracking();timerManager.setInterval(()=>{const now=Date.now();let changed=false;for(const key of ['active','activeSpeed','activeMoney']){const a=S.potions?.[key];if(a?.type&&Number(a.expiresAt)<=now){S.potions[key]={type:'',expiresAt:0};changed=true}}if(activePotion('luck')||activePotion('speed')||activePotion('money'))renderPotions();if(changed){restartAutoInterval();save();render()}},1000,'potion-expiry');


/* ---- merged from script2.js: achievement popup controls ---- */

setupDisplayControls({ documentRef: document, windowRef: window, navigatorRef: navigator, toast });
setupPetSellingUI({ getState: () => S, petById, petRarity, petArt, escapeHTML, PET_MUTATIONS, petIncomePerSecond, save, flushCloudSave, toast, render, renderPetsPage, coinEarningMultiplier, supabaseClient, getCurrentUser: () => currentUser });
