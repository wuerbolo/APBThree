import { io } from 'socket.io-client';

export class NetworkSystem {
  constructor(gameScene) {
    this.gameScene = gameScene;
    this.socket = io('http://localhost:3000');
    
    // Add connection monitoring
    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
    });

    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.socket.on('init', ({ id, position, players, npcs }) => {
      console.log('Connected with ID:', id);
      
      // Initialize local player
      this.gameScene.initLocalPlayer(id, position);
      
      // Initialize other players
      players.forEach(([playerId, pos]) => {
        if (playerId !== id) {
          this.gameScene.addRemotePlayer(playerId, pos);
        }
      });

      // Initialize NPCs
      npcs.forEach(({ id, position }) => {
        this.gameScene.addNPC(id, position);
      });
    });

    this.socket.on('playerJoined', ({ id, position }) => {
      this.gameScene.addRemotePlayer(id, position);
    });

    this.socket.on('playerMoved', ({ id, position }) => {
      this.gameScene.updateRemotePlayer(id, position);
    });

    this.socket.on('playerLeft', (id) => {
      this.gameScene.removeRemotePlayer(id);
    });

    this.socket.on('npcMoved', ({ id, position }) => {
      this.gameScene.updateNPC(id, position);
    });

    this.socket.on('removeNPC', (id) => {
      console.log(`Removing NPC ${id} from scene`);
      const npc = this.gameScene.npcs.get(id);
      if (npc) {
        this.gameScene.scene.remove(npc.mesh);
        this.gameScene.npcs.delete(id);
      }
    });

    this.socket.on('spawnNPC', ({ id, position, health }) => {
      console.log(`Spawning new NPC ${id} at position:`, position);
      this.gameScene.addNPC(id, position);
      // Update health if provided
      if (health) {
        const npc = this.gameScene.npcs.get(id);
        if (npc) {
          npc.health = health.health;
          npc.isAlive = health.isAlive;
          npc.updateHealthBar();
        }
      }
    });

    this.socket.on('shoot', ({ id, position, direction, playerId }) => {
      this.gameScene.handleRemoteShot(id, position, direction);
    });

    // Add health update handler
    this.socket.on('updateHealth', ({ id, health, isAlive, isNPC }) => {
      console.log(`Received health update: ${id} (${isNPC ? 'NPC' : 'Player'}) - Health: ${health}, Alive: ${isAlive}`);
      
      if (isNPC) {
        const npc = this.gameScene.npcs.get(id);
        if (npc) {
          const oldHealth = npc.health;
          npc.health = health;
          npc.isAlive = isAlive;
          npc.updateHealthBar();
          console.log(`NPC ${id} health changed from ${oldHealth} to ${health}`);

          // Update color based on alive status first
          if (!isAlive) {
            npc.mesh.material.color.setHex(0x333333); // Grey when dead
          } else {
            const healthFactor = health / 50;
            npc.mesh.material.color.setRGB(0, 0.533 * healthFactor + 0.267, healthFactor);
          }
        }
      } else {
        const player = id === this.socket.id ? 
          this.gameScene.localPlayer : 
          this.gameScene.remotePlayers.get(id);
        
        if (player) {
          const oldHealth = player.health;
          player.health = health;
          player.isAlive = isAlive;
          player.updateHealthBar();
          console.log(`Player ${id} health changed from ${oldHealth} to ${health}`);

          // Show death overlay for local player when they die
          if (id === this.socket.id && oldHealth > 0 && health <= 0) {
            console.log('Local player died, showing death overlay');
            this.gameScene.hud.showDeathOverlay();
          }

          // Update color based on alive status first
          if (!isAlive) {
            player.mesh.material.color.setHex(0x333333); // Grey when dead
          } else if (health === 100) { // Full health (respawn)
            if (player === this.gameScene.localPlayer) {
              player.mesh.material.color.setRGB(0, 1, 0); // Full green
            } else {
              player.mesh.material.color.setRGB(1, 0, 0); // Full red
            }
          } else { // Partial health
            const healthFactor = health / 100;
            if (player === this.gameScene.localPlayer) {
              player.mesh.material.color.setRGB(0, healthFactor, 0); // Green varying with health
            } else {
              player.mesh.material.color.setRGB(1, healthFactor, healthFactor); // Red varying with health
            }
          }
        }
      }
    });
  }

  sendPosition(position) {
    this.socket.emit('updatePosition', position);
  }

  sendShot(data) {
    this.socket.emit('shoot', data);
  }

  sendDamage(data) {
    console.log('Sending damage event:', data);
    if (!this.socket.connected) {
      console.error('Cannot send damage: Not connected to server');
      return;
    }
    this.socket.emit('damage', data, (response) => {
      // Add acknowledgment callback
      if (response && response.error) {
        console.error('Error sending damage:', response.error);
      } else {
        console.log('Damage event acknowledged by server');
      }
    });
  }
} 