import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'bans.json');

// Persistent ban list, keyed by player token, with the IP the player was
// using when banned. A connection is rejected if EITHER its token or its
// IP matches an active ban -- clearing localStorage alone (new token) or
// hopping networks alone (new IP) isn't enough to get back in. Same
// debounced-JSON-on-disk pattern as CharacterSystem/MetricsSystem.
export class BanSystem {
  constructor() {
    // token -> { token, ip, name, reason, bannedAt }
    this.bans = new Map();
    this.saveTimer = null;
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (!fs.existsSync(DATA_FILE)) return;
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      for (const entry of raw) {
        if (entry && entry.token) this.bans.set(entry.token, entry);
      }
      console.log(`Loaded ${this.bans.size} ban(s) from disk`);
    } catch (err) {
      console.error('Failed to load bans from disk:', err.message);
    }
  }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(this.bans.values()), null, 2));
      } catch (err) {
        console.error('Failed to save bans to disk:', err.message);
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
