export function createWeatherSystem(dependencies) {
 const {
  D, WEATHER_TYPES, format, escapeHTML, chanceText, byId, supabaseClient, timerManager,
  getState, getCurrentUser, getAnnouncementChannel, openAuth, toast, save,
  render, renderCodex, renderGloves, flushCloudSave,
  announceWeatherSummon, triggerWeatherSurge
 } = dependencies;
// 全服一致的遊戲天氣：以 UTC 當日每分鐘為固定種子，讓所有玩家看到同一場天氣；特殊天氣持續 5 分鐘。
let cachedWeatherMinute=-1,cachedWeatherState={type:'sunny',until:0};
// 召喚天氣保護：避免稍後抵達的舊晴天資料覆蓋剛成功的召喚結果。
let summonedWeatherGuardUntil=(()=>{try{return Number(JSON.parse(localStorage.getItem('diceRealmSummonedWeatherGuard')||'{}').until)||0}catch{return 0}})();
let lastServerWeatherUpdatedAt=0;
let serverWeatherState=null,lastWeatherAnnouncementKey='';
let playerWeatherOverride=null,playerWeatherChannel=null,lastPlayerWeatherKey='';
let serverWeatherRefreshBusy=false,playerWeatherRefreshBusy=false,summonDataLoadBusy=false;
let forcedWeatherState=(()=>{try{const v=JSON.parse(localStorage.getItem('diceRealmForcedWeather')||'null');return v&&Number(v.until)>Date.now()?v:null}catch{return null}})();
function specialWeatherLocked(now=Date.now()){return false}
function applyServerWeatherRow(row,announce=false){
 if(!row)return;
 const now=Date.now(),updatedAt=row.updated_at?new Date(row.updated_at).getTime():0;
 // 舊的 realtime／輪詢回應不得蓋掉更新的天氣狀態。
 if(updatedAt&&lastServerWeatherUpdatedAt&&updatedAt<lastServerWeatherUpdatedAt)return;
 const until=row.ends_at?new Date(row.ends_at).getTime():0;
 // 召喚成功後，若短時間內讀到舊的晴天資料，保留召喚天氣直到原定結束時間。
 if(row.weather_type==='sunny'&&(!row.weather_type_2||row.weather_type_2==='sunny')&&summonedWeatherGuardUntil>now)return;
 const valid=['sunny','rain','snow','thunder','crystal','hell','dumpling','glitch'];const next=until>now&&valid.includes(row.weather_type)?{type:row.weather_type,types:[row.weather_type,...(valid.includes(row.weather_type_2)&&row.weather_type_2!==row.weather_type?[row.weather_type_2]:[])],until,by:row.summoned_by||'玩家',at:updatedAt||now}:null;
 if(updatedAt)lastServerWeatherUpdatedAt=Math.max(lastServerWeatherUpdatedAt,updatedAt);
 if(next&&next.type!=='sunny'){summonedWeatherGuardUntil=next.until;try{localStorage.setItem('diceRealmSummonedWeatherGuard',JSON.stringify({until:next.until,type:next.type}))}catch{}}
 if(!next&&summonedWeatherGuardUntil<=now){summonedWeatherGuardUntil=0;try{localStorage.removeItem('diceRealmSummonedWeatherGuard')}catch{}}
 const key=next&&['crystal','hell'].includes(next.type)?`${next.type}:${next.at}:${next.by}`:'';
 const changed=!!next&&['crystal','hell'].includes(next.type)&&key!==lastWeatherAnnouncementKey;
 serverWeatherState=next;
 if(next&&changed){lastWeatherAnnouncementKey=key;if(announce)announceWeatherSummon(next.type,next.by,next.at);}
 cachedWeatherMinute=-1;updateWeatherUI();renderCodex();if(document.getElementById('page-weather-summon')?.classList.contains('active'))loadWeatherSummonData(false);
}
function applyPlayerWeatherRow(row,announce=false){
 const until=row?.ends_at?new Date(row.ends_at).getTime():0;
 const next=row&&until>Date.now()&&['sunny','rain','snow','thunder','crystal','hell'].includes(row.weather_type)?{type:row.weather_type,until,by:row.set_by||'管理員',at:row.updated_at?new Date(row.updated_at).getTime():Date.now(),personal:true}:null;
 const key=next?`${next.type}:${next.until}:${next.at}`:'';
 const changed=key!==lastPlayerWeatherKey;
 playerWeatherOverride=next;lastPlayerWeatherKey=key;
 if(next&&changed&&announce){toast(`管理員為你指定了${WEATHER_TYPES[next.type]?.label||'晴天'}，持續至 ${new Date(next.until).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}`);if(['crystal','hell'].includes(next.type))triggerWeatherSurge(next.type);}
 cachedWeatherMinute=-1;updateWeatherUI();renderCodex();
}
async function refreshPlayerWeatherOverride(announce=false){
 if(playerWeatherRefreshBusy)return;
 if(!supabaseClient||!getCurrentUser()){if(playerWeatherOverride){playerWeatherOverride=null;lastPlayerWeatherKey='';cachedWeatherMinute=-1;updateWeatherUI();renderCodex()}return}
 playerWeatherRefreshBusy=true;
 try{const {data,error}=await supabaseClient.from('player_weather_overrides').select('weather_type,ends_at,set_by,updated_at').eq('user_id',getCurrentUser().id).maybeSingle();if(error)throw error;applyPlayerWeatherRow(data,announce)}catch(e){console.debug('Personal weather override unavailable',e)}finally{playerWeatherRefreshBusy=false}
}
function setupPlayerWeatherSubscription(){
 if(playerWeatherChannel){try{supabaseClient?.removeChannel(playerWeatherChannel)}catch{}playerWeatherChannel=null}
 if(!supabaseClient||!getCurrentUser())return;
 try{playerWeatherChannel=supabaseClient.channel('player-weather-'+getCurrentUser().id).on('postgres_changes',{event:'*',schema:'public',table:'player_weather_overrides',filter:'user_id=eq.'+getCurrentUser().id},payload=>{applyPlayerWeatherRow(payload.new||null,true)}).subscribe();}catch(e){console.debug('Personal weather realtime unavailable',e)}
 refreshPlayerWeatherOverride(false);
}
async function refreshServerWeather(announce=false){
 if(serverWeatherRefreshBusy||!supabaseClient)return;
 serverWeatherRefreshBusy=true;
 try{const {data,error}=await supabaseClient.from('realm_weather_state').select('weather_type,weather_type_2,ends_at,summoned_by,updated_at').eq('singleton',true).maybeSingle();if(error)throw error;if(data)applyServerWeatherRow(data,announce)}
 catch(e){console.debug('Shared weather state unavailable',e)}finally{serverWeatherRefreshBusy=false}
}
function applyForcedWeather(payload){if(!payload||!['sunny','rain','snow','thunder','glitch'].includes(payload.type))return;const until=Number(payload.until)||0;forcedWeatherState={type:payload.type,until};try{if(until>Date.now())localStorage.setItem('diceRealmForcedWeather',JSON.stringify(forcedWeatherState));else localStorage.removeItem('diceRealmForcedWeather')}catch{}cachedWeatherMinute=-1;updateWeatherUI();renderCodex();}
function minuteSeed(n){let x=(n^0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);x=(x^(x>>>15))>>>0;return x/4294967296}
function getWeather(now=Date.now()){
 if(playerWeatherOverride&&Number(playerWeatherOverride.until)>now)return playerWeatherOverride;
 if(playerWeatherOverride&&Number(playerWeatherOverride.until)<=now){playerWeatherOverride=null;lastPlayerWeatherKey='';}
 // 共享狀態只在非晴天天氣期間覆蓋自然天氣循環。舊版雲端若留下長效 sunny 記錄，會讓所有玩家卡在晴天。
 if(serverWeatherState&&Number(serverWeatherState.until)>now&&(serverWeatherState.type!=='sunny'||(serverWeatherState.types||[]).some(type=>type!=='sunny')))return serverWeatherState;
 if(forcedWeatherState){if(Number(forcedWeatherState.until)>now)return forcedWeatherState;forcedWeatherState=null;try{localStorage.removeItem('diceRealmForcedWeather')}catch{}cachedWeatherMinute=-1;}
 const minute=Math.floor(now/60000);if(minute===cachedWeatherMinute)return cachedWeatherState;
 const dayStart=Math.floor(now/86400000)*1440-5;let state={type:'sunny',until:0};
 for(let m=dayStart;m<=minute;m++){
  const stamp=m*60000;
  if(state.type!=='sunny'&&stamp<state.until)continue;
  state={type:'sunny',until:0};
  const r=minuteSeed(m);
  if(r<.08)state={type:'rain',until:stamp+5*60000};
  else if(r<.14)state={type:'snow',until:stamp+5*60000};
  else if(r<.18)state={type:'thunder',until:stamp+5*60000};
 }
 if(state.type!=='sunny'&&now>=state.until)state={type:'sunny',until:0};
 cachedWeatherMinute=minute;cachedWeatherState=state;return state;
}
function activeWeatherDice(){const w=getWeather(),types=w.types||[w.type];return D.filter(d=>d.weather&&types.includes(d.weather))}
async function convertWeather(){
 const scope=document.getElementById('weatherConvertScope')?.value||'global';

 if(!getCurrentUser()||!supabaseClient){openAuth();toast('全服天氣轉換需要登入雲端帳號');return}
 if(getState().equipped!=='g7'||!getState().gloves?.g7){toast('需要裝備並擁有天氣手套');return}
 const btn=document.getElementById('weatherConvertBtn');if(btn){btn.disabled=true;btn.textContent='正在轉換全服天氣…'}
 try{
  const chosen=['rain','snow','thunder'][Math.floor(Math.random()*3)];
  if(scope==='local'){const until=Date.now()+5*60*1000;playerWeatherOverride={type:chosen,until,by:getState().name,at:Date.now()};getState().localWeatherConvertAt=Date.now();getState().weatherConvertAt=Date.now();cachedWeatherMinute=-1;updateWeatherUI();save();}
  else {await flushCloudSave();const {data,error}=await supabaseClient.rpc('convert_weather_with_glove');if(error)throw error;if(!data?.weather_type)throw new Error('伺服器沒有回傳天氣結果');getState().weatherConvertAt=Number(data.weather_convert_at)||Date.now();applyServerWeatherRow({weather_type:data.weather_type,ends_at:data.ends_at,summoned_by:data.summoned_by,updated_at:data.updated_at},false);save();await flushCloudSave();}
  getState().weatherConvertAt=Date.now();save();renderGloves();
  toast((scope==='local'?'本伺服器':'全伺服器')+'天氣已變更：'+(WEATHER_TYPES[scope==='local'?chosen:(serverWeatherState?.type||chosen)]?.label||'天氣'));
 }catch(e){console.error('Shared weather conversion failed',e);toast('天氣轉換失敗：'+(e.message||'請稍後重試'))}
 finally{renderGloves()}
}
document.addEventListener('click',e=>{if(e.target.closest('#weatherConvertBtn'))convertWeather()});
function updateWeatherUI(){
 const state=getWeather(),wrap=document.getElementById('weatherStatus'),activeTypes=(state.types||[state.type]).filter(t=>WEATHER_TYPES[t]);
 document.body.classList.toggle('weather-aura-crystal',activeTypes.includes('crystal'));
 document.body.classList.toggle('weather-aura-hell',activeTypes.includes('hell'));
 document.body.classList.toggle('weather-aura-dumpling',activeTypes.includes('dumpling'));
 document.body.classList.toggle('weather-aura-glitch',activeTypes.includes('glitch'));
 let scene=document.getElementById('weatherSceneOverlay');
 if(!scene){scene=document.createElement('div');scene.id='weatherSceneOverlay';scene.className='weather-scene-overlay';scene.setAttribute('aria-hidden','true');document.body.appendChild(scene)}
 scene.className='weather-scene-overlay'+(['rain','snow','thunder'].includes(state.type)?' '+state.type:'')+(activeTypes.includes('glitch')?' glitch':'');
 if(!wrap)return;
 wrap.classList.remove('weather-rain','weather-snow','weather-thunder','weather-crystal','weather-hell','weather-dumpling','weather-glitch');
 activeTypes.forEach(t=>wrap.classList.add('weather-'+t));
 if(!activeTypes.length){wrap.innerHTML='<span class="weather-item"><span class="weather-icon">☀️</span><span class="weather-name">晴天</span></span>';return}
 const now=Date.now();
 wrap.innerHTML=activeTypes.map(type=>{
  const meta=WEATHER_TYPES[type],until=Number(state.untilByType?.[type]??state[type+'Until']??state.until)||0;
  const left=Math.max(0,Math.ceil((until-now)/1000)),mm=String(Math.floor(left/60)).padStart(2,'0'),ss=String(left%60).padStart(2,'0');
  return '<span class="weather-item weather-item-'+type+'" data-weather-type="'+type+'"><span class="weather-icon">'+meta.icon+'</span><span class="weather-name">'+meta.label+'</span><span class="weather-countdown">'+mm+':'+ss+'</span></span>';
 }).join('');
}
timerManager.setInterval(()=>{updateWeatherUI();if(!document.getElementById('weatherConvertPanel')?.hidden&&getState().equipped==='g7')renderGloves()},1000,'weather-ui');updateWeatherUI();
let weatherContributionPoints=0,weatherContributionDeposits={};
function renderWeatherSummon(){
 const points=Math.max(0,Number(weatherContributionPoints)||0),remaining=Math.max(0,35000-points);
 const p=document.getElementById('summonPoints'),r=document.getElementById('summonRemaining'),bar=document.getElementById('summonProgressBar'),txt=document.getElementById('summonProgressText'),btn=document.getElementById('summonWeatherBtn'),status=document.getElementById('summonStatus'),list=document.getElementById('summonDiceList');
 if(!p||!r||!bar||!txt||!btn||!status||!list)return;
 p.textContent=format(points);r.textContent=format(remaining);bar.style.width=Math.min(100,points/35000*100)+'%';
 txt.textContent=points>=35000?'召喚儀式已完成，可以召喚天氣。':`已累積 ${format(points)} / 35,000`;
 btn.disabled=!getCurrentUser()||points<35000||specialWeatherLocked();
 btn.textContent=specialWeatherLocked()?'特殊天氣鎖定中':'✧ 召喚特殊天氣';
 if(!getCurrentUser())status.textContent='請先登入雲端帳號；投入骰子和召喚需要同步到全服伺服器。';
 else if(specialWeatherLocked())status.textContent=`目前${WEATHER_TYPES[serverWeatherState.type]?.label||'特殊天氣'}正在持續，剩餘 ${Math.max(1,Math.ceil((serverWeatherState.until-Date.now())/1000))} 秒，不能被其他天氣打斷。`;
 else status.textContent=points>=35000?'可以召喚：70% 水晶天氣、30% 地獄天氣。召喚後全服持續 5 分鐘。':`還需要 ${format(remaining)} 能量。`;
 const weatherDice=D.filter(d=>d.weather&&Number(getState().bag?.[d.id])>0).sort((a,b)=>({rain:0,snow:1,thunder:2,crystal:3,hell:4}[a.weather]-({rain:0,snow:1,thunder:2,crystal:3,hell:4}[b.weather])||a.den-b.den));
 if(!getCurrentUser()){list.innerHTML='<div class="empty">登入雲端帳號後，這裡會顯示可投入的天氣變異骰子。</div>';return}
 if(!weatherDice.length){list.innerHTML='<div class="empty">目前沒有可投入的天氣變異骰子。雨、雪、打雷、水晶、地獄限定骰子都可以投入。</div>';return}
 list.innerHTML=weatherDice.map(d=>{const have=Math.max(0,Number(getState().bag[d.id])||0),contributed=Number(weatherContributionDeposits[d.id])||0;return `<div class="summon-dice-row"><div class="summon-dice-meta"><b style="color:${d.weather==='crystal'?'#ed75ff':d.weather==='hell'?'#ff6038':d.weather==='rain'?'#75baff':d.weather==='snow'?'#f4fbff':'#fff000'}">${d.icon} ${escapeHTML(d.name)}</b><small>${chanceText(d)} · 持有 ${format(have)} · 已投入 ${format(contributed)} 顆 · 每顆 +${format(d.den)} 點</small></div><input class="field summon-qty" type="number" min="1" max="${have}" value="1" data-weather-deposit-qty="${d.id}" aria-label="投入${escapeHTML(d.name)}數量"><button class="primary" type="button" data-weather-deposit="${d.id}">投入</button></div>`}).join('');
}
async function loadWeatherSummonData(refreshState=true){
 if(summonDataLoadBusy)return;
 summonDataLoadBusy=true;
 try {
 if(refreshState)await refreshServerWeather(false);
 if(!getCurrentUser()||!supabaseClient){weatherContributionPoints=0;weatherContributionDeposits={};renderWeatherSummon();return}
 try{const {data,error}=await supabaseClient.from('realm_weather_contributions').select('points,deposits').eq('user_id',getCurrentUser().id).maybeSingle();if(error)throw error;weatherContributionPoints=Number(data?.points)||0;weatherContributionDeposits=data?.deposits||{};renderWeatherSummon()}
 catch(e){console.error('Weather contribution read failed',e);renderWeatherSummon();document.getElementById('summonStatus').textContent='讀取召喚資料失敗：'+(e.message||'請稍後重試')}
 } finally { summonDataLoadBusy=false; }
}
async function depositWeatherDice(id){
 if(!getCurrentUser()||!supabaseClient){openAuth();toast('請先登入雲端帳號');return}
 const d=byId(id);if(!d?.weather){toast('這顆不是天氣變異骰子');return}
 const row=document.querySelector(`[data-weather-deposit-qty="${id}"]`),qty=Math.floor(Number(row?.value)||0),have=Number(getState().bag?.[id])||0;
 if(qty<1||qty>have){toast('請輸入有效的投入數量');return}
 if(d.den>8000&&!confirm(`你準備投入 ${d.name}（1/${format(d.den)}）×${qty}。這類骰子相當稀有，投入後會永久扣除、無法取回。確定投入嗎？`))return;
 const button=document.querySelector(`[data-weather-deposit="${id}"]`);if(button){button.disabled=true;button.textContent='投入中…'}
 try{
  await flushCloudSave();
  const {data,error}=await supabaseClient.rpc('deposit_weather_dice',{p_dice_id:id,p_quantity:qty});if(error)throw error;
  if(!data||!data.bag)throw new Error('伺服器沒有回傳背包資料');
  getState().bag=data.bag;weatherContributionPoints=Number(data.points)||0;weatherContributionDeposits=data.deposits||{};save();render();await flushCloudSave();renderWeatherSummon();toast(`已投入 ${d.name} ×${qty}，增加 ${format(data.added_points)} 點召喚能量`);
 }catch(e){console.error('Weather dice deposit failed',e);toast('投入失敗：'+(e.message||'請確認已登入並同步存檔'));}finally{renderWeatherSummon()}
}
async function summonSpecialWeather(){
 if(!getCurrentUser()||!supabaseClient){openAuth();toast('請先登入雲端帳號');return}

 if(weatherContributionPoints<35000){toast('召喚能量尚未達到 35,000 點');return}
 if(!confirm('確定召喚特殊天氣嗎？召喚結果會立即改變全伺服器的天氣，所有玩家都會受到影響。可以邀請朋友一起體驗！水晶天氣機率 70%，地獄天氣機率 30%。'))return;
 const btn=document.getElementById('summonWeatherBtn');btn.disabled=true;btn.textContent='正在吟唱召喚咒文…';
 try{
  await flushCloudSave();
  const {data,error}=await supabaseClient.rpc('summon_realm_weather');if(error)throw error;
  if(!data?.weather_type)throw new Error('伺服器沒有回傳召喚結果');
  weatherContributionPoints=Number(data.remaining_points)||0;
  applyServerWeatherRow({weather_type:data.weather_type,ends_at:data.ends_at,summoned_by:data.summoned_by,updated_at:data.updated_at},true);
  if(getAnnouncementChannel())getAnnouncementChannel().send({type:'broadcast',event:'weather_summoned',payload:data}).catch?.(()=>{});
  await loadWeatherSummonData(false);render();toast(`召喚成功：${WEATHER_TYPES[data.weather_type]?.label||data.weather_type}！全服天氣已改變`);
 }catch(e){console.error('Weather summon failed',e);toast('召喚失敗：'+(e.message||'請稍後再試'))}
 finally{renderWeatherSummon()}
}
function toggleAutoDepositWeather(){getState().autoDepositWeatherEnabled=!getState().autoDepositWeatherEnabled;save();render();toast(getState().autoDepositWeatherEnabled?'自動添加已開啟：擲出符合門檻的天氣骰子時會自動投入':'自動添加已關閉')}
async function autoDepositRolledWeatherDice(d){
 if(!d?.weather||!getCurrentUser()||!supabaseClient)return false;
 if(!getState().autoDepositWeatherEnabled||!(getState().autoDepositDice||[]).includes(d.id))return false;
 try{
  // 先把剛抽到的骰子存進雲端，再由後端扣除並計入召喚能量，避免新骰子尚未同步而投入失敗。
  await flushCloudSave();
  const {data,error}=await supabaseClient.rpc('deposit_weather_dice',{p_dice_id:d.id,p_quantity:1});if(error)throw error;
  if(!data?.bag)throw new Error('伺服器沒有回傳背包資料');
  getState().bag=data.bag;weatherContributionPoints=Number(data.points)||0;weatherContributionDeposits=data.deposits||{};
  await flushCloudSave();renderWeatherSummon();toast(`已自動添加 ${d.name}，增加 ${format(data.added_points)} 點召喚能量`);return true;
 }catch(e){console.error('Auto deposit rolled weather die failed',e);toast('自動添加失敗，骰子已保留在背包：'+(e.message||'請稍後重試'));return false}
}
document.addEventListener('click',e=>{const d=e.target.closest('[data-weather-deposit]');if(d)depositWeatherDice(d.dataset.weatherDeposit);if(e.target.closest('#summonWeatherBtn'))summonSpecialWeather();if(e.target.closest('#autoDepositWeatherBtn'))toggleAutoDepositWeather()});
timerManager.setInterval(()=>{refreshServerWeather(false);refreshPlayerWeatherOverride(false)},12000,'weather-refresh');
 return {
  getWeather, activeWeatherDice, applyServerWeatherRow, applyForcedWeather,
  refreshServerWeather, setupPlayerWeatherSubscription, loadWeatherSummonData,
  autoDepositRolledWeatherDice, renderWeatherSummon, refreshPlayerWeatherOverride,
  updateWeatherUI
 };
}
