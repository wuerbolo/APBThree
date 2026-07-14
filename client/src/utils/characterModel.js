import * as THREE from 'three';

// Low-poly humanoid replacing the old 2x2x2 box placeholder.
//
// Every vertical position here is anchored to the feet, which sit at a
// fixed local y = -1 (so world feet = group.position.y - 1, matching the
// old placeholder box and every groundY/spawn-y convention elsewhere --
// nothing outside this file needs to know the model is 2x taller than the
// original box). To double the model's height while keeping feet pinned
// at -1, every other point's height *above the feet* doubles: for a point
// originally at local y = Y (i.e. Y+1 above the feet), the new position is
// -1 + 2*(Y+1) = 2*Y + 1.
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

  // Torso: 1.8 wide, from y -0.35 to 1.9
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.0), bodyMaterial);
  torso.position.y = 1.15;
  group.add(torso);

  // Head: 0.9 cube, from y 2.0 to 2.9
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), headMaterial);
  head.position.y = 2.45;
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

  // Legs: 1.4 long, pivots at hip height (y 0.4), feet reach y -1
  const leftLeg = makeLimb(0.56, 1.4, 0.6, legsMaterial);
  leftLeg.position.set(-0.44, 0.4, 0);
  const rightLeg = makeLimb(0.56, 1.4, 0.6, legsMaterial);
  rightLeg.position.set(0.44, 0.4, 0);
  group.add(leftLeg, rightLeg);

  // Arms: 1.3 long, pivots at shoulder height (y 1.8), just outside torso
  const leftArm = makeLimb(0.44, 1.3, 0.56, bodyMaterial);
  leftArm.position.set(-1.12, 1.8, 0);
  const rightArm = makeLimb(0.44, 1.3, 0.56, bodyMaterial);
  rightArm.position.set(1.12, 1.8, 0);
  group.add(leftArm, rightArm);

  return {
    group,
    bodyMaterial,
    limbs: { leftLeg, rightLeg, leftArm, rightArm },
    // Where cosmetics (hats) attach: top of the head
    headAnchorY: 2.9
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
      const dome = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.32, 1.0), material);
      hat.add(dome);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.56), material);
      brim.position.set(0, -0.11, 0.72);
      hat.add(brim);
      return hat;
    }
    case 'tophat': {
      const hat = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: 0x1b1b1b });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.84, 10), material);
      crown.position.y = 0.48;
      hat.add(crown);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 10), material);
      brim.position.y = 0.04;
      hat.add(brim);
      return hat;
    }
    case 'halo': {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.56, 0.09, 6, 16),
        new THREE.MeshBasicMaterial({ color: 0xffd700 })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.7;
      return halo;
    }
    default:
      return null;
  }
}
