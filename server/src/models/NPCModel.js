export class NPCModel {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.targetPosition = this.getNewTargetPosition();
    this.health = 50;
    this.isAlive = true;
    this.speed = 0.2;
  }

  update() {
    if (!this.isAlive) return this.position;

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
    this.isAlive = this.health > 0;
    console.log(`Server: NPC ${this.id} health now ${this.health}`);
    return this.isAlive;
  }

  heal(amount) {
    this.health = Math.min(50, this.health + amount);
    this.isAlive = true;
    return this.health;
  }

  getHealth() {
    return {
      health: this.health,
      isAlive: this.isAlive
    };
  }
} 