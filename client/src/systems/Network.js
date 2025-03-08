import { io } from 'socket.io-client';

export class NetworkSystem {
  constructor(gameScene) {
    this.gameScene = gameScene;
    this.socket = io('http://localhost:3000');
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
  }

  sendPosition(position) {
    this.socket.emit('updatePosition', position);
  }

  sendShot(data) {
    this.socket.emit('shoot', data);
  }
} 