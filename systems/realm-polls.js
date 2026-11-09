/** Realm admin messages, player polls, voting, and poll result display. */
export function createRealmPolls(dependencies) {
  const {
    getState, getCurrentUser, supabaseClient, isAdmin, escapeHTML, format, documentRef, timerManager,
    isCloudSyncBlocked = () => false, markCloudSyncBlocked = () => false
  } = dependencies;
  let realmLastMessageId = 0;
  let realmCurrentPollId = null;
  let realmPollExpiry = 0;
  let realmPollTimer = null;
  let realmAnnouncementTimer = null;
  let realmLastPollId = 0;
  let realmPollTickBusy = false;
  let realmSocialUISetup = false;
  let realmPollChannel = null;
  let realmPollChannelReady = false;
  let realmPollSyncIntervalMs = 0;
  const realmPollResultsBusy = new Set();
  function realmUsername() {
    const state = getState();
    const currentUser = getCurrentUser();
    return String(state?.name || state?.username || state?.playerName || currentUser?.user_metadata?.username || (currentUser?.email || '').split('@')[0] || '玩家').slice(0, 40);
  }

  function realmShowAnnouncement(row) {
    const el = documentRef.getElementById('realmAnnouncement');
    if (!el || !row) return;
    let message = String(row.message || ''), color = '#ffffff';
    const match = message.match(/^\[\[color:(#[0-9a-fA-F]{6})\]\]/);
    if (match) { color = match[1]; message = message.slice(match[0].length); }
    el.textContent = `【${row.admin_label || '𝓗𝓮𝓻𝓶𝓮𝓼'}】: ${message}`;
    el.style.color = color;
    el.style.display = 'block';
    timerManager.clearTimeout(realmAnnouncementTimer);
    const timer = timerManager.setTimeout(() => {
      el.style.display = 'none';
      if (realmAnnouncementTimer === timer) realmAnnouncementTimer = null;
    }, 3800, 'realm-announcement-hide');
    realmAnnouncementTimer = timer;
  }

  function realmHidePoll() {
    const el = documentRef.getElementById('realmPollPopup');
    if (el) el.style.display = 'none';
    if (realmPollTimer) { timerManager.clearInterval(realmPollTimer); realmPollTimer = null; }
    realmCurrentPollId = null;
  }

  function stopRealmPollSync() {
    timerManager.clearScope('realm-poll-sync');
    realmPollSyncIntervalMs = 0;
  }

  function setRealmPollSyncInterval(delay) {
    if (isCloudSyncBlocked()) {
      stopRealmPollSync();
      return;
    }
    if (realmPollSyncIntervalMs === delay) return;
    timerManager.clearScope('realm-poll-sync');
    timerManager.setInterval(realmPollTick, delay, 'realm-poll-sync');
    realmPollSyncIntervalMs = delay;
  }

  function receiveRealmAnnouncement(row) {
    if (!row || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) return;
    const id = Number(row.id) || 0;
    if (id && id <= realmLastMessageId) return;
    if (id) realmLastMessageId = id;
    realmShowAnnouncement(row);
  }

  async function broadcastRealmEvent(event, payload) {
    if (isCloudSyncBlocked() || !realmPollChannel || !realmPollChannelReady) return false;
    try {
      const status = await realmPollChannel.send({ type: 'broadcast', event, payload });
      if (status !== 'ok') {
        realmPollChannelReady = false;
        setRealmPollSyncInterval(1500);
        return false;
      }
      return true;
    } catch (error) {
      realmPollChannelReady = false;
      setRealmPollSyncInterval(1500);
      console.warn('Realm poll broadcast unavailable; fast fallback enabled', error);
      return false;
    }
  }

  async function realmDisplayPoll(poll) {
    if (isCloudSyncBlocked()) return false;
    const currentUser = getCurrentUser();
    const pollId = Number(poll?.id) || 0;
    const expiry = Date.parse(poll?.ends_at) || 0;
    if (!currentUser || !pollId || expiry <= Date.now()) {
      if (realmCurrentPollId === pollId) realmHidePoll();
      return false;
    }
    if (pollId === realmCurrentPollId) {
      if (isAdmin()) void realmRefreshPollResults(pollId);
      return true;
    }

    realmCurrentPollId = pollId;
    realmLastPollId = pollId;
    realmPollExpiry = expiry;
    const popup = documentRef.getElementById('realmPollPopup');
    const headline = documentRef.getElementById('realmPollHeadline');
    const buttons = documentRef.getElementById('realmPollButtons');
    const voteStatus = documentRef.getElementById('realmPollVoteStatus');
    const optionA = documentRef.querySelector('#realmPollButtons [data-poll-choice="hell"]');
    const optionB = documentRef.querySelector('#realmPollButtons [data-poll-choice="crystal"]');
    if (!popup || !headline || !buttons || !voteStatus || !optionA || !optionB) return false;

    headline.textContent = `【${poll.admin_label || '𝓗𝓮𝓻𝓶𝓮𝓼'}】: ${poll.question}`;
    optionA.textContent = poll.option_a || '選項一';
    optionB.textContent = poll.option_b || '選項二';
    buttons.style.display = 'grid';
    voteStatus.textContent = '每位玩家只能投票一次';
    popup.style.display = 'block';

    let existing = null;
    try {
      const result = await supabaseClient.from('realm_poll_votes')
        .select('id,choice').eq('poll_id', pollId).eq('user_id', currentUser.id).maybeSingle();
      if (result.error) throw result.error;
      existing = result.data;
    } catch (error) {
      console.warn('Existing poll vote check failed', error);
    }
    if (getCurrentUser()?.id !== currentUser.id || realmCurrentPollId !== pollId) return false;
    if (existing) {
      voteStatus.textContent = `你已投票：${existing.choice === 'hell' ? (poll.option_a || '選項一') : (poll.option_b || '選項二')}`;
      buttons.style.display = 'none';
    }

    if (realmPollTimer) timerManager.clearInterval(realmPollTimer);
    realmPollTimer = timerManager.setInterval(() => {
      const remain = Math.max(0, Math.ceil((realmPollExpiry - Date.now()) / 1000));
      const countdown = documentRef.getElementById('realmPollCountdown');
      if (countdown) countdown.textContent = remain > 0 ? `剩餘 ${remain} 秒` : '投票已結束';
      if (remain <= 0) realmHidePoll();
    }, 1000, 'realm-poll-countdown');
    if (isAdmin()) void realmRefreshPollResults(pollId);
    return true;
  }

  async function realmRefreshPollResults(pollId) {
    if (isCloudSyncBlocked() || !isAdmin() || !pollId || realmPollResultsBusy.has(pollId)) return;
    const box = documentRef.getElementById('adminPollResults');
    if (!box) return;
    realmPollResultsBusy.add(pollId);
    try {
      const [{ data: votes, error }, { data: poll, pollError }] = await Promise.all([
        supabaseClient.from('realm_poll_votes').select('username,user_id,choice,created_at').eq('poll_id', pollId).order('created_at', { ascending: false }),
        supabaseClient.from('realm_polls').select('option_a,option_b,question').eq('id', pollId).maybeSingle().then(r => ({ data: r.data, pollError: r.error }))
      ]);
      if (error) throw error;
      if (pollError) throw pollError;
      const rows = votes || [], profileIds = [...new Set(rows.map(v => v.user_id).filter(Boolean))], profileMap = {};
      if (profileIds.length) {
        const { data: profiles, error: profileError } = await supabaseClient.from('player_profiles').select('user_id,username').in('user_id', profileIds);
        if (!profileError) for (const profile of profiles || []) profileMap[profile.user_id] = profile.username;
      }
      const a = rows.filter(v => v.choice === 'hell').length, b = rows.filter(v => v.choice === 'crystal').length;
      const labelA = poll?.option_a || '選項一', labelB = poll?.option_b || '選項二', safeA = escapeHTML(labelA), safeB = escapeHTML(labelB);
      box.innerHTML = `<div class="card" style="padding:12px"><b>${escapeHTML(poll?.question || '投票結果')}</b><div style="display:flex;justify-content:space-between;margin-top:8px"><span>${safeA}</span><b>${a} 票</b></div><div style="height:7px;background:#272c43;border-radius:9px;overflow:hidden;margin:5px 0 10px"><div style="height:100%;width:${rows.length ? a / rows.length * 100 : 0}%;background:#f34d60"></div></div><div style="display:flex;justify-content:space-between"><span>${safeB}</span><b>${b} 票</b></div><div style="height:7px;background:#272c43;border-radius:9px;overflow:hidden;margin:5px 0 10px"><div style="height:100%;width:${rows.length ? b / rows.length * 100 : 0}%;background:#b57bff"></div></div><div class="mini">總投票：${rows.length} 人</div><details style="margin-top:8px" open><summary>投票玩家名稱與選擇</summary>${rows.length ? rows.map(v => `<div class="admin-log"><span>${escapeHTML((v.username && v.username !== '玩家' ? v.username : null) || profileMap[v.user_id] || ('玩家 ' + String(v.user_id || '').slice(0, 6)))}</span><b>${v.choice === 'hell' ? safeA : safeB}</b></div>`).join('') : '<div class="empty">目前還沒有人投票。</div>'}</details></div>`;
    } catch (e) {
      const restricted = markCloudSyncBlocked(e);
      if (restricted || isCloudSyncBlocked()) stopRealmPollSync();
      box.innerHTML = '<div class="empty">讀取投票結果失敗：' + escapeHTML(e.message || '未知錯誤') + '</div>';
    } finally {
      realmPollResultsBusy.delete(pollId);
    }
  }

  async function realmPollTick() {
    if (isCloudSyncBlocked()) {
      stopRealmPollSync();
      return;
    }
    if (realmPollTickBusy) return;
    const currentUser = getCurrentUser();
    if (!currentUser || !supabaseClient) return;
    realmPollTickBusy = true;
    try {
      if (!realmPollChannelReady) {
        const now = new Date().toISOString();
        const { data: messages, error: messageError } = await supabaseClient.from('realm_admin_messages')
          .select('id,message,admin_label,created_at,expires_at')
          .gt('expires_at', now).order('id', { ascending: false }).limit(1);
        if (messageError) throw messageError;
        if (messages?.length) receiveRealmAnnouncement(messages[0]);
      }

      const now = new Date().toISOString();
      const { data: polls, error: pollError } = await supabaseClient.from('realm_polls')
        .select('id,question,option_a,option_b,admin_label,created_at,ends_at,is_active')
        .eq('is_active', true).gt('ends_at', now).order('id', { ascending: false }).limit(1);
      if (pollError) throw pollError;
      if (!polls?.length) {
        if (realmCurrentPollId && Date.now() >= realmPollExpiry) realmHidePoll();
      } else {
        await realmDisplayPoll(polls[0]);
      }
      setRealmPollSyncInterval(realmPollChannelReady ? 60000 : 1500);
    } catch (error) {
      const restricted = markCloudSyncBlocked(error);
      console.warn('全服訊息／投票同步失敗', error);
      if (restricted || isCloudSyncBlocked()) stopRealmPollSync();
      else if (!realmPollChannelReady) setRealmPollSyncInterval(30000);
    } finally {
      realmPollTickBusy = false;
    }
  }

  async function realmSendMessage() {
    if (isCloudSyncBlocked() || !isAdmin()) return;
    const input = documentRef.getElementById('adminBroadcastText'), status = documentRef.getElementById('adminBroadcastStatus'), rawMessage = input.value.trim(), color = documentRef.getElementById('adminBroadcastColor')?.value || '#ffffff', message = `[[color:${color}]]${rawMessage}`;
    if (!rawMessage) { status.textContent = '請先輸入訊息。'; return; }
    const btn = documentRef.getElementById('adminBroadcastSendBtn');
    btn.disabled = true;
    status.textContent = '正在發送…';
    try {
      const announcement = {
        message,
        admin_label: '𝓗𝓮𝓻𝓶𝓮𝓼',
        expires_at: new Date(Date.now() + 3800).toISOString()
      };
      const { error } = await supabaseClient.from('realm_admin_messages').insert(announcement);
      if (error) throw error;
      const sent = await broadcastRealmEvent('admin_message', announcement);
      if (sent) receiveRealmAnnouncement(announcement);
      else await realmPollTick();
      status.textContent = '已發送；玩家畫面會顯示 3.8 秒。';
      input.value = '';
    } catch (e) {
      const restricted = markCloudSyncBlocked(e);
      if (restricted || isCloudSyncBlocked()) stopRealmPollSync();
      status.textContent = '發送失敗：' + (e.message || '請稍後重試');
    } finally {
      btn.disabled = false;
    }
  }

  async function realmStartPoll() {
    if (isCloudSyncBlocked() || !isAdmin()) return;
    const question = documentRef.getElementById('adminPollQuestion').value.trim(), optionA = documentRef.getElementById('adminPollOptionA').value.trim(), optionB = documentRef.getElementById('adminPollOptionB').value.trim(), duration = Number(documentRef.getElementById('adminPollDuration').value) || 60, status = documentRef.getElementById('adminPollStatus'), btn = documentRef.getElementById('adminPollStartBtn');
    if (!question) { status.textContent = '請先輸入投票問題。'; return; }
    if (!optionA || !optionB) { status.textContent = '請分別填寫選項一與選項二。'; return; }
    if (optionA.toLocaleLowerCase() === optionB.toLocaleLowerCase()) { status.textContent = '兩個選項不能完全相同。'; return; }
    if (!confirm(`確定發起「${question}」投票？\n選項一：${optionA}\n選項二：${optionB}\n時間：${duration} 秒。\n目前進行中的投票會被結束。`)) return;
    btn.disabled = true;
    status.textContent = '正在發起投票…';
    try {
      const { error: closeErr } = await supabaseClient.from('realm_polls').update({ is_active: false }).eq('is_active', true);
      if (closeErr) throw closeErr;
      const { data, error } = await supabaseClient.from('realm_polls')
        .insert({ question, option_a: optionA, option_b: optionB, admin_label: '𝓗𝓮𝓻𝓶𝓮𝓼', ends_at: new Date(Date.now() + duration * 1000).toISOString(), is_active: true })
        .select('id,question,option_a,option_b,admin_label,created_at,ends_at,is_active').single();
      if (error) throw error;
      status.textContent = `投票已發起：「${optionA}」與「${optionB}」，持續 ${duration} 秒；系統會自動統計票數。`;
      realmCurrentPollId = null;
      await realmDisplayPoll(data);
      await broadcastRealmEvent('poll_started', data);
      if (!realmPollChannelReady) await realmPollTick();
    } catch (e) {
      const restricted = markCloudSyncBlocked(e);
      if (restricted || isCloudSyncBlocked()) stopRealmPollSync();
      status.textContent = '發起失敗：' + (e.message || '請稍後重試');
    } finally {
      btn.disabled = false;
    }
  }

  function setupRealmSocialUI() {
    if (realmSocialUISetup) return false;
    realmSocialUISetup = true;
    documentRef.getElementById('adminBroadcastSendBtn')?.addEventListener('click', realmSendMessage);
    documentRef.getElementById('adminPollStartBtn')?.addEventListener('click', realmStartPoll);
    documentRef.getElementById('realmPollButtons')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-poll-choice]');
      const currentUser = getCurrentUser();
      if (isCloudSyncBlocked() || !btn || !realmCurrentPollId || !currentUser) return;
      const choice = btn.dataset.pollChoice;
      documentRef.querySelectorAll('#realmPollButtons button').forEach(b => b.disabled = true);
      try {
        const { error } = await supabaseClient.from('realm_poll_votes').insert({ poll_id: realmCurrentPollId, user_id: currentUser.id, username: realmUsername(), choice });
        if (error) {
          if (error.code === '23505') throw new Error('你已經投過票了');
          throw error;
        }
        documentRef.getElementById('realmPollVoteStatus').textContent = `投票成功：${documentRef.querySelector(`#realmPollButtons [data-poll-choice=\"${choice}\"]`)?.textContent || '已投票'}`;
        documentRef.getElementById('realmPollButtons').style.display = 'none';
        await broadcastRealmEvent('poll_vote', { pollId: realmCurrentPollId });
        if (isAdmin()) await realmRefreshPollResults(realmCurrentPollId);
      } catch (err) {
        const restricted = markCloudSyncBlocked(err);
        if (restricted || isCloudSyncBlocked()) stopRealmPollSync();
        documentRef.getElementById('realmPollVoteStatus').textContent = err.message || '投票失敗';
        documentRef.querySelectorAll('#realmPollButtons button').forEach(b => b.disabled = false);
      }
    });
    setRealmPollSyncInterval(1500);
    if (!isCloudSyncBlocked() && supabaseClient?.channel) {
      try {
        realmPollChannel = supabaseClient.channel('dice-realm-polls-live')
          .on('broadcast', { event: 'admin_message' }, ({ payload }) => receiveRealmAnnouncement(payload))
          .on('broadcast', { event: 'poll_started' }, ({ payload }) => { void realmDisplayPoll(payload); })
          .on('broadcast', { event: 'poll_vote' }, ({ payload }) => {
            if (isAdmin() && Number(payload?.pollId) === realmCurrentPollId) {
              void realmRefreshPollResults(realmCurrentPollId);
            }
          })
          .subscribe(status => {
            if (status === 'SUBSCRIBED') {
              realmPollChannelReady = true;
              if (getCurrentUser()) void realmPollTick();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              realmPollChannelReady = false;
              if (isCloudSyncBlocked()) stopRealmPollSync();
              else setRealmPollSyncInterval(1500);
            }
          });
      } catch (error) {
        realmPollChannelReady = false;
        console.warn('Realm poll realtime unavailable; fast fallback enabled', error);
      }
    }
    return true;
  }
  return {
    realmUsername,
    realmShowAnnouncement,
    realmHidePoll,
    realmRefreshPollResults,
    realmPollTick,
    realmSendMessage,
    realmStartPoll,
    setupRealmSocialUI
  };
}
