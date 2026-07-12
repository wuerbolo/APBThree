import * as THREE from 'three';
import { getFactionColor as resolveFactionColor, DEAD_COLOR } from '../utils/factionColors.js';

export class NPC {
  constructor(id, position, faction = "Civilian") {
    this.id = id;
    this.health = 50;
    this.isAlive = true;
    this.faction = faction; // Store faction information
    
    // Create mesh
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    
    // Set color based on faction
    const material = new THREE.MeshStandardMaterial({
      color: this.getFactionColor()
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    
    // Create health bar
    this.createHealthBar();
  }
  
  // Return the color for this NPC's faction
  getFactionColor() {
    return resolveFactionColor(this.faction, false);
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
    this.healthBar.position.y = 2.5; // Position above NPC

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
      this.mesh.material.color.setHex(DEAD_COLOR);
    }

    return this.isAlive;
  }
  
  // Update faction and related visuals
  setFaction(faction) {
    if (this.faction !== faction) {
      this.faction = faction;
      if (this.isAlive) {
        this.mesh.material.color.setHex(this.getFactionColor());
      }
      this.updateHealthBar();
    }
  }

  setPosition(position) {
    this.mesh.position.copy(position);
  }

  heal(amount) {
    this.health = Math.min(50, this.health + amount);
    this.isAlive = true;
    this.updateHealthBar();
    
    // Update color based on health and faction
    this.mesh.material.color.setHex(this.getFactionColor());
    
    return this.health;
  }

  update(camera) {
    if (!this.isAlive) return;

    // Smooth movement interpolation is handled here
    if (this.targetPosition) {
      const lerpFactor = 0.1;
      this.mesh.position.lerp(this.targetPosition, lerpFactor);
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