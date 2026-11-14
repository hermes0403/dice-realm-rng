/** Initial game state, legacy save migration, and local-save normalization. */
export function createGameStateService(dependencies) {
  const { KEY, D, G, POTIONS, ensurePetData, getCurrentUser, getState, localStorageRef = globalThis.localStorage } = dependencies;
  const localStorage = localStorageRef;
function fresh(){return {pets:[],equippedPetUids:[],petDiscovered:{},name:'旅人',joined:new Date().toISOString(),rolls:0,bag:{},lockedDice:[],bagCapacity:35,first:{},gloves:{g0:1},equipped:'g0',best:null,coins:0,currencyVersion:2,petIncomePending:0,adminGrantApplied:{},autoSellThreshold:0,autoDeleteDice:[],autoSold:0,autoDepositWeatherEnabled:false,autoDepositThreshold:700,autoDepositDice:[],potions:{inventory:{luck1:0,luck2:0,luck3:0,speed1:0,speed2:0,angel1:0,angel2:0},active:{type:'',expiresAt:0},activeSpeed:{type:'',expiresAt:0},angelCharges:0,autoAdd:false,materials:{},autoAddPotions:[]},halloweenUnlocked:{d33:false,d34:false},questDate:new Date().toLocaleDateString('en-CA'),quest:{rolls:0,rare:0,craft:0,coinsEarned:0,rewardClaimed:false,taskIds:[]},dailyQuestCompletions:0,achievements:{},petSkillLuckCharges:0,petSkillDaily:{date:new Date().toLocaleDateString('en-CA'),s3:0,s5:0},petSkillLogin:{lastDate:null,streak:0,reward:0},petSkillSpeed:{activatedAt:0,expiresAt:0,cooldownUntil:0}}}
function normalizeGloves(x){
 // 舊版手套名稱對應新名稱；只轉換存檔中確實存在且持有的項目，不新增任何手套。
 const legacyToCurrent={
  '運氣':'g1','運氣手套':'g1','木頭':'g1','木頭手套':'g1',
  '雷霆':'g2','雷霆手套':'g2','石頭':'g2','石頭手套':'g2',
  '南瓜':'g3','南瓜手套':'g3','鐵':'g3','鐵手套':'g3',
  '雪':'g4','雪手套':'g4','黃金':'g4','黃金手套':'g4',
  '虛空':'g5','虛空手套':'g5','鑽石':'g5','鑽石手套':'g5',
  '宇宙':'g6','宇宙手套':'g6','糖果':'g6','糖果手套':'g6'
 };
 const src=(x.gloves&&typeof x.gloves==='object')?x.gloves:{};
 const normalized={g0:1};
 for(const [key,value] of Object.entries(src)){
  if(!(Number(value)>0))continue;
  const id=G.some(g=>g.id===key)?key:legacyToCurrent[key];
  if(id)normalized[id]=1;
 }
 // 裝備欄位也只接受目前已持有的 ID；無法辨識時回到基礎手套。
 const equippedRaw=String(x.equipped||'');
 const equipped=G.some(g=>g.id===equippedRaw)?equippedRaw:legacyToCurrent[equippedRaw];
 x.gloves=normalized;
 x.equipped=(equipped&&normalized[equipped])?equipped:'g0';
 // craftVoid／craftUniverse 是購買鑽石／糖果手套後取得的成就。
 // 正規化手套持有狀態時保留既有成就，避免載入存檔時重置完成狀態。
 return x;
}
function migrateCurrency(x){if(!x||typeof x!=='object')return x;if(Number(x.currencyVersion||0)<2){x.coins=Math.max(0,Math.round((Number(x.coins)||0)/60));x.currencyVersion=2;}return x}
function load(){try{let x=JSON.parse(localStorage.getItem(KEY));if(!x||!x.bag)return fresh();x=migrateCurrency(x);x=normalizeGloves(x);x.dumplingWeatherRewardClaimed=!!x.dumplingWeatherRewardClaimed;x.pets=Array.isArray(x.pets)?x.pets:[];ensurePetData(x.pets);x.equippedPetUids=Array.isArray(x.equippedPetUids)?x.equippedPetUids.filter(uid=>x.pets.some(p=>p.uid===uid)).slice(0,3):[];x.petDiscovered=x.petDiscovered||{};x.petSkillLuckCharges=Math.max(0,Number(x.petSkillLuckCharges)||0);x.petSkillDaily=x.petSkillDaily||{date:new Date().toLocaleDateString('en-CA'),s3:0,s5:0};x.petSkillLogin=x.petSkillLogin||{lastDate:null,streak:0,reward:0};x.petSkillSpeed=x.petSkillSpeed||{activatedAt:0,expiresAt:0,cooldownUntil:0};x.adminGrantApplied=x.adminGrantApplied||{};x.bagCapacity=Math.min(200,Math.max(35,Math.floor(Number(x.bagCapacity)||35)));x.potions=x.potions||{inventory:{},active:{type:'',expiresAt:0},activeSpeed:{type:'',expiresAt:0},angelCharges:0};x.potions.inventory=Object.assign({luck1:0,luck2:0,luck3:0,speed1:0,speed2:0,angel1:0,angel2:0},x.potions.inventory||{});x.potions.active=x.potions.active||{type:'',expiresAt:0};x.potions.activeSpeed=x.potions.activeSpeed||{type:'',expiresAt:0};if(x.potions.active.type&&POTIONS.find(p=>p.id===x.potions.active.type)?.speed){x.potions.activeSpeed=x.potions.active;x.potions.active={type:'',expiresAt:0}}x.potions.angelCharges=Number(x.potions.angelCharges)||0;x.potions.autoAdd=!!x.potions.autoAdd;x.potions.materials=x.potions.materials||{};x.potions.autoAddPotions=Array.isArray(x.potions.autoAddPotions)?x.potions.autoAddPotions.slice(0,2):[];x.halloweenUnlocked=x.halloweenUnlocked||{};x.halloweenUnlocked={d33:!!(x.halloweenUnlocked.d33||x.halloweenUnlocked.d9),d34:!!(x.halloweenUnlocked.d34||x.halloweenUnlocked.d12)};x.coins=Number(x.coins)||0;x.autoSellThreshold=Number(x.autoSellThreshold)||0;x.autoDeleteDice=Array.isArray(x.autoDeleteDice)?x.autoDeleteDice.filter(id=>D.some(d=>d.id===id&&!d.weather&&Number(d.den)<=600000)):[];x.autoSold=Number(x.autoSold)||0;x.autoDepositWeatherEnabled=!!x.autoDepositWeatherEnabled;x.autoDepositThreshold=[700,2000,5000].includes(Number(x.autoDepositThreshold))?Number(x.autoDepositThreshold):700;x.autoDepositDice=Array.isArray(x.autoDepositDice)?x.autoDepositDice.filter(id=>D.some(d=>d.id===id&&!!d.weather&&Number(d.den)<=1000000)):[];x.first=x.first||{};x.bag=x.bag||{};x.lockedDice=Array.isArray(x.lockedDice)?x.lockedDice.filter(key=>typeof key==='string'):[];x.rollCounts=x.rollCounts||{};x.halloweenUnlocked=x.halloweenUnlocked||{};x.halloweenUnlocked={d33:!!(x.halloweenUnlocked.d33||x.halloweenUnlocked.d9),d34:!!(x.halloweenUnlocked.d34||x.halloweenUnlocked.d12)};for(const id of Object.keys(x.bag)){if((Number(x.bag[id])||0)>0&&!x.first[id])x.first[id]=x.joined||new Date().toISOString()}return x}catch{return fresh()}}
  function autoSellPrefsStorageKey(){const user=getCurrentUser();return user?.id?`diceRealmAutoSellPrefs_v1_${user.id}`:null}
  function persistAutoSellPrefs(){const key=autoSellPrefsStorageKey();if(!key)return;const state=getState();try{localStorage.setItem(key,JSON.stringify({autoDeleteDice:Array.isArray(state.autoDeleteDice)?state.autoDeleteDice:[],savedAt:Date.now()}))}catch(e){console.warn('Auto-sell preference local save failed',e)}}
  function restoreAutoSellPrefs(){const key=autoSellPrefsStorageKey();if(!key)return false;try{const raw=localStorage.getItem(key);if(!raw)return false;const prefs=JSON.parse(raw);if(!Array.isArray(prefs?.autoDeleteDice))return false;const state=getState();state.autoDeleteDice=prefs.autoDeleteDice.filter(id=>D.some(d=>d.id===id&&!d.weather&&Number(d.den)>=2&&Number(d.den)<=600000));return true}catch(e){console.warn('Auto-sell preference restore failed',e);return false}}
  return { fresh, normalizeGloves, migrateCurrency, load, persistAutoSellPrefs, restoreAutoSellPrefs };
}
