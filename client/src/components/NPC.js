import * as THREE from 'three';

export class NPC {
  constructor(id, position) {
    this.id = id;
    this.health = 50;
    this.isAlive = true;
    
    // Create mesh
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial({ color: 0x0088ff });
    this.mesh = new THREE.Mesh(geometry, material);
    
    // Set initial position
    this.mesh.position.set(position.x, position.y, position.z);
    this.targetPosition = new THREE.Vector3();

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

    // Draw health
    const healthWidth = (this.health / 50) * width; // NPCs have max 50 health
    ctx.fillStyle = this.health > 25 ? '#00ff00' : this.health > 12 ? '#ffff00' : '#ff0000';
    ctx.fillRect(0, 0, healthWidth, height);

    // Force texture update
    if (this.healthBarTexture) {
      this.healthBarTexture.needsUpdate = true;
      // Update material to ensure texture refresh
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

  takeDamage(damage) {
    this.health = Math.max(0, this.health - damage);
    this.isAlive = this.health > 0;
    this.updateHealthBar();

    // Update material color based on health
    const healthFactor = this.health / 50;
    const color = new THREE.Color(
      0.0,
      0.533 * healthFactor + 0.267,
      1 * healthFactor
    );
    this.mesh.material.color = color;

    return this.isAlive;
  }

  heal(amount) {
    this.health = Math.min(50, this.health + amount);
    this.isAlive = true;
    this.updateHealthBar();
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