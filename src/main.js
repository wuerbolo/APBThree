import * as THREE from 'three';
import { io } from 'socket.io-client';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Camera mode settings
let cameraMode = 'firstPerson'; // 'firstPerson' or 'topDown'
const TOPDOWN_HEIGHT = 50;
const TOPDOWN_ANGLE = -Math.PI / 4; // 45 degrees

// Mouse look controls
let isPointerLocked = false;
let yaw = 0;
let pitch = 0;
const mouseSensitivity = 0.002;

// Request pointer lock on click
renderer.domElement.addEventListener('click', () => {
  if (!isPointerLocked && cameraMode === 'firstPerson') {
    renderer.domElement.requestPointerLock();
  }
});

// Handle pointer lock state changes
document.addEventListener('pointerlockchange', () => {
  isPointerLocked = document.pointerLockElement === renderer.domElement;
});

// Mouse movement handler
document.addEventListener('mousemove', (event) => {
  if (isPointerLocked && cameraMode === 'firstPerson') {
    yaw -= event.movementX * mouseSensitivity;
    pitch -= event.movementY * mouseSensitivity;
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch)); // Clamp pitch
  }
});

// Camera mode toggle
document.addEventListener('keydown', (event) => {
  if (event.key === 'v' || event.key === 'V') {
    cameraMode = cameraMode === 'firstPerson' ? 'topDown' : 'firstPerson';
    
    // If switching to top-down, exit pointer lock
    if (cameraMode === 'topDown' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
});

// Projectile management
const projectiles = new Map();
const projectileGeometry = new THREE.SphereGeometry(0.2, 8, 8);
const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const PROJECTILE_SPEED = 1;
const PROJECTILE_LIFETIME = 3000; // 3 seconds

// Handle shooting
document.addEventListener('mousedown', (event) => {
  if (event.button === 0) { // Left click only
    const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
    let direction;
    
    if (cameraMode === 'firstPerson') {
      // First-person: shoot where you're looking
      direction = new THREE.Vector3(0, 0, -1);
      direction.applyQuaternion(camera.quaternion);
    } else {
      // Top-down: shoot forward relative to screen
      direction = new THREE.Vector3(0, -0.5, -1);
      direction.normalize();
    }
    
    projectile.position.copy(localPlayer.position).add(new THREE.Vector3(0, 1.5, 0));
    projectile.direction = direction;
    projectile.createdAt = Date.now();
    
    scene.add(projectile);
    const projectileId = Date.now().toString();
    projectiles.set(projectileId, projectile);
    
    // Emit shoot event
    socket.emit('shoot', {
      id: projectileId,
      position: projectile.position.toArray(),
      direction: direction.toArray()
    });
  }
});

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
    const currentPos = npcCube.position;
    const targetPos = new THREE.Vector3(position.x, position.y, position.z);
    const lerpFactor = 0.1;
    currentPos.lerp(targetPos, lerpFactor);
  }
});

// Handle remote projectiles
socket.on('shoot', ({ id, position, direction }) => {
  if (!projectiles.has(id)) { // Don't duplicate local projectiles
    const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
    projectile.position.set(...position);
    projectile.direction = new THREE.Vector3(...direction);
    projectile.createdAt = Date.now();
    scene.add(projectile);
    projectiles.set(id, projectile);
  }
});

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

// Movement speed
const MOVE_SPEED = 0.5;

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Handle movement based on camera mode
  const moveDistance = MOVE_SPEED;

  if (cameraMode === 'firstPerson') {
    // First-person movement
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    if (keys.w || keys.ArrowUp) localPlayer.position.add(forward.multiplyScalar(moveDistance));
    if (keys.s || keys.ArrowDown) localPlayer.position.add(forward.multiplyScalar(-moveDistance));
    if (keys.d || keys.ArrowRight) localPlayer.position.add(right.multiplyScalar(moveDistance));
    if (keys.a || keys.ArrowLeft) localPlayer.position.add(right.multiplyScalar(-moveDistance));

    // Update camera position in first-person
    camera.position.copy(localPlayer.position);
    camera.position.y += 2;
  } else {
    // Top-down movement (screen-relative)
    if (keys.w || keys.ArrowUp) localPlayer.position.z -= moveDistance;
    if (keys.s || keys.ArrowDown) localPlayer.position.z += moveDistance;
    if (keys.a || keys.ArrowLeft) localPlayer.position.x -= moveDistance;
    if (keys.d || keys.ArrowRight) localPlayer.position.x += moveDistance;

    // Update camera position in top-down
    camera.position.set(
      localPlayer.position.x,
      localPlayer.position.y + TOPDOWN_HEIGHT,
      localPlayer.position.z + TOPDOWN_HEIGHT
    );
    camera.rotation.set(TOPDOWN_ANGLE, 0, 0);
  }

  // Keep player within bounds
  localPlayer.position.x = Math.max(-50, Math.min(50, localPlayer.position.x));
  localPlayer.position.z = Math.max(-50, Math.min(50, localPlayer.position.z));

  // Update projectiles
  const now = Date.now();
  projectiles.forEach((projectile, id) => {
    if (now - projectile.createdAt > PROJECTILE_LIFETIME) {
      scene.remove(projectile);
      projectiles.delete(id);
    } else {
      projectile.position.add(projectile.direction.clone().multiplyScalar(PROJECTILE_SPEED));
    }
  });

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