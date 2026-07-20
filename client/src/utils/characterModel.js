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
    torso,
    head,
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

// --- Death / respawn pose --------------------------------------------------

// Topples the rig over: gravity-accelerated fall onto its face or back
// (random), with a slight sideways twist, a small bounce off the ground,
// and limbs going limp mid-fall. Runs on its own rAF loop -- entity update
// loops early-return for dead entities, so this can't be driven from there.
// The group's y is animated down so the lying body rests on the ground
// (torso depth/2 ~= 0.5) instead of hovering at hip height.
const LYING_Y = 0.55;

export function playDeathAnimation(rig) {
  cancelDeathAnimation(rig);
  const group = rig.group;
  const { leftLeg, rightLeg, leftArm, rightArm } = rig.limbs;

  const fallSign = Math.random() < 0.5 ? 1 : -1; // face-plant vs. onto the back
  const twist = (Math.random() - 0.5) * 0.7;
  const startY = group.position.y;
  const startLimbX = {
    leftLeg: leftLeg.rotation.x, rightLeg: rightLeg.rotation.x,
    leftArm: leftArm.rotation.x, rightArm: rightArm.rotation.x
  };
  const startedAt = performance.now();
  const DURATION = 750;

  // Piecewise: gravity fall (ease-in), hit the ground, small bounce, settle
  const fallCurve = (p) => {
    if (p < 0.55) { const t = p / 0.55; return t * t; }
    if (p < 0.75) { const t = (p - 0.55) / 0.2; return 1 - 0.08 * Math.sin(t * Math.PI); }
    return 1;
  };

  const step = () => {
    const p = Math.min(1, (performance.now() - startedAt) / DURATION);
    const f = fallCurve(p);

    group.rotation.x = fallSign * (Math.PI / 2) * f;
    group.rotation.z = twist * f;
    group.position.y = startY + (LYING_Y - startY) * f;

    // Limbs go limp: walk pose eases out, arms splay away from the body
    const limp = 1 - f;
    leftLeg.rotation.x = startLimbX.leftLeg * limp;
    rightLeg.rotation.x = startLimbX.rightLeg * limp;
    leftArm.rotation.x = startLimbX.leftArm * limp;
    rightArm.rotation.x = startLimbX.rightArm * limp;
    leftArm.rotation.z = 0.9 * f;
    rightArm.rotation.z = -0.9 * f;
    leftLeg.rotation.z = 0.18 * f;
    rightLeg.rotation.z = -0.18 * f;

    if (p < 1) {
      rig._deathAnimFrame = requestAnimationFrame(step);
    } else {
      rig._deathAnimFrame = null;
    }
  };
  rig._deathAnimFrame = requestAnimationFrame(step);
}

export function cancelDeathAnimation(rig) {
  if (rig._deathAnimFrame) {
    cancelAnimationFrame(rig._deathAnimFrame);
    rig._deathAnimFrame = null;
  }
}

// Snaps the rig back upright (respawn/revive) -- undoes everything
// playDeathAnimation touched.
export function resetDeathPose(rig, groundY = 1) {
  cancelDeathAnimation(rig);
  const group = rig.group;
  group.rotation.x = 0;
  group.rotation.z = 0;
  group.position.y = groundY;
  for (const limb of Object.values(rig.limbs)) {
    limb.rotation.x = 0;
    limb.rotation.z = 0;
  }
}

// --- Cosmetics (hats) ------------------------------------------------------

// Client-side catalog for the shop UI and hat meshes. Prices/levels here
// are display-only -- the server has the authoritative catalog and
// validates every purchase (including the level gates).
export const COSMETICS = {
  // Hats
  cap: { slot: 'hat', name: 'Street Cap', desc: 'A classic. Keeps the sun off.', price: 30, minLevel: 1 },
  beanie: { slot: 'hat', name: 'Beanie', desc: 'Low profile, zero fuss.', price: 60, minLevel: 2 },
  tophat: { slot: 'hat', name: 'Top Hat', desc: 'For the distinguished operator.', price: 100, minLevel: 3 },
  cowboy: { slot: 'hat', name: 'Cowboy Hat', desc: 'Earned, not bought. This town ain\'t big enough.', price: 0, minLevel: 4 },
  halo: { slot: 'hat', name: 'Halo', desc: 'Certified innocent (results may vary).', price: 250, minLevel: 5 },
  crown: { slot: 'hat', name: 'Crown', desc: 'Heavy is the head.', price: 400, minLevel: 7 },
  // Body color tones
  midnight: { slot: 'color', name: 'Midnight Tone', desc: 'A darker shade of your colors.', price: 60, minLevel: 2 },
  neon: { slot: 'color', name: 'Neon Tone', desc: 'Impossible to miss. That\'s the point.', price: 150, minLevel: 4 },
  royal: { slot: 'color', name: 'Royal Tone', desc: 'Earned, not bought. Dress like you run this city.', price: 0, minLevel: 6 },
  // Movement trails
  ember: { slot: 'trail', name: 'Ember Trail', desc: 'Leave sparks in your wake.', price: 150, minLevel: 3 },
  frost: { slot: 'trail', name: 'Frost Trail', desc: 'Ice-cold footwork.', price: 200, minLevel: 5 },
  shadow: { slot: 'trail', name: 'Shadow Trail', desc: 'Earned, not bought. The city whispers your name.', price: 0, minLevel: 8 },
  rainbow: { slot: 'trail', name: 'Rainbow Trail', desc: 'Full spectrum intimidation.', price: 500, minLevel: 8 }
};

export const SLOT_LABELS = { hat: 'HATS', color: 'BODY TONES', trail: 'TRAILS' };

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
    case 'beanie': {
      const hat = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: 0x37474f });
      const dome = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.4, 1.02), material);
      dome.position.y = 0.06;
      hat.add(dome);
      const fold = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 1.1), material);
      fold.position.y = -0.14;
      hat.add(fold);
      return hat;
    }
    case 'cowboy': {
      const hat = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: 0x795548 });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 8), material);
      crown.position.y = 0.24;
      hat.add(crown);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.08, 12), material);
      brim.position.y = 0;
      hat.add(brim);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.49, 0.52, 0.12, 8),
        new THREE.MeshStandardMaterial({ color: 0x3e2723 })
      );
      band.position.y = 0.08;
      hat.add(band);
      return hat;
    }
    case 'crown': {
      const hat = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: 0xffc107, metalness: 0.6, roughness: 0.3 });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.3, 8), material);
      hat.add(ring);
      // Four spikes around the ring
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.36, 4), material);
        spike.position.set(Math.cos(angle) * 0.44, 0.3, Math.sin(angle) * 0.44);
        hat.add(spike);
      }
      return hat;
    }
    default:
      return null;
  }
}
