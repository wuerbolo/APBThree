// World layout + collision math lives in shared/src/collision.js (a
// workspace package both client and server import) so the two copies
// can't drift out of sync. This file re-exports it plus the spawn logic
// below, which is server-authoritative only -- the client never decides
// where a player spawns.
export * from '@bolo/shared/collision.js';

import { WORLD_HALF, WORLD_SIZE, BUILDINGS } from '@bolo/shared/collision.js';

// Segment-vs-AABB intersection (slab method, 2D over x/z) -- does the
// straight line from (x0,z0) to (x1,z1) pass through the box?
function segmentIntersectsBox(x0, z0, x1, z1, minX, maxX, minZ, maxZ) {
  let tmin = 0;
  let tmax = 1;
  const dx = x1 - x0;
  const dz = z1 - z0;

  if (dx === 0) {
    if (x0 < minX || x0 > maxX) return false;
  } else {
    let t1 = (minX - x0) / dx;
    let t2 = (maxX - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  if (dz === 0) {
    if (z0 < minZ || z0 > maxZ) return false;
  } else {
    let t1 = (minZ - z0) / dz;
    let t2 = (maxZ - z0) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  return true;
}

// NPC chase AI only, server-side: is there a clear straight line between
// two points, or does a building sit in the way? Without this, NPCs
// picked chase targets by raw distance alone and would lock onto (and
// walk straight into) an opposing-faction target standing on the other
// side of a wall, getting shoved back to the same spot every tick
// forever -- "staring at each other through a building."
export function hasLineOfSight(a, b) {
  for (const building of BUILDINGS) {
    const minX = building.x - building.halfWidth;
    const maxX = building.x + building.halfWidth;
    const minZ = building.z - building.halfDepth;
    const maxZ = building.z + building.halfDepth;
    if (segmentIntersectsBox(a.x, a.z, b.x, b.z, minX, maxX, minZ, maxZ)) return false;
  }
  return true;
}

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
