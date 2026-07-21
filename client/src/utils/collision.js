// World layout + collision math lives in shared/src/collision.js (a
// workspace package both client and server import) so the two copies
// can't drift out of sync. This file re-exports it plus PLAZA, which is
// purely a client-side render detail (the monument in BUILDINGS is the
// only actual obstacle there, so the server has no reason to know about it).
export * from '@bolo/shared/collision.js';

// Open pavement patch (no collision -- the monument in BUILDINGS above
// provides the only obstacle here) rendered by GameScene.
export const PLAZA = { x: 40, z: 40, size: 24 };
