// Persistent ban list, keyed by player token, with the IP the player was
// using when banned. A connection is rejected if EITHER its token or its
// IP matches an active ban -- clearing localStorage alone (new token) or
// hopping networks alone (new IP) isn't enough to get back in. Persisted
// via the pluggable store (server/src/persistence/store.js).
export class BanSystem {
  constructor(store) {
    // token -> { token, ip, name, reason, bannedAt }
    this.bans = new Map();
    this.saveTimer = null;
    this.store = store;
  }

  // Call once, before accepting connections -- see NetworkSystem.init().
  // Accepts both the current { token: entry } shape and the original
  // bans.json array format, so older data files still load correctly.
  async load() {
    try {
      const raw = await this.store.load('bans');
      if (!raw) return;
      const entries = Array.isArray(raw) ? raw : Object.values(raw);
      for (const entry of entries) {
        if (entry && entry.token) this.bans.set(entry.token, entry);
      }
      console.log(`Loaded ${this.bans.size} ban(s) from ${this.store.describe()}`);
    } catch (err) {
      console.error('Failed to load bans:', err.message);
    }
  }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        const out = {};
        this.bans.forEach((entry, token) => { out[token] = entry; });
        await this.store.save('bans', out);
      } catch (err) {
        console.error('Failed to save bans:', err.message);
      }
    }, 2000);
  }

  isBanned(token, ip) {
    for (const entry of this.bans.values()) {
      if (entry.token === token) return entry;
      if (entry.ip && ip && entry.ip === ip) return entry;
    }
    return null;
  }

  ban({ token, ip, name, reason }) {
    const entry = {
      token,
      ip: ip || null,
      name: name || null,
      reason: reason || null,
      bannedAt: new Date().toISOString()
    };
    this.bans.set(token, entry);
    this.save();
    return entry;
  }

  unban(token) {
    const existed = this.bans.delete(token);
    if (existed) this.save();
    return existed;
  }

  list() {
    return Array.from(this.bans.values());
  }
}
