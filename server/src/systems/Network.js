import { Server } from 'socket.io';
import { PlayerModel } from '../models/PlayerModel.js';
import { NPCModel } from '../models/NPCModel.js';
import * as THREE from 'three';

export class NetworkSystem {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
      }
    });

    this.players = new Map();
    this.npcs = new Map();
    this.setupSocketHandlers();
    this.startNPCLoop();
  }

  setupSocketHandlers() {
    console.log('Setting up socket handlers...');
    
    this.io.on('connection', (socket) => {
      console.log('Player connected:', socket.id);

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

      // Send initial state
      socket.emit('init', {
        id: socket.id,
        position: initialPosition,
        players: Array.from(this.players.entries()).map(([id, p]) => [id, p.getPosition()]),
        npcs: Array.from(this.npcs.entries()).map(([id, npc]) => ({
          id,
          position: npc.getPosition(),
          health: npc.getHealth()
        }))
      });

      // Broadcast new player
      socket.broadcast.emit('playerJoined', {
        id: socket.id,
        position: initialPosition
      });

      // Handle position updates - no logging needed for frequent updates
      socket.on('updatePosition', (position) => {
        const player = this.players.get(socket.id);
        if (player) {
          player.updatePosition(position);
          socket.broadcast.emit('playerMoved', {
            id: socket.id,
            position
          });
        }
      });

      // Handle shooting - only log when shots hit
      socket.on('shoot', (data) => {
        socket.broadcast.emit('shoot', {
          ...data,
          playerId: socket.id
        });
      });

      // Handle damage events
      socket.on('damage', ({ targetId, damage, isNPC }, callback) => {
        try {
          if (isNPC) {
            const npc = this.npcs.get(targetId);
            if (npc) {
              const isAlive = npc.takeDamage(damage);
              console.log(`NPC ${targetId} took ${damage} damage. Health: ${npc.health}, Alive: ${isAlive}`);
              
              const updateData = {
                id: targetId,
                health: npc.health,
                isAlive,
                isNPC: true
              };
              this.io.emit('updateHealth', updateData);
              
              if (callback) callback({ success: true });
            } else {
              console.log(`NPC ${targetId} not found`);
              if (callback) callback({ error: 'NPC not found' });
            }
          } else {
            const player = this.players.get(targetId);
            if (player) {
              const isAlive = player.takeDamage(damage);
              console.log(`Player ${targetId} took ${damage} damage. Health: ${player.health}, Alive: ${isAlive}`);
              
              const updateData = {
                id: targetId,
                health: player.health,
                isAlive,
                isNPC: false
              };
              this.io.emit('updateHealth', updateData);
              
              if (callback) callback({ success: true });
            } else {
              console.log(`Player ${targetId} not found`);
              if (callback) callback({ error: 'Player not found' });
            }
          }
        } catch (error) {
          console.error('Error processing damage event:', error);
          if (callback) callback({ error: 'Internal server error' });
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

      // Handle respawn events
      socket.on('respawn', (position) => {
        const player = this.players.get(socket.id);
        if (player) {
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
        console.log('Player disconnected:', socket.id);
        this.players.delete(socket.id);
        this.io.emit('playerLeft', socket.id);
      });
    });
  }

  initializeNPCs(numNPCs = 5) {
    for (let i = 0; i < numNPCs; i++) {
      const id = `npc-${i}`;
      const position = {
        x: (Math.random() * 100) - 50,
        y: 1,
        z: (Math.random() * 100) - 50
      };
      
      const npc = new NPCModel(id, position);
      this.npcs.set(id, npc);
    }
  }

  startNPCLoop() {
    this.initializeNPCs();

    setInterval(() => {
      this.npcs.forEach((npc, id) => {
        const newPosition = npc.update();
        if (npc.isAlive) {
          this.io.emit('npcMoved', {
            id,
            position: newPosition
          });
        }
      });
    }, 50); // Update every 50ms
  }
} 