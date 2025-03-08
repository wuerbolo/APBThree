export class PlayerModel {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.health = 100;
  }

  updatePosition(position) {
    this.position = position;
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