// World layout + collision math lives in shared/src/collision.js (a
// workspace package both client and server import) so the two copies
// can't drift out of sync. This file re-exports it plus the spawn logic
// below, which is server-authoritative only -- the client never decides
// where a player spawns.
export * from '@bolo/shared/collision.js';

import { WORLD_HALF, WORLD_SIZE } from '@bolo/shared/collision.js';

// Enforcer HQ sits at (-70, -70), footprint z: -82..-58. Just outside its
// south wall so Enforcer spawns don't clip the building.
const ENFORCER_SPAWN_POINT = { x: -70, z: -52 };

function randomMapPosition() {
  return {
    x: (Math.random() * WORLD_SIZE) - WORLD_HALF,
    y: 1,
    z: (Math.random() * WORLD_SIZE) - WORLD_HALF
  };
}

// Enforcers always spawn right outside their HQ; everyone else (Criminal
// players/NPCs, Civilian NPCs) spawns anywhere on the open map.
export function getSpawnPositionForFaction(faction) {
  if (faction === 'Enforcer') {
    return {
      x: ENFORCER_SPAWN_POINT.x + (Math.random() * 10 - 5),
      y: 1,
      z: ENFORCER_SPAWN_POINT.z + (Math.random() * 10 - 5)
    };
  }
  return randomMapPosition();
}
