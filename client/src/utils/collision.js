export const BUILDINGS = [
  { x: -20, z: -20, halfWidth: 5, halfDepth: 5, height: 20 },
  { x: 20, z: 20, halfWidth: 5, halfDepth: 5, height: 20 }
];

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
