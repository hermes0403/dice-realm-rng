/** Realm admin messages, player polls, voting, and poll result display. */
export function createRealmPolls(dependencies) {
  const { getState, getCurrentUser, supabaseClient, isAdmin, escapeHTML, format, documentRef, timerManager } = dependencies;
  let realmLastMessageId = 0;
  let realmLastMessageAt = 0;
  let realmCurrentPollId = null;
  let realmPollExpiry = 0;
  let realmPollTimer = null;
  let realmAnnouncementTimer = null;
  let realmLastPollId = 0;
  let realmPollTickBusy = false;
  let realmAnnouncementTickBusy = false;
  let realmPollSyncTimer = null;
  let realmSocialChannel = null;
  let realmSocialUISetup = false;
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
    if (realmPollSyncTimer) { timerManager.clearInterval(realmPollSyncTimer); realmPollSyncTimer = null; }
    realmCurrentPollId = null;
  }

  function realmSetPollSync(active) {
    if (active) {
      if (!realmPollSyncTimer) realmPollSyncTimer = timerManager.setInterval(realmRefreshPoll, 5000, 'realm-poll-sync');
    } else if (realmPollSyncTimer) {
      timerManager.clearInterval(realmPollSyncTimer);
      realmPollSyncTimer = null;
    }
  }

  function sendSocialBroadcast(event, payload) {
    if (!realmSocialChannel) return;
    try {
      const result = realmSocialChannel.send({ type: 'broadcast', event, payload });
      result?.catch?.(error => console.debug('Social broadcast unavailable', error));
    } catch (error) {
      console.debug('Social broadcast unavailable', error);
    }
  }

  async function realmRefreshPollResults(pollId) {
    if (!isAdmin() || !pollId || realmPollResultsBusy.has(pollId)) return;
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
      box.innerHTML = '<div class="empty">讀取投票結果失敗：' + escapeHTML(e.message || '未知錯誤') + '</div>';
    } finally {
      realmPollResultsBusy.delete(pollId);
    }
  }

  async function realmRefreshAnnouncement() {
    const currentUser = getCurrentUser();
    if (!currentUser || !supabaseClient || realmAnnouncementTickBusy) return;
    realmAnnouncementTickBusy = true;
    try {
      const now = new Date().toISOString();
      const { data: messages, error } = await supabaseClient.from('realm_admin_messages')
        .select('id,message,admin_label,created_at,expires_at')
        .gt('expires_at', now).order('id', { ascending: false }).limit(1);
      const latest = messages?.[0];
      const latestAt = Date.parse(latest?.created_at || '') || 0;
      if (!error && latest && latestAt > realmLastMessageAt) {
        realmLastMessageId = Number(latest.id) || realmLastMessageId;
        realmLastMessageAt = latestAt;
        realmShowAnnouncement(latest);
      }
    } catch (e) {
      console.debug('公告補查失敗', e);
    } finally {
      realmAnnouncementTickBusy = false;
    }
  }

  async function realmApplyPoll(poll) {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    if (!poll || !poll.id || !poll.ends_at || poll.is_active === false || Date.parse(poll.ends_at) <= Date.now()) {
      realmHidePoll();
      return;
    }
    const pollId = Number(poll.id);
    const isNewPoll = pollId !== realmCurrentPollId;
    realmCurrentPollId = pollId;
    realmLastPollId = pollId;
    realmPollExpiry = Date.parse(poll.ends_at) || Date.now();
    const popup = documentRef.getElementById('realmPollPopup');
    const headline = documentRef.getElementById('realmPollHeadline');
    const buttons = documentRef.getElementById('realmPollButtons');
    const status = documentRef.getElementById('realmPollVoteStatus');
    if (popup && headline && buttons && status && isNewPoll) {
      headline.textContent = '【' + (poll.admin_label || '𝓗𝓮𝓻𝓶𝓮𝓼') + '】: ' + (poll.question || '全服投票');
      const optionA = documentRef.querySelector('#realmPollButtons [data-poll-choice="hell"]');
      const optionB = documentRef.querySelector('#realmPollButtons [data-poll-choice="crystal"]');
      if (optionA) optionA.textContent = poll.option_a || '選項一';
      if (optionB) optionB.textContent = poll.option_b || '選項二';
      buttons.style.display = 'grid';
      status.textContent = '每位玩家只能投票一次';
      popup.style.display = 'block';
      if (currentUser) {
        const { data: existing } = await supabaseClient.from('realm_poll_votes')
          .select('id,choice').eq('poll_id', poll.id).eq('user_id', currentUser.id).maybeSingle();
        if (existing && realmCurrentPollId === pollId) {
          status.textContent = '你已投票：' + (existing.choice === 'hell' ? (poll.option_a || '選項一') : (poll.option_b || '選項二'));
          buttons.style.display = 'none';
        }
      }
    } else if (popup) {
      popup.style.display = 'block';
    }
    realmSetPollSync(true);
    if (!realmPollTimer) {
      realmPollTimer = timerManager.setInterval(() => {
        const remain = Math.max(0, Math.ceil((realmPollExpiry - Date.now()) / 1000));
        const countdown = documentRef.getElementById('realmPollCountdown');
        if (countdown) countdown.textContent = remain > 0 ? '剩餘 ' + remain + ' 秒' : '投票已結束';
        if (remain <= 0) realmHidePoll();
      }, 1000, 'realm-poll-countdown');
    }
    if (isAdmin()) realmRefreshPollResults(pollId);
  }

  async function realmRefreshPoll() {
    const currentUser = getCurrentUser();
    if (!currentUser || !supabaseClient || realmPollTickBusy) return;
    realmPollTickBusy = true;
    try {
      const now = new Date().toISOString();
      const { data: polls, error } = await supabaseClient.from('realm_polls')
        .select('id,question,option_a,option_b,admin_label,created_at,ends_at,is_active')
        .eq('is_active', true).gt('ends_at', now).order('id', { ascending: false }).limit(1);
      if (error) throw error;
      if (!polls?.length) {
        if (realmCurrentPollId) realmHidePoll();
        else realmSetPollSync(false);
        return;
      }
      await realmApplyPoll(polls[0]);
    } catch (e) {
      console.warn('全服投票同步失敗', e);
    } finally {
      realmPollTickBusy = false;
    }
  }

  async function realmPollTick() {
    const currentUser = getCurrentUser();
    if (!currentUser || !supabaseClient) return;
    await Promise.all([realmRefreshAnnouncement(), realmRefreshPoll()]);
  }

  async function realmSendMessage() {
    if (!isAdmin()) return;
    const input = documentRef.getElementById('adminBroadcastText'), status = documentRef.getElementById('adminBroadcastStatus'), rawMessage = input.value.trim(), color = documentRef.getElementById('adminBroadcastColor')?.value || '#ffffff', message = `[[color:${color}]]${rawMessage}`;
    if (!rawMessage) { status.textContent = '請先輸入訊息。'; return; }
    const btn = documentRef.getElementById('adminBroadcastSendBtn');
    btn.disabled = true;
    status.textContent = '正在發送…';
    try {
      const payload = { message, admin_label: '𝓗𝓮𝓻𝓶𝓮𝓼', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString() };
      const { error } = await supabaseClient.from('realm_admin_messages').insert(payload);
      if (error) throw error;
      realmLastMessageAt = Date.parse(payload.created_at) || Date.now();
      realmShowAnnouncement(payload);
      sendSocialBroadcast('admin_message', payload);
      status.textContent = '已發送；玩家畫面會顯示 3.8 秒。';
      input.value = '';

    } catch (e) {
      status.textContent = '發送失敗：' + (e.message || '請稍後重試');
    } finally {
      btn.disabled = false;
    }
  }

  async function realmStartPoll() {
    if (!isAdmin()) return;
    const question = documentRef.getElementById('adminPollQuestion').value.trim(), optionA = documentRef.getElementById('adminPollOptionA').value.trim(), optionB = documentRef.getElementById('adminPollOptionB').value.trim(), duration = Number(documentRef.getElementById('adminPollDuration').value) || 60, status = documentRef.getElementById('adminPollStatus'), btn = documentRef.getElementById('adminPollStartBtn');
    if (!question) { status.textContent = '請先輸入投票問題。'; return; }
    if (!optionA || !optionB) { status.textContent = '請分別填寫選項一與選項二。'; return; }
    if (optionA.toLocaleLowerCase() === optionB.toLocaleLowerCase()) { status.textContent = '兩個選項不能完全相同。'; return; }
    if (!confirm(`確定發起「${question}」投票？\n選項一：${optionA}\n選項二：${optionB}\n時間：${duration} 秒。\n目前進行中的投票會被結束。`)) return;
    btn.disabled = true;
    status.textContent = '正在發起投票…';
    try {
      const endedPollId = realmCurrentPollId;
      const { error: closeErr } = await supabaseClient.from('realm_polls').update({ is_active: false }).eq('is_active', true);
      if (closeErr) throw closeErr;
      if (endedPollId) sendSocialBroadcast('poll_ended', { poll_id: endedPollId });
      const endsAt = new Date(Date.now() + duration * 1000).toISOString();
      const { data, error } = await supabaseClient.from('realm_polls').insert({
        question, option_a: optionA, option_b: optionB, admin_label: '𝓗𝓮𝓻𝓶𝓮𝓼', ends_at: endsAt, is_active: true
      }).select('id').single();
      if (error) throw error;
      const pollPayload = { id: data.id, question, option_a: optionA, option_b: optionB, admin_label: '𝓗𝓮𝓻𝓶𝓮𝓼', ends_at: endsAt, is_active: true };
      status.textContent = '投票已發起：「' + optionA + '」與「' + optionB + '」，持續 ' + duration + ' 秒；系統會自動統計票數。';
      await realmApplyPoll(pollPayload);
      sendSocialBroadcast('poll_started', pollPayload);
    } catch (e) {
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
      if (!btn || !realmCurrentPollId || !currentUser) return;
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
        sendSocialBroadcast('poll_vote', { poll_id: realmCurrentPollId });
        if (isAdmin()) await realmRefreshPollResults(realmCurrentPollId);
      } catch (err) {
        documentRef.getElementById('realmPollVoteStatus').textContent = err.message || '投票失敗';
        documentRef.querySelectorAll('#realmPollButtons button').forEach(b => b.disabled = false);
      }
    });
    timerManager.clearScope('realm-poll-sync');
    timerManager.clearScope('realm-announcement-sync');
    realmPollSyncTimer = null;
    if (supabaseClient && !realmSocialChannel) {
      realmSocialChannel = supabaseClient.channel('dice-realm-social-sync');
      realmSocialChannel
        .on('broadcast', { event: 'admin_message' }, ({ payload }) => {
          if (payload?.message && (!payload.expires_at || Date.parse(payload.expires_at) > Date.now())) {
            const messageAt = Date.parse(payload.created_at || '') || Date.now();
            realmLastMessageAt = Math.max(realmLastMessageAt, messageAt);
            if (Number(payload.id)) realmLastMessageId = Math.max(realmLastMessageId, Number(payload.id));
            realmShowAnnouncement(payload);
          }
        })
        .on('broadcast', { event: 'poll_started' }, ({ payload }) => {
          if (payload) realmApplyPoll(payload.poll || payload);
        })
        .on('broadcast', { event: 'poll_ended' }, ({ payload }) => {
          if (!payload?.poll_id || Number(payload.poll_id) === realmCurrentPollId) realmHidePoll();
        })
        .on('broadcast', { event: 'poll_vote' }, ({ payload }) => {
          if (isAdmin() && Number(payload?.poll_id) === realmCurrentPollId) realmRefreshPollResults(realmCurrentPollId);
        })
        .subscribe(status => {
          if (status === 'SUBSCRIBED') realmPollTick();
        });
    }
    timerManager.setInterval(realmRefreshAnnouncement, 60000, 'realm-announcement-sync');
    realmPollTick();
    supabaseClient?.auth?.onAuthStateChange?.((_event, session) => {
      if (session?.user) realmPollTick();
      else realmHidePoll();
    });
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
