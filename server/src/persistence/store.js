import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

// Every persisted collection is a flat { key -> document } object. The
// backends store that as one JSON file per collection (dev fallback) or
// one Postgres table per collection with (key TEXT PK, data JSONB).
//
// This whitelist doubles as the set of table names -- nothing else is
// ever interpolated into SQL.
const COLLECTIONS = ['characters', 'scores', 'metrics', 'bans'];

// --- JSON backend (no DATABASE_URL): the original files, unchanged ---------

class JsonStore {
  async init() {}

  async load(collection) {
    const file = path.join(DATA_DIR, `${collection}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  async save(collection, doc) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, `${collection}.json`), JSON.stringify(doc, null, 2));
  }

  describe() {
    return `JSON files in ${DATA_DIR}`;
  }
}

// --- Postgres backend (Neon in production) ----------------------------------
// The game keeps all state in memory and only reads at boot / writes on a
// debounce, so per-query latency (and Neon's autosuspend wake-up) never
// sits in a player-facing path. Saves are whole-collection snapshots in a
// transaction -- same semantics as the full-file JSON rewrites, including
// deletions -- which stays cheap at this scale (tens to hundreds of rows).

class PgStore {
  constructor(connectionString, poolOverride = null) {
    this.connectionString = connectionString;
    this.pool = poolOverride;
  }

  async init() {
    if (!this.pool) {
      const { default: pg } = await import('pg');
      const local = /localhost|127\.0\.0\.1/.test(this.connectionString);
      this.pool = new pg.Pool({
        connectionString: this.connectionString,
        max: 3,
        ssl: local ? undefined : { rejectUnauthorized: false }
      });
    }
    for (const collection of COLLECTIONS) {
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS ${collection} (
           key TEXT PRIMARY KEY,
           data JSONB NOT NULL,
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`
      );
    }
    await this.migrateLegacyJson();
  }

  // One-time import: a collection whose table is still empty picks up the
  // pre-Postgres JSON file, so switching DATABASE_URL on preserves
  // everything. The JSON files are left in place as a cold backup.
  async migrateLegacyJson() {
    const legacy = new JsonStore();
    for (const collection of COLLECTIONS) {
      const { rows } = await this.pool.query(`SELECT 1 FROM ${collection} LIMIT 1`);
      if (rows.length > 0) continue;
      let doc;
      try {
        doc = await legacy.load(collection);
      } catch (err) {
        console.error(`Skipping legacy import of ${collection}: ${err.message}`);
        continue;
      }
      if (!doc) continue;
      // bans.json was historically an array; collections are keyed objects
      if (Array.isArray(doc)) {
        doc = Object.fromEntries(doc.filter((e) => e && e.token).map((e) => [e.token, e]));
      }
      if (Object.keys(doc).length === 0) continue;
      await this.save(collection, doc);
      console.log(`Migrated legacy ${collection}.json into Postgres (${Object.keys(doc).length} row(s))`);
    }
  }

  async load(collection) {
    const { rows } = await this.pool.query(`SELECT key, data FROM ${collection}`);
    if (rows.length === 0) return null;
    const out = {};
    for (const row of rows) out[row.key] = row.data;
    return out;
  }

  async save(collection, doc) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM ${collection}`);
      for (const [key, value] of Object.entries(doc)) {
        await client.query(
          `INSERT INTO ${collection} (key, data) VALUES ($1, $2)`,
          [key, JSON.stringify(value)]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  describe() {
    return 'Postgres (DATABASE_URL)';
  }
}

// DATABASE_URL set -> Postgres (Neon in production); otherwise the JSON
// files, so local dev and tests stay zero-config.
export function createStore() {
  const url = process.env.DATABASE_URL;
  return url ? new PgStore(url) : new JsonStore();
}

export { JsonStore, PgStore, COLLECTIONS };
