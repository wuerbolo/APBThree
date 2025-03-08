import * as THREE from 'three';

export class Player {
  constructor(id, isLocal = false) {
    this.id = id;
    this.isLocal = isLocal;
    
    // Create mesh
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial({
      color: isLocal ? 0x00ff00 : 0xff0000
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
  }

  update(cameraMode, camera) {
    if (!this.isLocal) return;

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
} 