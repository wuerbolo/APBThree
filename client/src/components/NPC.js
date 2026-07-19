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
    }
  }

  // Server position updates land here (~20Hz); store as a lerp target so
  // update() smooths the motion each frame and the walk cycle has a real
  // per-frame delta to animate from.
  setPosition(position) {
    if (!this.targetPosition) this.targetPosition = new THREE.Vector3();
    this.targetPosition.set(position.x, position.y, position.z);
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

    // Smooth movement interpolation is handled here
    const before = { x: this.mesh.position.x, z: this.mesh.position.z };
    if (this.targetPosition) {
      const lerpFactor = 0.1;
      this.mesh.position.lerp(this.targetPosition, lerpFactor);
    }

    // Walk cycle + face the direction of travel
    const dx = this.mesh.position.x - before.x;
    const dz = this.mesh.position.z - before.z;
    const moved = Math.sqrt(dx * dx + dz * dz);
    animateWalk(this.rig, moved);
    if (moved > 0.01) {
      this.mesh.rotation.y = Math.atan2(-dx, -dz); // gun/front faces local -Z
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