/** First-login guide and admin-only preview for Dice Realm. */
const STEPS = [
{title:'歡迎來到骰界 RNG',kicker:'WELCOME TO DICE REALM',page:'roll',body:'每一次擲骰都可能帶來新的發現。先從擲骰大廳開始，累積骰子、收藏與資源。',tip:'按「下一步」認識各個系統。'},
{title:'擲骰大廳',kicker:'ROLL THE UNKNOWN',page:'roll',body:'按下擲骰即可抽取骰子，也能開啟自動擲骰。畫面會顯示目前抽中的骰子、稀有度與你的累積數據。',tip:'背包滿了就先整理或擴充容量。'},
{title:'骰子背包',kicker:'YOUR INVENTORY',page:'inventory',body:'這裡會保存你持有的骰子。你可以鎖定重要骰子、選擇出售，並使用金錢擴充背包容量。',tip:'重要或稀有的骰子建議先鎖定。'},
{title:'收藏圖鑑',kicker:'ARCHIVE DATABASE',page:'codex',body:'圖鑑會記錄你發現過的骰子與收藏進度。尚未發現的項目會以未知檔案顯示。',tip:'持續探索不同骰子，逐步完成收藏。'},
{title:'寵物與融合機',kicker:'PET SYNTHESIS CORE',page:'pets',body:'投入兩顆符合條件的骰子即可合成寵物。裝備寵物後，帳號在線時可獲得每秒收益。',tip:'合成前先查看材料與品質機率。'},
{title:'手套、藥水與道具',kicker:'WORKSHOP',page:'workshop',body:'工坊分為手套、藥水與道具。依照配方收集材料，製作裝備或使用增益道具。',tip:'切換工坊上方分類即可查看不同項目。'},
{title:'天氣召喚',kicker:'ARCANE WEATHER RITUAL',page:'weather-summon',body:'投入符合條件的天氣骰子累積召喚能量，達到需求後即可參與全服特殊天氣召喚。',tip:'投入前請確認骰子種類，投入後無法取回。'},
{title:'任務、成就與里程碑',kicker:'YOUR PROGRESS',page:'quests',body:'每日任務提供日常目標，成就會記錄你的長期進度並自動發放達成獎勵。',tip:'完成教學後，就可以開始自己的骰界旅程。'}
];
export function setupOnboardingUI({documentRef=document,getCurrentUser,isAdmin,go,toast}){
let index=0,previewMode=false;
const overlay=documentRef.getElementById('onboardingOverlay');
const el=id=>documentRef.getElementById(id);
function markSeen(){const user=getCurrentUser();if(!previewMode&&user?.id){try{localStorage.setItem('diceRealmTutorialSeen_v1_'+user.id,'1')}catch{}}}
function close(){if(!overlay)return;markSeen();overlay.hidden=true;documentRef.body.classList.remove('tutorial-open');previewMode=false}
function render(){const step=STEPS[index];el('onboardingKicker').textContent=step.kicker;el('onboardingTitle').textContent=step.title;el('onboardingBody').textContent=step.body;el('onboardingTip').textContent=step.tip;el('onboardingCounter').textContent=(index+1)+' / '+STEPS.length;el('onboardingProgress').style.width=((index+1)/STEPS.length*100)+'%';el('onboardingPrevious').disabled=index===0;el('onboardingNext').textContent=index===STEPS.length-1?'完成教學':'下一步';el('onboardingGoPage').onclick=()=>go(step.page)}
function show({preview=false}={}){if(!getCurrentUser()){toast('請先登入再查看新手教學');return false}if(preview&&!isAdmin()){toast('沒有管理員權限');return false}previewMode=preview;index=0;render();overlay.hidden=false;documentRef.body.classList.add('tutorial-open');return true}
function maybeShowForCurrentUser(){const user=getCurrentUser();if(!user?.id||!overlay)return false;try{if(localStorage.getItem('diceRealmTutorialSeen_v1_'+user.id)==='1')return false}catch{}return show()}
el('onboardingPrevious').addEventListener('click',()=>{if(index>0){index--;render()}});
el('onboardingNext').addEventListener('click',()=>{if(index===STEPS.length-1){close();return}index++;render()});
el('onboardingClose').addEventListener('click',close);el('onboardingSkip').addEventListener('click',close);
el('replayTutorialBtn').addEventListener('click',()=>show());
el('adminTutorialTestBtn').addEventListener('click',()=>show({preview:true}));
return{show,close,maybeShowForCurrentUser};
}
