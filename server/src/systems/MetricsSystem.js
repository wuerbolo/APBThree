function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, server-local UTC day
}

function yesterdayKey() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Tracks, per UTC day: unique player tokens seen, session count, total
// session duration (for the average), and how many of today's tokens were
// also seen yesterday (D1 retention). Persisted via the pluggable store
// (server/src/persistence/store.js) -- one row per day.
export class MetricsSystem {
  constructor(store) {
    // date -> { tokens: string[], sessionCount, totalDurationMs, returningFromYesterday }
    this.days = new Map();
    // socket.id -> { token, connectedAt } -- lets recordDisconnect compute
    // a duration without the caller having to pass the token back in.
    this.activeSessions = new Map();
    this.saveTimer = null;
    this.store = store;
  }

  // Call once, before accepting connections -- see NetworkSystem.init().
  async load() {
    try {
      const raw = await this.store.load('metrics');
      if (!raw) return;
      for (const [date, day] of Object.entries(raw)) {
        this.days.set(date, {
          tokens: new Set(day.tokens || []),
          sessionCount: day.sessionCount || 0,
          totalDurationMs: day.totalDurationMs || 0,
          returningFromYesterday: day.returningFromYesterday || 0
        });
      }
      console.log(`Loaded metrics for ${this.days.size} day(s) from ${this.store.describe()}`);
    } catch (err) {
      console.error('Failed to load metrics:', err.message);
    }
  }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        const out = {};
        this.days.forEach((day, date) => {
          out[date] = {
            tokens: Array.from(day.tokens),
            sessionCount: day.sessionCount,
            totalDurationMs: day.totalDurationMs,
            returningFromYesterday: day.returningFromYesterday
          };
        });
        await this.store.save('metrics', out);
      } catch (err) {
        console.error('Failed to save metrics:', err.message);
      }
    }, 2000);
  }

  getOrCreateDay(date) {
    let day = this.days.get(date);
    if (!day) {
      day = { tokens: new Set(), sessionCount: 0, totalDurationMs: 0, returningFromYesterday: 0 };
      this.days.set(date, day);
    }
    return day;
  }

  // Call on every socket connection (not just first-ever visit -- a
  // reconnect is still a new session for duration/session-count purposes).
  recordConnect(socketId, token) {
    const date = todayKey();
    const day = this.getOrCreateDay(date);

    const isFirstTimeToday = !day.tokens.has(token);
    if (isFirstTimeToday) {
      day.tokens.add(token);
      const yesterday = this.days.get(yesterdayKey());
      if (yesterday && yesterday.tokens.has(token)) {
        day.returningFromYesterday++;
      }
    }
    day.sessionCount++;

    this.activeSessions.set(socketId, { token, connectedAt: Date.now() });
    this.save();
  }

  // Call on disconnect. Session duration is credited to the day the
  // session *started* on, so a session spanning midnight doesn't get
  // silently dropped.
  recordDisconnect(socketId) {
    const session = this.activeSessions.get(socketId);
    if (!session) return;
    this.activeSessions.delete(socketId);

    const duration = Date.now() - session.connectedAt;
    const date = new Date(session.connectedAt).toISOString().slice(0, 10);
    const day = this.getOrCreateDay(date);
    day.totalDurationMs += duration;
    this.save();
  }

  // Aggregated view for the last `count` days (oldest first), no raw
  // tokens exposed -- just the counts the P0 card asked for.
  getSummary(count = 14) {
    return Array.from(this.days.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-count)
      .map(([date, day]) => ({
        date,
        uniqueTokens: day.tokens.size,
        sessionCount: day.sessionCount,
        avgSessionDurationSec: day.sessionCount > 0
          ? Math.round(day.totalDurationMs / day.sessionCount / 1000)
          : 0,
        returningFromYesterday: day.returningFromYesterday
      }));
  }
}
