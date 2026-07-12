import { Server } from 'socket.io';
import { PlayerModel } from '../models/PlayerModel.js';
import { NPCSpawner } from './NPCSpawner.js';
import { CharacterSystem } from './CharacterSystem.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { getSpawnPositionForFaction } from '../utils/collision.js';
import * as THREE from 'three';

function getClientIp(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return socket.handshake.address;
}

export class NetworkSystem {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
        methods: ["GET", "POST"]
      }
    });

    this.players = new Map();
    this.npcs = new Map();
    this.moneyPickups = new Map();
    this.nextPickupSequence = 0;

    // Per-socket sliding-window limits on the noisiest events. A normal
    // player's input loop stays well under these; a script hammering the
    // server won't.
    this.positionLimiter = new RateLimiter(60, 1000);
    this.shootLimiter = new RateLimiter(10, 1000);
    this.damageLimiter = new RateLimiter(15, 1000);

    // Initialize character system
    this.characterSystem = new CharacterSystem();
    
    this.setupSocketHandlers();
    
    // Initialize NPC spawner
    this.npcSpawner = new NPCSpawner(this);
    this.startNPCLoop();
  }

  setupSocketHandlers() {
    console.log('Setting up socket handlers...');
    
    this.io.on('connection', (socket) => {
      const clientIp = getClientIp(socket);
      console.log(`Player connected: ${socket.id} from ${clientIp}`);

      // Assign initial position
      const isFirstPlayer = this.players.size === 0;
      const initialPosition = {
        x: isFirstPlayer ? -40 : 40,
        y: 1,
        z: 0
      };

      // Create new player
      const player = new PlayerModel(socket.id, initialPosition);
      this.players.set(socket.id, player);

      // Check if player has a character
      const existingCharacter = this.characterSystem.getCharacter(socket.id);
      
      if (existingCharacter) {
        // Player has a character, associate it with the player
        player.setCharacter(existingCharacter);
        
        // Send initialization with character data
        socket.emit('init', {
          id: socket.id,
          position: initialPosition,
          players: Array.from(this.players.entries()).map(([id, p]) => [
            id, 
            p.getPosition(),
            p.hasCharacter() ? p.getCharacter().getData() : null
          ]),
          npcs: Array.from(this.npcs.entries()).map(([id, npc]) => ({
            id,
            position: npc.getPosition(),
            health: npc.getHealth(),
            faction: npc.faction
          })),
          pickups: Array.from(this.moneyPickups.entries()).map(([id, pickup]) => ({
            id,
            position: pickup.position,
            amount: pickup.amount
          })),
          character: existingCharacter.getData(),
          hasCharacter: true
        });
      } else {
        // Player doesn't have a character, tell client to show creation UI
        socket.emit('init', {
          id: socket.id,
          position: initialPosition,
          players: Array.from(this.players.entries()).map(([id, p]) => [
            id, 
            p.getPosition(),
            p.hasCharacter() ? p.getCharacter().getData() : null
          ]),
          npcs: Array.from(this.npcs.entries()).map(([id, npc]) => ({
            id,
            position: npc.getPosition(),
            health: npc.getHealth(),
            faction: npc.faction
          })),
          pickups: Array.from(this.moneyPickups.entries()).map(([id, pickup]) => ({
            id,
            position: pickup.position,
            amount: pickup.amount
          })),
          hasCharacter: false
        });
      }

      // Broadcast new player to others
      socket.broadcast.emit('playerJoined', {
        id: socket.id,
        position: initialPosition,
        character: player.hasCharacter() ? player.getCharacter().getData() : null
      });

      // Handle character creation
      socket.on('createCharacter', ({ name, faction }, callback) => {
        console.log(`Creating character for ${socket.id}: ${name} (${faction})`);
        
        // Validate faction
        if (faction !== 'Criminal' && faction !== 'Enforcer') {
          return callback({ success: false, error: 'Invalid faction' });
        }
        
        // Create character
        const character = this.characterSystem.createCharacter(socket.id, name, faction);
        player.setCharacter(character);

        // Place them at their faction's spawn -- HQ for Enforcers, anywhere
        // on the map for Criminals.
        const spawnPosition = getSpawnPositionForFaction(faction);
        player.updatePosition(spawnPosition);

        // Send character data back to the client
        callback({
          success: true,
          character: character.getData(),
          position: spawnPosition
        });
        
        // Broadcast character data to other players
        socket.broadcast.emit('playerUpdated', {
          id: socket.id,
          character: character.getData()
        });
      });

      // Handle position updates
      socket.on('updatePosition', (position) => {
        if (!this.positionLimiter.allow(socket.id)) {
          console.warn(`Rate limit exceeded (updatePosition) for ${socket.id} (${clientIp}), disconnecting`);
          socket.disconnect(true);
          return;
        }
        const player = this.players.get(socket.id);
        if (player) {
          player.updatePosition(position);
          socket.broadcast.emit('playerMoved', {
            id: socket.id,
            position
          });
        }
      });

      // Handle shooting
      socket.on('shoot', (data) => {
        if (!this.shootLimiter.allow(socket.id)) {
          console.warn(`Rate limit exceeded (shoot) for ${socket.id} (${clientIp}), disconnecting`);
          socket.disconnect(true);
          return;
        }
        socket.broadcast.emit('shoot', {
          ...data,
          playerId: socket.id
        });
      });

      // Handle damage events
      socket.on('damage', (data, callback) => {
        if (!this.damageLimiter.allow(socket.id)) {
          console.warn(`Rate limit exceeded (damage) for ${socket.id} (${clientIp}), disconnecting`);
          socket.disconnect(true);
          return;
        }
        console.log('Received damage event:', data);

        // Send acknowledgment immediately
        if (callback) callback({ received: true });
        
        const { targetId, amount, isNPC } = data;
        
        // Get the attacker (the player who sent the damage event)
        const attacker = this.players.get(socket.id);
        if (!attacker) return; // Attacker not found
        
        // Check if attacker has a character with faction info
        const attackerFaction = attacker.hasCharacter() ? attacker.getCharacter().faction : null;
        
        if (isNPC) {
          // Player attacking NPC
          const npc = this.npcs.get(targetId);
          if (!npc) return; // NPC not found
          
          // Get the NPC's faction
          const npcFaction = npc.faction;

          // Faction rules: Civilians are neutral and always damageable;
          // same-faction NPCs are protected (no friendly fire).
          if (npcFaction === "Civilian" || npcFaction !== attackerFaction) {
            npc.takeDamage(amount);
            console.log(`NPC ${targetId} (${npcFaction}) took ${amount} damage from ${socket.id} (${attackerFaction}). Health: ${npc.health}`);

            const isAlive = npc.health > 0;

            // Broadcast damage to all clients
            this.io.emit('updateHealth', {
              id: targetId,
              health: npc.health,
              isAlive: isAlive,
              isNPC: true,
              faction: npcFaction
            });

            // If NPC died, handle it
            if (!isAlive) {
              console.log(`NPC ${targetId} died!`);

              const playerWhoKilled = attacker;
              if (playerWhoKilled.hasCharacter()) {
                const character = playerWhoKilled.getCharacter();

                // Every NPC kill drops cash on the ground instead of
                // paying out instantly.
                this.spawnMoneyPickup(npc.position, 10);

                // Reputation only for putting down a rival-faction NPC --
                // Civilians are neutral and don't count.
                if (npcFaction !== "Civilian" && npcFaction !== attackerFaction) {
                  character.reputation += 10;
                  character.updateLevel();
                  socket.emit('characterUpdated', character.getData());
                }
              }
            }
          } else {
            // Friendly fire - no damage applied
            console.log(`Friendly fire prevented: ${socket.id} (${attackerFaction}) cannot damage NPC ${targetId} (${npcFaction})`);
            socket.emit('damageRejected', {
              targetId,
              reason: 'FRIENDLY_FIRE',
              message: 'Cannot damage NPCs of your own faction'
            });
          }
        } else {
          // Player attacking Player
          const targetPlayer = this.players.get(targetId);
          if (!targetPlayer) return; // Target player not found
          
          // Check if target has character info
          const targetFaction = targetPlayer.hasCharacter() ? targetPlayer.getCharacter().faction : null;
          
          // Check faction rules:
          // 1. If target is Civilian, damage is allowed
          // 2. If attacker and target have the same faction, no damage (friendly fire off)
          if (targetFaction === "Civilian" || targetFaction !== attackerFaction) {
            // Damage is allowed
            const wasAlive = targetPlayer.isAlive;
            targetPlayer.takeDamage(amount);
            
            console.log(`Player ${targetId} (${targetFaction}) took ${amount} damage from ${socket.id} (${attackerFaction}). Health: ${targetPlayer.health}`);
            
            this.io.emit('updateHealth', {
              id: targetId,
              health: targetPlayer.health,
              isAlive: targetPlayer.isAlive,
              isNPC: false,
              faction: targetFaction,
              attackerPosition: attacker.getPosition()
            });

            // If player died and was previously alive
            if (wasAlive && !targetPlayer.isAlive) {
              console.log(`Player ${targetId} was killed by ${socket.id}!`);
              
              // Award XP or reputation to the killer if both have characters
              if (attacker.hasCharacter() && targetPlayer.hasCharacter()) {
                const killerChar = attacker.getCharacter();
                const victimChar = targetPlayer.getCharacter();
                
                // PvP reputation changes depend on faction relation
                if (killerChar.faction !== victimChar.faction) {
                  // Opposing faction kill - gain reputation
                  killerChar.reputation += 5;
                } else {
                  // Same faction kill (shouldn't happen with friendly fire disabled)
                  // but keep this as a fallback
                  killerChar.reputation -= 10;
                }
                killerChar.updateLevel();

                // Notify killer of updated character stats
                socket.emit('characterUpdated', killerChar.getData());
              }

              this.applyDeathPenalty(targetId, targetPlayer);
            }
          } else {
            // Friendly fire - no damage applied
            console.log(`Friendly fire prevented: ${socket.id} (${attackerFaction}) cannot damage player ${targetId} (${targetFaction})`);
            socket.emit('damageRejected', { 
              targetId, 
              reason: 'FRIENDLY_FIRE',
              message: 'Cannot damage players of your own faction'
            });
          }
        }
      });

      // Handle healing events
      socket.on('heal', ({ targetId, amount, isNPC }) => {
        if (isNPC) {
          const npc = this.npcs.get(targetId);
          if (npc) {
            const health = npc.heal(amount);
            console.log(`NPC ${targetId} healed ${amount}. New health: ${health}`);
            this.io.emit('updateHealth', {
              id: targetId,
              health,
              isAlive: true,
              isNPC: true
            });
          }
        } else {
          const player = this.players.get(targetId);
          if (player) {
            const health = player.heal(amount);
            console.log(`Player ${targetId} healed ${amount}. New health: ${health}`);
            this.io.emit('updateHealth', {
              id: targetId,
              health,
              isAlive: true,
              isNPC: false
            });
          }
        }
      });

      // Handle picking up dropped cash
      socket.on('collectMoney', (pickupId) => {
        const pickup = this.moneyPickups.get(pickupId);
        if (!pickup) return; // already collected

        const player = this.players.get(socket.id);
        if (!player) return;

        // Loose sanity check -- ignore requests for pickups nowhere near
        // the player (stale client state, or someone poking the event by hand).
        const dx = player.position.x - pickup.position.x;
        const dz = player.position.z - pickup.position.z;
        if (Math.sqrt(dx * dx + dz * dz) > 5) return;

        this.moneyPickups.delete(pickupId);
        this.io.emit('removeMoneyPickup', pickupId);

        if (player.hasCharacter()) {
          const character = player.getCharacter();
          character.money += pickup.amount;
          socket.emit('characterUpdated', character.getData());
        }
      });

      // Handle respawn events
      socket.on('respawn', () => {
        const player = this.players.get(socket.id);
        if (player) {
          const faction = player.hasCharacter() ? player.getCharacter().faction : null;
          const position = getSpawnPositionForFaction(faction);

          player.health = 100;
          player.isAlive = true;
          player.updatePosition(position);

          // Broadcast respawn to all clients
          this.io.emit('playerRespawned', {
            id: socket.id,
            position
          });

          // Broadcast health update
          this.io.emit('updateHealth', {
            id: socket.id,
            health: player.health,
            isAlive: true,
            isNPC: false
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id} from ${clientIp}`);
        // Keep character data in memory but remove player
        this.players.delete(socket.id);
        this.io.emit('playerLeft', socket.id);
        this.positionLimiter.clear(socket.id);
        this.shootLimiter.clear(socket.id);
        this.damageLimiter.clear(socket.id);
      });
    });
  }

  // Cash dropped by a killed Civilian, collected by walking over it. Offset
  // from the death spot so it doesn't spawn invisibly under the corpse.
  spawnMoneyPickup(position, amount) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 1.5 + Math.random() * 1.5;
    const dropPosition = {
      x: position.x + Math.cos(angle) * distance,
      y: position.y,
      z: position.z + Math.sin(angle) * distance
    };

    const id = `pickup-${Date.now()}-${this.nextPickupSequence++}`;
    this.moneyPickups.set(id, { position: dropPosition, amount });
    this.io.emit('spawnMoneyPickup', { id, position: dropPosition, amount });
  }

  startNPCLoop() {
    setInterval(() => {
      const alivePlayers = Array.from(this.players.entries())
        .filter(([, p]) => p.isAlive && p.hasCharacter())
        .map(([id, p]) => ({
          id,
          position: p.getPosition(),
          faction: p.getCharacter().faction
        }));

      const aliveNpcs = Array.from(this.npcs.entries())
        .filter(([, n]) => n.isAlive)
        .map(([id, n]) => ({
          id,
          position: n.getPosition(),
          faction: n.faction
        }));

      this.npcs.forEach((npc, id) => {
        const { position, attack } = npc.update(alivePlayers, aliveNpcs);
        if (npc.isAlive) {
          this.io.emit('npcMoved', {
            id,
            position
          });
        }
        if (attack) {
          if (attack.targetType === 'npc') {
            this.applyNPCAttackOnNPC(id, attack.targetId, attack.amount);
          } else {
            this.applyNPCAttack(id, attack.targetId, attack.amount);
          }
        }
      });
    }, 50); // Update every 50ms
  }

  // An Enforcer/Criminal NPC caught up to an opposing-faction player and is
  // in range -- deal damage the same way a player-vs-player hit would.
  applyNPCAttack(npcId, targetId, amount) {
    const attackerNpc = this.npcs.get(npcId);
    const targetPlayer = this.players.get(targetId);
    if (!targetPlayer || !targetPlayer.isAlive) return;

    targetPlayer.takeDamage(amount);
    const targetFaction = targetPlayer.hasCharacter() ? targetPlayer.getCharacter().faction : null;

    console.log(`Player ${targetId} (${targetFaction}) took ${amount} damage from NPC ${npcId}. Health: ${targetPlayer.health}`);

    this.io.emit('updateHealth', {
      id: targetId,
      health: targetPlayer.health,
      isAlive: targetPlayer.isAlive,
      isNPC: false,
      faction: targetFaction,
      attackerPosition: attackerNpc ? attackerNpc.position : null
    });

    if (!targetPlayer.isAlive) {
      console.log(`Player ${targetId} was killed by NPC ${npcId}!`);
      this.applyDeathPenalty(targetId, targetPlayer);
    }
  }

  // Dying costs you: all your money, half your reputation. Sent only to
  // the victim so their HUD can animate the drop.
  applyDeathPenalty(targetId, player) {
    if (!player.hasCharacter()) return;
    const character = player.getCharacter();
    character.money = 0;
    character.reputation = Math.floor(character.reputation / 2);
    this.io.to(targetId).emit('characterPenalty', character.getData());
  }

  // An Enforcer/Criminal NPC caught up to an opposing-faction NPC -- same
  // damage/death flow as a player killing an NPC.
  applyNPCAttackOnNPC(attackerId, targetNpcId, amount) {
    const targetNpc = this.npcs.get(targetNpcId);
    if (!targetNpc || !targetNpc.isAlive) return;

    targetNpc.takeDamage(amount);

    console.log(`NPC ${targetNpcId} (${targetNpc.faction}) took ${amount} damage from NPC ${attackerId}. Health: ${targetNpc.health}`);

    this.io.emit('updateHealth', {
      id: targetNpcId,
      health: targetNpc.health,
      isAlive: targetNpc.isAlive,
      isNPC: true,
      faction: targetNpc.faction
    });

    if (!targetNpc.isAlive) {
      console.log(`NPC ${targetNpcId} was killed by NPC ${attackerId}!`);
    }
  }
} 