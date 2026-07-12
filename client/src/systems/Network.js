import { io } from 'socket.io-client';
import { DEAD_COLOR } from '../utils/factionColors.js';

export class NetworkSystem {
  constructor(gameScene) {
    this.gameScene = gameScene;
    this.socket = io(import.meta.env.VITE_SERVER_URL || undefined);
    
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
    this.socket.on('init', ({ id, position, players, npcs, character, hasCharacter }) => {
      console.log('Connected with ID:', id);
      
      // Check if player has a character
      if (hasCharacter) {
        // Initialize with existing character
        console.log('Loaded existing character:', character);
        this.gameScene.character = character;
        this.gameScene.hud.showCharacterInfo(character);

        // Initialize local player
        this.gameScene.initLocalPlayer(id, position);
        this.gameScene.localPlayer.applyCharacter(character);
      } else {
        // Needs to create a character first - show faction selection UI
        console.log('No character found, showing faction selection');
        this.gameScene.hud.showFactionSelection();
        
        // Still initialize local player to have the camera work properly
        this.gameScene.initLocalPlayer(id, position);
        
        // Hide the player until character is created
        if (this.gameScene.localPlayer) {
          this.gameScene.localPlayer.mesh.visible = false;
        }
      }
      
      // Initialize other players
      players.forEach(([playerId, pos, characterData]) => {
        if (playerId !== id) {
          this.gameScene.addRemotePlayer(playerId, pos, characterData);
        }
      });

      // Initialize NPCs
      npcs.forEach(({ id, position }) => {
        this.gameScene.addNPC(id, position);
      });
    });

    // Character updates
    this.socket.on('characterUpdated', (characterData) => {
      console.log('Character updated:', characterData);
      this.gameScene.character = characterData;
      this.gameScene.hud.showCharacterInfo(characterData);
      if (this.gameScene.localPlayer) {
        this.gameScene.localPlayer.applyCharacter(characterData);
      }
    });

    this.socket.on('playerUpdated', ({ id, character }) => {
      // Update remote player's character data (and recolor them to match)
      const remotePlayer = this.gameScene.remotePlayers.get(id);
      if (remotePlayer) {
        remotePlayer.applyCharacter(character);
      }
    });

    this.socket.on('playerJoined', ({ id, position, character }) => {
      this.gameScene.addRemotePlayer(id, position, character);
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

    this.socket.on('spawnNPC', ({ id, position, health, faction }) => {
      console.log(`Spawning new NPC ${id} (${faction || 'Unknown faction'}) at position:`, position);
      this.gameScene.addNPC(id, position, faction);
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

    this.socket.on('updateHealth', ({ id, health, isAlive, isNPC, faction }) => {
      console.log(`Received health update: ${id} (${isNPC ? 'NPC' : 'Player'}) - Health: ${health}, Alive: ${isAlive}, Faction: ${faction || 'Unknown'}`);
      
      if (isNPC) {
        const npc = this.gameScene.npcs.get(id);
        if (npc) {
          const oldHealth = npc.health;
          npc.health = health;
          npc.isAlive = isAlive;

          // Update faction if provided
          if (faction && faction !== npc.faction) {
            npc.setFaction(faction);
          }

          npc.updateHealthBar();
          console.log(`NPC ${id} health changed from ${oldHealth} to ${health}`);

          npc.mesh.material.color.setHex(isAlive ? npc.getFactionColor() : DEAD_COLOR);
        }
      } else {
        const player = id === this.socket.id ?
          this.gameScene.localPlayer :
          this.gameScene.remotePlayers.get(id);

        if (player) {
          const oldHealth = player.health;
          player.applyHealthUpdate(health, isAlive);
          console.log(`Player ${id} health changed from ${oldHealth} to ${health}`);

          // Show death overlay for local player when they die
          if (id === this.socket.id && oldHealth > 0 && health <= 0) {
            console.log('Local player died, showing death overlay');
            this.gameScene.hud.showDeathOverlay();
          }
        }
      }
    });

    // Handle damage rejection (friendly fire, etc.)
    this.socket.on('damageRejected', ({ targetId, reason, message }) => {
      console.log(`Damage rejected: ${message}`);
      
      // Show a visual feedback for rejected damage
      if (reason === 'FRIENDLY_FIRE') {
        this.showFriendlyFireIndicator(message);
      }
    });
  }

  // Display a temporary message for friendly fire
  showFriendlyFireIndicator(message) {
    // Create or reuse the element
    let indicator = document.getElementById('friendly-fire-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'friendly-fire-indicator';
      indicator.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0, 0, 0, 0.7);
        color: #ff0000;
        padding: 15px 20px;
        border-radius: 5px;
        font-family: Arial, sans-serif;
        font-size: 18px;
        text-align: center;
        pointer-events: none;
        z-index: 1000;
        transition: opacity 0.5s;
      `;
      document.body.appendChild(indicator);
    }
    
    // Set the message
    indicator.textContent = message;
    indicator.style.opacity = '1';
    
    // Clear any existing timeout
    if (this.friendlyFireTimeout) {
      clearTimeout(this.friendlyFireTimeout);
    }
    
    // Hide after 2 seconds
    this.friendlyFireTimeout = setTimeout(() => {
      indicator.style.opacity = '0';
    }, 2000);
  }

  createCharacter(name, faction) {
    console.log(`Creating character: ${name} (${faction})`);
    this.socket.emit('createCharacter', { name, faction }, (response) => {
      if (response.success) {
        console.log('Character created successfully:', response.character);
        
        // Store character data in game scene
        this.gameScene.character = response.character;
        
        // Show character info in HUD
        this.gameScene.hud.showCharacterInfo(response.character);
        
        // Make local player visible and colored to match the chosen faction
        if (this.gameScene.localPlayer) {
          this.gameScene.localPlayer.mesh.visible = true;
          this.gameScene.localPlayer.applyCharacter(response.character);
          if (response.position) {
            this.gameScene.localPlayer.setPosition(response.position);
          }
        }
      } else {
        console.error('Failed to create character:', response.error);
        // Show faction selection again with error
        this.gameScene.hud.showFactionSelection();
      }
    });
  }

  sendPosition(position) {
    const now = Date.now();
    if (this._lastPositionSend && now - this._lastPositionSend < 50) return;
    this._lastPositionSend = now;
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