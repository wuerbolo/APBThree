// Mirrors client/src/utils/collision.js -- keep the building layout in sync
// between the two until there's a shared package both sides import from.
export const BUILDINGS = [
  { x: -20, z: -20, halfWidth: 5, halfDepth: 5, height: 20 },
  { x: 20, z: 20, halfWidth: 5, halfDepth: 5, height: 20 }
];

const BODY_RADIUS = 1;

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

const MIN_ENTITY_DISTANCE = BODY_RADIUS * 2;

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
