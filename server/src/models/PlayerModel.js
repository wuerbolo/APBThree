export class PlayerModel {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.health = 100;
    this.isAlive = true;
    this.character = null; // Will hold character data

    // WANTED system (session-scoped, not persisted): stars from killing
    // Civilians; decays over time, cleared on respawn/arrest (see
    // clearWanted() call sites in NetworkSystem).
    this.wantedStars = 0;
    this.lastWantedAt = 0;

    // While jailed (arrested), position updates are ignored until released.
    this.jailedUntil = 0;

    // Anti-cheat bookkeeping for the 'shoot' -> 'damage' flow: per-weapon
    // last-fired timestamps (fire-rate enforcement) and a short-lived
    // budget of how many 'damage' events the current shot is allowed to
    // produce (so a shotgun's 6 pellets are legitimate but a client can't
    // just spam extra 'damage' events off one 'shoot' call).
    this.lastShotAt = {};
    this.shotBudget = null; // { weapon, remaining, expiresAt }
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