import * as THREE from 'three';
import { io } from 'socket.io-client';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// Ground plane (100x100)
const groundGeometry = new THREE.BoxGeometry(100, 1, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x33aa33 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.5;
scene.add(ground);

// Buildings
const buildingGeometry = new THREE.BoxGeometry(10, 20, 10);
const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });

const building1 = new THREE.Mesh(buildingGeometry, buildingMaterial);
building1.position.set(-20, 10, -20);
scene.add(building1);

const building2 = new THREE.Mesh(buildingGeometry, buildingMaterial);
building2.position.set(20, 10, 20);
scene.add(building2);

// Player and NPC geometries/materials
const playerGeometry = new THREE.BoxGeometry(2, 2, 2);
const localPlayerMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const remotePlayerMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const npcMaterial = new THREE.MeshStandardMaterial({ color: 0x0088ff });

const localPlayer = new THREE.Mesh(playerGeometry, localPlayerMaterial);
localPlayer.position.y = 1;
scene.add(localPlayer);

// Store for remote players and NPCs
const remotePlayers = new Map();
const npcs = new Map();

// Camera setup
camera.position.set(0, 30, 50);
camera.lookAt(localPlayer.position);

// Movement
const keys = {
  w: false,
  s: false,
  a: false,
  d: false,
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false
};

window.addEventListener('keydown', (e) => {
  if (keys.hasOwnProperty(e.key)) {
    keys[e.key] = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (keys.hasOwnProperty(e.key)) {
    keys[e.key] = false;
  }
});

// Socket.IO setup
const socket = io('http://localhost:3000');

socket.on('init', ({ id, position, players, npcs: initialNpcs }) => {
  console.log('Connected with ID:', id);
  localPlayer.position.set(position.x, position.y, position.z);
  
  // Create cubes for existing players
  players.forEach(([playerId, pos]) => {
    if (playerId !== id) {
      const playerCube = new THREE.Mesh(playerGeometry, remotePlayerMaterial);
      playerCube.position.set(pos.x, pos.y, pos.z);
      scene.add(playerCube);
      remotePlayers.set(playerId, playerCube);
    }
  });

  // Create cubes for NPCs
  initialNpcs.forEach(({ id, position }) => {
    const npcCube = new THREE.Mesh(playerGeometry, npcMaterial);
    npcCube.position.set(position.x, position.y, position.z);
    scene.add(npcCube);
    npcs.set(id, npcCube);
  });
});

socket.on('playerJoined', ({ id, position }) => {
  const playerCube = new THREE.Mesh(playerGeometry, remotePlayerMaterial);
  playerCube.position.set(position.x, position.y, position.z);
  scene.add(playerCube);
  remotePlayers.set(id, playerCube);
});

socket.on('playerMoved', ({ id, position }) => {
  const playerCube = remotePlayers.get(id);
  if (playerCube) {
    playerCube.position.set(position.x, position.y, position.z);
  }
});

socket.on('playerLeft', (id) => {
  const playerCube = remotePlayers.get(id);
  if (playerCube) {
    scene.remove(playerCube);
    remotePlayers.delete(id);
  }
});

// Handle NPC movement updates
socket.on('npcMoved', ({ id, position }) => {
  const npcCube = npcs.get(id);
  if (npcCube) {
    // Smoothly interpolate NPC movement
    const currentPos = npcCube.position;
    const targetPos = new THREE.Vector3(position.x, position.y, position.z);
    const lerpFactor = 0.1;

    currentPos.lerp(targetPos, lerpFactor);
  }
});

// Movement speed
const MOVE_SPEED = 0.5;

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Handle movement
  const moveDistance = MOVE_SPEED;
  if (keys.w || keys.ArrowUp) localPlayer.position.z -= moveDistance;
  if (keys.s || keys.ArrowDown) localPlayer.position.z += moveDistance;
  if (keys.a || keys.ArrowLeft) localPlayer.position.x -= moveDistance;
  if (keys.d || keys.ArrowRight) localPlayer.position.x += moveDistance;

  // Keep player within bounds
  localPlayer.position.x = Math.max(-50, Math.min(50, localPlayer.position.x));
  localPlayer.position.z = Math.max(-50, Math.min(50, localPlayer.position.z));

  // Update camera position to follow player
  camera.position.x = localPlayer.position.x;
  camera.position.z = localPlayer.position.z + 50;
  camera.lookAt(localPlayer.position);

  // Emit position update
  socket.emit('updatePosition', {
    x: localPlayer.position.x,
    y: localPlayer.position.y,
    z: localPlayer.position.z
  });

  renderer.render(scene, camera);
}

// Handle window resizing
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});

// Start the animation loop
animate(); 