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

          // Update color based on health
          if (npc.isAlive) {
            const healthFactor = health / 50;
            npc.mesh.material.color.setRGB(0, 0.533 * healthFactor + 0.267, healthFactor);
          } else {
            npc.mesh.material.color.setHex(0x333333); // Dark gray for dead NPCs
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

          // Update color based on health
          if (player.isAlive) {
            const healthFactor = health / 100;
            if (player === this.gameScene.localPlayer) {
              player.mesh.material.color.setRGB(healthFactor, 1, healthFactor); // Green to dark green
            } else {
              player.mesh.material.color.setRGB(1, healthFactor, healthFactor); // Red to dark red
            }
          } else {
            player.mesh.material.color.setHex(0x333333); // Dark gray for dead players
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