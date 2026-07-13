export class PlayerModel {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.health = 100;
    this.isAlive = true;
    this.character = null; // Will hold character data

    // WANTED system (session-scoped, not persisted): stars from killing
    // Civilians; decays over time, cleared on death/arrest.
    this.wantedStars = 0;
    this.lastWantedAt = 0;

    // While jailed (arrested), position updates are ignored until released.
    this.jailedUntil = 0;
  }

  isJailed() {
    return Date.now() < this.jailedUntil;
  }

  updatePosition(position) {
    this.position = position;
  }

  getPosition() {
    return this.position;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.isAlive = this.health > 0;
    console.log(`Server: Player ${this.id} health now ${this.health}`);
    return this.isAlive;
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
    this.isAlive = true;
    return this.health;
  }

  getHealth() {
    return {
      health: this.health,
      isAlive: this.isAlive
    };
  }

  // Set character data
  setCharacter(character) {
    this.character = character;
  }

  // Get character data
  getCharacter() {
    return this.character;
  }

  // Check if player has a character
  hasCharacter() {
    return this.character !== null;
  }
} 