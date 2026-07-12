import * as THREE from 'three';
import { Player } from '../components/Player';
import { NPC } from '../components/NPC';
import { NetworkSystem } from '../systems/Network';
import { HUD } from '../systems/HUD.js';
import { BUILDINGS } from '../utils/collision.js';

export class GameScene {
  constructor() {
    this.setupScene();
    this.setupCamera();
    this.setupLights();
    this.setupEnvironment();
    
    // Game state
    this.localPlayer = null;
    this.remotePlayers = new Map();
    this.npcs = new Map();
    this.projectiles = new Map();
    this.character = null; // Store character data
    
    // Camera controls
    this.cameraMode = 'firstPerson';
    this.isPointerLocked = false;
    this.yaw = 0;
    this.pitch = 0;
    this.mouseSensitivity = 0.002;
    
    // Constants
    this.TOPDOWN_HEIGHT = 20; // was 50 -- way too far out to make anything out
    this.TOPDOWN_MIN_HEIGHT = 8;
    this.TOPDOWN_MAX_HEIGHT = 50;
    this.TOPDOWN_ANGLE = -Math.PI / 4;
    
    // Setup systems
    this.network = new NetworkSystem(this);
    this.hud = new HUD(this);
    
    // Setup event listeners
    this.setupEventListeners();
    this.initNetworkHandlers();
  }

  setupScene() {
    this.scene = new THREE.Scene();
    const skyColor = 0x87ceeb;
    this.scene.background = new THREE.Color(skyColor);
    // Fades the ground's edge into the sky color instead of cutting off
    // into a black void once you're near the 100-unit world boundary.
    this.scene.fog = new THREE.Fog(skyColor, 60, 150);

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);
  }

  setupEnvironment() {
    // Ground
    const groundGeometry = new THREE.BoxGeometry(100, 1, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x33aa33 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = -0.5;
    this.scene.add(ground);

    // Buildings (collision bounds for these live in utils/collision.js)
    const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });

    BUILDINGS.forEach(building => {
      const geometry = new THREE.BoxGeometry(
        building.halfWidth * 2,
        building.height,
        building.halfDepth * 2
      );
      const mesh = new THREE.Mesh(geometry, buildingMaterial);
      mesh.position.set(building.x, building.height / 2, building.z);
      this.scene.add(mesh);
    });
  }

  setupEventListeners() {
    // Mouse controls
    this.renderer.domElement.addEventListener('click', () => {
      if (!this.isPointerLocked && this.cameraMode === 'firstPerson') {
        this.renderer.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    });

    document.addEventListener('mousemove', (event) => {
      if (this.isPointerLocked && this.cameraMode === 'firstPerson') {
        this.yaw -= event.movementX * this.mouseSensitivity;
        this.pitch -= event.movementY * this.mouseSensitivity;
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
      }
    });

    // Keyboard controls
    window.addEventListener('keydown', (event) => {
      if (this.localPlayer) {
        this.localPlayer.handleKeyDown(event);
      }
      // Camera mode toggle
      if (event.key === 'v' || event.key === 'V') {
        this.cameraMode = this.cameraMode === 'firstPerson' ? 'topDown' : 'firstPerson';
        if (this.cameraMode === 'topDown' && document.pointerLockElement) {
          document.exitPointerLock();
        }
      }
    });

    window.addEventListener('keyup', (event) => {
      if (this.localPlayer) {
        this.localPlayer.handleKeyUp(event);
      }
    });

    // Shooting
    document.addEventListener('mousedown', this.handleShot.bind(this));

    // Zoom the top-down camera in/out with the scroll wheel
    document.addEventListener('wheel', (event) => {
      if (this.cameraMode !== 'topDown') return;
      this.TOPDOWN_HEIGHT = Math.max(
        this.TOPDOWN_MIN_HEIGHT,
        Math.min(this.TOPDOWN_MAX_HEIGHT, this.TOPDOWN_HEIGHT + event.deltaY * 0.05)
      );
    });

    // Window resize
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    });
  }

  handleShot(event) {
    if (event.button !== 0) return; // Left click only

    const projectile = {
      geometry: new THREE.SphereGeometry(0.2, 8, 8),
      material: new THREE.MeshBasicMaterial({ color: 0xff0000 }),
      speed: 1,
      lifetime: 3000
    };

    const mesh = new THREE.Mesh(projectile.geometry, projectile.material);
    let direction;

    if (this.cameraMode === 'firstPerson') {
      direction = new THREE.Vector3(0, 0, -1);
      direction.applyQuaternion(this.camera.quaternion);
    } else {
      direction = new THREE.Vector3(0, -0.5, -1);
      direction.normalize();
    }

    mesh.position.copy(this.localPlayer.mesh.position).add(new THREE.Vector3(0, 1.5, 0));
    mesh.direction = direction;
    mesh.createdAt = Date.now();

    this.scene.add(mesh);
    const projectileId = Date.now().toString();
    this.projectiles.set(projectileId, mesh);

    this.network.sendShot({
      id: projectileId,
      position: mesh.position.toArray(),
      direction: direction.toArray()
    });
  }

  initLocalPlayer(id, position) {
    this.localPlayer = new Player(id, true);
    this.scene.add(this.localPlayer.mesh);
    this.localPlayer.setPosition(position);
  }

  addRemotePlayer(id, position, characterData) {
    const player = new Player(id, false);
    this.scene.add(player.mesh);
    player.setPosition(position);
    
    // Store character data if available
    if (characterData) {
      player.character = characterData;
    }
    
    this.remotePlayers.set(id, player);
  }

  updateRemotePlayer(id, position) {
    const player = this.remotePlayers.get(id);
    if (player) {
      player.setPosition(position);
    }
  }

  removeRemotePlayer(id) {
    const player = this.remotePlayers.get(id);
    if (player) {
      this.scene.remove(player.mesh);
      this.remotePlayers.delete(id);
    }
  }

  addNPC(id, position, faction = "Civilian") {
    const npc = new NPC(id, position, faction);
    this.scene.add(npc.mesh);
    this.npcs.set(id, npc);
  }

  updateNPC(id, position) {
    const npc = this.npcs.get(id);
    if (npc) {
      npc.setPosition(position);
    }
  }

  handleRemoteShot(id, position, direction) {
    if (!this.projectiles.has(id)) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      mesh.position.set(...position);
      mesh.direction = new THREE.Vector3(...direction);
      mesh.createdAt = Date.now();
      this.scene.add(mesh);
      this.projectiles.set(id, mesh);
    }
  }

  initNetworkHandlers() {
    // Only handle respawn events here since health updates are handled in NetworkSystem
    this.network.socket.on('playerRespawned', ({ id, position }) => {
      const player = id === this.network.socket.id ? 
        this.localPlayer : 
        this.remotePlayers.get(id);
      
      if (player) {
        player.respawn();
        player.mesh.position.copy(position);
      }
    });
  }

  handleRespawn() {
    if (this.localPlayer) {
      // Generate new position
      const x = Math.random() * 80 - 40; // -40 to 40
      const z = Math.random() * 80 - 40; // -40 to 40
      const position = { x, y: 1, z };
      
      // Send respawn request to server
      this.network.socket.emit('respawn', position);
      
      // Update local position immediately
      this.localPlayer.setPosition(position);
      this.localPlayer.respawn();
    }
  }

  update() {
    // Update local player
    if (this.localPlayer) {
      this.localPlayer.update(this.cameraMode, this.camera);
      this.network.sendPosition(this.localPlayer.getPosition());
    }

    // Update NPCs
    this.npcs.forEach(npc => npc.update(this.camera));

    // Update projectiles
    const now = Date.now();
    this.projectiles.forEach((projectile, id) => {
      // Check if projectile is out of bounds
      if (projectile.position.length() > 100) {
        this.scene.remove(projectile);
        this.projectiles.delete(id);
        return;
      }

      // Check if projectile has expired
      if (now - projectile.createdAt > 3000) {
        this.scene.remove(projectile);
        this.projectiles.delete(id);
        return;
      }

      // Move projectile
      projectile.position.add(
        projectile.direction.clone().multiplyScalar(1)
      );

      // Check for collisions with players and NPCs
      const hitRadius = 1; // Collision radius

      // Check remote players
      this.remotePlayers.forEach((player) => {
        if (player.isAlive && projectile.position.distanceTo(player.mesh.position) < hitRadius) {
          console.log(`Detected collision with player ${player.id} at distance ${projectile.position.distanceTo(player.mesh.position)}`);
          
          // Send damage event first
          this.network.sendDamage({
            targetId: player.id,
            amount: 10,
            isNPC: false
          });

          // Visual feedback
          const originalColor = player.mesh.material.color.clone();
          player.mesh.material.color.setHex(0xffff00);
          
          setTimeout(() => {
            player.mesh.material.color.copy(originalColor);
          }, 100);

          // Remove projectile
          this.scene.remove(projectile);
          this.projectiles.delete(id);
        }
      });

      // Check NPCs
      this.npcs.forEach((npc) => {
        if (npc.isAlive && projectile.position.distanceTo(npc.mesh.position) < hitRadius) {
          console.log(`Detected collision with NPC ${npc.id} at distance ${projectile.position.distanceTo(npc.mesh.position)}`);
          
          // Send damage event first
          this.network.sendDamage({
            targetId: npc.id,
            amount: 10,
            isNPC: true
          });

          // Visual feedback
          const originalColor = npc.mesh.material.color.clone();
          npc.mesh.material.color.setHex(0xff0000);
          
          setTimeout(() => {
            npc.mesh.material.color.copy(originalColor);
          }, 100);

          // Remove projectile
          this.scene.remove(projectile);
          this.projectiles.delete(id);
        }
      });
    });

    // Update camera
    if (this.localPlayer) {
      if (this.cameraMode === 'firstPerson') {
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
        this.camera.position.copy(this.localPlayer.mesh.position);
        this.camera.position.y += 2;
      } else {
        this.camera.position.set(
          this.localPlayer.mesh.position.x,
          this.localPlayer.mesh.position.y + this.TOPDOWN_HEIGHT,
          this.localPlayer.mesh.position.z + this.TOPDOWN_HEIGHT
        );
        this.camera.rotation.set(this.TOPDOWN_ANGLE, 0, 0);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
} 