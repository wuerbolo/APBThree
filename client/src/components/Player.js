import * as THREE from 'three';
import { resolveBuildingCollision } from '../utils/collision.js';

export class Player {
  constructor(id, isLocal = false) {
    this.id = id;
    this.isLocal = isLocal;
    this.health = 100;
    this.isAlive = true;
    this.character = null; // Store character data
    
    // Create mesh
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial({
      color: isLocal ? 0x00ff00 : 0xff0000 // Default colors before faction assignment
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 1;

    // Movement state
    this.keys = {
      w: false, s: false, a: false, d: false,
      ArrowUp: false, ArrowDown: false,
      ArrowLeft: false, ArrowRight: false
    };
    this.moveSpeed = 0.5;
    this.moveVector = new THREE.Vector3();

    // Create health bar
    this.createHealthBar();
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
    this.healthBar.position.y = 2.5; // Position above player

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
    if (!this.character) return this.isLocal ? 0x00ff00 : 0xff0000;
    
    // Get colors based on faction
    switch(this.character.faction) {
      case "Criminal":
        return this.isLocal ? 0x8b0000 : 0xd32f2f; // Dark red for local, bright red for remote
      case "Enforcer":
        return this.isLocal ? 0x00008b : 0x1976d2; // Dark blue for local, bright blue for remote
      case "Civilian":
        return this.isLocal ? 0x006400 : 0x388e3c; // Dark green for local, bright green for remote
      default:
        return this.isLocal ? 0x00ff00 : 0xff0000; // Default colors
    }
  }
  
  setFaction(faction) {
    if (!this.character) this.character = {};
    if (this.character.faction !== faction) {
      this.character.faction = faction;
      if (this.isAlive) {
        this.mesh.material.color.setHex(this.getFactionColor());
      }
      this.updateHealthBar();
    }
  }

  takeDamage(damage) {
    this.health = Math.max(0, this.health - damage);
    this.isAlive = this.health > 0;
    this.updateHealthBar();

    // Update material color based on health and alive status
    if (!this.isAlive) {
      this.mesh.material.color.setHex(0x333333); // Grey when dead
    } else if (this.character) {
      // Use faction-based colors
      this.mesh.material.color.setHex(this.getFactionColor());
    } else {
      // Default colors if no character (shouldn't happen once character system is fully implemented)
      const healthFactor = this.health / 100;
      if (this.isLocal) {
        this.mesh.material.color.setRGB(0, healthFactor, 0); // Green varying with health
      } else {
        this.mesh.material.color.setRGB(1, healthFactor, healthFactor); // Red varying with health
      }
    }

    return this.isAlive;
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
    this.isAlive = true;
    this.updateHealthBar();
    
    // Update color based on health and faction
    if (this.character) {
      this.mesh.material.color.setHex(this.getFactionColor());
    } else {
      // Default behavior
      if (this.isLocal) {
        this.mesh.material.color.setRGB(0, 1, 0); // Full green for local
      } else {
        this.mesh.material.color.setRGB(1, 0, 0); // Full red for remote
      }
    }
    
    return this.health;
  }

  update(cameraMode, camera) {
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

    // Keep player within bounds
    this.mesh.position.x = Math.max(-50, Math.min(50, this.mesh.position.x));
    this.mesh.position.z = Math.max(-50, Math.min(50, this.mesh.position.z));

    // Push back out of any building we just walked into
    resolveBuildingCollision(this.mesh.position);

    // Update health bar to face camera
    this.updateHealthBarRotation(camera);
  }

  setPosition(position) {
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

    // Generate random spawn position
    const x = Math.random() * 80 - 40; // -40 to 40
    const z = Math.random() * 80 - 40; // -40 to 40
    this.mesh.position.set(x, 1, z);
    
    // Reset material color to full health color based on player type
    if (this.isLocal) {
      this.mesh.material.color.setRGB(0, 1, 0); // Full green for local player
    } else {
      this.mesh.material.color.setRGB(1, 0, 0); // Full red for remote player
    }
    
    // Update health bar
    this.updateHealthBar();
  }
} 