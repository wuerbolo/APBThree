import { Server } from 'socket.io';
import { PlayerModel } from '../models/PlayerModel';
import { NPCModel } from '../models/NPCModel';

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
          position: npc.getPosition()
        }))
      });

      // Broadcast new player
      socket.broadcast.emit('playerJoined', {
        id: socket.id,
        position: initialPosition
      });

      // Handle position updates
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

      // Handle shooting
      socket.on('shoot', (data) => {
        socket.broadcast.emit('shoot', {
          ...data,
          playerId: socket.id
        });
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
        this.io.emit('npcMoved', {
          id,
          position: newPosition
        });
      });
    }, 50); // Update every 50ms
  }
} 