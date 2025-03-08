import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Serve static files from the dist directory after building
app.use(express.static('dist'));

// Store connected players and NPCs
const players = new Map();
const npcs = new Map();

// NPC configuration
const NUM_NPCS = 5;
const NPC_SPEED = 0.2;
const NPC_UPDATE_INTERVAL = 50; // milliseconds
const GROUND_SIZE = 100;
const GROUND_HALF = GROUND_SIZE / 2;

// Initialize NPCs with random positions
for (let i = 0; i < NUM_NPCS; i++) {
  const npcId = `npc-${i}`;
  const position = {
    x: (Math.random() * GROUND_SIZE) - GROUND_HALF,
    y: 1,
    z: (Math.random() * GROUND_SIZE) - GROUND_HALF
  };
  
  npcs.set(npcId, {
    position,
    targetPosition: getNewTargetPosition(),
    moveTimeout: null
  });
}

// Helper function to get a new random target position
function getNewTargetPosition() {
  return {
    x: (Math.random() * GROUND_SIZE) - GROUND_HALF,
    y: 1,
    z: (Math.random() * GROUND_SIZE) - GROUND_HALF
  };
}

// Update NPC positions
function updateNPCs() {
  npcs.forEach((npc, npcId) => {
    const { position, targetPosition } = npc;
    
    // Calculate direction vector
    const dx = targetPosition.x - position.x;
    const dz = targetPosition.z - position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance < NPC_SPEED) {
      // NPC reached target, set new target
      npc.targetPosition = getNewTargetPosition();
    } else {
      // Move NPC towards target
      position.x += (dx / distance) * NPC_SPEED;
      position.z += (dz / distance) * NPC_SPEED;
      
      // Broadcast NPC position update
      io.emit('npcMoved', {
        id: npcId,
        position: position
      });
    }
  });
}

// Start NPC update loop
setInterval(updateNPCs, NPC_UPDATE_INTERVAL);

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Assign initial position based on number of players
  const isFirstPlayer = players.size === 0;
  const initialPosition = {
    x: isFirstPlayer ? -40 : 40,
    y: 1,
    z: 0
  };

  // Add new player to the players map
  players.set(socket.id, initialPosition);

  // Send initial state to the new player
  socket.emit('init', {
    id: socket.id,
    position: initialPosition,
    players: Array.from(players.entries()),
    npcs: Array.from(npcs.entries()).map(([id, npc]) => ({
      id,
      position: npc.position
    }))
  });

  // Broadcast new player to all other players
  socket.broadcast.emit('playerJoined', {
    id: socket.id,
    position: initialPosition
  });

  // Handle position updates
  socket.on('updatePosition', (position) => {
    players.set(socket.id, position);
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      position
    });
  });

  // Handle shooting
  socket.on('shoot', (data) => {
    // Broadcast the shot to all other players
    socket.broadcast.emit('shoot', {
      ...data,
      playerId: socket.id
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    players.delete(socket.id);
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 