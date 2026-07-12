export const WORLD_HALF = 100;
export const WORLD_SIZE = WORLD_HALF * 2;

export const BUILDINGS = [
  { x: -70, z: -70, halfWidth: 12, halfDepth: 12, height: 40, color: 0x1565c0, label: 'ENFORCER HQ' },
  { x: 10, z: -30, halfWidth: 6, halfDepth: 6, height: 14, color: 0xff9800, label: 'STORE' },
  { x: 40, z: 40, halfWidth: 2, halfDepth: 2, height: 4, color: 0x9e9e9e }, // plaza monument
  { x: -40, z: 30, halfWidth: 5, halfDepth: 5, height: 10, color: 0xa1887f },
  { x: 60, z: -50, halfWidth: 6, halfDepth: 6, height: 28, color: 0x607d8b },
  { x: -60, z: 60, halfWidth: 8, halfDepth: 8, height: 8, color: 0x77886b },
  { x: 0, z: 70, halfWidth: 5, halfDepth: 5, height: 16, color: 0xc2a878 }
];

// Open pavement patch (no collision -- the monument in BUILDINGS above
// provides the only obstacle here) rendered by GameScene.
export const PLAZA = { x: 40, z: 40, size: 24 };

// Half-extent of the 2x2x2 player/NPC boxes, so bodies stop at the wall
// instead of clipping halfway into it.
const BODY_RADIUS = 1;

// Pushes (x, z) out of any building it's overlapping, along whichever axis
// requires the smaller correction. Mutates and returns the same object.
export function resolveBuildingCollision(position) {
  for (const building of BUILDINGS) {
    const minX = building.x - building.halfWidth - BODY_RADIUS;
    const maxX = building.x + building.halfWidth + BODY_RADIUS;
    const minZ = building.z - building.halfDepth - BODY_RADIUS;
    const maxZ = building.z + building.halfDepth + BODY_RADIUS;

    if (position.x <= minX || position.x >= maxX || position.z <= minZ || position.z >= maxZ) {
      continue;
    }

    const overlapX = Math.min(position.x - minX, maxX - position.x);
    const overlapZ = Math.min(position.z - minZ, maxZ - position.z);

    if (overlapX < overlapZ) {
      position.x += position.x > building.x ? overlapX : -overlapX;
    } else {
      position.z += position.z > building.z ? overlapZ : -overlapZ;
    }
  }

  return position;
}

// Two body radii apart is "touching"; anything closer gets pushed apart.
const MIN_ENTITY_DISTANCE = BODY_RADIUS * 2;

// Pushes (x, z) out of any position in `others` closer than MIN_ENTITY_DISTANCE,
// along the line between the two centers. `others` is a list of { x, z }
// positions (players, NPCs -- anything with a body). Mutates and returns
// the same object.
export function resolveEntityCollision(position, others) {
  for (const other of others) {
    const dx = position.x - other.x;
    const dz = position.z - other.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance === 0 || distance >= MIN_ENTITY_DISTANCE) continue;

    const overlap = MIN_ENTITY_DISTANCE - distance;
    position.x += (dx / distance) * overlap;
    position.z += (dz / distance) * overlap;
  }

  return position;
}
