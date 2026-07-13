import * as THREE from 'three';
import { Player } from '../components/Player';
import { NPC } from '../components/NPC';
import { NetworkSystem } from '../systems/Network';
import { HUD } from '../systems/HUD.js';
import { BUILDINGS, PLAZA, WORLD_SIZE, WORLD_HALF } from '../utils/collision.js';
import { sound } from '../utils/sound.js';
import { DEAD_COLOR } from '../utils/factionColors.js';

// Client-side weapon behavior; prices/ownership are validated server-side.
const WEAPONS = {
  pistol: { damage: 10, cooldown: 250, pellets: 1, spread: 0 },
  shotgun: { damage: 4, cooldown: 800, pellets: 6, spread: 0.09 }
};

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
    this.moneyPickups = new Map();
    this.character = null; // Store character data

    // Camera shake, triggered by triggerHitFeedback()
    this.shakeUntil = 0;
    this.SHAKE_DURATION = 300;

    // Weapons
    this.currentWeapon = 'pistol';
    this.lastShotTime = 0;

    // STORE building, for shop proximity checks
    this.storeBuilding = BUILDINGS.find(b => b.label === 'STORE');
    this.nearStore = false;

    // Active mission beacon (pillar of light at the current objective)
    this.missionBeacon = null;
    
    // Camera controls
    this.cameraMode = 'firstPerson';
    this.isPointerLocked = false;
    this.yaw = 0;
    this.pitch = 0;
    this.mouseSensitivity = 0.002;
    
    // Constants
    this.TOPDOWN_HEIGHT = 20; // was 50 -- way too far out to make anything out
    this.TOPDOWN_MIN_HEIGHT = 8;
    this.TOPDOWN_MAX_HEIGHT = 80; // world doubled in size, let zoom pull back further
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
    // into a black void once you're near the world boundary.
    this.scene.fog = new THREE.Fog(skyColor, 120, 300);

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
    // Camera must be in the scene graph for its children (the first-person
    // weapon viewmodel) to render.
    this.scene.add(this.camera);
    this.setupViewmodels();
  }

  // First-person weapon models parented to the camera, bottom-right of the
  // view, classic FPS style. Only one is visible at a time.
  setupViewmodels() {
    const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x6d4c33 });

    const pistol = new THREE.Group();
    const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.4), gunMaterial);
    const pBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), gunMaterial);
    pBarrel.position.set(0, 0.05, -0.3);
    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.14), woodMaterial);
    pGrip.position.set(0, -0.17, 0.12);
    pGrip.rotation.x = 0.3;
    pistol.add(pBody, pBarrel, pGrip);
    pistol.position.set(0.45, -0.4, -0.9);

    const shotgun = new THREE.Group();
    const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.55), gunMaterial);
    const sBarrelL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.6), gunMaterial);
    sBarrelL.position.set(-0.045, 0.05, -0.5);
    const sBarrelR = sBarrelL.clone();
    sBarrelR.position.x = 0.045;
    const sStock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.35), woodMaterial);
    sStock.position.set(0, -0.06, 0.4);
    sStock.rotation.x = 0.15;
    shotgun.add(sBody, sBarrelL, sBarrelR, sStock);
    shotgun.position.set(0.45, -0.42, -0.85);
    shotgun.visible = false;

    this.camera.add(pistol, shotgun);
    this.viewmodels = { pistol, shotgun };
  }

  // Keep the viewmodel/crosshair in sync with camera mode, equipped weapon
  // and alive state. Called every frame; cheap (just visibility flags).
  updateViewmodel() {
    const inFirstPerson = this.cameraMode === 'firstPerson'
      && this.isLocalPlayerAlive()
      && this.localPlayer.mesh.visible;
    this.viewmodels.pistol.visible = inFirstPerson && this.currentWeapon === 'pistol';
    this.viewmodels.shotgun.visible = inFirstPerson && this.currentWeapon === 'shotgun';
    this.hud.setCrosshairVisible(inFirstPerson);
  }

  setupLights() {
    // Hemisphere light (sky tint from above, ground bounce from below)
    // reads much better than flat ambient for the same cost.
    const hemiLight = new THREE.HemisphereLight(0xcfe5f0, 0x8a8577, 0.85);
    this.scene.add(hemiLight);

    const directionalLight = new THREE.DirectionalLight(0xfff2d9, 0.9);
    directionalLight.position.set(40, 80, 20);
    this.scene.add(directionalLight);
  }

  setupEnvironment() {
    // Ground -- pastel cement rather than grass
    const groundGeometry = new THREE.BoxGeometry(WORLD_SIZE, 1, WORLD_SIZE);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xbdb9ae });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = -0.5;
    this.scene.add(ground);

    // Plaza pavement (purely cosmetic -- the monument's collision box lives
    // in BUILDINGS below).
    const plazaGeometry = new THREE.BoxGeometry(PLAZA.size, 0.15, PLAZA.size);
    const plazaMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d3c4 });
    const plaza = new THREE.Mesh(plazaGeometry, plazaMaterial);
    plaza.position.set(PLAZA.x, 0.08, PLAZA.z);
    this.scene.add(plaza);

    // Buildings (collision bounds for these live in utils/collision.js).
    // One tiny shared canvas draws a single window; RepeatWrapping tiles it
    // into a facade grid per building, so the whole city costs one extra
    // texture. The map multiplies the building color, so windows read as
    // dark glass on whatever the wall color is. Sides get windows;
    // roof/underside stay plain via a per-face material array.
    const windowCanvas = document.createElement('canvas');
    windowCanvas.width = 64;
    windowCanvas.height = 64;
    const wctx = windowCanvas.getContext('2d');
    wctx.fillStyle = '#ffffff';
    wctx.fillRect(0, 0, 64, 64);
    wctx.fillStyle = '#26313d';
    wctx.fillRect(14, 12, 36, 38);
    const baseWindowTexture = new THREE.CanvasTexture(windowCanvas);

    BUILDINGS.forEach(building => {
      const geometry = new THREE.BoxGeometry(
        building.halfWidth * 2,
        building.height,
        building.halfDepth * 2
      );
      const color = building.color || 0x888888;

      const sideTexture = baseWindowTexture.clone();
      sideTexture.needsUpdate = true;
      sideTexture.wrapS = THREE.RepeatWrapping;
      sideTexture.wrapT = THREE.RepeatWrapping;
      sideTexture.repeat.set(
        Math.max(1, Math.round((building.halfWidth * 2) / 3)),
        Math.max(1, Math.round(building.height / 3))
      );

      const sideMaterial = new THREE.MeshStandardMaterial({ color, map: sideTexture });
      const plainMaterial = new THREE.MeshStandardMaterial({ color });
      // BoxGeometry face order: +x, -x, +y (roof), -y, +z, -z
      const mesh = new THREE.Mesh(geometry, [
        sideMaterial, sideMaterial, plainMaterial, plainMaterial, sideMaterial, sideMaterial
      ]);
      mesh.position.set(building.x, building.height / 2, building.z);
      this.scene.add(mesh);

      if (building.label) {
        const label = this.createBuildingLabel(building.label);
        label.position.set(building.x, building.height + 3, building.z);
        this.scene.add(label);
      }
    });

    this.setupProps();
  }

  // Low-poly street dressing: roads, trees, benches, trash cans. All props
  // share geometries/materials (clone() reuses them), and the whole set is
  // a few dozen meshes total -- cheap enough that instancing isn't worth
  // the complexity yet. Props have no collision on purpose: trunks are
  // thin, and per-prop AABBs would complicate NPC pathing for little gain.
  setupProps() {
    // Roads: one east-west through the center, one north-south past the
    // STORE. Thin boxes slightly above the ground to avoid z-fighting.
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x4f4f52 });
    const roadEW = new THREE.Mesh(new THREE.BoxGeometry(WORLD_SIZE, 0.06, 8), roadMaterial);
    roadEW.position.set(0, 0.03, 0);
    this.scene.add(roadEW);
    const roadNS = new THREE.Mesh(new THREE.BoxGeometry(8, 0.06, WORLD_SIZE), roadMaterial);
    roadNS.position.set(20, 0.03, 0);
    this.scene.add(roadNS);

    // Tree template
    const trunkGeometry = new THREE.CylinderGeometry(0.25, 0.35, 2, 6);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6d4c33 });
    const leavesGeometry = new THREE.IcosahedronGeometry(1.5, 0);
    const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x4a7c3f, flatShading: true });
    const treeTemplate = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 1;
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.y = 2.8;
    treeTemplate.add(trunk, leaves);

    // Deterministic placement (seeded PRNG) so every client renders the
    // same map, skipping roads, plaza and building footprints.
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const isClear = (x, z) => {
      if (Math.abs(z) < 7) return false;
      if (Math.abs(x - 20) < 7) return false;
      if (Math.abs(x - PLAZA.x) < 15 && Math.abs(z - PLAZA.z) < 15) return false;
      for (const b of BUILDINGS) {
        if (Math.abs(x - b.x) < b.halfWidth + 4 && Math.abs(z - b.z) < b.halfDepth + 4) return false;
      }
      return true;
    };

    let placed = 0;
    let attempts = 0;
    while (placed < 30 && attempts < 400) {
      attempts++;
      const x = rand() * (WORLD_SIZE - 10) - (WORLD_HALF - 5);
      const z = rand() * (WORLD_SIZE - 10) - (WORLD_HALF - 5);
      if (!isClear(x, z)) continue;
      const tree = treeTemplate.clone();
      const scale = 0.8 + rand() * 0.6;
      tree.scale.setScalar(scale);
      tree.position.set(x, 0, z);
      tree.rotation.y = rand() * Math.PI * 2;
      this.scene.add(tree);
      placed++;
    }

    // Bench template: seat, backrest, leg slab
    const benchWood = new THREE.MeshStandardMaterial({ color: 0x8a6642 });
    const benchTemplate = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.7), benchWood);
    seat.position.y = 0.55;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.1), benchWood);
    back.position.set(0, 0.95, -0.3);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.5), new THREE.MeshStandardMaterial({ color: 0x3c3c3c }));
    legs.position.y = 0.27;
    benchTemplate.add(seat, back, legs);

    // Four benches around the plaza facing the monument
    const benchSpots = [
      { x: PLAZA.x, z: PLAZA.z - 10, ry: Math.PI },
      { x: PLAZA.x, z: PLAZA.z + 10, ry: 0 },
      { x: PLAZA.x - 10, z: PLAZA.z, ry: -Math.PI / 2 },
      { x: PLAZA.x + 10, z: PLAZA.z, ry: Math.PI / 2 }
    ];
    benchSpots.forEach(spot => {
      const bench = benchTemplate.clone();
      bench.position.set(spot.x, 0, spot.z);
      bench.rotation.y = spot.ry;
      this.scene.add(bench);
    });

    // Trash cans near points of interest. (Look the STORE up locally --
    // setupProps runs from the constructor before this.storeBuilding is set.)
    const store = BUILDINGS.find(b => b.label === 'STORE');
    const trashGeometry = new THREE.CylinderGeometry(0.45, 0.4, 1.1, 8);
    const trashMaterial = new THREE.MeshStandardMaterial({ color: 0x3d5245 });
    const trashSpots = [
      { x: store.x + 8, z: store.z },
      { x: PLAZA.x - 11, z: PLAZA.z - 11 },
      { x: PLAZA.x + 11, z: PLAZA.z + 11 },
      { x: -70, z: -50 },
      { x: 26, z: 10 },
      { x: 14, z: -12 }
    ];
    trashSpots.forEach(spot => {
      const trash = new THREE.Mesh(trashGeometry, trashMaterial);
      trash.position.set(spot.x, 0.55, spot.z);
      this.scene.add(trash);
    });
  }

  // A billboard sprite so labels like "STORE" stay readable from both
  // first-person and top-down camera modes. Canvas is sized to the text
  // itself so longer labels ("ENFORCER HQ") don't get clipped.
  createBuildingLabel(text) {
    const font = 'bold 40px Arial';
    const paddingX = 24;

    const measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    const textWidth = measureCtx.measureText(text).width;

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(textWidth) + paddingX * 2;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    const spriteHeight = 3;
    sprite.scale.set(spriteHeight * (canvas.width / canvas.height), spriteHeight, 1);
    return sprite;
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
      if (this.isPointerLocked && this.cameraMode === 'firstPerson' && this.isLocalPlayerAlive()) {
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
      if ((event.key === 'v' || event.key === 'V') && this.isLocalPlayerAlive()) {
        this.cameraMode = this.cameraMode === 'firstPerson' ? 'topDown' : 'firstPerson';
        if (this.cameraMode === 'topDown' && document.pointerLockElement) {
          document.exitPointerLock();
        }
      }
      // Weapon switching
      if (event.key === '1') this.equipWeapon('pistol');
      if (event.key === '2') this.equipWeapon('shotgun');
      // Shop (only near the STORE)
      if ((event.key === 'e' || event.key === 'E') && this.isLocalPlayerAlive()) {
        if (this.hud.isShopOpen()) {
          this.hud.closeShop();
        } else if (this.nearStore) {
          this.hud.openShop(this.character);
        }
      }
      // Accept a pending mission offer
      if ((event.key === 'm' || event.key === 'M') && this.isLocalPlayerAlive()) {
        if (this.hud.hasPendingMissionOffer()) {
          this.network.socket.emit('missionAccept');
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

  isLocalPlayerAlive() {
    return !!this.localPlayer && this.localPlayer.isAlive;
  }

  // Shared tracer assets -- one geometry/material for every bullet in the
  // scene instead of allocating new ones per shot.
  static TRACER_GEOMETRY = new THREE.BoxGeometry(0.07, 0.07, 0.6);
  static TRACER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xffd54a });

  createTracerMesh(position, direction) {
    const mesh = new THREE.Mesh(GameScene.TRACER_GEOMETRY, GameScene.TRACER_MATERIAL);
    mesh.position.copy(position);
    // Align the elongated axis with the flight direction
    mesh.lookAt(position.x + direction.x, position.y + direction.y, position.z + direction.z);
    mesh.direction = direction;
    mesh.createdAt = Date.now();
    return mesh;
  }

  equipWeapon(weaponId) {
    if (!this.isLocalPlayerAlive()) return;
    if (!WEAPONS[weaponId]) return;
    if (weaponId !== 'pistol') {
      const owned = this.character && Array.isArray(this.character.weapons)
        && this.character.weapons.includes(weaponId);
      if (!owned) return;
    }
    this.currentWeapon = weaponId;
    this.hud.updateWeaponStat(weaponId);
  }

  handleShot(event) {
    if (event.button !== 0) return; // Left click only
    if (!this.isLocalPlayerAlive()) return;
    if (this.hud.isShopOpen()) return;

    const weapon = WEAPONS[this.currentWeapon];
    const now = Date.now();
    if (now - this.lastShotTime < weapon.cooldown) return;
    this.lastShotTime = now;

    let baseDirection;
    if (this.cameraMode === 'firstPerson') {
      baseDirection = new THREE.Vector3(0, 0, -1);
      baseDirection.applyQuaternion(this.camera.quaternion);
    } else {
      baseDirection = new THREE.Vector3(0, -0.5, -1);
      baseDirection.normalize();
    }

    const origin = this.localPlayer.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    const pellets = [];

    for (let i = 0; i < weapon.pellets; i++) {
      const direction = baseDirection.clone();
      if (weapon.spread > 0) {
        direction.x += (Math.random() - 0.5) * weapon.spread * 2;
        direction.y += (Math.random() - 0.5) * weapon.spread * 2;
        direction.z += (Math.random() - 0.5) * weapon.spread * 2;
        direction.normalize();
      }

      const mesh = this.createTracerMesh(origin, direction);
      mesh.damage = weapon.damage;
      // Only the shooter's client reports damage for its own projectiles;
      // observers just render them.
      mesh.isLocal = true;
      this.scene.add(mesh);

      const projectileId = `${now}-${i}-${Math.floor(Math.random() * 1e6)}`;
      this.projectiles.set(projectileId, mesh);
      pellets.push({
        id: projectileId,
        position: mesh.position.toArray(),
        direction: direction.toArray()
      });
    }

    if (this.currentWeapon === 'shotgun') {
      sound.shootShotgun();
    } else {
      sound.shootPistol();
    }

    this.network.sendShot({ weapon: this.currentWeapon, pellets });
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
    
    // Store character data if available, and recolor to match their faction
    if (characterData) {
      player.applyCharacter(characterData);
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

  // Cash dropped by a killed Civilian -- walk over it to collect. Bounces
  // gently in place so it's easy to spot on the ground.
  addMoneyPickup(id, position) {
    const geometry = new THREE.BoxGeometry(0.6, 0.3, 0.9);
    const material = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
    const mesh = new THREE.Mesh(geometry, material);
    const baseY = 0.3;
    mesh.position.set(position.x, baseY, position.z);
    this.scene.add(mesh);
    this.moneyPickups.set(id, { mesh, baseY, spawnTime: Date.now() });
  }

  removeMoneyPickup(id) {
    const pickup = this.moneyPickups.get(id);
    if (pickup) {
      this.scene.remove(pickup.mesh);
      this.moneyPickups.delete(id);
    }
  }

  // Tall translucent pillar marking the current mission objective, visible
  // from anywhere; optional bouncing "package" at its base.
  setMissionBeacon(beacon) {
    this.clearMissionBeacon();
    if (!beacon) return;

    const group = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe082,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    pillar.position.y = 30;
    group.add(pillar);

    if (beacon.package) {
      const pkg = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.6, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xffc107 })
      );
      pkg.position.y = 0.6;
      group.add(pkg);
      group.userData.package = pkg;
    }

    group.position.set(beacon.x, 0, beacon.z);
    this.scene.add(group);
    this.missionBeacon = group;
  }

  clearMissionBeacon() {
    if (this.missionBeacon) {
      this.scene.remove(this.missionBeacon);
      this.missionBeacon = null;
    }
  }

  // Screen shake + red flash + a shove away from the attacker, triggered by
  // the local player taking damage.
  triggerHitFeedback(attackerPosition) {
    this.shakeUntil = Date.now() + this.SHAKE_DURATION;
    this.hud.flashDamage();
    sound.hit();

    if (this.localPlayer && attackerPosition) {
      const dx = this.localPlayer.mesh.position.x - attackerPosition.x;
      const dz = this.localPlayer.mesh.position.z - attackerPosition.z;
      const distance = Math.sqrt(dx * dx + dz * dz) || 1;
      this.localPlayer.applyKnockback((dx / distance) * 0.6, (dz / distance) * 0.6);
    }
  }

  handleRemoteShot(id, position, direction) {
    if (!this.projectiles.has(id)) {
      const pos = new THREE.Vector3(...position);
      const dir = new THREE.Vector3(...direction);
      const mesh = this.createTracerMesh(pos, dir);
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
      // Server picks the position (HQ for Enforcers, anywhere for
      // Criminals) and echoes it back via 'playerRespawned'.
      this.network.socket.emit('respawn');
      this.localPlayer.respawn();
    }
  }

  update() {
    // Update local player
    if (this.localPlayer) {
      const otherPositions = [];
      this.remotePlayers.forEach(player => {
        if (player.isAlive) otherPositions.push(player.mesh.position);
      });
      this.npcs.forEach(npc => {
        if (npc.isAlive) otherPositions.push(npc.mesh.position);
      });

      this.localPlayer.update(this.cameraMode, this.camera, otherPositions);
      this.network.sendPosition(this.localPlayer.getPosition());
      this.hud.updateHealthStat(this.localPlayer.health);

      // STORE proximity: show/hide the "press E" prompt
      const sdx = this.localPlayer.mesh.position.x - this.storeBuilding.x;
      const sdz = this.localPlayer.mesh.position.z - this.storeBuilding.z;
      const nearStoreNow = Math.sqrt(sdx * sdx + sdz * sdz) < 14;
      if (nearStoreNow !== this.nearStore) {
        this.nearStore = nearStoreNow;
        if (nearStoreNow) {
          this.hud.showShopPrompt();
        } else {
          this.hud.hideShopPrompt();
          this.hud.closeShop();
        }
      }
    }

    this.updateViewmodel();

    // Update NPCs
    this.npcs.forEach(npc => npc.update(this.camera));

    // Characters rotate to face their movement direction now, so remote
    // players' health bars need re-billboarding every frame too.
    this.remotePlayers.forEach(player => player.updateHealthBarRotation(this.camera));

    // Update projectiles
    const now = Date.now();
    this.projectiles.forEach((projectile, id) => {
      // Check if projectile is out of bounds
      if (projectile.position.length() > WORLD_HALF * 2) {
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
          // Only the shooter's own projectiles report damage -- otherwise
          // every observing client would double-report the same hit.
          if (projectile.isLocal) {
            this.network.sendDamage({
              targetId: player.id,
              amount: projectile.damage || 10,
              isNPC: false
            });
          }

          // Visual feedback -- revert to the *computed* faction color rather
          // than whatever's on the material right now. With a multi-pellet
          // weapon several pellets can hit the same target in one frame;
          // capturing "current color" as the original would just capture
          // the flash color a sibling pellet had already applied, and the
          // target would get stuck flashed. A single timer per target also
          // avoids a pile of pending reverts firing out of order.
          clearTimeout(player._hitFlashTimer);
          player.setBodyColorHex(0xffff00);
          player._hitFlashTimer = setTimeout(() => {
            player.setBodyColorHex(player.isAlive ? player.getFactionColor() : DEAD_COLOR);
          }, 100);

          // Remove projectile
          this.scene.remove(projectile);
          this.projectiles.delete(id);
        }
      });

      // Check NPCs
      this.npcs.forEach((npc) => {
        if (npc.isAlive && projectile.position.distanceTo(npc.mesh.position) < hitRadius) {
          if (projectile.isLocal) {
            this.network.sendDamage({
              targetId: npc.id,
              amount: projectile.damage || 10,
              isNPC: true
            });
          }

          // Visual feedback (see comment on the player branch above)
          clearTimeout(npc._hitFlashTimer);
          npc.setBodyColorHex(0xff0000);
          npc._hitFlashTimer = setTimeout(() => {
            npc.setBodyColorHex(npc.isAlive ? npc.getFactionColor() : DEAD_COLOR);
          }, 100);

          // Remove projectile
          this.scene.remove(projectile);
          this.projectiles.delete(id);
        }
      });
    });

    // Animate the mission beacon package, if any
    if (this.missionBeacon && this.missionBeacon.userData.package) {
      const pkg = this.missionBeacon.userData.package;
      pkg.rotation.y += 0.03;
      pkg.position.y = 0.6 + Math.abs(Math.sin(Date.now() / 400)) * 0.3;
    }

    // Animate and collect money pickups
    this.moneyPickups.forEach((pickup, id) => {
      const elapsed = (Date.now() - pickup.spawnTime) / 1000;
      pickup.mesh.position.y = pickup.baseY + Math.abs(Math.sin(elapsed * 3)) * 0.35;
      pickup.mesh.rotation.y += 0.03;

      if (this.localPlayer) {
        const collectRadius = 2;
        const dx = this.localPlayer.mesh.position.x - pickup.mesh.position.x;
        const dz = this.localPlayer.mesh.position.z - pickup.mesh.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < collectRadius) {
          this.network.socket.emit('collectMoney', id);
          this.removeMoneyPickup(id);
          sound.pickup();
        }
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

      // Hit shake -- decaying random jitter for the remainder of SHAKE_DURATION
      const shakeRemaining = this.shakeUntil - Date.now();
      if (shakeRemaining > 0) {
        const intensity = (shakeRemaining / this.SHAKE_DURATION) * 0.3;
        this.camera.position.x += (Math.random() - 0.5) * intensity;
        this.camera.position.y += (Math.random() - 0.5) * intensity;
        this.camera.position.z += (Math.random() - 0.5) * intensity;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
} 