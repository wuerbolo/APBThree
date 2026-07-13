import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dayKey, isoWeekKey, yearKey } from '../utils/timeBuckets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'scores.json');

const BUCKET_KEYS = { day: dayKey, week: isoWeekKey, year: yearKey };
// How many past buckets to keep per period when pruning on save.
const KEEP_BUCKETS = { day: 8, week: 6, year: 3 };

// Reputation earned per player, bucketed by day / ISO week / year, so the
// leaderboard can rank activity within a period (including offline players).
// Only positive reputation deltas are recorded -- see awardReputation.
export class ScoreSystem {
  constructor() {
    // period -> bucketKey -> playerKey -> { name, faction, score }
    this.scores = { day: {}, week: {}, year: {} };
    this.saveTimer = null;
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (!fs.existsSync(DATA_FILE)) return;
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      for (const period of Object.keys(this.scores)) {
        if (raw[period]) this.scores[period] = raw[period];
      }
    } catch (err) {
      console.error('Failed to load scores from disk:', err.message);
    }
  }

  record(playerKey, name, faction, amount) {
    const now = new Date();
    for (const [period, keyFn] of Object.entries(BUCKET_KEYS)) {
      const bucket = keyFn(now);
      const buckets = this.scores[period];
      if (!buckets[bucket]) buckets[bucket] = {};
      const entry = buckets[bucket][playerKey] || { name, faction, score: 0 };
      // Keep name/faction fresh in case the character was recreated.
      entry.name = name;
      entry.faction = faction;
      entry.score += amount;
      buckets[bucket][playerKey] = entry;
    }
    this.save();
  }

  topN(period, n = 10) {
    const bucket = this.scores[period]?.[BUCKET_KEYS[period](new Date())];
    if (!bucket) return [];
    return Object.values(bucket)
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map(({ name, faction, score }) => ({ name, faction, score }));
  }

  // Drop buckets older than the retention window. Bucket keys sort
  // lexicographically in chronological order by construction.
  prune() {
    for (const [period, keep] of Object.entries(KEEP_BUCKETS)) {
      const keys = Object.keys(this.scores[period]).sort();
      for (const key of keys.slice(0, Math.max(0, keys.length - keep))) {
        delete this.scores[period][key];
      }
    }
  }

  // Debounced write, same pattern as CharacterSystem.
  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        this.prune();
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(this.scores, null, 2));
      } catch (err) {
        console.error('Failed to save scores to disk:', err.message);
      }
    }, 2000);
  }
}
