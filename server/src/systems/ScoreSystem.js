import { dayKey, isoWeekKey, yearKey } from '../utils/timeBuckets.js';

const BUCKET_KEYS = { day: dayKey, week: isoWeekKey, year: yearKey };
// How many past buckets to keep per period when pruning on save.
const KEEP_BUCKETS = { day: 8, week: 6, year: 3 };

// Reputation earned per player, bucketed by day / ISO week / year, so the
// leaderboard can rank activity within a period (including offline players).
// Only positive reputation deltas are recorded -- see awardReputation.
export class ScoreSystem {
  constructor(store) {
    // period -> bucketKey -> playerKey -> { name, faction, score }
    this.scores = { day: {}, week: {}, year: {} };
    this.saveTimer = null;
    this.store = store;
  }

  // Call once, before accepting connections -- see NetworkSystem.init().
  // The 'scores' collection is keyed by period ('day'/'week'/'year'), one
  // row per period holding its full bucket structure.
  async load() {
    try {
      const raw = await this.store.load('scores');
      if (!raw) return;
      for (const period of Object.keys(this.scores)) {
        if (raw[period]) this.scores[period] = raw[period];
      }
    } catch (err) {
      console.error('Failed to load scores:', err.message);
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
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        this.prune();
        await this.store.save('scores', this.scores);
      } catch (err) {
        console.error('Failed to save scores:', err.message);
      }
    }, 2000);
  }
}
