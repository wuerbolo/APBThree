import { resolveBuildingCollision, resolveEntityCollision, hasLineOfSight, WORLD_HALF, WORLD_SIZE } from '../utils/collision.js';

// 60% Civilian, 20% Criminal, 20% Enforcer.
export function randomNPCFaction() {
  const rand = Math.random();
  if (rand < 0.6) {
    return "Civilian";
  } else if (rand < 0.8) {
    return "Criminal";
  } else {
    return "Enforcer";
  }
}

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
    this.chaseRange = 30;
    this.attackRange = 2.5;
    this.attackCooldown = 1000;
    this.attackDamage = 8;
    this.lastAttackTime = 0;

    // While jailed (arrested Outlaw NPCs), the NPC is pinned in the cell
    // and does nothing until this timestamp passes.
    this.jailedUntil = 0;

    // Assign a faction if not provided
    this.faction = faction || randomNPCFaction();
  }

  // The faction of player this NPC will chase and attack on sight, or null
  // if this NPC never initiates a chase (Civilians just wander).
  getOpposingFaction() {
    if (this.faction === "Enforcer") return "Criminal";
    if (this.faction === "Criminal") return "Enforcer";
    return null;
  }

  // alivePlayers: [{ id, position, faction }], aliveNpcs: [{ id, position, faction }]
  // -- fresh snapshots passed in each tick by NetworkSystem. Enforcer/Criminal
  // NPCs chase and attack whichever opposing-faction target (player or NPC)
  // is closest.
  update(alivePlayers = [], aliveNpcs = []) {
    if (!this.isAlive) return { position: this.position, attack: null };
    if (Date.now() < this.jailedUntil) return { position: this.position, attack: null };

    let attack = null;
    const target = this.findChaseTarget(alivePlayers, aliveNpcs);

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
          attack = { targetId: target.id, targetType: target.type, amount: this.attackDamage };
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
    this.position.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, this.position.x));
    this.position.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, this.position.z));

    // If a building or another body blocked this step, the current target
    // is behind/inside it and the distance-to-target check above will
    // never trip (the corrected position keeps sitting at roughly the same
    // distance from an unreachable target) -- without this the NPC freezes
    // in place forever instead of just picking somewhere else to go.
    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    resolveBuildingCollision(this.position);

    const others = [];
    for (const player of alivePlayers) others.push(player.position);
    for (const npc of aliveNpcs) {
      if (npc.id !== this.id) others.push(npc.position);
    }
    resolveEntityCollision(this.position, others);

    if ((this.position.x !== beforeX || this.position.z !== beforeZ) && !target) {
      this.targetPosition = this.getNewTargetPosition();
    }

    return { position: this.position, attack };
  }

  // Closest alive opposing-faction target (player or NPC) within chase
  // range, or null. Players and NPCs compete for "closest" equally.
  findChaseTarget(alivePlayers, aliveNpcs) {
    const opposingFaction = this.getOpposingFaction();
    if (!opposingFaction) return null;

    let closest = null;
    let closestDist = this.chaseRange;

    const consider = (candidate, type) => {
      if (candidate.id === this.id) return;
      if (candidate.faction !== opposingFaction) return;
      // Don't lock onto (and walk straight into) a target standing on
      // the other side of a wall -- see hasLineOfSight() for why this
      // was the root cause of NPCs freezing mid-chase against buildings.
      if (!hasLineOfSight(this.position, candidate.position)) return;
      const dx = candidate.position.x - this.position.x;
      const dz = candidate.position.z - this.position.z;
      let dist = Math.sqrt(dx * dx + dz * dz);
      // Manhunt: heavily WANTED targets draw aggro from twice as far and
      // win ties against closer, less notorious targets.
      if ((candidate.wanted || 0) >= 3) {
        if (dist > this.chaseRange * 2) return;
        dist = dist / 2;
      }
      if (dist < closestDist) {
        closestDist = dist;
        closest = { id: candidate.id, position: candidate.position, type };
      }
    };

    alivePlayers.forEach(p => consider(p, 'player'));
    aliveNpcs.forEach(n => consider(n, 'npc'));

    return closest;
  }

  getNewTargetPosition() {
    return {
      x: (Math.random() * WORLD_SIZE) - WORLD_HALF,
      y: 1,
      z: (Math.random() * WORLD_SIZE) - WORLD_HALF
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