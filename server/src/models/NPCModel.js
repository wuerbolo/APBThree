export class NPCModel {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.targetPosition = this.getNewTargetPosition();
    this.health = 100;
    this.speed = 0.2;
  }

  update() {
    const dx = this.targetPosition.x - this.position.x;
    const dz = this.targetPosition.z - this.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < this.speed) {
      this.targetPosition = this.getNewTargetPosition();
    } else {
      this.position.x += (dx / distance) * this.speed;
      this.position.z += (dz / distance) * this.speed;
    }

    return this.position;
  }

  getNewTargetPosition() {
    const GROUND_SIZE = 100;
    const GROUND_HALF = GROUND_SIZE / 2;

    return {
      x: (Math.random() * GROUND_SIZE) - GROUND_HALF,
      y: 1,
      z: (Math.random() * GROUND_SIZE) - GROUND_HALF
    };
  }

  getPosition() {
    return this.position;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health;
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
    return this.health;
  }
} 