import * as THREE from 'three';
import { Player } from '../components/Player';
import { NPC } from '../components/NPC';
import { NetworkSystem } from '../systems/Network';
import { HUD } from '../systems/HUD.js';
import { BUILDINGS, PLAZA, WORLD_SIZE, WORLD_HALF, JAIL, MISSION_CONTACTS, CONTACT_INTERACT_RADIUS } from '../utils/collision.js';
import { sound } from '../utils/sound.js';
import { DEAD_COLOR, getFactionColor } from '../utils/factionColors.js';
import { buildCharacterMesh } from '../utils/characterModel.js';

// Client-side weapon behavior; prices/ownership are validated server-side.
// auto: hold left click to keep firing. speed: projectile velocity
// multiplier. zoom: right-click to aim down sights (narrow FOV).
const WEAPONS = {
  pistol: { damage: 10, cooldown: 250, pellets: 1, spread: 0 },
  shotgun: { damage: 4, cooldown: 800, pellets: 6, spread: 0.09 },
  smg: { damage: 4, cooldown: 90, pellets: 1, spread: 0.035, auto: true },
  sniper: { damage: 50, cooldown: 1500, pellets: 1, spread: 0, speed: 2.5, zoom: true }
};

const WEAPON_KEYS = { '1': 'pistol', '2': 'shotgun', '3': 'smg', '4': 'sniper' };
const INTERACT_RADIUS = 4;
// Purely cosmetic shove applied to an NPC on every pellet that lands.
// This is the peak *offset* in world units (it eases back to zero over a
// few frames) -- small enough to read as a flinch, not a launch. Shotgun
// pellets stack, so a point-blank blast shoves noticeably harder.
const NPC_KNOCKBACK_FORCE = 0.5;

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
    this.mouseDown = false; // for auto-fire weapons
    this.zoomed = false;    // sniper aim-down-sights

    // STORE building, for shop proximity checks
    this.storeBuilding = BUILDINGS.find(b => b.label === 'STORE');
    this.nearStore = false;

    // Active mission beacon (pillar of light at the current objective)
    this.missionBeacon = null;

    // World interactables
    this.medkits = new Map();
    this.airdropMesh = null;
    // Best interaction currently in range ({ type, targetId, isNPC } or null)
    this.currentInteraction = null;

    // Jail state for the local player (server-enforced; this just locks input)
    this.jailedUntil = 0;

    // Who's dancing (entity id -> timestamp when the emote ends)
    this.dancingUntil = new Map();
    
    // Camera controls
    this.cameraMode = 'firstPerson';
    this.isPointerLocked = false;
    this.yaw = 0;
    this.pitch = 0;
    this.mouseSensitivity = 0.002;
    // Visual-only recoil flick applied on top of yaw/pitch; decays per frame
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    // Rapid-fire spread penalty (see tryShoot); drains back to zero per frame
    this.fireBloom = 0;
    // Viewmodel kick-back spring; decays in updateViewmodel
    this.viewmodelKick = 0;
    
    // Constants
    this.TOPDOWN_HEIGHT = 20; // was 50 -- way too far out to make anything out
    this.TOPDOWN_MIN_HEIGHT = 8;
    this.TOPDOWN_MAX_HEIGHT = 80; // world doubled in size, let zoom pull back further
    this.TOPDOWN_ANGLE = -Math.PI / 4;
    
    // Setup systems
    this.network = new NetworkSystem(this);
    this.hud = new HUD(this);
    this.hud.showTitleScreen();

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

    // SMG: stubby body, long magazine, short barrel
    const smg = new THREE.Group();
    const mBody = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.45), gunMaterial);
    const mBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), gunMaterial);
    mBarrel.position.set(0, 0.04, -0.32);
    const mMag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.12), gunMaterial);
    mMag.position.set(0, -0.22, 0.02);
    const mGrip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.12), woodMaterial);
    mGrip.position.set(0, -0.15, 0.16);
    mGrip.rotation.x = 0.3;
    smg.add(mBody, mBarrel, mMag, mGrip);
    smg.position.set(0.45, -0.4, -0.85);
    smg.visible = false;

    // Sniper: long barrel + scope tube on top
    const sniper = new THREE.Group();
    const nBody = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.6), gunMaterial);
    const nBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.85), gunMaterial);
    nBarrel.position.set(0, 0.04, -0.68);
    const nScope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 8), gunMaterial);
    nScope.rotation.x = Math.PI / 2;
    nScope.position.set(0, 0.14, -0.1);
    const nStock = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.3), woodMaterial);
    nStock.position.set(0, -0.04, 0.42);
    sniper.add(nBody, nBarrel, nScope, nStock);
    sniper.position.set(0.45, -0.42, -0.8);
    sniper.visible = false;

    this.camera.add(pistol, shotgun, smg, sniper);
    this.viewmodels = { pistol, shotgun, smg, sniper };

    // Per-model rest pose (recoil animates offsets from it) and a muzzle
    // flash at each barrel tip.
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc94d,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const muzzleZ = { pistol: -0.55, shotgun: -0.9, smg: -0.5, sniper: -1.2 };
    for (const [weaponId, model] of Object.entries(this.viewmodels)) {
      model.userData.restPosition = model.position.clone();
      const flash = new THREE.Group();
      const quadA = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMaterial);
      const quadB = quadA.clone();
      quadB.rotation.z = Math.PI / 4;
      flash.add(quadA, quadB);
      flash.position.set(0, 0.05, muzzleZ[weaponId]);
      flash.visible = false;
      model.add(flash);
      model.userData.flash = flash;
    }
  }

  // Kick the first-person weapon back/up and light its muzzle flash.
  triggerViewmodelKick(strength = 1) {
    this.viewmodelKick = Math.min(this.viewmodelKick + strength, 2.5);
    const model = this.viewmodels[this.currentWeapon];
    if (model && model.visible && model.userData.flash) {
      const flash = model.userData.flash;
      flash.visible = true;
      flash.rotation.z = Math.random() * Math.PI;
      clearTimeout(this._viewmodelFlashTimer);
      this._viewmodelFlashTimer = setTimeout(() => { flash.visible = false; }, 55);
    }
  }

  // Keep the viewmodel/crosshair in sync with camera mode, equipped weapon
  // and alive state, and run the recoil kick-back spring. Called every frame.
  updateViewmodel() {
    const inFirstPerson = this.cameraMode === 'firstPerson'
      && this.isLocalPlayerAlive()
      && this.localPlayer.mesh.visible;
    for (const [weaponId, model] of Object.entries(this.viewmodels)) {
      // Hide the viewmodel while zoomed -- it blocks the scoped view
      model.visible = inFirstPerson && !this.zoomed && this.currentWeapon === weaponId;

      // Recoil: slide back toward the shoulder, muzzle tips up, then spring
      // back to the rest pose.
      const rest = model.userData.restPosition;
      model.position.z = rest.z + this.viewmodelKick * 0.14;
      model.position.y = rest.y + this.viewmodelKick * 0.025;
      model.rotation.x = this.viewmodelKick * 0.13;
    }
    this.viewmodelKick *= 0.75;
    if (this.viewmodelKick < 0.01) this.viewmodelKick = 0;

    // Bloom drains while you hold fire discipline
    this.fireBloom *= 0.90;
    if (this.fireBloom < 0.001) this.fireBloom = 0;

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
      const scale = 2 * (0.8 + rand() * 0.6); // doubled to match the rest of the scenery
      tree.scale.setScalar(scale);
      tree.position.set(x, 0, z);
      tree.rotation.y = rand() * Math.PI * 2;
      this.scene.add(tree);
      placed++;
    }

    // Bench template: seat, backrest, leg slab
    const benchWood = new THREE.MeshStandardMaterial({ color: 0x8a6642 });
    const benchTemplate = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.24, 1.4), benchWood);
    seat.position.y = 1.1;
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.0, 0.2), benchWood);
    back.position.set(0, 1.9, -0.6);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.1, 1.0), new THREE.MeshStandardMaterial({ color: 0x3c3c3c }));
    legs.position.y = 0.54;
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
    const trashGeometry = new THREE.CylinderGeometry(0.9, 0.8, 2.2, 8);
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
      trash.position.set(spot.x, 1.1, spot.z);
      this.scene.add(trash);
    });

    // Holding cell: a ring of vertical bars next to the HQ. Visual only --
    // the server pins jailed entities in place, so no collision needed.
    const barGeometry = new THREE.CylinderGeometry(0.08, 0.08, 6.8, 6);
    const barMaterial = new THREE.MeshStandardMaterial({ color: 0x37474f });
    const half = JAIL.size / 2;
    const barsPerSide = 5;
    for (let i = 0; i < barsPerSide; i++) {
      const t = -half + (JAIL.size / (barsPerSide - 1)) * i;
      for (const [bx, bz] of [[t, -half], [t, half], [-half, t], [half, t]]) {
        const bar = new THREE.Mesh(barGeometry, barMaterial);
        bar.position.set(JAIL.x + bx, 3.4, JAIL.z + bz);
        this.scene.add(bar);
      }
    }
    const jailRoof = new THREE.Mesh(
      new THREE.BoxGeometry(JAIL.size + 0.4, 0.15, JAIL.size + 0.4),
      barMaterial
    );
    jailRoof.position.set(JAIL.x, 6.8, JAIL.z);
    this.scene.add(jailRoof);

    // Mission contact NPCs: immortal, static, one per faction, with a
    // bouncing "!" marker so they read as quest givers from a distance.
    this.contactMarkers = [];
    for (const [faction, spot] of Object.entries(MISSION_CONTACTS)) {
      const rig = buildCharacterMesh(getFactionColor(faction, false));
      rig.group.position.set(spot.x, 1, spot.z);
      // Face the plaza/HQ-ish center of the map
      rig.group.rotation.y = Math.atan2(spot.x, spot.z);
      this.scene.add(rig.group);

      const marker = this.createBuildingLabel('!');
      marker.scale.set(2.4, 3.2, 1);
      marker.position.set(spot.x, 4.9, spot.z);
      this.scene.add(marker);
      this.contactMarkers.push(marker);
    }
  }

  // --- World pickups & events ----------------------------------------------

  addMedkit(id, position) {
    const kit = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.4, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xf5f5f5 })
    );
    box.position.y = 0.2;
    const crossMaterial = new THREE.MeshStandardMaterial({ color: 0xd32f2f });
    const crossA = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.14), crossMaterial);
    crossA.position.y = 0.43;
    const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.42), crossMaterial);
    crossB.position.y = 0.43;
    kit.add(box, crossA, crossB);
    kit.position.set(position.x, 0, position.z);
    this.scene.add(kit);
    this.medkits.set(id, kit);
  }

  removeMedkit(id) {
    const kit = this.medkits.get(id);
    if (kit) {
      this.scene.remove(kit);
      this.medkits.delete(id);
    }
  }

  addAirdrop(drop) {
    this.removeAirdrop();
    const group = new THREE.Group();
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.2, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xffb300 })
    );
    crate.position.y = 0.6;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff6f00,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    beam.position.y = 30;
    group.add(crate, beam);
    group.userData.crate = crate;
    group.position.set(drop.position.x, 0, drop.position.z);
    this.scene.add(group);
    this.airdropMesh = group;
  }

  removeAirdrop() {
    if (this.airdropMesh) {
      this.scene.remove(this.airdropMesh);
      this.airdropMesh = null;
    }
  }

  isLocalPlayerJailed() {
    return Date.now() < this.jailedUntil;
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
        if (this.localPlayer) this.localPlayer.setFirstPersonView(this.cameraMode === 'firstPerson');
      }
      // Weapon switching
      if (WEAPON_KEYS[event.key]) this.equipWeapon(WEAPON_KEYS[event.key]);
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
      // Contextual interaction: talk / revive / arrest
      if ((event.key === 'f' || event.key === 'F') && this.isLocalPlayerAlive() && !this.isLocalPlayerJailed()) {
        this.executeInteraction();
      }
      // Dance emote
      if ((event.key === 'g' || event.key === 'G') && this.isLocalPlayerAlive()) {
        this.network.socket.emit('emote', 'dance');
      }
      // Switch factions
      if ((event.key === 'n' || event.key === 'N') && this.character && !this.isLocalPlayerJailed()) {
        if (this.hud.isFactionChangeMenuOpen()) {
          this.hud.closeFactionChangeMenu();
        } else {
          this.hud.showFactionChangeMenu(this.character.faction);
        }
      }
      // Roster: hold Tab to see who's online and which bots are active
      if (event.key === 'Tab') {
        event.preventDefault();
        this.hud.showRoster(this.buildRoster());
      }
      // Controls help
      if (event.key === 'h' || event.key === 'H') {
        if (this.hud.isHelpOpen()) {
          this.hud.hideHelp();
        } else {
          this.hud.showHelp();
        }
      }
    });

    window.addEventListener('keyup', (event) => {
      if (this.localPlayer) {
        this.localPlayer.handleKeyUp(event);
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        this.hud.hideRoster();
      }
      if (event.key === 'Escape' && this.hud.isFactionChangeMenuOpen()) {
        this.hud.closeFactionChangeMenu();
      }
      if (event.key === 'Escape' && this.hud.isHelpOpen()) {
        this.hud.hideHelp();
      }
    });

    // Shooting: left click fires (hold to auto-fire with the SMG); right
    // click aims down the sniper scope.
    document.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouseDown = true;
        this.tryShoot();
      } else if (event.button === 2) {
        if (this.currentWeapon === 'sniper' && this.cameraMode === 'firstPerson' && this.isLocalPlayerAlive()) {
          this.setZoom(true);
        }
      }
    });
    document.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
      if (event.button === 2) this.setZoom(false);
    });
    document.addEventListener('contextmenu', (event) => event.preventDefault());

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

  // Snapshot for the hold-Tab roster: online players grouped by faction,
  // plus a count of currently-alive NPCs per faction ("active bots").
  buildRoster() {
    const players = [];
    if (this.character) {
      players.push({
        name: this.character.name,
        faction: this.character.faction,
        isAlive: this.isLocalPlayerAlive(),
        isLocal: true
      });
    }
    this.remotePlayers.forEach((player) => {
      if (player.character) {
        players.push({
          name: player.character.name,
          faction: player.character.faction,
          isAlive: player.isAlive,
          isLocal: false
        });
      }
    });

    const bots = { Criminal: 0, Enforcer: 0, Civilian: 0 };
    this.npcs.forEach((npc) => {
      if (npc.isAlive && bots[npc.faction] !== undefined) bots[npc.faction]++;
    });

    return { players, bots };
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
    if (weaponId !== 'sniper') this.setZoom(false);
    this.hud.updateWeaponStat(weaponId);
  }

  setZoom(zoomed) {
    if (this.zoomed === zoomed) return;
    this.zoomed = zoomed;
    this.camera.fov = zoomed ? 28 : 75;
    this.camera.updateProjectionMatrix();
  }

  // Which nearby thing F would act on right now. Recomputed every frame in
  // update(); also drives the HUD prompt.
  findInteraction() {
    if (!this.localPlayer || !this.isLocalPlayerAlive() || this.isLocalPlayerJailed() || !this.character) {
      return null;
    }
    const myPos = this.localPlayer.mesh.position;
    const myFaction = this.character.faction;

    // 1. Faction contact: get a job (unless one is already active)
    const contact = MISSION_CONTACTS[myFaction];
    if (contact && !this.hud.hasActiveMission()) {
      const dx = myPos.x - contact.x;
      const dz = myPos.z - contact.z;
      if (Math.sqrt(dx * dx + dz * dz) <= CONTACT_INTERACT_RADIUS) {
        return { type: 'contact', prompt: '[F] Talk to your contact' };
      }
    }

    if (myFaction === 'Enforcer') {
      // 2. Revive a downed Civilian
      for (const [id, npc] of this.npcs) {
        if (npc.faction === 'Civilian' && !npc.isAlive
            && myPos.distanceTo(npc.mesh.position) <= INTERACT_RADIUS) {
          return { type: 'revive', targetId: id, prompt: '[F] Revive Civilian (+$10)' };
        }
      }
      // 3. Arrest an Outlaw (NPC or player)
      for (const [id, npc] of this.npcs) {
        if (npc.faction === 'Criminal' && npc.isAlive
            && myPos.distanceTo(npc.mesh.position) <= INTERACT_RADIUS) {
          return { type: 'arrest', targetId: id, isNPC: true, prompt: '[F] Arrest Outlaw' };
        }
      }
      for (const [id, player] of this.remotePlayers) {
        if (player.isAlive && player.character && player.character.faction === 'Criminal'
            && myPos.distanceTo(player.mesh.position) <= INTERACT_RADIUS) {
          return { type: 'arrest', targetId: id, isNPC: false, prompt: '[F] Arrest Outlaw' };
        }
      }
    }

    return null;
  }

  executeInteraction() {
    const interaction = this.currentInteraction;
    if (!interaction) return;
    if (interaction.type === 'contact') {
      this.network.socket.emit('requestMission');
    } else if (interaction.type === 'revive') {
      this.network.socket.emit('reviveCivilian', interaction.targetId);
      sound.heal();
    } else if (interaction.type === 'arrest') {
      this.network.socket.emit('arrest', { targetId: interaction.targetId, isNPC: interaction.isNPC });
      sound.arrest();
    }
  }

  tryShoot() {
    if (!this.isLocalPlayerAlive()) return;
    if (this.isLocalPlayerJailed()) return;
    if (this.hud.isShopOpen()) return;

    const weapon = WEAPONS[this.currentWeapon];
    const now = Date.now();
    if (now - this.lastShotTime < weapon.cooldown) return;
    this.lastShotTime = now;

    let origin;
    let baseDirection;
    if (this.cameraMode === 'firstPerson') {
      // The third-person gun hangs ~1.5 right and ~2 below the eye; a tracer
      // spawned there carries almost all of that offset at real combat
      // distances, which reads as shots landing down-right of the crosshair.
      // Standard FPS trick instead: spawn from a "viewmodel muzzle" just
      // below-right of the camera, and converge onto the crosshair's
      // sightline at typical engagement range. The residual error is a
      // fraction of the ~0.6-unit muzzle offset -- invisible in practice.
      const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      origin = this.camera.position.clone()
        .addScaledVector(camRight, 0.45)
        .addScaledVector(camUp, -0.4)
        .addScaledVector(camForward, 1.0);
      const CONVERGENCE_DISTANCE = 60;
      const aimPoint = this.camera.position.clone().addScaledVector(camForward, CONVERGENCE_DISTANCE);
      baseDirection = aimPoint.sub(origin).normalize();
    } else {
      // Top-down: no free-look camera to aim with, so shots fire flat and
      // straight along the character's own facing (same convention as
      // movement-facing: rotation.y = theta -> world forward
      // (-sin theta, -cos theta)), from the actual gun muzzle. No downward
      // tilt -- that was aiming shots into the ground, cutting range short.
      this.localPlayer.mesh.updateMatrixWorld(true);
      origin = new THREE.Vector3();
      this.localPlayer.gun.getWorldPosition(origin);
      const rotY = this.localPlayer.mesh.rotation.y;
      baseDirection = new THREE.Vector3(-Math.sin(rotY), 0, -Math.cos(rotY));
    }

    const pellets = [];

    // Base weapon spread widened by accumulated bloom from rapid fire
    // (first person only -- top-down has no crosshair to drift from)
    const spread = weapon.spread + (this.cameraMode === 'firstPerson' ? this.fireBloom : 0);

    for (let i = 0; i < weapon.pellets; i++) {
      const direction = baseDirection.clone();
      if (spread > 0) {
        direction.x += (Math.random() - 0.5) * spread * 2;
        direction.y += (Math.random() - 0.5) * spread * 2;
        direction.z += (Math.random() - 0.5) * spread * 2;
        direction.normalize();
      }

      const mesh = this.createTracerMesh(origin, direction);
      mesh.damage = weapon.damage;
      mesh.speed = weapon.speed || 1;
      mesh.weapon = this.currentWeapon;
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

    const shotSounds = {
      shotgun: sound.shootShotgun,
      smg: sound.shootSmg,
      sniper: sound.shootSniper
    };
    (shotSounds[this.currentWeapon] || sound.shootPistol)();

    // Weapon kick: viewmodel recoil + muzzle flash, plus a camera flick in
    // first person that decays back in the render loop.
    const RECOIL_KICK = { pistol: 1.0, shotgun: 1.8, smg: 0.5, sniper: 2.4 };
    const kick = RECOIL_KICK[this.currentWeapon] || 1.0;
    this.localPlayer.triggerGunRecoil(kick);
    this.triggerViewmodelKick(kick);
    if (this.cameraMode === 'firstPerson') {
      this.recoilPitch += 0.005 * kick;
      this.recoilYaw += (Math.random() - 0.5) * 0.0035 * kick;
      // Firing again before the recoil settles widens the next shot's
      // spread (bloom); it drains back to zero in the render loop.
      const BLOOM_ADD = { pistol: 0.028, shotgun: 0.02, smg: 0.011, sniper: 0.07 };
      this.fireBloom = Math.min(0.09, this.fireBloom + (BLOOM_ADD[this.currentWeapon] || 0.02));
    }

    this.network.sendShot({ weapon: this.currentWeapon, pellets });
  }

  initLocalPlayer(id, position) {
    this.localPlayer = new Player(id, true);
    this.scene.add(this.localPlayer.mesh);
    this.localPlayer.setPosition(position);
    this.localPlayer.setFirstPersonView(this.cameraMode === 'firstPerson');
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

  handleRemoteShot(id, position, direction, weapon) {
    if (!this.projectiles.has(id)) {
      const pos = new THREE.Vector3(...position);
      const dir = new THREE.Vector3(...direction);
      const mesh = this.createTracerMesh(pos, dir);
      mesh.speed = (WEAPONS[weapon] && WEAPONS[weapon].speed) || 1;
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
    // Update local player (frozen while jailed -- the server ignores our
    // position updates then anyway)
    if (this.localPlayer && !this.isLocalPlayerJailed()) {
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

      // Auto-fire while the button is held (SMG)
      if (this.mouseDown && WEAPONS[this.currentWeapon].auto) {
        this.tryShoot();
      }

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

      // Contextual interaction prompt (talk / revive / arrest)
      this.currentInteraction = this.findInteraction();
      this.hud.setInteractPrompt(this.currentInteraction ? this.currentInteraction.prompt : null);

      // Walk over a medkit to heal (only useful when hurt)
      if (this.localPlayer.health < 100) {
        this.medkits.forEach((kit, id) => {
          const dx = this.localPlayer.mesh.position.x - kit.position.x;
          const dz = this.localPlayer.mesh.position.z - kit.position.z;
          if (Math.sqrt(dx * dx + dz * dz) < 2) {
            this.network.socket.emit('collectMedkit', id);
            this.removeMedkit(id);
            sound.heal();
          }
        });
      }
    } else if (this.localPlayer) {
      this.hud.setInteractPrompt(null);
    }

    this.updateViewmodel();

    // Dance emotes: spin the whole rig and flail the limbs until the timer
    // runs out. Walk animation takes back over naturally afterwards.
    if (this.dancingUntil.size > 0) {
      const now = Date.now();
      this.dancingUntil.forEach((until, id) => {
        if (now > until) {
          this.dancingUntil.delete(id);
          return;
        }
        const entity = id === this.network.socket.id ? this.localPlayer : this.remotePlayers.get(id);
        if (!entity || !entity.rig) return;
        entity.mesh.rotation.y += 0.25;
        const wave = Math.sin(now / 90) * 1.1;
        entity.rig.limbs.leftArm.rotation.x = wave;
        entity.rig.limbs.rightArm.rotation.x = -wave;
        entity.rig.limbs.leftLeg.rotation.x = -wave * 0.4;
        entity.rig.limbs.rightLeg.rotation.x = wave * 0.4;
      });
    }

    // Airdrop crate slowly spins so it catches the eye
    if (this.airdropMesh) {
      this.airdropMesh.userData.crate.rotation.y += 0.02;
    }

    // Update NPCs
    this.npcs.forEach(npc => npc.update(this.camera));

    // Characters rotate to face their movement direction now, so remote
    // players' health bars need re-billboarding every frame too, and their
    // gun recoil springs need decaying.
    this.remotePlayers.forEach(player => {
      player.updateHealthBarRotation(this.camera);
      player.updateGunRecoil();
    });

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

      // Move projectile (sniper rounds travel faster), remembering where it
      // was -- fast rounds can cross a whole hitbox between frames, so hit
      // tests run against the swept segment, not just the end point.
      const prevPosition = projectile.position.clone();
      projectile.position.add(
        projectile.direction.clone().multiplyScalar(projectile.speed || 1)
      );

      // Two hit zones per character: a generous body sphere around the
      // origin (hip height, spans the doubled-size model), and a tighter
      // head sphere. The head (world y ~3.0-3.9) pokes *out* of the body
      // sphere (tops out at y=3) -- checking only the body sphere is why
      // headshots never registered.
      const bodyRadius = 2;
      const HEAD_OFFSET_Y = 2.45; // rig head center above the mesh origin
      const headRadius = 0.85;

      // Distance from point p to the segment [a, b] the projectile just swept
      const segmentDistanceTo = (p, a, b) => {
        const ab = b.clone().sub(a);
        const lengthSq = ab.lengthSq();
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1,
          p.clone().sub(a).dot(ab) / lengthSq));
        return a.clone().addScaledVector(ab, t).distanceTo(p);
      };

      const testHit = (mesh) => {
        const headCenter = mesh.position.clone();
        headCenter.y += HEAD_OFFSET_Y;
        if (segmentDistanceTo(headCenter, prevPosition, projectile.position) < headRadius) {
          return { hit: true, headshot: true };
        }
        if (segmentDistanceTo(mesh.position, prevPosition, projectile.position) < bodyRadius) {
          return { hit: true, headshot: false };
        }
        return { hit: false };
      };

      // Check remote players
      this.remotePlayers.forEach((player) => {
        if (!player.isAlive) return;
        const result = testHit(player.mesh);
        if (result.hit) {
          // Only the shooter's client reports damage for its own projectiles;
          // observers just render them.
          if (projectile.isLocal) {
            this.network.sendDamage({
              targetId: player.id,
              amount: projectile.damage || 10,
              isNPC: false,
              weapon: projectile.weapon,
              isHeadshot: result.headshot
            });
            if (result.headshot) this.hud.showHeadshotMarker();
          }

          // Visual feedback -- revert to the *computed* faction color rather
          // than whatever's on the material right now. With a multi-pellet
          // weapon several pellets can hit the same target in one frame;
          // capturing "current color" as the original would just capture
          // the flash color a sibling pellet had already applied, and the
          // target would get stuck flashed. A single timer per target also
          // avoids a pile of pending reverts firing out of order.
          clearTimeout(player._hitFlashTimer);
          player.setBodyColorHex(result.headshot ? 0xffffff : 0xffff00);
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
        if (!npc.isAlive) return;
        const result = testHit(npc.mesh);
        if (result.hit) {
          if (projectile.isLocal) {
            this.network.sendDamage({
              targetId: npc.id,
              amount: projectile.damage || 10,
              isNPC: true,
              weapon: projectile.weapon,
              isHeadshot: result.headshot
            });
            if (result.headshot) this.hud.showHeadshotMarker();
          }

          // Visual feedback (see comment on the player branch above)
          clearTimeout(npc._hitFlashTimer);
          npc.setBodyColorHex(result.headshot ? 0xffffff : 0xff0000);
          npc._hitFlashTimer = setTimeout(() => {
            npc.setBodyColorHex(npc.isAlive ? npc.getFactionColor() : DEAD_COLOR);
          }, 100);

          // Mini knockback: shove the NPC along the shot's travel direction
          // so getting shot reads as an actual hit, not a silent number
          // change. Every client runs this same collision check off the
          // shared shot broadcast, so shooter and bystanders see it alike.
          npc.applyKnockback(
            projectile.direction.x * NPC_KNOCKBACK_FORCE,
            projectile.direction.z * NPC_KNOCKBACK_FORCE
          );

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
        this.camera.rotation.y = this.yaw + this.recoilYaw;
        this.camera.rotation.x = this.pitch + this.recoilPitch;
        this.camera.position.copy(this.localPlayer.mesh.position);
        this.camera.position.y += 2.7; // eye height -- just below the top of the head (local head top is y=2.9)
      } else {
        this.camera.position.set(
          this.localPlayer.mesh.position.x,
          this.localPlayer.mesh.position.y + this.TOPDOWN_HEIGHT,
          this.localPlayer.mesh.position.z + this.TOPDOWN_HEIGHT
        );
        this.camera.rotation.set(this.TOPDOWN_ANGLE, 0, 0);
      }

      // Recoil flick springs back to rest over a few frames
      this.recoilPitch *= 0.82;
      this.recoilYaw *= 0.82;
      if (Math.abs(this.recoilPitch) < 0.0004) this.recoilPitch = 0;
      if (Math.abs(this.recoilYaw) < 0.0004) this.recoilYaw = 0;

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