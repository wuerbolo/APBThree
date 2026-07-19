import * as THREE from 'three';
import { resolveBuildingCollision, resolveEntityCollision, WORLD_HALF } from '../utils/collision.js';
import { getFactionColor as resolveFactionColor, DEAD_COLOR } from '../utils/factionColors.js';
import { buildCharacterMesh, animateWalk, buildHatMesh, playDeathAnimation, resetDeathPose } from '../utils/characterModel.js';

export class Player {
  constructor(id, isLocal = false) {
    this.id = id;
    this.isLocal = isLocal;
    this.health = 100;
    this.isAlive = true;
    this.character = null; // Store character data

    // Low-poly humanoid rig (same 2-unit bounds as the old placeholder box)
    this.rig = buildCharacterMesh(isLocal ? 0x00ff00 : 0xff0000);
    this.mesh = this.rig.group;
    this.bodyMaterial = this.rig.bodyMaterial;
    this.hat = null;
    this.mesh.position.y = 1;
    // For remote players: walk animation + facing driven by position deltas
    this._lastAnimPosition = new THREE.Vector3();

    // Movement state
    this.keys = {
      w: false, s: false, a: false, d: false,
      ArrowUp: false, ArrowDown: false,
      ArrowLeft: false, ArrowRight: false
    };
    this.moveSpeed = 0.5;
    this.moveVector = new THREE.Vector3();

    // Jumping
    this.groundY = 1;
    this.velocityY = 0;
    this.isJumping = false;
    this.jumpSpeed = 0.28;
    this.gravity = 0.015;

    // Knockback impulse from being hit; decays each frame.
    this.knockback = { x: 0, z: 0 };

    // Create health bar
    this.createHealthBar();

    // Create gun
    this.createGun();
  }

  createGun() {
    const gunGroup = new THREE.Group();
    const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.0), gunMaterial);
    gunGroup.add(body);

    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.8), gunMaterial);
    barrel.position.z = -0.8;
    gunGroup.add(barrel);

    // Held at the right hand: just outside the right arm (arm pivot at
    // x=1.12 plus arm width), around hand height, slightly forward.
    gunGroup.position.set(1.56, 0.7, -0.6);

    this.gun = gunGroup;
    this.mesh.add(this.gun);
  }

  // Recolor the faction-colored surface (torso + arms). Used by faction
  // changes, death/respawn, and the hit flash in GameScene.
  setBodyColorHex(hex) {
    this.bodyMaterial.color.setHex(hex);
  }

  // In first-person, seeing your own head/torso/legs from inside the model
  // makes the camera (parked at eye height) feel like it's floating way
  // above everyone else. Hide the body and just show the gun arm, like a
  // regular FPS -- cheaper than clipping and looks fine for now.
  setFirstPersonView(enabled) {
    this.rig.torso.visible = !enabled;
    this.rig.head.visible = !enabled;
    this.rig.limbs.leftLeg.visible = !enabled;
    this.rig.limbs.rightLeg.visible = !enabled;
    this.rig.limbs.leftArm.visible = !enabled;
    if (this.hat) this.hat.visible = !enabled;
  }

  // Swap the equipped cosmetic (hat) to match character data.
  applyCosmetic(cosmeticId) {
    if (this.hat) {
      this.mesh.remove(this.hat);
      this.hat = null;
    }
    if (!cosmeticId) return;
    const hat = buildHatMesh(cosmeticId);
    if (hat) {
      hat.position.y = this.rig.headAnchorY;
      this.mesh.add(hat);
      this.hat = hat;
    }
  }

  createHealthBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 10;
    this.healthBarTexture = new THREE.CanvasTexture(canvas);
    this.healthBarContext = canvas.getContext('2d');

    const healthBarGeometry = new THREE.PlaneGeometry(2, 0.2);
    const healthBarMaterial = new THREE.MeshBasicMaterial({
      map: this.healthBarTexture,
      transparent: true,
      depthTest: false,
      side: THREE.DoubleSide
    });

    this.healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
    this.healthBar.position.y = 3.3; // Just above the (doubled-size) head

    // Create a container for the health bar that will handle the billboard effect
    this.healthBarContainer = new THREE.Object3D();
    this.healthBarContainer.add(this.healthBar);
    this.mesh.add(this.healthBarContainer);

    this.updateHealthBar();
  }

  updateHealthBar() {
    const ctx = this.healthBarContext;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, width, height);

    // Draw health with faction-specific color
    const healthWidth = (this.health / 100) * width;
    
    // Select color based on faction
    let healthColor;
    if (this.character) {
      switch(this.character.faction) {
        case "Criminal":
          healthColor = '#ff5252'; // Light red
          break;
        case "Enforcer":
          healthColor = '#64b5f6'; // Light blue
          break;
        case "Civilian":
          healthColor = '#81c784'; // Light green
          break;
        default:
          healthColor = this.health > 50 ? '#00ff00' : this.health > 25 ? '#ffff00' : '#ff0000';
      }
    } else {
      healthColor = this.health > 50 ? '#00ff00' : this.health > 25 ? '#ffff00' : '#ff0000';
    }
    
    ctx.fillStyle = healthColor;
    ctx.fillRect(0, 0, healthWidth, height);

    // Force texture update
    if (this.healthBarTexture) {
      this.healthBarTexture.needsUpdate = true;
      this.healthBar.material.needsUpdate = true;
    }
  }

  updateHealthBarRotation(camera) {
    // Make health bar face camera
    if (this.healthBarContainer) {
      const cameraPosition = camera.position.clone();
      this.healthBarContainer.lookAt(cameraPosition);
      
      // Keep the health bar vertical
      this.healthBarContainer.rotation.x = 0;
      this.healthBarContainer.rotation.z = 0;
    }
  }

  getFactionColor() {
    return resolveFactionColor(this.character?.faction, this.isLocal);
  }

  // Sets/updates this player's character data and recolors the mesh to
  // match their faction. Call this anywhere character data arrives --
  // creation, server updates for you, or for a remote player who picks
  // their faction after you're already connected.
  applyCharacter(character) {
    this.character = character;
    if (this.isAlive) {
      this.setBodyColorHex(this.getFactionColor());
    }
    this.applyCosmetic(character && character.equippedCosmetic);
    this.updateHealthBar();
  }

  // Server is the source of truth for health/alive state; this applies an
  // authoritative update rather than a local delta. Always recolors to the
  // faction color when alive, DEAD_COLOR when not -- no health-based
  // dimming, so a low-health teammate doesn't start looking like a
  // different faction.
  applyHealthUpdate(health, isAlive) {
    const wasAlive = this.isAlive;
    this.health = health;
    this.isAlive = isAlive;
    this.updateHealthBar();
    this.setBodyColorHex(isAlive ? this.getFactionColor() : DEAD_COLOR);

    // Topple over on the alive->dead transition; a floating health bar over
    // a body lying sideways looks wrong, so hide it until respawn.
    if (wasAlive && !isAlive) {
      playDeathAnimation(this.rig);
      this.healthBarContainer.visible = false;
    } else if (!wasAlive && isAlive) {
      resetDeathPose(this.rig, this.groundY);
      this.healthBarContainer.visible = true;
    }
  }

  // Nudges the player away from wherever they just got hit from; decays
  // to zero over the following frames in update().
  applyKnockback(dx, dz) {
    this.knockback.x += dx;
    this.knockback.z += dz;
  }

  update(cameraMode, camera, otherPositions = []) {
    if (!this.isLocal || !this.isAlive) return;

    const moveDistance = this.moveSpeed;
    this.moveVector.set(0, 0, 0);

    if (cameraMode === 'firstPerson') {
      // First-person movement
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      right.y = 0;
      right.normalize();

      if (this.keys.w || this.keys.ArrowUp) this.moveVector.add(forward);
      if (this.keys.s || this.keys.ArrowDown) this.moveVector.sub(forward);
      if (this.keys.d || this.keys.ArrowRight) this.moveVector.add(right);
      if (this.keys.a || this.keys.ArrowLeft) this.moveVector.sub(right);
    } else {
      // Top-down movement
      if (this.keys.w || this.keys.ArrowUp) this.moveVector.z -= 1;
      if (this.keys.s || this.keys.ArrowDown) this.moveVector.z += 1;
      if (this.keys.a || this.keys.ArrowLeft) this.moveVector.x -= 1;
      if (this.keys.d || this.keys.ArrowRight) this.moveVector.x += 1;
    }

    // Normalize and apply movement
    if (this.moveVector.lengthSq() > 0) {
      this.moveVector.normalize().multiplyScalar(moveDistance);
      this.mesh.position.add(this.moveVector);
    }

    // Apply and decay any knockback impulse from a recent hit
    this.mesh.position.x += this.knockback.x;
    this.mesh.position.z += this.knockback.z;
    this.knockback.x *= 0.85;
    this.knockback.z *= 0.85;
    if (Math.abs(this.knockback.x) < 0.02) this.knockback.x = 0;
    if (Math.abs(this.knockback.z) < 0.02) this.knockback.z = 0;

    // Keep player within bounds
    this.mesh.position.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, this.mesh.position.x));
    this.mesh.position.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, this.mesh.position.z));

    // Push back out of any building or other player/NPC we just walked into
    resolveBuildingCollision(this.mesh.position);
    resolveEntityCollision(this.mesh.position, otherPositions);

    // Jump / gravity
    this.velocityY -= this.gravity;
    this.mesh.position.y += this.velocityY;
    if (this.mesh.position.y <= this.groundY) {
      this.mesh.position.y = this.groundY;
      this.velocityY = 0;
      this.isJumping = false;
    }

    // Walk cycle + face the direction of travel
    const dx = this.mesh.position.x - this._lastAnimPosition.x;
    const dz = this.mesh.position.z - this._lastAnimPosition.z;
    const moved = Math.sqrt(dx * dx + dz * dz);
    animateWalk(this.rig, moved);
    if (cameraMode === 'firstPerson') {
      // Body/gun always face the same way the camera looks -- otherwise the
      // gun (offset to the body's right in local space) ends up pointing
      // wherever you last walked instead of where the crosshair is, and
      // shots fired from its muzzle drift off to the side of the aim ray.
      this.mesh.rotation.y = camera.rotation.y;
    } else if (moved > 0.01) {
      this.mesh.rotation.y = Math.atan2(-dx, -dz); // gun/front faces local -Z
    }
    this._lastAnimPosition.copy(this.mesh.position);

    // Update health bar to face camera
    this.updateHealthBarRotation(camera);
  }

  setPosition(position) {
    // A dead body's pose (lying on the ground at LYING_Y) is owned by the
    // death animation -- the dead player's client still echoes its stale
    // upright position every frame, which would yank the body back up.
    if (!this.isAlive) return;
    // Remote players only move through here -- drive their walk animation
    // and facing from the position delta.
    if (!this.isLocal) {
      const dx = position.x - this.mesh.position.x;
      const dz = position.z - this.mesh.position.z;
      const moved = Math.sqrt(dx * dx + dz * dz);
      animateWalk(this.rig, moved);
      if (moved > 0.01) {
        this.mesh.rotation.y = Math.atan2(-dx, -dz); // gun/front faces local -Z
      }
    }
    this.mesh.position.set(position.x, position.y, position.z);
  }

  getPosition() {
    return {
      x: this.mesh.position.x,
      y: this.mesh.position.y,
      z: this.mesh.position.z
    };
  }

  handleKeyDown(event) {
    if (this.keys.hasOwnProperty(event.key)) {
      this.keys[event.key] = true;
    }
    if (event.key === ' ' && !this.isJumping) {
      this.velocityY = this.jumpSpeed;
      this.isJumping = true;
    }
  }

  handleKeyUp(event) {
    if (this.keys.hasOwnProperty(event.key)) {
      this.keys[event.key] = false;
    }
  }

  respawn() {
    // Reset health and alive status
    this.health = 100;
    this.isAlive = true;

    // Back on your feet: undo the death-animation pose
    resetDeathPose(this.rig, this.groundY);
    this.healthBarContainer.visible = true;

    // Position is set by the caller from the server's 'playerRespawned'
    // event (faction-specific spawn point), not decided here.
    this.velocityY = 0;
    this.isJumping = false;

    // Back to your faction color, not a hardcoded local=green/remote=red
    this.setBodyColorHex(this.getFactionColor());

    // Update health bar
    this.updateHealthBar();
  }
} 