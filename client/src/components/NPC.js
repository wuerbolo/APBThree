import * as THREE from 'three';

export class NPC {
  constructor(id, position) {
    this.id = id;
    
    // Create mesh
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial({ color: 0x0088ff });
    this.mesh = new THREE.Mesh(geometry, material);
    
    // Set initial position
    this.mesh.position.set(position.x, position.y, position.z);
    this.targetPosition = new THREE.Vector3();
  }

  update() {
    // Smooth movement interpolation is handled here
    if (this.targetPosition) {
      const lerpFactor = 0.1;
      this.mesh.position.lerp(this.targetPosition, lerpFactor);
    }
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