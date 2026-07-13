import * as THREE from 'three';

// Low-poly humanoid replacing the old 2x2x2 box placeholder. The whole
// figure fits the exact same bounds (-1..+1 on Y around the group origin,
// ~1.4 wide), so collision radii, spawn heights and the health bar at
// y=2.5 all keep working unchanged.
//
// Materials: the torso+arms share one per-entity "body" material -- that's
// the faction-colored (and hit-flashed, and death-grayed) surface. Head
// and legs share module-level singleton materials across every character
// on screen, since they never get recolored.

const headMaterial = new THREE.MeshStandardMaterial({ color: 0xd7a77c });
const legsMaterial = new THREE.MeshStandardMaterial({ color: 0x2f3540 });

export function buildCharacterMesh(initialBodyColor) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: initialBodyColor });

  // Torso: 0.9 wide, from y -0.3 to 0.45
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.5), bodyMaterial);
  torso.position.y = 0.075;
  group.add(torso);

  // Head: 0.45 cube, from y 0.5 to 0.95
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), headMaterial);
  head.position.y = 0.725;
  group.add(head);

  // Limbs hang from pivot groups at the hip/shoulder so a simple
  // rotation.x swing animates a walk.
  const makeLimb = (width, height, depth, material) => {
    const pivot = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    limb.position.y = -height / 2;
    pivot.add(limb);
    return pivot;
  };

  // Legs: 0.7 long, pivots at hip height (y -0.3), feet reach y -1
  const leftLeg = makeLimb(0.28, 0.7, 0.3, legsMaterial);
  leftLeg.position.set(-0.22, -0.3, 0);
  const rightLeg = makeLimb(0.28, 0.7, 0.3, legsMaterial);
  rightLeg.position.set(0.22, -0.3, 0);
  group.add(leftLeg, rightLeg);

  // Arms: 0.65 long, pivots at shoulder height (y 0.4), just outside torso
  const leftArm = makeLimb(0.22, 0.65, 0.28, bodyMaterial);
  leftArm.position.set(-0.56, 0.4, 0);
  const rightArm = makeLimb(0.22, 0.65, 0.28, bodyMaterial);
  rightArm.position.set(0.56, 0.4, 0);
  group.add(leftArm, rightArm);

  return {
    group,
    bodyMaterial,
    limbs: { leftLeg, rightLeg, leftArm, rightArm },
    // Where cosmetics (hats) attach: top of the head
    headAnchorY: 0.95
  };
}

// Advance a walk cycle by how far the character just moved; eases limbs
// back to rest when standing still. Call once per frame.
export function animateWalk(rig, distanceMoved) {
  if (!rig || !rig.limbs) return;
  const { leftLeg, rightLeg, leftArm, rightArm } = rig.limbs;

  if (distanceMoved > 0.005) {
    rig._walkPhase = (rig._walkPhase || 0) + Math.min(distanceMoved, 1) * 5;
    const swing = Math.sin(rig._walkPhase) * 0.55;
    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
    leftArm.rotation.x = -swing * 0.6;
    rightArm.rotation.x = swing * 0.6;
  } else {
    for (const limb of [leftLeg, rightLeg, leftArm, rightArm]) {
      limb.rotation.x *= 0.75;
      if (Math.abs(limb.rotation.x) < 0.01) limb.rotation.x = 0;
    }
  }
}

// --- Cosmetics (hats) ------------------------------------------------------

// Client-side catalog for the shop UI and hat meshes. Prices here are
// display-only -- the server has the authoritative catalog and validates
// every purchase.
export const COSMETICS = {
  cap: { name: 'Street Cap', price: 30 },
  tophat: { name: 'Top Hat', price: 100 },
  halo: { name: 'Halo', price: 250 }
};

export function buildHatMesh(cosmeticId) {
  switch (cosmeticId) {
    case 'cap': {
      const hat = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: 0xc62828 });
      const dome = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), material);
      hat.add(dome);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.28), material);
      brim.position.set(0, -0.055, 0.36);
      hat.add(brim);
      return hat;
    }
    case 'tophat': {
      const hat = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: 0x1b1b1b });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 10), material);
      crown.position.y = 0.24;
      hat.add(crown);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 10), material);
      brim.position.y = 0.02;
      hat.add(brim);
      return hat;
    }
    case 'halo': {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.28, 0.045, 6, 16),
        new THREE.MeshBasicMaterial({ color: 0xffd700 })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.35;
      return halo;
    }
    default:
      return null;
  }
}
