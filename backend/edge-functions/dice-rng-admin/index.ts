import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const ADMIN_EMAIL = "toby110403@gmail.com";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers:corsHeaders});
async function fetchAllUserRows(admin:any, table:string, userId:string, sortColumn:string){
  const all:any[]=[];
  for(let offset=0; offset<100000; offset+=1000){
    const {data,error}=await admin.from(table).select("*").eq("user_id",userId).order(sortColumn,{ascending:true}).range(offset,offset+999);
    if(error) throw error;
    const batch=data||[]; all.push(...batch);
    if(batch.length<1000) break;
  }
  return all;
}

async function purgePlayerData(admin:any, uid:string){
  const deletes = [
    ["potion_usage_logs","user_id"],["craft_logs","user_id"],["roll_announcements","user_id"],
    ["security_audit_logs","user_id"],["game_visit_events","user_id"],["player_grants","user_id"],
    ["realm_weather_contributions","user_id"],["player_weather_overrides","user_id"],
    ["game_saves","user_id"],["player_profiles","user_id"]
  ];
  for(const [table,column] of deletes){
    const {error}=await admin.from(table).delete().eq(column,uid);
    if(error) throw new Error("刪除玩家資料失敗 ("+table+"): "+error.message);
  }
  const {error:snapshotError}=await admin.from("deleted_player_accounts").delete().eq("deleted_user_id",uid);
  if(snapshotError) throw new Error("刪除舊封存資料失敗: "+snapshotError.message);
  const {error:adminLogError}=await admin.from("admin_actions").delete().filter("details->>targetUserId","eq",uid);
  if(adminLogError) throw new Error("刪除關聯管理紀錄失敗: "+adminLogError.message);
}

async function archivePlayer(admin:any, targetUser:any, deletedBy:string, reason:string){
  const uid=String(targetUser.id);
  const [profileRes,saveRes,grantsRes,weatherRes,overrideRes,craftLogs,rareRolls,securityLogs]=await Promise.all([
    admin.from("player_profiles").select("*").eq("user_id",uid).maybeSingle(),
    admin.from("game_saves").select("*").eq("user_id",uid).maybeSingle(),
    admin.from("player_grants").select("*").eq("user_id",uid).maybeSingle(),
    admin.from("realm_weather_contributions").select("*").eq("user_id",uid).maybeSingle(),
    admin.from("player_weather_overrides").select("*").eq("user_id",uid).maybeSingle(),
    fetchAllUserRows(admin,"craft_logs",uid,"created_at"),
    fetchAllUserRows(admin,"roll_announcements",uid,"created_at"),
    fetchAllUserRows(admin,"security_audit_logs",uid,"created_at")
  ]);
  for(const [label,result] of [["profile",profileRes],["save",saveRes],["grants",grantsRes],["weather contributions",weatherRes],["weather override",overrideRes]]) if(result.error) throw result.error;
  const username=String(profileRes.data?.username||targetUser.user_metadata?.username||"玩家").slice(0,20);
  const {error}=await admin.from("deleted_player_accounts").insert({
    deleted_user_id:uid, original_email:targetUser.email||null, original_username:username,
    deleted_by:deletedBy, deletion_reason:reason,
    account_snapshot:{user_id:uid,email:targetUser.email||null,created_at:targetUser.created_at||null,last_sign_in_at:targetUser.last_sign_in_at||null},
    profile_snapshot:profileRes.data||null, save_snapshot:saveRes.data?.save_data||null,
    craft_logs_snapshot:craftLogs, rare_rolls_snapshot:rareRolls, security_logs_snapshot:securityLogs,
    grants_snapshot:grantsRes.data||null, weather_contributions_snapshot:weatherRes.data||null,
    weather_override_snapshot:overrideRes.data||null
  });
  if(error) throw error;
  return {username,archivedRecords:craftLogs.length+rareRolls.length+securityLogs.length};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers:corsHeaders});
  if (req.method !== "POST") return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")!;
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any;
  try { body=await req.json(); } catch { return json({error:"請求內容格式錯誤"},400); }
  // Public, non-identifying visit heartbeat: records each browser session once per hour.
  if(body.action==="presence_ping"){
    const sessionId=String(body.sessionId||"");
    if(!/^[a-f0-9-]{24,80}$/i.test(sessionId)) return json({error:"無效的訪客工作階段"},400);
    const now=new Date();
    const bucket=new Date(now); bucket.setUTCMinutes(0,0,0);
    const {error}=await admin.from("presence_hourly_events").upsert(
      {session_id:sessionId,hour_bucket:bucket.toISOString(),last_seen:now.toISOString()},
      {onConflict:"session_id,hour_bucket"}
    );
    if(error) return json({error:"無法記錄本次訪問"},500);
    return json({success:true});
  }
  const authHeader=req.headers.get("Authorization");
  if(!authHeader?.startsWith("Bearer ")) return json({error:"請先登入管理員帳號"},401);
  const token=authHeader.slice(7);
  const userClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser(token);
  if(userError || !userData.user) return json({error:"請先登入有效帳號"},401);
  try{
    if(body.action==="coin_boost_status"){
      const now=new Date().toISOString();
      const {data,error}=await admin.from("admin_actions").select("details,created_at").eq("action_type","coin_boost").order("created_at",{ascending:false}).limit(500);
      if(error) throw error;
      const rows=data||[];
      const globalRow=rows.find((r:any)=>r.details?.scope==="all" && r.details?.expires_at>now);
      const personalRow=rows.find((r:any)=>r.details?.scope==="single" && r.details?.target_user_id===userData.user.id && r.details?.expires_at>now);
      return json({success:true,global:globalRow?.details||null,personal:personalRow?.details||null});
    }
    if(body.action==="delete_self_account"){
      const targetUserId=userData.user.id;
      if((userData.user.email||"").toLowerCase()===ADMIN_EMAIL) return json({error:"管理員帳號受到保護，不能從玩家設定中刪除"},403);
      await purgePlayerData(admin,targetUserId);
      const {error:deleteSelfError}=await admin.auth.admin.deleteUser(targetUserId,false);
      if(deleteSelfError) throw deleteSelfError;
      return json({success:true,deleted:true,message:"已永久刪除登入帳號及所有相關遊戲資料，不保留封存副本。"});
    }
    if(userData.user.email?.toLowerCase()!==ADMIN_EMAIL) return json({error:"沒有管理員權限"},403);
    if(body.action==="guild_xp_grant"){
      const targetUserId=String(body.targetUserId||"").trim();
      const amount=Number(body.amount);
      const reason=String(body.reason||"").trim();
      const requestId=String(body.requestId||"");
      if(!targetUserId) return json({error:"請選擇要發放 XP 的玩家"},400);
      if(!Number.isSafeInteger(amount)||amount<1||amount>1000000000) return json({error:"XP 必須是 1～1,000,000,000 的正整數"},400);
      if(reason.length<3||reason.length>300) return json({error:"發放原因必須為 3～300 字"},400);
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return json({error:"發放識別碼無效，請重新操作"},400);
      const {data,error}=await admin.rpc("admin_grant_guild_xp",{
        p_admin_user_id:userData.user.id,
        p_admin_email:userData.user.email,
        p_target_user_id:targetUserId,
        p_amount:amount,
        p_reason:reason,
        p_request_id:requestId
      });
      if(error) {
        if(String(error.message||"").includes("target_player_not_in_guild")) return json({error:"這位玩家目前沒有加入公會，無法發放 XP"},400);
        throw error;
      }
      return json({success:true,result:data});
    }
    if(body.action==="guild_xp_history"){
      const {data:rows,error}=await admin.from("guild_xp_award_ledger")
        .select("id,guild_id,member_id,actor_user_id,source,task_key,task_date,cycle_number,base_xp,xp_awarded,actor_admin_email,reason,details,awarded_at")
        .order("awarded_at",{ascending:false}).limit(100);
      if(error) throw error;
      const memberIds=[...new Set((rows||[]).map((r:any)=>r.member_id).filter(Boolean))];
      const guildIds=[...new Set((rows||[]).map((r:any)=>r.guild_id).filter(Boolean))];
      const [profilesRes,guildsRes]=await Promise.all([
        memberIds.length?admin.from("player_profiles").select("user_id,username").in("user_id",memberIds):Promise.resolve({data:[],error:null}),
        guildIds.length?admin.from("guilds").select("id,name").in("id",guildIds):Promise.resolve({data:[],error:null})
      ]);
      if(profilesRes.error) throw profilesRes.error;
      if(guildsRes.error) throw guildsRes.error;
      const names=new Map((profilesRes.data||[]).map((p:any)=>[String(p.user_id),String(p.username||"玩家")]));
      const guildNames=new Map((guildsRes.data||[]).map((g:any)=>[String(g.id),String(g.name||"公會")]));
      return json({success:true,records:(rows||[]).map((r:any)=>({
        ...r,member_name:r.details?.target_username||names.get(String(r.member_id))||"已離開的成員",
        guild_name:r.details?.guild_name||guildNames.get(String(r.guild_id))||"已不存在的公會"
      }))});
    }
    if(body.action==="set_coin_boost"){
      const scope=String(body.scope||"");
      const multiplier=Number(body.multiplier);
      const durationSeconds=Math.floor(Number(body.durationSeconds));
      const targetUserId=String(body.targetUserId||"");
      if(!["all","single"].includes(scope)) return json({error:"無效的生效範圍"},400);
      if(!Number.isFinite(multiplier)||multiplier<1||multiplier>1000||!Number.isInteger(durationSeconds)||durationSeconds<1||durationSeconds>86400) return json({error:"倍率或持續時間超出範圍"},400);
      if(scope==="single"&&!targetUserId) return json({error:"請選擇指定玩家"},400);
      if(scope==="single") { const {data,error}=await admin.auth.admin.getUserById(targetUserId); if(error||!data?.user) return json({error:"找不到指定玩家"},404); }
      const startsAt=new Date(); const expiresAt=new Date(startsAt.getTime()+durationSeconds*1000).toISOString();
      const details={scope,multiplier,duration_seconds:durationSeconds,target_user_id:scope==="single"?targetUserId:null,starts_at:startsAt.toISOString(),expires_at:expiresAt};
      const {error}=await admin.from("admin_actions").insert({admin_email:ADMIN_EMAIL,action_type:"coin_boost",details,affected_count:scope==="all"?-1:1});
      if(error) throw error;
      return json({success:true,details});
    }
    if(body.action==="online_curve"){
      const now=new Date();
      const currentHour=new Date(now); currentHour.setUTCMinutes(0,0,0);
      const start=new Date(currentHour.getTime()-35*3600000);
      const rows:any[]=[];
      for(let offset=0;offset<100000;offset+=1000){
        const {data,error}=await admin.from("presence_hourly_events").select("session_id,hour_bucket").gte("hour_bucket",start.toISOString()).lte("hour_bucket",currentHour.toISOString()).order("hour_bucket",{ascending:true}).range(offset,offset+999);
        if(error) throw error;
        const batch=data||[]; rows.push(...batch);
        if(batch.length<1000) break;
      }
      const counts:Record<string,Set<string>>={};
      for(let i=0;i<36;i++){const bucket=new Date(start.getTime()+i*3600000).toISOString();counts[bucket]=new Set();}
      for(const row of rows){const key=new Date(row.hour_bucket).toISOString();if(counts[key])counts[key].add(String(row.session_id));}
      return json({success:true,windowHours:36,points:Object.entries(counts).map(([hour,sessions])=>({hour,count:sessions.size}))});
    }
    if(body.action==="achievement_counts"){
      const achievementsMeta=[
        {id:"roll100",name:"擲骰新手",description:"累計擲骰 100 次"},
        {id:"roll1000",name:"命運常客",description:"累計擲骰 1,000 次"},
        {id:"roll10000",name:"擲骰熟手",description:"累計擲骰 10,000 次"},
        {id:"roll100000",name:"命運征服者",description:"累計擲骰 100,000 次"},
        {id:"roll300000",name:"300,000 抽",description:"累計擲骰 300,000 次"},
        {id:"roll500000",name:"500,000 抽",description:"累計擲骰 500,000 次"},
        {id:"collect5",name:"收藏起步",description:"發現 5 種骰子"},
        {id:"daily20",name:"每日任務達人",description:"累計完成 20 次每日任務"},
        {id:"collect12",name:"收藏家",description:"發現 12 種骰子"},
        {id:"collect20",name:"收藏大師",description:"發現 20 種骰子"},
        {id:"collect28",name:"收藏專家",description:"發現 28 種骰子"},
        {id:"collect30",name:"舊版收藏專家",description:"舊版發現 30 種骰子"},
        {id:"rare1",name:"舊版稀有發現者",description:"舊版稀有成就紀錄（已對應現行 1/2,048 成就）"},
        {id:"rare2048",name:"稀有發現者",description:"獲得 1/2,048 或更稀有的骰子"},
        {id:"rare1m",name:"百萬分之一",description:"獲得 1/1M 或更稀有的骰子"},
        {id:"rare10m",name:"千萬分之一",description:"獲得 1/10M 或更稀有的骰子"},
        {id:"craftVoid",name:"鑽石手套",description:"購買鑽石手套"},
        {id:"craftUniverse",name:"糖果手套",description:"購買糖果手套"},
        {id:"rainCollect2",name:"雨中收藏家",description:"獲得兩種雨天骰子"},
        {id:"snowCollect2",name:"雪境收藏家",description:"獲得兩種雪天骰子"},
        {id:"thunderCollect2",name:"雷霆收藏家",description:"獲得兩種打雷骰子"},
        {id:"crystalCollect2",name:"水晶收藏家",description:"獲得兩種水晶骰子"},
        {id:"hellCollect2",name:"地獄收藏家",description:"獲得兩種地獄骰子"},
        {id:"daily5",name:"每日任務達人",description:"累計完成 5 次每日任務"}
      ];
      const saves:any[]=[];
      for(let offset=0;offset<100000;offset+=1000){
        const {data,error}=await admin.from("game_saves").select("user_id,save_data").range(offset,offset+999);
        if(error) throw error;
        const batch=data||[]; saves.push(...batch);
        if(batch.length<1000) break;
      }
      const achievements=achievementsMeta.map(meta=>{
        let players=0;
        for(const row of saves){
          const a=row.save_data?.achievements?.[meta.id];
          if(a && (typeof a!=="object" || Object.keys(a).length>0)) players++;
        }
        return {...meta,players};
      });
      return json({success:true,totalCloudSaves:saves.length,achievements});
    }
    if(body.action==="online_hourly" || body.action==="online_curve"){
      const now=new Date();
      const currentHour=new Date(now); currentHour.setUTCMinutes(0,0,0);
      const start=new Date(currentHour.getTime()-35*60*60*1000);
      const events:any[]=[];
      for(let offset=0;offset<100000;offset+=1000){
        const {data,error}=await admin.from("game_visit_events").select("visitor_id,user_id,occurred_at").gte("occurred_at",start.toISOString()).order("occurred_at",{ascending:true}).range(offset,offset+999);
        if(error) throw error;
        const batch=data||[]; events.push(...batch);
        if(batch.length<1000) break;
      }
      const {data:firstEvent,error:firstEventError}=await admin.from("game_visit_events").select("occurred_at").order("occurred_at",{ascending:true}).limit(1).maybeSingle();
      if(firstEventError) throw firstEventError;
      const trackingStartedAt=firstEvent?.occurred_at||now.toISOString();
      const trackingStart=new Date(trackingStartedAt); trackingStart.setUTCMinutes(0,0,0);
      const buckets:any[]=[];
      const indexByHour=new Map<string,any>();
      for(let i=0;i<36;i++){
        const t=new Date(start.getTime()+i*60*60*1000);
        const key=t.toISOString();
        const bucket={hour:key,visitorUsers:new Map<string,string>()};
        buckets.push(bucket); indexByHour.set(key,bucket);
      }
      for(const event of events){
        const d=new Date(event.occurred_at); d.setUTCMinutes(0,0,0);
        const bucket=indexByHour.get(d.toISOString());
        if(bucket){const visitorId=String(event.visitor_id||"unknown");if(event.user_id)bucket.visitorUsers.set(visitorId,String(event.user_id));else if(!bucket.visitorUsers.has(visitorId))bucket.visitorUsers.set(visitorId,"");}
      }
      const hours=buckets.map(b=>({hour:b.hour,count:new Date(b.hour)<trackingStart?null:new Set([...b.visitorUsers.entries()].map(([visitorId,userId]:[string,string])=>userId?("user:"+userId):("browser:"+visitorId))).size}));
      return json({success:true,metric:"unique_visitors_seen_in_hour",trackingStartedAt,hours,points:hours.map((h:any)=>({hour:h.hour,count:h.count})),totalEvents:events.length,generatedAt:now.toISOString()});
    }
    if(body.action==="deleted_accounts_history"){
      const {data,error}=await admin.from("deleted_player_accounts").select("id,deleted_user_id,original_email,original_username,deleted_at,deleted_by,deletion_reason,account_snapshot,profile_snapshot,save_snapshot,craft_logs_snapshot,rare_rolls_snapshot,security_logs_snapshot,grants_snapshot,weather_contributions_snapshot,weather_override_snapshot").order("deleted_at",{ascending:false}).limit(1000);
      if(error) throw error;
      return json({success:true,deletedAccounts:(data||[]).map((r:any)=>({id:r.id,user_id:r.deleted_user_id,username:r.original_username,email:r.original_email,deleted_at:r.deleted_at,deleted_by:r.deleted_by,reason:r.deletion_reason,account:r.account_snapshot,profile:r.profile_snapshot,save:r.save_snapshot,craftLogs:r.craft_logs_snapshot,rareRolls:r.rare_rolls_snapshot,securityLogs:r.security_logs_snapshot,grants:r.grants_snapshot,weatherContributions:r.weather_contributions_snapshot,weatherOverride:r.weather_override_snapshot}))});
    }
    if(body.action==="pet_income_monitor"){
      const saves:any[]=[];
      for(let offset=0;offset<100000;offset+=1000){
        const {data,error}=await admin.from("game_saves").select("user_id,save_data,updated_at").order("updated_at",{ascending:false}).range(offset,offset+999);
        if(error) throw error;
        const batch=data||[]; saves.push(...batch);
        if(batch.length<1000) break;
      }
      const profiles:any[]=[];
      for(let offset=0;offset<100000;offset+=1000){
        const {data,error}=await admin.from("player_profiles").select("user_id,username,coins,last_seen").range(offset,offset+999);
        if(error) throw error;
        const batch=data||[]; profiles.push(...batch);
        if(batch.length<1000) break;
      }
      return json({success:true,saves,profiles,loadedAt:new Date().toISOString()});
    }
    if(body.action==="dashboard"){
      const profilesRes = await admin.from("player_profiles").select("user_id,username,total_rolls,unique_dice,rarest_den,coins,updated_at,last_seen").order("last_seen",{ascending:false,nullsFirst:false}).limit(500);
      if(profilesRes.error) throw profilesRes.error;
      // Auth is the authoritative source for account creation and status.
      const authInfoById = new Map<string,any>();
      for(let page=1;page<=100;page++){
        const {data:usersRes,error:usersError}=await admin.auth.admin.listUsers({page,perPage:1000});
        if(usersError) throw usersError;
        const users=usersRes?.users||[];
        for(const user of users) if(user.id) authInfoById.set(user.id,{
          created_at:user.created_at||null,
          banned_until:user.banned_until||null,
          email_confirmed_at:user.email_confirmed_at||null
        });
        if(users.length<1000) break;
      }
      const loginNamesRes = await admin.from("player_login_names").select("user_id,username");
      if(loginNamesRes.error) throw loginNamesRes.error;
      const loginNameById = new Map<string,string>((loginNamesRes.data||[]).map((row:any)=>[String(row.user_id),String(row.username)]));
      // 玩家名單不可因為合成紀錄表暫時查詢失敗而整個消失。
      const logsRes = await admin.from("craft_logs").select("id,user_id,username,item_type,item_id,item_name,created_at").order("created_at",{ascending:false}).limit(100);
      const now=Date.now();
      const players=(profilesRes.data||[]).map((p:any)=>{
        const uid=String(p.user_id);
        const authInfo=authInfoById.get(uid)||{};
        const banned=!!authInfo.banned_until&&new Date(authInfo.banned_until).getTime()>now;
        const accountStatus=banned?"已停權":authInfo.email_confirmed_at?"正常":authInfo.created_at?"未驗證":"未知";
        return {
          ...p,
          created_at:authInfo.created_at||null,
          login_username:loginNameById.get(uid)||null,
          account_status:accountStatus,
          banned,
          online:!!p.last_seen&&now-new Date(p.last_seen).getTime()<=90000
        };
      });
      return json({success:true,players,crafts:logsRes.error?[]:(logsRes.data||[]),craftLogsError:logsRes.error?.message||null,onlineCount:players.filter((p:any)=>p.online).length});
    }
    if(body.action==="potion_logs"){
      const {data,error}=await admin.from("potion_usage_logs").select("id,user_id,username,potion_id,potion_name,action_type,details,created_at").order("created_at",{ascending:false}).limit(200);
      if(error) throw error;
      return json({records:data||[]});
    }
    if(body.action==="rare_rolls"){
      const {data,error}=await admin.from("roll_announcements").select("id,user_id,username,dice_name,den,created_at").gte("den",4096).order("created_at",{ascending:false}).limit(200);
      if(error) throw error;
      return json({records:data||[]});
    }
    if(body.action==="update_player_login_username"){
      const targetUserId=String(body.targetUserId||"").trim();
      const username=String(body.newUsername||"").normalize("NFKC").trim();
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) return json({error:"玩家帳號識別碼無效"},400);
      if(!/^[\p{L}\p{N}_-]{3,20}$/u.test(username)) return json({error:"登入帳號需為 3 至 20 個字，只能使用文字、數字、底線或連字號"},400);
      const {data:targetData,error:targetError}=await admin.auth.admin.getUserById(targetUserId);
      if(targetError||!targetData?.user) return json({error:"找不到指定玩家帳號"},404);
      if((targetData.user.email||"").toLowerCase()===ADMIN_EMAIL) return json({error:"管理員帳號受到保護，不能從玩家管理面板修改"},403);
      const normalized=username.toLowerCase();
      const {data:existingName,error:existingNameError}=await admin.from("player_login_names").select("user_id").eq("username_normalized",normalized).maybeSingle();
      if(existingNameError) throw existingNameError;
      if(existingName?.user_id && String(existingName.user_id)!==targetUserId) return json({error:"這個登入帳號名稱已被其他玩家使用"},409);
      const {data:existingMapping,error:mappingError}=await admin.from("player_login_names").select("user_id").eq("user_id",targetUserId).maybeSingle();
      if(mappingError) throw mappingError;
      const mappingWrite=existingMapping
        ? await admin.from("player_login_names").update({username,username_normalized:normalized,updated_at:new Date().toISOString()}).eq("user_id",targetUserId)
        : await admin.from("player_login_names").insert({user_id:targetUserId,username,username_normalized:normalized});
      if(mappingWrite.error){
        if(mappingWrite.error.code==="23505") return json({error:"這個登入帳號名稱已被其他玩家使用"},409);
        throw mappingWrite.error;
      }
      const {error:auditError}=await admin.from("admin_actions").insert({
        admin_email:ADMIN_EMAIL,
        action_type:"player_login_name_updated",
        details:{targetUserId,loginUsername:username},
        affected_count:1
      });
      if(auditError) throw auditError;
      return json({success:true,userId:targetUserId,loginUsername:username,message:"登入帳號名稱已更新；遊戲暱稱與存檔未變更。"});
    }
    if(body.action==="reset_player_password"){
      const targetUserId=String(body.targetUserId||"").trim();
      const newPassword=String(body.newPassword||"");
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) return json({error:"玩家帳號識別碼無效"},400);
      if(newPassword.length<8||newPassword.length>128) return json({error:"新密碼必須介於 8 到 128 個字元"},400);
      if(targetUserId===userData.user.id) return json({error:"請使用目前帳號的安全設定變更管理員密碼"},400);
      const {data:targetData,error:targetError}=await admin.auth.admin.getUserById(targetUserId);
      if(targetError||!targetData?.user) return json({error:"找不到指定玩家帳號"},404);
      if((targetData.user.email||"").toLowerCase()===ADMIN_EMAIL) return json({error:"管理員帳號受到保護，不能從玩家管理面板重設"},403);
      const {error:updateError}=await admin.auth.admin.updateUserById(targetUserId,{password:newPassword});
      if(updateError) throw updateError;
      const {error:auditError}=await admin.from("admin_actions").insert({
        admin_email:ADMIN_EMAIL,
        action_type:"player_password_reset",
        details:{targetUserId},
        affected_count:1
      });
      if(auditError) throw auditError;
      return json({success:true,userId:targetUserId,message:"已設定新密碼；系統不會顯示或保存原密碼。"});
    }
    if(body.action==="set_player_ban"){
      const targetUserId=String(body.targetUserId||"").trim();
      const banned=body.banned===true;
      if(!targetUserId) return json({error:"請先選擇一位玩家"},400);
      if(targetUserId===userData.user.id) return json({error:"不能停權目前登入的管理員帳號"},400);
      const {data:targetData,error:targetError}=await admin.auth.admin.getUserById(targetUserId);
      if(targetError||!targetData.user) return json({error:"找不到這位玩家帳號"},404);
      const {data:updateData,error:updateError}=await admin.auth.admin.updateUserById(targetUserId,{ban_duration:banned?"876000h":"none"});
      if(updateError) throw updateError;
      const verifiedUser=updateData.user;
      const bannedUntil=verifiedUser?.banned_until||null;
      if(banned && (!bannedUntil || new Date(bannedUntil).getTime()<=Date.now())) throw new Error("Supabase 未確認停權狀態，請檢查 Auth 使用者狀態後再試。");
      if(!banned && bannedUntil && new Date(bannedUntil).getTime()>Date.now()) throw new Error("Supabase 尚未解除停權，請稍後重新確認。");
      const {error:auditError}=await admin.from("admin_actions").insert({admin_email:ADMIN_EMAIL,action_type:banned?"player_ban":"player_unban",details:{targetUserId,targetEmail:targetData.user.email||null,banned},affected_count:1});
      if(auditError) throw auditError;
      return json({success:true,banned,userId:targetUserId,message:banned?"已停權該玩家帳號。":"已解除該玩家停權。"});
    }
    if(body.action==="delete_player"){
      const targetUserId=String(body.targetUserId||"").trim();
      if(!targetUserId) return json({error:"請先選擇要刪除的玩家"},400);
      if(targetUserId===userData.user.id) return json({error:"不能刪除目前登入的管理員帳號"},400);
      const {data:targetData,error:targetError}=await admin.auth.admin.getUserById(targetUserId);
      if(targetError||!targetData.user) return json({error:"找不到這位玩家帳號，可能已被刪除"},404);
      if((targetData.user.email||"").toLowerCase()===ADMIN_EMAIL) return json({error:"為了保護管理員，不能刪除管理員帳號"},403);
      const {data:profile,error:profileError}=await admin.from("player_profiles").select("username").eq("user_id",targetUserId).maybeSingle();
      if(profileError) throw profileError;
      const username=String(profile?.username||"玩家").slice(0,20);
      await purgePlayerData(admin,targetUserId);
      const {error:deleteError}=await admin.auth.admin.deleteUser(targetUserId,false);
      if(deleteError) throw deleteError;
      // Keep only a generic admin audit event without the deleted player's name, email, or ID.
      const {error:auditError}=await admin.from("admin_actions").insert({admin_email:ADMIN_EMAIL,action_type:"player_account_deleted",details:{deleted:true},affected_count:1});
      if(auditError) throw auditError;
      return json({success:true,deleted:true,username,message:"已永久刪除該玩家帳號與雲端遊戲資料；該帳號無法再登入。"});
    }
    if(body.action==="grant_pet_player" || body.action==="grant_pet_all"){
      const allPlayers=body.action==="grant_pet_all";
      const petId=String(body.petId||"").trim();
      const amount=Math.floor(Number(body.amount));
      if(!/^[crlms][0-9]+$/.test(petId)) return json({error:"寵物種類無效"},400);
      if(!Number.isFinite(amount)||amount<1||amount>1000) return json({error:"寵物數量必須介於 1 到 1,000"},400);
      const petNames:Record<string,string>={
        c1:"灰狼幼崽",c2:"暮色狐",c3:"暗羽烏鴉",c4:"影紋貓",c5:"岩甲龜",c6:"霧林鹿",c7:"鐵喙鷹",c8:"洞穴蝙蝠",
        r1:"霜痕狼",r2:"雷翼鴉",r3:"星尾狐",r5:"冰棘鹿",r6:"電弧獵犬",r7:"深淵魟",r8:"月環貓頭鷹",r9:"晶角山羊",
        l2:"耀日鳳凰",l3:"星冠神鹿",l4:"黃金機龍",l5:"裂空獅鷲",l6:"永夜巨蛇",l7:"熔核巨鷹",l8:"時序獵犬",l9:"極光天馬",
        m1:"赤白天龍",m3:"混沌天狼",m4:"天隕白虎",m5:"創世神鹿",m6:"深空巨龍",m7:"紅月天鯨",m8:"萬象玄龜",m9:"時空九尾",
        s1:"零界吞噬者",s2:"無序之龍",s3:"終焉渡鴉",s4:"永寂環蛇",s5:"虛無君王",s6:"原初奇點"
      };
      if(!petNames[petId]) return json({error:"找不到指定寵物"},400);
      let targetIds:string[]=[];
      if(allPlayers){
        const [savesRes,profilesRes]=await Promise.all([
          admin.from("game_saves").select("user_id"),
          admin.from("player_profiles").select("user_id")
        ]);
        if(savesRes.error) throw savesRes.error;
        if(profilesRes.error) throw profilesRes.error;
        targetIds=[...new Set([...(savesRes.data||[]).map((r:any)=>String(r.user_id)),...(profilesRes.data||[]).map((r:any)=>String(r.user_id))])];
      } else {
        const targetUserId=String(body.targetUserId||"").trim();
        if(!targetUserId) return json({error:"請先選擇一位玩家"},400);
        if(targetUserId===userData.user.id) return json({error:"此功能不能將寵物發放給管理員本人"},400);
        const {data:target,error}=await admin.auth.admin.getUserById(targetUserId);
        if(error||!target?.user) return json({error:"找不到這位玩家"},404);
        targetIds=[targetUserId];
      }
      let affected=0;
      const petName=petNames[petId];
      for(const uid of targetIds){
        const {data:saveRow,error:readError}=await admin.from("game_saves").select("save_data").eq("user_id",uid).maybeSingle();
        if(readError) throw readError;
        const saveData=saveRow?.save_data||{};
        const pets=Array.isArray(saveData.pets)?[...saveData.pets]:[];
        for(let i=0;i<amount;i++){
          pets.push({uid:crypto.randomUUID(),id:petId,obtainedAt:new Date().toISOString(),source:"admin_grant"});
        }
        const {error:saveError}=await admin.from("game_saves").upsert({user_id:uid,save_data:{...saveData,pets},updated_at:new Date().toISOString()},{onConflict:"user_id"});
        if(saveError) throw saveError;
        affected++;
      }
      const details={petId,petName,amount,scope:allPlayers?"all":"single",targetUserId:allPlayers?null:targetIds[0]};
      const {error:auditError}=await admin.from("admin_actions").insert({admin_email:ADMIN_EMAIL,action_type:allPlayers?"grant_pet_all":"grant_pet_single",details,affected_count:affected});
      if(auditError) throw auditError;
      let username="全體玩家";
      if(!allPlayers){const {data:p}=await admin.from("player_profiles").select("username").eq("user_id",targetIds[0]).maybeSingle();username=p?.username||"指定玩家";}
      return json({success:true,affected,username,details});
    }
    if(body.action==="grant_player"){
      const targetUserId=String(body.targetUserId||"").trim();
      if(!targetUserId) return json({error:"請先選擇一位玩家"},400);
      const type=String(body.type||"");
      const amount=Math.floor(Number(body.amount));
      if(!Number.isFinite(amount)||amount<1||amount>1000000000) return json({error:"數量必須介於 1 到 1,000,000,000"},400);
      if(type!=="coins"&&type!=="potion"&&type!=="aura") return json({error:"未知發放類型"},400);
      const auraId=String(body.auraId||"");
      if(type==="aura"){
        if(!/^d[0-9]+$/.test(auraId)) return json({error:"光環／骰子種類無效"},400);
        const [saveRes,profileRes,grantRes]=await Promise.all([
          admin.from("game_saves").select("user_id").eq("user_id",targetUserId).maybeSingle(),
          admin.from("player_profiles").select("user_id,username").eq("user_id",targetUserId).maybeSingle(),
          admin.from("player_grants").select("user_id,dice_grants").eq("user_id",targetUserId).maybeSingle()
        ]);
        if(saveRes.error) throw saveRes.error;
        if(profileRes.error) throw profileRes.error;
        if(grantRes.error) throw grantRes.error;
        if(!saveRes.data&&!profileRes.data) return json({error:"找不到這位玩家，請重新整理玩家名單"},404);
        const diceGrants={...((grantRes.data as any)?.dice_grants||{})};
        const previous=Math.max(0,Number(diceGrants[auraId])||0);
        diceGrants[auraId]=previous+amount;
        const {error:grantWriteError}=await admin.from("player_grants").upsert({user_id:targetUserId,dice_grants:diceGrants,updated_at:new Date().toISOString()},{onConflict:"user_id"});
        if(grantWriteError) throw grantWriteError;
        const {data:verifyDiceGrant,error:verifyDiceGrantError}=await admin.from("player_grants").select("dice_grants").eq("user_id",targetUserId).maybeSingle();
        if(verifyDiceGrantError) throw verifyDiceGrantError;
        if(Number(verifyDiceGrant?.dice_grants?.[auraId]||0)<diceGrants[auraId]) throw new Error("骰子待領取紀錄未成功寫入，請重試");
        const username=profileRes.data?.username||"指定玩家";
        const details={type,auraId,auraName:String(body.auraName||auraId).slice(0,100),amount,targetUserId,username};
        const {error:auditError}=await admin.from("admin_actions").insert({admin_email:ADMIN_EMAIL,action_type:"grant_aura_single",details,affected_count:1});
        if(auditError) throw auditError;
        return json({success:true,affected:1,username,details,message:"骰子已加入待領取清單，玩家下次登入時自動領取。"});
      }
      const potionId=String(body.potionId||"");
      const potionNames:Record<string,string>={luck1:"運氣藥水 I",luck2:"運氣藥水 II",luck3:"運氣藥水 III",angel1:"天堂藥水 I",angel2:"天堂藥水 II"};
      if(type==="potion"&&!potionNames[potionId]) return json({error:"藥水種類無效"},400);
      const [saveCheck,profileCheck]=await Promise.all([
        admin.from("game_saves").select("user_id").eq("user_id",targetUserId).maybeSingle(),
        admin.from("player_profiles").select("user_id,username").eq("user_id",targetUserId).maybeSingle()
      ]);
      if(saveCheck.error) throw saveCheck.error;
      if(profileCheck.error) throw profileCheck.error;
      if(!saveCheck.data&&!profileCheck.data) return json({error:"找不到這位玩家，請重新整理玩家名單"},404);
      const counterColumn=type==="coins"?"coins_total":potionId+"_total";
      const {data:existing,error:readError}=await admin.from("player_grants").select("user_id,coins_total,luck1_total,luck2_total,luck3_total,angel1_total,angel2_total").eq("user_id",targetUserId).maybeSingle();
      if(readError) throw readError;
      const next:any={user_id:targetUserId,coins_total:0,luck1_total:0,luck2_total:0,luck3_total:0,angel1_total:0,angel2_total:0,updated_at:new Date().toISOString(),...(existing||{})};
      next[counterColumn]=Math.max(0,Number(next[counterColumn])||0)+amount;
      next.updated_at=new Date().toISOString();
      const {error:upsertError}=await admin.from("player_grants").upsert(next,{onConflict:"user_id"});
      if(upsertError) throw upsertError;
      const {data:verifyGrant,error:verifyGrantError}=await admin.from("player_grants").select(counterColumn).eq("user_id",targetUserId).maybeSingle();
      if(verifyGrantError) throw verifyGrantError;
      if(Number((verifyGrant as any)?.[counterColumn]||0)<Number(next[counterColumn])) throw new Error("發放未寫入雲端資料，請重試");
      const username=profileCheck.data?.username||"指定玩家";
      const details=type==="coins"?{type,amount,targetUserId,username}:{type,potionId,potionName:potionNames[potionId],amount,targetUserId,username};
      const {error:auditError}=await admin.from("admin_actions").insert({admin_email:ADMIN_EMAIL,action_type:type==="coins"?"grant_coins_single":"grant_potion_single",details,affected_count:1});
      if(auditError) throw auditError;
      return json({success:true,affected:1,username,details});
    }
    if(body.action==="grant"){
      const type=String(body.type||"");
      const amount=Math.floor(Number(body.amount));
      if(!Number.isFinite(amount)||amount<1||amount>1000000000) return json({error:"數量必須介於 1 到 1,000,000,000"},400);
      if(type!=="coins"&&type!=="potion") return json({error:"未知發放類型"},400);
      const potionId=String(body.potionId||"");
      const potionNames:Record<string,string>={luck1:"運氣藥水 I",luck2:"運氣藥水 II",luck3:"運氣藥水 III",angel1:"天堂藥水 I",angel2:"天堂藥水 II"};
      if(type==="potion"&&!potionNames[potionId]) return json({error:"藥水種類無效"},400);
      const [savesRes,profilesRes]=await Promise.all([
        admin.from("game_saves").select("user_id"),
        admin.from("player_profiles").select("user_id")
      ]);
      if(savesRes.error) throw savesRes.error;
      if(profilesRes.error) throw profilesRes.error;
      const allIds=new Set([...(savesRes.data||[]).map((s:any)=>s.user_id),...(profilesRes.data||[]).map((p:any)=>p.user_id)]);
      const counterColumn=type==="coins"?"coins_total":potionId+"_total";
      let affected=0;
      for(const uid of allIds){
        const {data:existing,error:readError}=await admin.from("player_grants").select("user_id,coins_total,luck1_total,luck2_total,luck3_total,angel1_total,angel2_total").eq("user_id",uid).maybeSingle();
        if(readError) throw readError;
        const next:any={user_id:uid,coins_total:0,luck1_total:0,luck2_total:0,luck3_total:0,angel1_total:0,angel2_total:0,updated_at:new Date().toISOString(),...(existing||{})};
        next[counterColumn]=Math.max(0,Number(next[counterColumn])||0)+amount;
        next.updated_at=new Date().toISOString();
        const {error:upsertError}=await admin.from("player_grants").upsert(next,{onConflict:"user_id"});
        if(upsertError) throw upsertError;
        affected++;
      }
      const details=type==="coins"?{type,amount}:{type,potionId,potionName:potionNames[potionId],amount};
      const {error:auditError}=await admin.from("admin_actions").insert({admin_email:ADMIN_EMAIL,action_type:type==="coins"?"grant_coins_all":"grant_potion_all",details,affected_count:affected});
      if(auditError) throw auditError;
      return json({success:true,affected,details});
    }
    return json({error:"未知操作"},400);
  }catch(e){
    console.error("admin-panel error",e);
    return json({error:e instanceof Error?e.message:"管理操作失敗"},500);
  }
});