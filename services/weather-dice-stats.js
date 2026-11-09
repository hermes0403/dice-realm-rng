/** Cached, de-duplicated loader for weather dice collection counts. */
export function createWeatherDiceStatsLoader({
  supabaseClient,
  stats,
  isCloudSyncBlocked = () => false,
  markCloudSyncBlocked = () => false,
  renderCodex = () => {},
  cacheMs = 5 * 60 * 1000,
  retryDelayMs = 30 * 1000,
  now = () => Date.now()
}) {
  let inFlight = null;
  let failedAt = 0;

  async function loadWeatherDiceExistCounts({ force = false } = {}) {
    if (isCloudSyncBlocked()) return stats.counts;
    const currentTime = now();
    if (!force && stats.loadedAt && currentTime - stats.loadedAt < cacheMs) return stats.counts;
    if (!force && failedAt && currentTime - failedAt < retryDelayMs) return stats.counts;
    if (inFlight) return inFlight;
    if (!supabaseClient) {
      stats.counts = {};
      stats.loadedAt = currentTime;
      return stats.counts;
    }

    inFlight = (async () => {
      try {
        const { data, error } = await supabaseClient.rpc('get_weather_dice_exist_counts');
        if (error) throw error;
        const normalized = {};
        if (Array.isArray(data)) {
          for (const row of data) {
            const id = row.dice_id || row.die_id || row.id;
            if (id) normalized[id] = Number(row.player_count ?? row.exist_count ?? row.count ?? row.total) || 0;
          }
        } else if (data && typeof data === 'object') {
          for (const [id, value] of Object.entries(data)) {
            normalized[id] = Number(typeof value === 'object'
              ? (value.player_count ?? value.exist_count ?? value.count ?? value.total)
              : value) || 0;
          }
        }
        stats.counts = normalized;
        stats.loadedAt = now();
        failedAt = 0;
        renderCodex();
        return stats.counts;
      } catch (error) {
        failedAt = now();
        markCloudSyncBlocked(error);
        console.warn('Weather dice exist counts unavailable', error);
        stats.counts = null;
        renderCodex();
        return null;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return { loadWeatherDiceExistCounts };
}
