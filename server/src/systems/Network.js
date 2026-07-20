import { Server } from 'socket.io';
import { PlayerModel } from '../models/PlayerModel.js';
import { NPCSpawner } from './NPCSpawner.js';
import { CharacterSystem } from './CharacterSystem.js';
import { MetricsSystem } from './MetricsSystem.js';
import { BanSystem } from './BanSystem.js';
import { MissionSystem } from './MissionSystem.js';
import { RoundSystem } from './RoundSystem.js';
import { ScoreSystem } from './ScoreSystem.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { getSpawnPositionForFaction, BUILDINGS, JAIL, MISSION_CONTACTS, CONTACT_INTERACT_RADIUS, WORLD_HALF } from '../utils/collision.js';
import { validateCharacterName } from '../utils/nameValidation.js';
import * as THREE from 'three';

function getClientIp(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return socket.handshake.address;
}

// What the STORE sells. Server-side so the client can't invent prices.
const WEAPON_CATALOG = {
  shotgun: { price: 50 },
  smg: { price: 120 },
  sniper: { price: 200 }
};
const COSMETIC_CATALOG = {
  cap: { price: 30 },
  tophat: { price: 100 },
  halo: { price: 250 }
};
const STORE_BUY_RADIUS = 15;

// Interactions (revive/arrest/talk) require being right next to the target.
const INTERACT_RADIUS = 4;

const JAIL_SECONDS = 10;
const ARREST_REWARD_MONEY = 25;
const ARREST_REWARD_REP = 8;
const REVIVE_REWARD = 10;

// WANTED system: stars from killing Civilians, decaying over time. At 3+
// stars you're announced server-wide, NPC Enforcers hunt you from twice
// the range, and your head is worth stars * WANTED_BOUNTY_PER_STAR to
// whoever kills or arrests you.
const MAX_WANTED_STARS = 5;
const WANTED_DECAY_MS = 45000;
const WANTED_BOUNTY_PER_STAR = 30;

const MEDKIT_TARGET_COUNT = 4;
const MEDKIT_HEAL = 30;

const AIRDROP_INTERVAL_MS = 120000;
const AIRDROP_CLAIM_RADIUS = 2.5;

// Authoritative weapon stats for the 'shoot' -> 'damage' flow. The client
// sends a weapon id and hit targets, but damage amount, fire rate and max
// range are always taken from here -- never trusted from the client. This
// is what stops a browser-console script from claiming 9999 damage,
// firing a sniper at SMG speed, or landing "hits" across the whole map.
const WEAPON_STATS = {
  pistol: { damage: 10, cooldown: 250, maxRange: 60, pellets: 1 },
  shotgun: { damage: 4, cooldown: 800, maxRange: 25, pellets: 6 },
  smg: { damage: 4, cooldown: 90, maxRange: 45, pellets: 1 },
  sniper: { damage: 50, cooldown: 1500, maxRange: 150, pellets: 1 }
};
// Network jitter allowance: a shot slightly under the nominal cooldown
// isn't necessarily cheating, just latency.
const FIRE_RATE_TOLERANCE_MS = 60;
// Pellets from one 'shoot' call must land (as 'damage' events) within this
// window, or the budget expires and further hits from it are rejected.
const SHOT_BUDGET_WINDOW_MS = 1000;

function randomOpenPosition() {
  return {
    x: Math.random() * (WORLD_HALF * 2 - 20) - (WORLD_HALF - 10),
    y: 1,
    z: Math.random() * (WORLD_HALF * 2 - 20) - (WORLD_HALF - 10)
  };
}

export class NetworkSystem {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
        methods: ["GET", "POST"]
      }
    });

    this.players = new Map();
    this.npcs = new Map();
    this.moneyPickups = new Map();
    this.medkits = new Map();
    this.nextPickupSequence = 0;

    // Airdrop event state ({ id, position, amount } while one is up)
    this.airdrop = null;

    // Per-socket sliding-window limits on the noisiest events. A normal
    // player's input loop stays well under these; a script hammering the
    // server won't.
    this.positionLimiter = new RateLimiter(60, 1000);
    // The SMG auto-fires at ~11 shots/s, so the old 10/s tripped on
    // legitimate play.
    this.shootLimiter = new RateLimiter(20, 1000);
    // High enough for a shotgun blast (6 pellets, each its own damage
    // event) landing twice in the same second.
    this.damageLimiter = new RateLimiter(40, 1000);
    this.interactLimiter = new RateLimiter(5, 1000);

    // Initialize character system
    this.characterSystem = new CharacterSystem();

    // Sessions/duration/D1 retention -- see server/src/systems/MetricsSystem.js
    this.metricsSystem = new MetricsSystem();

    // Persistent token+IP ban list, enforced at connection time and
    // managed from the /admin panel (see server/src/admin/routes.js)
    this.banSystem = new BanSystem();

    // Faction missions (multi-stage jobs with rewards)
    this.missionSystem = new MissionSystem(this);

    // Day/week/year reputation scoreboards + 3-minute faction rounds
    this.scoreSystem = new ScoreSystem();
    this.roundSystem = new RoundSystem(this);
    this.roundSystem.start();

    this.setupSocketHandlers();
    
    // Initialize NPC spawner
    this.npcSpawner = new NPCSpawner(this);
    this.startNPCLoop();

    // Fame/Infamy leaderboard for everyone currently online
    setInterval(() => this.broadcastLeaderboard(), 5000);

    // Keep MEDKIT_TARGET_COUNT medkits on the map
    this.maintainMedkits();
    setInterval(() => this.maintainMedkits(), 5000);

    // Periodic cash airdrop everyone races to claim
    setInterval(() => this.spawnAirdrop(), AIRDROP_INTERVAL_MS);
    setTimeout(() => this.spawnAirdrop(), 45000);

    // WANTED stars cool off over time
    setInterval(() => this.decayWanted(), 15000);
  }

  // --- Medkits --------------------------------------------------------------

  maintainMedkits() {
    while (this.medkits.size < MEDKIT_TARGET_COUNT) {
      const id = `medkit-${Date.now()}-${this.nextPickupSequence++}`;
      const position = randomOpenPosition();
      this.medkits.set(id, { position });
      this.io.emit('spawnMedkit', { id, position });
    }
  }

  // --- Airdrops ---------------------------------------------------------------

  spawnAirdrop() {
    if (this.airdrop) return; // previous one still unclaimed
    const id = `drop-${Date.now()}`;
    const amount = 100 + Math.floor(Math.random() * 150);
    const position = randomOpenPosition();
    this.airdrop = { id, position, amount };
    this.io.emit('airdropSpawned', { id, position, amount });
    console.log(`Airdrop ${id} ($${amount}) at`, position);
  }

  tryClaimAirdrop(socketId, player) {
    if (!this.airdrop || !player.isAlive || !player.hasCharacter()) return;
    const dx = player.position.x - this.airdrop.position.x;
    const dz = player.position.z - this.airdrop.position.z;
    if (Math.sqrt(dx * dx + dz * dz) > AIRDROP_CLAIM_RADIUS) return;

    const character = player.getCharacter();
    character.money += this.airdrop.amount;
    this.characterSystem.save();
    this.io.emit('airdropClaimed', { name: character.name, amount: this.airdrop.amount });
    this.io.to(socketId).emit('characterUpdated', character.getData());
    console.log(`Airdrop claimed by ${character.name} ($${this.airdrop.amount})`);
    this.airdrop = null;
  }

  // --- WANTED -----------------------------------------------------------------

  addWanted(socketId) {
    const player = this.players.get(socketId);
    if (!player || !player.hasCharacter()) return;
    player.wantedStars = Math.min(MAX_WANTED_STARS, player.wantedStars + 1);
    player.lastWantedAt = Date.now();
    this.broadcastWanted(socketId, player);
  }

  clearWanted(socketId) {
    const player = this.players.get(socketId);
    if (!player || player.wantedStars === 0) return;
    player.wantedStars = 0;
    this.broadcastWanted(socketId, player);
  }

  decayWanted() {
    const now = Date.now();
    this.players.forEach((player, socketId) => {
      if (player.wantedStars > 0 && now - player.lastWantedAt > WANTED_DECAY_MS) {
        player.wantedStars--;
        player.lastWantedAt = now;
        this.broadcastWanted(socketId, player);
      }
    });
  }

  broadcastWanted(socketId, player) {
    this.io.emit('wantedUpdate', {
      id: socketId,
      name: player.hasCharacter() ? player.getCharacter().name : '???',
      stars: player.wantedStars
    });
  }

  // Cash bounty for taking down (or arresting) a wanted player.
  collectBounty(hunterSocketId, wantedPlayer) {
    const bounty = wantedPlayer.wantedStars * WANTED_BOUNTY_PER_STAR;
    if (bounty <= 0) return 0;
    const hunter = this.players.get(hunterSocketId);
    if (!hunter || !hunter.hasCharacter()) return 0;
    const character = hunter.getCharacter();
    character.money += bounty;
    this.characterSystem.save();
    this.io.to(hunterSocketId).emit('characterUpdated', character.getData());
    return bounty;
  }

  broadcastLeaderboard() {
    const entries = [];
    this.players.forEach(player => {
      if (player.hasCharacter()) {
        const c = player.getCharacter();
        entries.push({ name: c.name, faction: c.faction, reputation: c.reputation, level: c.level });
      }
    });
    entries.sort((a, b) => b.reputation - a.reputation);
    this.io.emit('leaderboard', {
      now: entries.slice(0, 5),
      day: this.scoreSystem.topN('day'),
      week: this.scoreSystem.topN('week'),
      year: this.scoreSystem.topN('year')
    });
  }

  // Single choke point for reputation changes (kills here, missions via
  // MissionSystem). Only positive deltas feed the round bars and the
  // period scoreboards; the death-halving penalty stays out of both.
  awardReputation(socketId, amount) {
    const player = this.players.get(socketId);
    if (!player || !player.hasCharacter()) return;
    const character = player.getCharacter();
    character.reputation = Math.max(0, character.reputation + amount);
    character.updateLevel();
    this.characterSystem.save();
    this.io.to(socketId).emit('characterUpdated', character.getData());
    if (amount > 0) {
      this.roundSystem.onRepGained(character.faction, amount);
      this.scoreSystem.record(player.characterKey, character.name, character.faction, amount);
    }
  }

  setupSocketHandlers() {
    console.log('Setting up socket handlers...');
    
    this.io.on('connection', (socket) => {
      const clientIp = getClientIp(socket);
      console.log(`Player connected: ${socket.id} from ${clientIp}`);

      // Stable identity across reconnects: the client sends a persistent
      // token in the socket.io auth payload; characters are keyed by it so
      // your character survives refreshes and server restarts.
      const playerKey = String((socket.handshake.auth && socket.handshake.auth.token) || socket.id).slice(0, 64);

      // Banned players are rejected before anything is set up for them --
      // before metrics too, so ban-retry spam doesn't inflate session counts.
      const banEntry = this.banSystem.isBanned(playerKey, clientIp);
      if (banEntry) {
        console.log(`Rejected banned player: ${socket.id} from ${clientIp} (banned as "${banEntry.name}")`);
        socket.emit('banned', { reason: banEntry.reason });
        socket.disconnect(true);
        return;
      }

      this.metricsSystem.recordConnect(socket.id, playerKey);

      // Check if player has a character
      const existingCharacter = this.characterSystem.getCharacter(playerKey);

      // Returning players spawn at their faction's spawn; fresh ones get a
      // neutral drop-in position until they pick a faction.
      const initialPosition = existingCharacter
        ? getSpawnPositionForFaction(existingCharacter.faction)
        : { x: this.players.size === 0 ? -40 : 40, y: 1, z: 0 };

      // Create new player
      const player = new PlayerModel(socket.id, initialPosition);
      player.characterKey = playerKey;
      // Kept for the admin panel: who's connected from where, since when
      player.clientIp = clientIp;
      player.connectedAt = Date.now();
      this.players.set(socket.id, player);
      
      if (existingCharacter) {
        // Player has a character, associate it with the player
        player.setCharacter(existingCharacter);
        
        // Send initialization with character data
        socket.emit('init', {
          id: socket.id,
          position: initialPosition,
          players: Array.from(this.players.entries()).map(([id, p]) => [
            id, 
            p.getPosition(),
            p.hasCharacter() ? p.getCharacter().getData() : null
          ]),
          npcs: Array.from(this.npcs.entries()).map(([id, npc]) => ({
            id,
            position: npc.getPosition(),
            health: npc.getHealth(),
            faction: npc.faction
          })),
          pickups: Array.from(this.moneyPickups.entries()).map(([id, pickup]) => ({
            id,
            position: pickup.position,
            amount: pickup.amount
          })),
          medkits: Array.from(this.medkits.entries()).map(([id, kit]) => ({
            id,
            position: kit.position
          })),
          airdrop: this.airdrop,
          character: existingCharacter.getData(),
          hasCharacter: true,
          round: this.roundSystem.getClientState()
        });
      } else {
        // Player doesn't have a character, tell client to show creation UI
        socket.emit('init', {
          id: socket.id,
          position: initialPosition,
          players: Array.from(this.players.entries()).map(([id, p]) => [
            id, 
            p.getPosition(),
            p.hasCharacter() ? p.getCharacter().getData() : null
          ]),
          npcs: Array.from(this.npcs.entries()).map(([id, npc]) => ({
            id,
            position: npc.getPosition(),
            health: npc.getHealth(),
            faction: npc.faction
          })),
          pickups: Array.from(this.moneyPickups.entries()).map(([id, pickup]) => ({
            id,
            position: pickup.position,
            amount: pickup.amount
          })),
          medkits: Array.from(this.medkits.entries()).map(([id, kit]) => ({
            id,
            position: kit.position
          })),
          airdrop: this.airdrop,
          hasCharacter: false,
          round: this.roundSystem.getClientState()
        });
      }

      // Broadcast new player to others
      socket.broadcast.emit('playerJoined', {
        id: socket.id,
        position: initialPosition,
        character: player.hasCharacter() ? player.getCharacter().getData() : null
      });

      // Handle mission acceptance
      socket.on('missionAccept', () => {
        this.missionSystem.accept(socket.id);
      });

      // Talk to your faction's contact NPC to get a job offer
      socket.on('requestMission', () => {
        if (!this.interactLimiter.allow(socket.id)) return;
        const player = this.players.get(socket.id);
        if (!player || !player.hasCharacter() || !player.isAlive) return;

        const contact = MISSION_CONTACTS[player.getCharacter().faction];
        if (!contact) return;
        const dx = player.position.x - contact.x;
        const dz = player.position.z - contact.z;
        if (Math.sqrt(dx * dx + dz * dz) > CONTACT_INTERACT_RADIUS) return;

        // Re-send the pending offer if they walked away and came back,
        // otherwise roll a fresh one.
        const existing = this.missionSystem.missions.get(socket.id);
        if (existing && existing.state === 'offered') {
          const t = existing.template;
          socket.emit('missionOffer', {
            title: t.title, description: t.description,
            rewardMoney: t.rewardMoney, rewardRep: t.rewardRep
          });
          return;
        }
        this.missionSystem.offer(socket.id);
      });

      // Enforcer revives a downed Civilian NPC for cash
      socket.on('reviveCivilian', (targetId) => {
        if (!this.interactLimiter.allow(socket.id)) return;
        const player = this.players.get(socket.id);
        if (!player || !player.isAlive || !player.hasCharacter()) return;
        if (player.getCharacter().faction !== 'Enforcer') return;

        const npc = this.npcs.get(targetId);
        if (!npc || npc.isAlive || npc.faction !== 'Civilian') return;

        const dx = player.position.x - npc.position.x;
        const dz = player.position.z - npc.position.z;
        if (Math.sqrt(dx * dx + dz * dz) > INTERACT_RADIUS) return;

        npc.heal(50); // full heal; also cancels the corpse despawn timer
        this.io.emit('updateHealth', {
          id: targetId,
          health: npc.health,
          isAlive: true,
          isNPC: true,
          faction: npc.faction
        });

        const character = player.getCharacter();
        character.money += REVIVE_REWARD;
        this.characterSystem.save();
        socket.emit('characterUpdated', character.getData());
        console.log(`${character.name} revived Civilian ${targetId} (+$${REVIVE_REWARD})`);
      });

      // Enforcer handcuffs an Outlaw (player or NPC): straight to the
      // holding cell for JAIL_SECONDS, then released.
      socket.on('arrest', ({ targetId, isNPC }) => {
        if (!this.interactLimiter.allow(socket.id)) return;
        const player = this.players.get(socket.id);
        if (!player || !player.isAlive || !player.hasCharacter()) return;
        if (player.getCharacter().faction !== 'Enforcer') return;

        const now = Date.now();
        const jailPosition = { x: JAIL.x, y: 1, z: JAIL.z };

        if (isNPC) {
          const npc = this.npcs.get(targetId);
          if (!npc || !npc.isAlive || npc.faction !== 'Criminal') return;
          if (now < npc.jailedUntil) return;

          const dx = player.position.x - npc.position.x;
          const dz = player.position.z - npc.position.z;
          if (Math.sqrt(dx * dx + dz * dz) > INTERACT_RADIUS) return;

          npc.jailedUntil = now + JAIL_SECONDS * 1000;
          npc.position = { ...jailPosition };
          npc.targetPosition = null; // pick a fresh target on release
          this.io.emit('npcMoved', { id: targetId, position: npc.position });
          this.io.emit('entityJailed', { id: targetId, isNPC: true, seconds: JAIL_SECONDS, by: player.getCharacter().name });
        } else {
          const target = this.players.get(targetId);
          if (!target || !target.isAlive || target.isJailed()) return;
          if (!target.hasCharacter() || target.getCharacter().faction !== 'Criminal') return;

          const dx = player.position.x - target.position.x;
          const dz = player.position.z - target.position.z;
          if (Math.sqrt(dx * dx + dz * dz) > INTERACT_RADIUS) return;

          const bounty = this.collectBounty(socket.id, target);
          this.clearWanted(targetId);
          this.missionSystem.fail(targetId, 'You got arrested mid-job.');

          target.jailedUntil = now + JAIL_SECONDS * 1000;
          target.updatePosition({ ...jailPosition });
          this.io.to(targetId).emit('arrested', { seconds: JAIL_SECONDS, position: jailPosition });
          this.io.emit('playerMoved', { id: targetId, position: jailPosition });
          this.io.emit('entityJailed', { id: targetId, isNPC: false, seconds: JAIL_SECONDS, by: player.getCharacter().name, bounty });

          // Release: fresh spawn somewhere on the map
          setTimeout(() => {
            const releasedPlayer = this.players.get(targetId);
            if (!releasedPlayer) return; // disconnected while jailed
            const releasePosition = getSpawnPositionForFaction('Criminal');
            releasedPlayer.jailedUntil = 0;
            releasedPlayer.updatePosition(releasePosition);
            this.io.to(targetId).emit('released', { position: releasePosition });
            this.io.emit('playerMoved', { id: targetId, position: releasePosition });
          }, JAIL_SECONDS * 1000);
        }

        // Arrest pay: flat reward + rep (bounty for wanted players handled above)
        const character = player.getCharacter();
        character.money += ARREST_REWARD_MONEY;
        this.characterSystem.save();
        this.awardReputation(socket.id, ARREST_REWARD_REP);
      });

      // Walk over a medkit to heal
      socket.on('collectMedkit', (medkitId) => {
        const medkit = this.medkits.get(medkitId);
        if (!medkit) return;

        const player = this.players.get(socket.id);
        if (!player || !player.isAlive) return;

        const dx = player.position.x - medkit.position.x;
        const dz = player.position.z - medkit.position.z;
        if (Math.sqrt(dx * dx + dz * dz) > 5) return;
        if (player.health >= 100) return; // don't waste it at full health

        this.medkits.delete(medkitId);
        this.io.emit('removeMedkit', medkitId);

        player.heal(MEDKIT_HEAL);
        this.io.emit('updateHealth', {
          id: socket.id,
          health: player.health,
          isAlive: true,
          isNPC: false
        });
      });

      // Dance emote -- pure flair, relayed to everyone
      socket.on('emote', (type) => {
        if (!this.interactLimiter.allow(socket.id)) return;
        if (type !== 'dance') return;
        this.io.emit('emote', { id: socket.id, type });
      });

      // Handle character creation
      socket.on('createCharacter', ({ name, faction }, callback) => {
        console.log(`Creating character for ${socket.id}: ${name} (${faction})`);

        // Validate faction
        if (faction !== 'Criminal' && faction !== 'Enforcer') {
          return callback({ success: false, error: 'Invalid faction' });
        }

        // Length/charset, profanity, and uniqueness -- all server-side
        // since the client can't be trusted to self-police any of this.
        const nameCheck = validateCharacterName(name, this.characterSystem, playerKey);
        if (!nameCheck.valid) {
          return callback({ success: false, error: nameCheck.error });
        }

        // Create character
        const character = this.characterSystem.createCharacter(playerKey, nameCheck.name, faction);
        player.setCharacter(character);

        // Place them at their faction's spawn -- HQ for Enforcers, anywhere
        // on the map for Criminals.
        const spawnPosition = getSpawnPositionForFaction(faction);
        player.updatePosition(spawnPosition);

        // Send character data back to the client
        callback({
          success: true,
          character: character.getData(),
          position: spawnPosition
        });
        
        // Broadcast character data to other players
        socket.broadcast.emit('playerUpdated', {
          id: socket.id,
          character: character.getData()
        });
      });

      // Handle position updates
      socket.on('updatePosition', (position) => {
        if (!this.positionLimiter.allow(socket.id)) {
          console.warn(`Rate limit exceeded (updatePosition) for ${socket.id} (${clientIp}), disconnecting`);
          socket.disconnect(true);
          return;
        }
        const player = this.players.get(socket.id);
        if (player) {
          // Jailed players are pinned in the cell -- ignore their client's
          // position updates until release.
          if (player.isJailed()) return;
          player.updatePosition(position);
          this.missionSystem.onPosition(socket.id, position);
          this.tryClaimAirdrop(socket.id, player);
          socket.broadcast.emit('playerMoved', {
            id: socket.id,
            position
          });
        }
      });

      // Handle shooting. This is the fire-rate/ownership gate; the actual
      // damage amount is decided in the 'damage' handler below, never here
      // and never from the client's own numbers.
      socket.on('shoot', (data) => {
        if (!this.shootLimiter.allow(socket.id)) {
          console.warn(`Rate limit exceeded (shoot) for ${socket.id} (${clientIp}), disconnecting`);
          socket.disconnect(true);
          return;
        }

        const player = this.players.get(socket.id);
        if (!player || !player.isAlive || player.isJailed() || !player.hasCharacter()) return;

        const weaponId = data.weapon || 'pistol';
        const stats = WEAPON_STATS[weaponId];
        if (!stats) return;
        if (weaponId !== 'pistol' && !player.getCharacter().hasWeapon(weaponId)) {
          console.warn(`${socket.id} tried to fire unowned weapon ${weaponId}`);
          return;
        }

        const now = Date.now();
        const lastShot = player.lastShotAt[weaponId] || 0;
        if (now - lastShot < stats.cooldown - FIRE_RATE_TOLERANCE_MS) return; // firing faster than the weapon allows
        player.lastShotAt[weaponId] = now;

        // Cap pellets to what the weapon actually fires, and open a budget
        // for the matching 'damage' events -- this is what a shotgun's 6
        // simultaneous hits spend down.
        const pellets = Array.isArray(data.pellets) ? data.pellets.slice(0, stats.pellets) : [];
        player.shotBudget = { weapon: weaponId, remaining: pellets.length, expiresAt: now + SHOT_BUDGET_WINDOW_MS };

        socket.broadcast.emit('shoot', {
          weapon: weaponId,
          pellets,
          playerId: socket.id
        });
      });

      // Handle damage events
      socket.on('damage', (data, callback) => {
        if (!this.damageLimiter.allow(socket.id)) {
          console.warn(`Rate limit exceeded (damage) for ${socket.id} (${clientIp}), disconnecting`);
          socket.disconnect(true);
          return;
        }

        // Send acknowledgment immediately
        if (callback) callback({ received: true });

        const { targetId, isNPC } = data;

        // Get the attacker (the player who sent the damage event)
        const attacker = this.players.get(socket.id);
        if (!attacker || !attacker.isAlive || attacker.isJailed() || !attacker.hasCharacter()) return;

        // Weapon must exist, be owned, and have an open budget from a
        // recent legitimate 'shoot' call -- this is what stops a script
        // from emitting 'damage' events with no corresponding shot, or
        // more hits than the weapon's pellet count allows.
        const weaponId = data.weapon || 'pistol';
        const stats = WEAPON_STATS[weaponId];
        if (!stats) return;
        if (weaponId !== 'pistol' && !attacker.getCharacter().hasWeapon(weaponId)) return;

        const budget = attacker.shotBudget;
        if (!budget || budget.weapon !== weaponId || budget.remaining <= 0 || Date.now() > budget.expiresAt) {
          console.warn(`${socket.id} sent a damage event with no matching shot budget (weapon: ${weaponId})`);
          return;
        }
        budget.remaining--;

        // Authoritative damage -- the client's claimed amount is ignored.
        // Headshots deal triple: the hit *location* is client-reported (the
        // server doesn't track aim), but the multiplier, budget, range and
        // ownership all stay server-side, so the worst a doctored client
        // gets is 3x -- same as an actual headshot.
        const amount = data.isHeadshot ? stats.damage * 3 : stats.damage;

        // Range check against the server's own positions, not anything
        // the client asserts about where the shot came from.
        const targetEntity = isNPC ? this.npcs.get(targetId) : this.players.get(targetId);
        if (!targetEntity) return;
        const targetPos = isNPC ? targetEntity.position : targetEntity.getPosition();
        const rdx = attacker.position.x - targetPos.x;
        const rdz = attacker.position.z - targetPos.z;
        if (Math.sqrt(rdx * rdx + rdz * rdz) > stats.maxRange) {
          console.warn(`${socket.id} claimed an out-of-range hit with ${weaponId} on ${targetId}`);
          return;
        }

        // Check if attacker has a character with faction info
        const attackerFaction = attacker.hasCharacter() ? attacker.getCharacter().faction : null;

        if (isNPC) {
          // Player attacking NPC
          const npc = this.npcs.get(targetId);
          if (!npc) return; // NPC not found
          // Already dead -- ignore. Without this, a multi-pellet weapon
          // (or just several shots landing in the same tick) re-runs the
          // whole death payout -- cash drop, reputation, mission progress --
          // once per pellet that still lands on the corpse.
          if (!npc.isAlive) return;
          // Jailed NPCs are behind bars -- untouchable until release
          if (Date.now() < npc.jailedUntil) return;

          // Get the NPC's faction
          const npcFaction = npc.faction;

          // Faction rules: Civilians are neutral and always damageable;
          // same-faction NPCs are protected (no friendly fire).
          if (npcFaction === "Civilian" || npcFaction !== attackerFaction) {
            npc.takeDamage(amount);
            console.log(`NPC ${targetId} (${npcFaction}) took ${amount} damage from ${socket.id} (${attackerFaction}). Health: ${npc.health}`);

            const isAlive = npc.health > 0;

            // Broadcast damage to all clients
            this.io.emit('updateHealth', {
              id: targetId,
              health: npc.health,
              isAlive: isAlive,
              isNPC: true,
              faction: npcFaction
            });

            // If NPC died, handle it
            if (!isAlive) {
              console.log(`NPC ${targetId} died!`);

              const playerWhoKilled = attacker;
              if (playerWhoKilled.hasCharacter()) {
                // Every NPC kill drops cash on the ground instead of
                // paying out instantly.
                this.spawnMoneyPickup(npc.position, 10);

                // Reputation only for putting down a rival-faction NPC --
                // Civilians are neutral and don't count.
                if (npcFaction !== "Civilian" && npcFaction !== attackerFaction) {
                  this.awardReputation(socket.id, 10);
                }

                // Killing a Civilian makes you WANTED
                if (npcFaction === "Civilian") {
                  this.addWanted(socket.id);
                }

                // Mission progress (kill objectives)
                this.missionSystem.onNpcKill(socket.id, npcFaction);
              }
            }
          } else {
            // Friendly fire - no damage applied
            console.log(`Friendly fire prevented: ${socket.id} (${attackerFaction}) cannot damage NPC ${targetId} (${npcFaction})`);
            socket.emit('damageRejected', {
              targetId,
              reason: 'FRIENDLY_FIRE',
              message: 'Cannot damage NPCs of your own faction'
            });
          }
        } else {
          // Player attacking Player
          const targetPlayer = this.players.get(targetId);
          if (!targetPlayer) return; // Target player not found
          
          // Check if target has character info
          const targetFaction = targetPlayer.hasCharacter() ? targetPlayer.getCharacter().faction : null;
          
          // Check faction rules:
          // 1. If target is Civilian, damage is allowed
          // 2. If attacker and target have the same faction, no damage (friendly fire off)
          if (targetFaction === "Civilian" || targetFaction !== attackerFaction) {
            // Jailed players are behind bars -- untouchable until release
            if (targetPlayer.isJailed()) return;

            // Damage is allowed
            const wasAlive = targetPlayer.isAlive;
            targetPlayer.takeDamage(amount);
            
            console.log(`Player ${targetId} (${targetFaction}) took ${amount} damage from ${socket.id} (${attackerFaction}). Health: ${targetPlayer.health}`);
            
            this.io.emit('updateHealth', {
              id: targetId,
              health: targetPlayer.health,
              isAlive: targetPlayer.isAlive,
              isNPC: false,
              faction: targetFaction,
              attackerPosition: attacker.getPosition()
            });

            // If player died and was previously alive
            if (wasAlive && !targetPlayer.isAlive) {
              console.log(`Player ${targetId} was killed by ${socket.id}!`);
              
              // Award XP or reputation to the killer if both have characters
              if (attacker.hasCharacter() && targetPlayer.hasCharacter()) {
                // Opposing-faction kill gains reputation; same-faction kill
                // (shouldn't happen with friendly fire disabled) is a
                // penalized fallback.
                const sameFaction = attacker.getCharacter().faction === targetPlayer.getCharacter().faction;
                this.awardReputation(socket.id, sameFaction ? -10 : 5);
              }

              // Bounty for taking down a WANTED player
              const bounty = this.collectBounty(socket.id, targetPlayer);
              if (bounty > 0 && attacker.hasCharacter()) {
                this.io.emit('bountyClaimed', {
                  hunter: attacker.getCharacter().name,
                  target: targetPlayer.hasCharacter() ? targetPlayer.getCharacter().name : '???',
                  amount: bounty
                });
              }
              this.clearWanted(targetId);

              this.applyDeathPenalty(targetId, targetPlayer);
            }
          } else {
            // Friendly fire - no damage applied
            console.log(`Friendly fire prevented: ${socket.id} (${attackerFaction}) cannot damage player ${targetId} (${targetFaction})`);
            socket.emit('damageRejected', { 
              targetId, 
              reason: 'FRIENDLY_FIRE',
              message: 'Cannot damage players of your own faction'
            });
          }
        }
      });

      // Handle healing events
      socket.on('heal', ({ targetId, amount, isNPC }) => {
        if (isNPC) {
          const npc = this.npcs.get(targetId);
          if (npc) {
            const health = npc.heal(amount);
            console.log(`NPC ${targetId} healed ${amount}. New health: ${health}`);
            this.io.emit('updateHealth', {
              id: targetId,
              health,
              isAlive: true,
              isNPC: true
            });
          }
        } else {
          const player = this.players.get(targetId);
          if (player) {
            const health = player.heal(amount);
            console.log(`Player ${targetId} healed ${amount}. New health: ${health}`);
            this.io.emit('updateHealth', {
              id: targetId,
              health,
              isAlive: true,
              isNPC: false
            });
          }
        }
      });

      // Handle buying a weapon at the STORE
      socket.on('buyWeapon', (weaponId, callback) => {
        const respond = (result) => { if (typeof callback === 'function') callback(result); };

        const player = this.players.get(socket.id);
        if (!player || !player.hasCharacter()) return respond({ success: false, error: 'No character' });

        const item = WEAPON_CATALOG[weaponId];
        if (!item) return respond({ success: false, error: 'Unknown weapon' });

        const character = player.getCharacter();
        if (character.hasWeapon(weaponId)) return respond({ success: false, error: 'Already owned' });

        const store = BUILDINGS.find(b => b.label === 'STORE');
        const dx = player.position.x - store.x;
        const dz = player.position.z - store.z;
        if (Math.sqrt(dx * dx + dz * dz) > STORE_BUY_RADIUS) {
          return respond({ success: false, error: 'Too far from the store' });
        }

        if (character.money < item.price) return respond({ success: false, error: 'Not enough money' });

        character.money -= item.price;
        character.weapons.push(weaponId);
        this.characterSystem.save();
        console.log(`Player ${socket.id} bought ${weaponId} for $${item.price}`);
        respond({ success: true, character: character.getData() });
      });

      // Handle buying a cosmetic at the STORE (auto-equips on purchase)
      socket.on('buyCosmetic', (cosmeticId, callback) => {
        const respond = (result) => { if (typeof callback === 'function') callback(result); };

        const player = this.players.get(socket.id);
        if (!player || !player.hasCharacter()) return respond({ success: false, error: 'No character' });

        const item = COSMETIC_CATALOG[cosmeticId];
        if (!item) return respond({ success: false, error: 'Unknown cosmetic' });

        const character = player.getCharacter();
        if (character.hasCosmetic(cosmeticId)) return respond({ success: false, error: 'Already owned' });

        const store = BUILDINGS.find(b => b.label === 'STORE');
        const dx = player.position.x - store.x;
        const dz = player.position.z - store.z;
        if (Math.sqrt(dx * dx + dz * dz) > STORE_BUY_RADIUS) {
          return respond({ success: false, error: 'Too far from the store' });
        }

        if (character.money < item.price) return respond({ success: false, error: 'Not enough money' });

        character.money -= item.price;
        character.cosmetics.push(cosmeticId);
        character.equippedCosmetic = cosmeticId;
        this.characterSystem.save();
        console.log(`Player ${socket.id} bought cosmetic ${cosmeticId} for $${item.price}`);

        // Everyone else needs the new look too
        socket.broadcast.emit('playerUpdated', { id: socket.id, character: character.getData() });
        respond({ success: true, character: character.getData() });
      });

      // Handle equipping/unequipping an owned cosmetic (null = bare head).
      // No store proximity needed -- you own it, wear it anywhere.
      socket.on('equipCosmetic', (cosmeticId, callback) => {
        const respond = (result) => { if (typeof callback === 'function') callback(result); };

        const player = this.players.get(socket.id);
        if (!player || !player.hasCharacter()) return respond({ success: false, error: 'No character' });

        const character = player.getCharacter();
        if (cosmeticId !== null && !character.hasCosmetic(cosmeticId)) {
          return respond({ success: false, error: 'Not owned' });
        }

        character.equippedCosmetic = cosmeticId;
        this.characterSystem.save();

        socket.broadcast.emit('playerUpdated', { id: socket.id, character: character.getData() });
        respond({ success: true, character: character.getData() });
      });

      // Handle picking up dropped cash
      socket.on('collectMoney', (pickupId) => {
        const pickup = this.moneyPickups.get(pickupId);
        if (!pickup) return; // already collected

        const player = this.players.get(socket.id);
        if (!player) return;

        // Loose sanity check -- ignore requests for pickups nowhere near
        // the player (stale client state, or someone poking the event by hand).
        const dx = player.position.x - pickup.position.x;
        const dz = player.position.z - pickup.position.z;
        if (Math.sqrt(dx * dx + dz * dz) > 5) return;

        this.moneyPickups.delete(pickupId);
        this.io.emit('removeMoneyPickup', pickupId);

        if (player.hasCharacter()) {
          const character = player.getCharacter();
          character.money += pickup.amount;
          this.characterSystem.save();
          socket.emit('characterUpdated', character.getData());
        }
      });

      // Handle respawn events
      socket.on('respawn', () => {
        const player = this.players.get(socket.id);
        if (player) {
          const faction = player.hasCharacter() ? player.getCharacter().faction : null;
          const position = getSpawnPositionForFaction(faction);

          player.health = 100;
          player.isAlive = true;
          player.updatePosition(position);

          // Broadcast respawn to all clients
          this.io.emit('playerRespawned', {
            id: socket.id,
            position
          });

          // Broadcast health update
          this.io.emit('updateHealth', {
            id: socket.id,
            health: player.health,
            isAlive: true,
            isNPC: false
          });
        }
      });

      // Switch factions mid-game (the "N" key). Treated like a respawn --
      // full heal, teleport to the new faction's spawn -- since letting
      // someone swap sides in the middle of a fight (still at low health,
      // still standing where the old faction's enemies are) would be an
      // easy way to dodge a losing fight or camp the other side's spawn.
      socket.on('changeFaction', (faction, callback) => {
        const player = this.players.get(socket.id);
        const respond = (result) => { if (typeof callback === 'function') callback(result); };
        if (!player || !player.hasCharacter()) {
          return respond({ success: false, error: 'No character yet' });
        }
        if (faction !== 'Criminal' && faction !== 'Enforcer') {
          return respond({ success: false, error: 'Invalid faction' });
        }
        if (player.isJailed()) {
          return respond({ success: false, error: 'Cannot change faction while arrested' });
        }

        const character = player.getCharacter();
        if (character.faction === faction) {
          return respond({ success: true, character: character.getData(), position: player.position });
        }

        this.characterSystem.updateCharacter(playerKey, { faction });
        const position = getSpawnPositionForFaction(faction);
        player.health = 100;
        player.isAlive = true;
        player.updatePosition(position);

        respond({ success: true, character: character.getData(), position });

        this.io.emit('playerRespawned', { id: socket.id, position });
        this.io.emit('updateHealth', { id: socket.id, health: player.health, isAlive: true, isNPC: false });
        // characterUpdated (self) applies the new faction color/HUD locally;
        // playerUpdated (everyone else) recolors this player on their screens.
        socket.emit('characterUpdated', character.getData());
        socket.broadcast.emit('playerUpdated', { id: socket.id, character: character.getData() });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id} from ${clientIp}`);
        this.metricsSystem.recordDisconnect(socket.id);
        // Keep character data in memory but remove player
        this.players.delete(socket.id);
        this.io.emit('playerLeft', socket.id);
        this.missionSystem.onDisconnect(socket.id);
        this.positionLimiter.clear(socket.id);
        this.shootLimiter.clear(socket.id);
        this.damageLimiter.clear(socket.id);
      });
    });
  }

  // --- Admin panel (see server/src/admin/routes.js) -------------------------

  getAdminPlayerList() {
    return Array.from(this.players.entries()).map(([socketId, player]) => {
      const character = player.hasCharacter() ? player.getCharacter() : null;
      return {
        socketId,
        name: character ? character.name : null,
        faction: character ? character.faction : null,
        level: character ? character.level : null,
        money: character ? character.money : null,
        token: player.characterKey,
        ip: player.clientIp,
        connectedAt: player.connectedAt
      };
    });
  }

  kickPlayer(socketId) {
    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) return false;
    socket.emit('kicked', {});
    socket.disconnect(true);
    return true;
  }

  banPlayer(socketId, reason) {
    const player = this.players.get(socketId);
    if (!player) return null;
    const character = player.hasCharacter() ? player.getCharacter() : null;
    const entry = this.banSystem.ban({
      token: player.characterKey,
      ip: player.clientIp,
      name: character ? character.name : null,
      reason
    });
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('banned', { reason: entry.reason });
      socket.disconnect(true);
    }
    return entry;
  }

  // Cash dropped by a killed Civilian, collected by walking over it. Offset
  // from the death spot so it doesn't spawn invisibly under the corpse.
  spawnMoneyPickup(position, amount) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 1.5 + Math.random() * 1.5;
    const dropPosition = {
      x: position.x + Math.cos(angle) * distance,
      y: position.y,
      z: position.z + Math.sin(angle) * distance
    };

    const id = `pickup-${Date.now()}-${this.nextPickupSequence++}`;
    this.moneyPickups.set(id, { position: dropPosition, amount });
    this.io.emit('spawnMoneyPickup', { id, position: dropPosition, amount });
  }

  startNPCLoop() {
    setInterval(() => {
      const now = Date.now();
      const alivePlayers = Array.from(this.players.entries())
        .filter(([, p]) => p.isAlive && p.hasCharacter() && !p.isJailed())
        .map(([id, p]) => ({
          id,
          position: p.getPosition(),
          faction: p.getCharacter().faction,
          wanted: p.wantedStars
        }));

      const aliveNpcs = Array.from(this.npcs.entries())
        .filter(([, n]) => n.isAlive && now >= n.jailedUntil)
        .map(([id, n]) => ({
          id,
          position: n.getPosition(),
          faction: n.faction
        }));

      this.npcs.forEach((npc, id) => {
        const { position, attack } = npc.update(alivePlayers, aliveNpcs);
        if (npc.isAlive) {
          this.io.emit('npcMoved', {
            id,
            position
          });
        }
        if (attack) {
          if (attack.targetType === 'npc') {
            this.applyNPCAttackOnNPC(id, attack.targetId, attack.amount);
          } else {
            this.applyNPCAttack(id, attack.targetId, attack.amount);
          }
        }
      });
    }, 50); // Update every 50ms
  }

  // An Enforcer/Criminal NPC caught up to an opposing-faction player and is
  // in range -- deal damage the same way a player-vs-player hit would.
  applyNPCAttack(npcId, targetId, amount) {
    const attackerNpc = this.npcs.get(npcId);
    const targetPlayer = this.players.get(targetId);
    if (!targetPlayer || !targetPlayer.isAlive) return;

    targetPlayer.takeDamage(amount);
    const targetFaction = targetPlayer.hasCharacter() ? targetPlayer.getCharacter().faction : null;

    // Clients animate the attacker's melee swing (baton/knife) off this
    this.io.emit('npcSwing', { id: npcId });

    console.log(`Player ${targetId} (${targetFaction}) took ${amount} damage from NPC ${npcId}. Health: ${targetPlayer.health}`);

    this.io.emit('updateHealth', {
      id: targetId,
      health: targetPlayer.health,
      isAlive: targetPlayer.isAlive,
      isNPC: false,
      faction: targetFaction,
      attackerPosition: attackerNpc ? attackerNpc.position : null
    });

    if (!targetPlayer.isAlive) {
      console.log(`Player ${targetId} was killed by NPC ${npcId}!`);
      this.applyDeathPenalty(targetId, targetPlayer);
    }
  }

  // Dying costs you: all your money, half your reputation. Sent only to
  // the victim so their HUD can animate the drop.
  applyDeathPenalty(targetId, player) {
    if (!player.hasCharacter()) return;
    const character = player.getCharacter();
    character.money = 0;
    character.reputation = Math.floor(character.reputation / 2);
    this.characterSystem.save();
    this.io.to(targetId).emit('characterPenalty', character.getData());
    this.missionSystem.onDeath(targetId);
  }

  // An Enforcer/Criminal NPC caught up to an opposing-faction NPC -- same
  // damage/death flow as a player killing an NPC.
  applyNPCAttackOnNPC(attackerId, targetNpcId, amount) {
    const targetNpc = this.npcs.get(targetNpcId);
    if (!targetNpc || !targetNpc.isAlive) return;

    targetNpc.takeDamage(amount);

    this.io.emit('npcSwing', { id: attackerId });

    console.log(`NPC ${targetNpcId} (${targetNpc.faction}) took ${amount} damage from NPC ${attackerId}. Health: ${targetNpc.health}`);

    this.io.emit('updateHealth', {
      id: targetNpcId,
      health: targetNpc.health,
      isAlive: targetNpc.isAlive,
      isNPC: true,
      faction: targetNpc.faction
    });

    if (!targetNpc.isAlive) {
      console.log(`NPC ${targetNpcId} was killed by NPC ${attackerId}!`);
    }
  }
} 