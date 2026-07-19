import * as THREE from 'three';
import { getFactionColor as resolveFactionColor, DEAD_COLOR } from '../utils/factionColors.js';
import { buildCharacterMesh, animateWalk, playDeathAnimation, resetDeathPose } from '../utils/characterModel.js';

export class NPC {
  constructor(id, position, faction = "Civilian") {
    this.id = id;
    this.health = 50;
    this.isAlive = true;
    this.faction = faction; // Store faction information

    // Low-poly humanoid rig, body colored by faction
    this.rig = buildCharacterMesh(this.getFactionColor());
    this.mesh = this.rig.group;
    this.bodyMaterial = this.rig.bodyMaterial;
    this.mesh.position.copy(position);

    // Create health bar
    this.createHealthBar();

    // Knockback impulse from being shot; decays each frame (see Player.js
    // for the same pattern on the local player getting hit).
    this.knockback = { x: 0, z: 0 };

    // Faction melee weapon in the right hand (baton/knife)
    this.meleeWeapon = null;
    this.equipMeleeWeapon();
  }

  // Enforcers carry a baton, Outlaws a knife, Civilians nothing. The
  // weapon is a child of the right-arm pivot so it swings naturally with
  // the walk cycle and with the melee attack animation.
  equipMeleeWeapon() {
    if (this.meleeWeapon) {
      this.rig.limbs.rightArm.remove(this.meleeWeapon);
      this.meleeWeapon = null;
    }

    let weapon = null;
    if (this.faction === 'Enforcer') {
      // Baton: black shaft with a short grip
      weapon = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.95, 8),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
      );
      shaft.position.y = -0.3;
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.22, 8),
        new THREE.MeshStandardMaterial({ color: 0x424242 })
      );
      grip.position.y = 0.28;
      weapon.add(shaft, grip);
      weapon.rotation.x = 0.5; // angled forward-down, patrol style
    } else if (this.faction === 'Criminal') {
      // Knife: silver blade pointing forward out of a dark handle
      weapon = new THREE.Group();
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.12, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.6, roughness: 0.3 })
      );
      blade.position.z = -0.34;
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.14, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x3e2723 })
      );
      weapon.add(blade, handle);
    }

    if (weapon) {
      // Right-arm pivot hangs the arm down its local -y; the hand sits at
      // roughly -1.2 (arm length 1.3)
      weapon.position.set(0, -1.2, -0.05);
      this.rig.limbs.rightArm.add(weapon);
      this.meleeWeapon = weapon;
    }
  }

  // Server says this NPC just landed a melee hit -- play a quick
  // raise-and-strike swing with the weapon arm.
  triggerMeleeSwing() {
    this._swingStart = performance.now();
  }

  // Return the color for this NPC's faction
  getFactionColor() {
    return resolveFactionColor(this.faction, false);
  }

  // Recolor the faction-colored surface (torso + arms).
  setBodyColorHex(hex) {
    this.bodyMaterial.color.setHex(hex);
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

    // Draw health - use colors that match NPC's faction
    const healthWidth = (this.health / 50) * width;  // NPCs have max 50 health
    
    // Get faction-based color
    let healthColor;
    switch(this.faction) {
      case "Criminal":
        healthColor = '#ff5252'; // Lighter red
        break;
      case "Enforcer":
        healthColor = '#64b5f6'; // Lighter blue
        break;
      case "Civilian":
      default:
        healthColor = '#81c784'; // Lighter green
        break;
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
    if (this.healthBarContainer) {
      const cameraPosition = camera.position.clone();
      this.healthBarContainer.lookAt(cameraPosition);
      
      // Keep the health bar vertical
      this.healthBarContainer.rotation.x = 0;
      this.healthBarContainer.rotation.z = 0;
    }
  }

  takeDamage(damage) {
    this.health = Math.max(0, this.health - damage);
    this.isAlive = this.health > 0;
    this.updateHealthBar();

    if (!this.isAlive) {
      this.setBodyColorHex(DEAD_COLOR);
    }

    return this.isAlive;
  }

  // Authoritative health/alive state from the server. Handles the topple
  // animation on death and standing back up on revive/respawn.
  applyHealthUpdate(health, isAlive) {
    const wasAlive = this.isAlive;
    this.health = health;
    this.isAlive = isAlive;
    this.updateHealthBar();
    this.setBodyColorHex(isAlive ? this.getFactionColor() : DEAD_COLOR);

    if (wasAlive && !isAlive) {
      playDeathAnimation(this.rig);
      this.healthBarContainer.visible = false;
    } else if (!wasAlive && isAlive) {
      resetDeathPose(this.rig, 1);
      this.healthBarContainer.visible = true;
    }
  }
  
  // Update faction and related visuals
  setFaction(faction) {
    if (this.faction !== faction) {
      this.faction = faction;
      if (this.isAlive) {
        this.setBodyColorHex(this.getFactionColor());
      }
      this.updateHealthBar();
      this.equipMeleeWeapon();
    }
  }

  // Server position updates land here (~20Hz); store as a lerp target so
  // update() smooths the motion each frame and the walk cycle has a real
  // per-frame delta to animate from.
  setPosition(position) {
    if (!this.targetPosition) this.targetPosition = new THREE.Vector3();
    this.targetPosition.set(position.x, position.y, position.z);
  }

  // Nudges the NPC away from wherever it just got shot from; the offset
  // eases back to zero in update(). Capped so sustained SMG fire or a
  // multi-pellet shotgun blast can't shove a body into a wall.
  applyKnockback(dx, dz) {
    this.knockback.x += dx;
    this.knockback.z += dz;
    const magnitude = Math.sqrt(this.knockback.x ** 2 + this.knockback.z ** 2);
    const MAX_KNOCKBACK = 2.5;
    if (magnitude > MAX_KNOCKBACK) {
      const scale = MAX_KNOCKBACK / magnitude;
      this.knockback.x *= scale;
      this.knockback.z *= scale;
    }
  }

  heal(amount) {
    this.health = Math.min(50, this.health + amount);
    this.isAlive = true;
    this.updateHealthBar();

    // Update color based on health and faction
    this.setBodyColorHex(this.getFactionColor());

    return this.health;
  }

  update(camera) {
    if (!this.isAlive) return;

    // Smooth movement interpolation runs on a *base* position that the
    // knockback never touches. If the shove moved mesh.position directly,
    // the next frame's lerp would see a bigger gap to targetPosition and
    // correct proportionally faster -- the NPC visibly accelerates back
    // onto its path, eating the knockback. Rendering at base + offset
    // keeps the lerp speed constant while the offset eases out on its own.
    if (!this._basePosition) this._basePosition = this.mesh.position.clone();
    const before = { x: this._basePosition.x, z: this._basePosition.z };
    if (this.targetPosition) {
      const lerpFactor = 0.1;
      this._basePosition.lerp(this.targetPosition, lerpFactor);
    }

    // Decay the knockback offset (impulses accumulate in applyKnockback)
    this.knockback.x *= 0.88;
    this.knockback.z *= 0.88;
    if (Math.abs(this.knockback.x) < 0.01) this.knockback.x = 0;
    if (Math.abs(this.knockback.z) < 0.01) this.knockback.z = 0;

    this.mesh.position.set(
      this._basePosition.x + this.knockback.x,
      this._basePosition.y,
      this._basePosition.z + this.knockback.z
    );

    // Walk cycle + face the direction of travel -- driven by the base
    // movement, so a shove doesn't spin the NPC around or pump the legs
    const dx = this._basePosition.x - before.x;
    const dz = this._basePosition.z - before.z;
    const moved = Math.sqrt(dx * dx + dz * dz);
    animateWalk(this.rig, moved);
    if (moved > 0.01) {
      this.mesh.rotation.y = Math.atan2(-dx, -dz); // gun/front faces local -Z
    }

    // Melee swing overrides the weapon arm's walk pose: raise forward and
    // strike, back to rest over ~350ms (positive rotation.x swings the
    // hanging arm toward local -Z, i.e. at whoever the NPC is facing)
    if (this._swingStart) {
      const t = (performance.now() - this._swingStart) / 350;
      if (t >= 1) {
        this._swingStart = null;
      } else {
        this.rig.limbs.rightArm.rotation.x = Math.sin(t * Math.PI) * 2.1;
      }
    }

    // Update health bar to face camera
    this.updateHealthBarRotation(camera);
  }

  setTargetPosition(position) {
    this.targetPosition.set(position.x, position.y, position.z);
  }

  getPosition() {
    return {
      x: this.mesh.position.x,
      y: this.mesh.position.y,
      z: this.mesh.position.z
    };
  }
} 