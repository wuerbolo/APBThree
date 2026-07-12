import { resolveBuildingCollision } from '../utils/collision.js';

export class NPCModel {
  constructor(id, position, faction = null) {
    this.id = id;
    this.position = position;
    this.targetPosition = this.getNewTargetPosition();
    this.health = 50;
    this.isAlive = true;
    this.speed = 0.2;
    this.despawnTimer = null;

    // Chase AI (Enforcer <-> Criminal only; Civilian NPCs never chase)
    this.chaseSpeed = 0.32;
    this.chaseRange = 20;
    this.attackRange = 2.5;
    this.attackCooldown = 1000;
    this.attackDamage = 8;
    this.lastAttackTime = 0;

    // Assign a faction if not provided
    this.faction = faction || this.getRandomFaction();
  }

  // The faction of player this NPC will chase and attack on sight, or null
  // if this NPC never initiates a chase (Civilians just wander).
  getOpposingFaction() {
    if (this.faction === "Enforcer") return "Criminal";
    if (this.faction === "Criminal") return "Enforcer";
    return null;
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

  // alivePlayers: [{ id, position, faction }] -- only alive players with a
  // character, passed in fresh each tick by NetworkSystem.
  update(alivePlayers = []) {
    if (!this.isAlive) return { position: this.position, attack: null };

    let attack = null;
    const target = this.findChaseTarget(alivePlayers);

    if (target) {
      this.targetPosition = null; // drop any wander target while chasing
      const dx = target.position.x - this.position.x;
      const dz = target.position.z - this.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance > this.attackRange) {
        this.position.x += (dx / distance) * this.chaseSpeed;
        this.position.z += (dz / distance) * this.chaseSpeed;
      } else {
        const now = Date.now();
        if (now - this.lastAttackTime >= this.attackCooldown) {
          this.lastAttackTime = now;
          attack = { targetId: target.id, amount: this.attackDamage };
        }
      }
    } else {
      if (!this.targetPosition) this.targetPosition = this.getNewTargetPosition();

      const dx = this.targetPosition.x - this.position.x;
      const dz = this.targetPosition.z - this.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance < this.speed) {
        this.targetPosition = this.getNewTargetPosition();
      } else {
        this.position.x += (dx / distance) * this.speed;
        this.position.z += (dz / distance) * this.speed;
      }
    }

    // Keep within bounds
    this.position.x = Math.max(-50, Math.min(50, this.position.x));
    this.position.z = Math.max(-50, Math.min(50, this.position.z));

    // If a building blocked this step, the current target is behind/inside
    // it and the distance-to-target check above will never trip (the
    // corrected position keeps sitting at roughly the same distance from an
    // unreachable target) -- without this the NPC freezes at the wall
    // forever instead of just picking somewhere else to go.
    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    resolveBuildingCollision(this.position);
    if ((this.position.x !== beforeX || this.position.z !== beforeZ) && !target) {
      this.targetPosition = this.getNewTargetPosition();
    }

    return { position: this.position, attack };
  }

  // Closest alive player of the opposing faction within chase range, or null.
  findChaseTarget(alivePlayers) {
    const opposingFaction = this.getOpposingFaction();
    if (!opposingFaction) return null;

    let closest = null;
    let closestDist = this.chaseRange;
    for (const player of alivePlayers) {
      if (player.faction !== opposingFaction) continue;
      const dx = player.position.x - this.position.x;
      const dz = player.position.z - this.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < closestDist) {
        closestDist = dist;
        closest = player;
      }
    }
    return closest;
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