import { D, G } from './data/dice.js';
import { POTIONS, ANGEL_ODDS } from './data/equipment.js';
import { PET_RARITIES, PETS, PET_BASE_INCOME, PET_INCOME_ROLLS, PET_TIER_CONFIG, PET_TIER_RATES, SECRET_PET_SKILLS, MYTHIC_PET_SKILLS, PET_IMAGE_ASSETS, PET_INDIVIDUAL_ODDS, PET_MUTATIONS, petBaseIncome, randomPet, petById } from './data/pets.js?v=20261104-pet-image-fix';
import { DAILY_TASKS } from './data/progression.js';
import { KEY, SUPABASE_URL, SUPABASE_KEY, WEATHER_TYPES, DEVICE_ACCOUNT_LIMIT, pages, ADMIN_GRANT_LABELS } from './config.js';
import { supabaseClient } from './services/supabase.js';
import { format, formatWalletScientific, compactNum, escapeHTML } from './core/format.js';
import { createNavigationUI } from './ui/navigation.js';
import { createInventoryUI } from './ui/inventory.js';
import { createPetIncomeSystem } from './systems/pet-income.js';
import { setupAdminPetOddsUI } from './admin/pet-odds.js';
import { createDeviceLockService } from './services/device-lock.js';
import { createVisitTrackingService } from './services/visit-tracking.js';
import { setupPetSellingUI } from './ui/pet-selling.js';
import { createProgressionSystem } from './systems/progression.js';
import { createAdminGrantService } from './admin/grants.js';

import { createWeatherSystem } from './systems/weather.js';
import { createCloudSaveService } from './services/cloud-save.js?v=20261110-roll-save-cachefix';
import { createCoinBoostService } from './systems/coin-boost.js';
import { createLeaderboardSystem } from './systems/leaderboards.js';
import { createAuthService } from './services/auth.js';
import { createPetSystem } from './systems/pets.js?v=20261104-pet-image-fix';
import { petWeightSkillMultiplier } from './systems/pet-skills.js';
import { createDiceSystem } from './systems/dice.js';
import { createGlobalBoostSystem } from './systems/global-boost.js';
import { createRealmSocialSystem } from './systems/realm-social.js';
import { createEquipmentUI } from './ui/equipment.js';
import { createAdminPlayerManagement } from './admin/player-management.js';
import { createAdminMonitoringSystem } from './admin/monitoring.js';
import { createGameStateService } from './core/game-state.js';
import { createPresenceService } from './services/presence.js';
import { createActivityLogService } from './services/activity-logs.js';
import { createPetNoticeUI } from './ui/pet-notices.js';
import { createCodexUI } from './ui/codex.js';
import { createMainRenderUI } from './ui/main-render.js';
import { setupAdminUIBindings } from './admin/ui-bindings.js';
import { setupAccountActions } from './services/account-actions.js';
import { createTimerManager } from './core/timer-manager.js';

const timerManager = createTimerManager();
let globalBoostState=null;
let realmSocialSystem=null;
let equipmentUI=null;
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
activityLogService = createActivityLogService({ supabaseClient, getCurrentUser: () => currentUser, getState: () => S });
const { coinEarningMultiplier, refreshCoinBoosts, activeGlobalCoinBoost } = createCoinBoostService({ getCurrentUser: () => currentUser, supabaseClient, SUPABASE_URL, SUPABASE_KEY });
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
 restoreAutoSellPrefs, totalUnique, render, refreshLeaderboards,
 toast, openAuth, showAuthMessage, localStorageRef: localStorage, documentRef: document
});
const { scheduleSync } = cloudSaveService;
presenceService = createPresenceService({ supabaseClient, getCurrentUser: () => currentUser, getState: () => S, totalUnique, achievementStats, applyPendingGrants, scheduleSync });
function save(){return cloudSaveService.save()}
function userSaveKey(userId){return cloudSaveService.userSaveKey(userId)}
function savePayload(){return cloudSaveService.savePayload()}
function achievementStats(){return cloudSaveService.achievementStats()}
function applyPendingGrants(){return cloudSaveService.applyPendingGrants()}
function syncCloudSave(){return cloudSaveService.syncCloudSave()}
function loadCloudSave(){return cloudSaveService.loadCloudSave()}
let authService=null;
function showAuthMessage(message){return authService?.showAuthMessage(message)}
function openAuth(){return authService?.openAuth()}
function closeAuth(){return authService?.closeAuth()}
function authAction(mode){return authService?.authAction(mode)}
setupGlobalAnnouncements();refreshServerWeather(false);loadWeatherSummonData(false);
function byId(id){return D.find(x=>x.id===id)}
function glove(id){return G.find(x=>x.id===id)||G[0]}
function totalUnique(){return new Set([...Object.keys(S.first||{}),...Object.keys(S.bag||{}).filter(k=>S.bag[k]>0)]).size}
function totalDice(){return Object.values(S.bag).reduce((a,b)=>a+Math.max(0,Number(b)||0),0)}
function currentGlove(){return glove(S.equipped)}
function activePotion(category='luck'){const a=category==='speed'?S.potions?.activeSpeed:S.potions?.active;if(a&&a.type&&Number(a.expiresAt)>Date.now())return POTIONS.find(p=>p.id===a.type)||null;return null}
function potionLuck(){return activePotion('luck')?.luck||0}
function potionSpeed(){return activePotion('speed')?.speed||0}
function luck(){return Math.min(500,currentGlove().luck+potionLuck()+petBonusTotals().luck+Number(activeGlobalBoost().luck_percent||0)+((Number(S.petSkillLuckCharges)||0)>0?100:0))}
function speed(){return Math.min(500,currentGlove().speed+potionSpeed()+petBonusTotals().speed+Number(activeGlobalBoost().speed_percent||0))}
function effectiveDen(d){const w=getWeather(),types=w.types||[w.type];return d&&types.includes('hell')&&Number(d.den)>=700000?Math.floor(Number(d.den)*0.95):Number(d?.den)||0}
function chanceText(d){return d.id==='d1'?'1/2':'1/'+format(effectiveDen(d))}
// 天堂藥水 I 專屬固定機率。加入天氣限定骰子後，會從原本大於 10% 的項目分配機率，總和仍為 100%。
function toast(t){let e=document.getElementById('toast');e.textContent=t;e.classList.add('show');timerManager.clearTimeout(e._t);const timer=timerManager.setTimeout(()=>{e.classList.remove('show');if(e._t===timer)e._t=null},2100,'toast-hide');e._t=timer}
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
 showPetAutoSellNotice, documentRef:document, confirmAction:message=>confirm(message)
});
const {
 equippedPetHas, applyPetSkillDailyReset, applyPetRollSkills, petBonusTotals, populateAdminPetSelects,
 petRarity, petArt, petTierFromDen, weightedPetRarity, petMutationForDice, petMutationLabel,
 rollPetWeightKg, addPet, applyPetAutoSell, ownedPetName, renderPetsPage, renderPetCodex,
 renderPetChance, dicePairAllowed, dicePairTier, refreshPetDiceSelects, updatePetDicePreview,
 onPetDiceSelectionChange, craftPetFromDice
} = petSystem;
const { updateAdminVisibility, navHTML, go } = createNavigationUI({
  pages, isAdmin, toast, loadAdminDashboard, refreshLeaderboards, loadWeatherSummonData, renderPetsPage
});
authService=createAuthService({
 supabaseClient, DEVICE_ACCOUNT_LIMIT, KEY,
 getCurrentUser:()=>currentUser, setCurrentUser:value=>{currentUser=value}, getState:()=>S,
 releaseDeviceLock, recordGameVisit, setupPlayerWeatherSubscription, updateAdminVisibility,
 toast, loadCloudSave, loadPetFusionOdds, heartbeat, refreshLeaderboards, loadWeatherSummonData, timerManager
});
authService.registerAuthStateListener();
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
 D, ANGEL_ODDS, POTIONS, KEY, supabaseClient, timerManager, getState:()=>S, getCurrentUser:()=>currentUser,
 getWeather, luck, speed, byId, format, chanceText, totalDice, go, toast,
 isLockHeld, isHeartbeatActive, scheduleUnlock, applyPetRollSkills, potionMaterialTotal,
 checkAchievements, checkDailyReward, save, autoDepositRolledWeatherDice, broadcastRareRoll,
 render, documentRef:document
});
restartAutoInterval = restartAutoIntervalImpl;
equipmentUI = createEquipmentUI({
  getState: () => S, D, G, POTIONS, supabaseClient,
  getCurrentUser: () => currentUser, byId, glove, currentGlove, activePotion,
  luck, speed, format, formatWalletScientific, fresh, save, flushCloudSave,
  render, toast, achievementStats, rewardText, grantAchievementReward,
  showAchievementPopup, checkAchievements, logCraft, logPotionAction,
  KEY, userSaveKey, documentRef: document, confirmAction: message => confirm(message),
  openAuth, totalUnique, restartAutoInterval, chanceText, localStorageRef: localStorage
});
equipmentUI.setupEquipmentUI();
mainRenderUI = createMainRenderUI({
  getState: () => S, documentRef: document, updateWeatherUI, checkAchievements, save,
  format, totalUnique, luck, formatWalletScientific, totalDice, renderAutoDepositOptions,
  isRolling, isAutoRolling, bagUpgradeCost, renderAutoSellOptions, renderInventory,
  renderCodex, renderGloves, renderPotions, renderQuests, renderProfile, D
});
setupAutoRollUI();
const { activeGlobalBoost, refreshGlobalBoost, updateGlobalBoostStatus, renderRealmActivity, setupGlobalBoostUI } = createGlobalBoostSystem({
 supabaseClient, timerManager, getBoostState:()=>globalBoostState, setBoostState:value=>{globalBoostState=value},
 render, restartAutoInterval, loadAdminIncomeMonitor, getCoinBoost:activeGlobalCoinBoost, documentRef:document
});
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
  updateGlobalBoostStatus, renderRealmActivity, render, restartAutoInterval,
  setGlobalBoostState: value => { globalBoostState = value; }, updateAdminVisibility,
  setPlayerBan, getCurrentUser: () => currentUser
});

function loadAdminDashboard(){return adminPlayerManagement?.loadAdminDashboard()}
function loadAdminRareRolls(){return adminPlayerManagement?.loadAdminRareRolls()}
function analyzeSuspiciousRolls(){return adminPlayerManagement?.analyzeSuspiciousRolls()}

document.getElementById('upgradeBagBtn').onclick=()=>{const cap=Number(S.bagCapacity)||35;if(cap>=200){toast('背包已達目前上限 200 顆');return}const cost=bagUpgradeCost(cap);if((Number(S.coins)||0)<cost){toast(`$ 不足，擴充需要 ${format(cost)}$`);return}S.coins-=cost;S.bagCapacity=cap+1;save();render();toast(`背包容量已擴充至 ${S.bagCapacity} 顆`)};
document.getElementById('rollBtn').onclick=doRoll;
document.getElementById('authOpenBtn').onclick=openAuth;document.getElementById('authCloseBtn').onclick=closeAuth;document.getElementById('authLoginBtn').onclick=()=>authAction('login');document.getElementById('authSignupBtn').onclick=()=>authAction('signup');document.getElementById('authResetBtn').onclick=()=>authAction('reset');document.getElementById('refreshLeaderboardBtn').onclick=refreshLeaderboards;

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
  save, render, flushCloudSave, toast, stopAuto, KEY, localStorageRef: localStorage,
  fresh, refreshLeaderboards
});
save();render();refreshGlobalBoost();renderRealmActivity();refreshLeaderboards();startGameVisitTracking();timerManager.setInterval(()=>{const now=Date.now();let changed=false;for(const key of ['active','activeSpeed']){const a=S.potions?.[key];if(a?.type&&Number(a.expiresAt)<=now){S.potions[key]={type:'',expiresAt:0};changed=true}}if(activePotion('luck')||activePotion('speed'))renderPotions();if(changed){restartAutoInterval();save();render()}},1000,'potion-expiry');


/* ---- merged from script2.js: achievement popup controls ---- */

setupPetSellingUI({ getState: () => S, petById, petRarity, petArt, escapeHTML, PET_MUTATIONS, petIncomePerSecond, save, toast, render, renderPetsPage, coinEarningMultiplier });
