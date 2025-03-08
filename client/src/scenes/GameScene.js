import * as THREE from 'three';
import { Player } from '../components/Player';
import { NPC } from '../components/NPC';
import { NetworkSystem } from '../systems/Network';

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
    
    // Camera controls
    this.cameraMode = 'firstPerson';
    this.isPointerLocked = false;
    this.yaw = 0;
    this.pitch = 0;
    this.mouseSensitivity = 0.002;
    
    // Constants
    this.TOPDOWN_HEIGHT = 50;
    this.TOPDOWN_ANGLE = -Math.PI / 4;
    
    // Setup systems
    this.network = new NetworkSystem(this);
    
    // Setup event listeners
    this.setupEventListeners();
  }

  setupScene() {
    this.scene = new THREE.Scene();
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

    // Buildings
    const buildingGeometry = new THREE.BoxGeometry(10, 20, 10);
    const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });

    const building1 = new THREE.Mesh(buildingGeometry, buildingMaterial);
    building1.position.set(-20, 10, -20);
    this.scene.add(building1);

    const building2 = new THREE.Mesh(buildingGeometry, buildingMaterial);
    building2.position.set(20, 10, 20);
    this.scene.add(building2);
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

  addRemotePlayer(id, position) {
    const player = new Player(id, false);
    this.scene.add(player.mesh);
    player.setPosition(position);
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

  addNPC(id, position) {
    const npc = new NPC(id, position);
    this.scene.add(npc.mesh);
    this.npcs.set(id, npc);
  }

  updateNPC(id, position) {
    const npc = this.npcs.get(id);
    if (npc) {
      npc.setTargetPosition(position);
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

  update() {
    // Update local player
    if (this.localPlayer) {
      this.localPlayer.update(this.cameraMode, this.camera);
      this.network.sendPosition(this.localPlayer.getPosition());
    }

    // Update NPCs
    this.npcs.forEach(npc => npc.update());

    // Update projectiles
    const now = Date.now();
    this.projectiles.forEach((projectile, id) => {
      if (now - projectile.createdAt > 3000) {
        this.scene.remove(projectile);
        this.projectiles.delete(id);
      } else {
        projectile.position.add(
          projectile.direction.clone().multiplyScalar(1)
        );
      }
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