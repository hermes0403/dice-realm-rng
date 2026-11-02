/** Best-effort client activity logs for crafting and potion use. */
export function createActivityLogService({ supabaseClient, getCurrentUser, getState }) {
  async function logCraft(type, id, name) {
    const user = getCurrentUser();
    if (!user || !supabaseClient) return;
    try {
      const state = getState();
      const { error } = await supabaseClient.from('craft_logs').insert({
        user_id: user.id,
        username: (state.name || '玩家').slice(0, 20),
        item_type: type,
        item_id: id,
        item_name: name
      });
      if (error) throw error;
    } catch (error) {
      console.warn('Craft log failed', error);
    }
  }

  async function logPotionAction(id, name, actionType, details = {}) {
    const user = getCurrentUser();
    if (!user || !supabaseClient) return;
    try {
      const state = getState();
      const { error } = await supabaseClient.from('potion_usage_logs').insert({
        user_id: user.id,
        username: (state.name || '玩家').slice(0, 20),
        potion_id: id,
        potion_name: name,
        action_type: actionType,
        details
      });
      if (error) throw error;
    } catch (error) {
      console.warn('Potion log failed', error);
    }
  }

  return { logCraft, logPotionAction };
}
