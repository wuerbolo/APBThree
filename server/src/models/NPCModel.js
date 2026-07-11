export class NPCModel {
  constructor(id, position, faction = null) {
    this.id = id;
    this.position = position;
    this.targetPosition = this.getNewTargetPosition();
    this.health = 50;
    this.isAlive = true;
    this.speed = 0.2;
    this.despawnTimer = null;
    
    // Assign a faction if not provided
    this.faction = faction || this.getRandomFaction();
  }

  // Random faction assignment - 60% chance of Civilian, 20% each for Criminal and Enforcer
  getRandomFaction() {
    const rand = Math.random();
    if (rand < 0.6) {
      return "Civilian";
    } else if (rand < 0.8) {
      return "Criminal";
    } else {
      return "Enforcer";
    }
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

    // Keep within bounds
    this.position.x = Math.max(-50, Math.min(50, this.position.x));
    this.position.z = Math.max(-50, Math.min(50, this.position.z));

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

  takeDamage(damage) {
    this.health = Math.max(0, this.health - damage);
    this.isAlive = this.health > 0;

    // Start despawn timer if NPC dies
    if (!this.isAlive && !this.despawnTimer) {
      this.despawnTimer = setTimeout(() => {
        // We'll emit the event through the NetworkSystem
        // The actual removal will be handled by the callback
        if (this.onDespawn) {
          this.onDespawn(this.id);
        }
      }, 20000); // 20 seconds
    }

    return this.isAlive;
  }

  heal(amount) {
    // Clear despawn timer if healing a dead NPC
    if (!this.isAlive && this.despawnTimer) {
      clearTimeout(this.despawnTimer);
      this.despawnTimer = null;
    }

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
  
  // Get all NPC data including faction
  getData() {
    return {
      id: this.id,
      position: this.position,
      health: this.health,
      isAlive: this.isAlive,
      faction: this.faction
    };
  }

  updatePosition(position) {
    this.position = position;
  }

  // Set callback for when NPC should be despawned
  setDespawnCallback(callback) {
    this.onDespawn = callback;
  }
} 