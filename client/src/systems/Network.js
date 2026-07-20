import { io } from 'socket.io-client';
import { getFactionDisplayName } from '../utils/factionColors.js';
import { sound } from '../utils/sound.js';

// Persistent per-browser identity so the server can hand you back your
// character across refreshes and server restarts.
function getPlayerToken() {
  try {
    // Renamed from 'apb-player-token' during the BOLO rebrand -- fall back to
    // the old key so existing players don't lose their saved character.
    let token = localStorage.getItem('bolo-player-token') || localStorage.getItem('apb-player-token');
    if (!token) {
      token = (crypto.randomUUID && crypto.randomUUID())
        || `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    localStorage.setItem('bolo-player-token', token);
    return token;
  } catch (e) {
    return null; // private browsing etc. -- falls back to per-session identity
  }
}

export class NetworkSystem {
  constructor(gameScene) {
    this.gameScene = gameScene;
    const token = getPlayerToken();
    this.socket = io(
      import.meta.env.VITE_SERVER_URL || undefined,
      token ? { auth: { token } } : undefined
    );
    
    // Add connection monitoring
    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
    });

    // Admin actions against this player. Both arrive right before the
    // server closes the socket ('io server disconnect', which socket.io
    // does not auto-reconnect from), so the overlay is terminal until the
    // player refreshes -- and a banned player just gets it again.
    this.socket.on('kicked', () => {
      this.gameScene.hud.showDisconnectScreen('KICKED', 'An admin removed you from the server.');
    });

    this.socket.on('banned', ({ reason }) => {
      this.gameScene.hud.showDisconnectScreen('BANNED', reason || 'You are banned from this server.');
    });

    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.socket.on('init', ({ id, position, players, npcs, pickups, medkits, airdrop, character, hasCharacter, round, goldenHour }) => {
      // Joined mid-golden-hour: show the persistent badge (the start/end
      // announcements are only broadcast at the transitions themselves)
      if (goldenHour) this.gameScene.hud.showGoldenHourBadge();
      console.log('Connected with ID:', id);
      
      // Check if player has a character
      if (hasCharacter) {
        // Initialize with existing character
        console.log('Loaded existing character:', character);
        this.gameScene.character = character;
        this.gameScene.hud.showCharacterInfo(character);

        // Initialize local player
        this.gameScene.initLocalPlayer(id, position);
        this.gameScene.localPlayer.applyCharacter(character);
      } else {
        // Needs to create a character first - show faction selection UI
        console.log('No character found, showing faction selection');
        this.gameScene.hud.showFactionSelection();
        
        // Still initialize local player to have the camera work properly
        this.gameScene.initLocalPlayer(id, position);
        
        // Hide the player until character is created
        if (this.gameScene.localPlayer) {
          this.gameScene.localPlayer.mesh.visible = false;
        }
      }
      
      // Initialize other players
      players.forEach(([playerId, pos, characterData]) => {
        if (playerId !== id) {
          this.gameScene.addRemotePlayer(playerId, pos, characterData);
        }
      });

      // Initialize NPCs (a corpse the server still tracks joins lying down)
      npcs.forEach(({ id, position, faction, health }) => {
        this.gameScene.addNPC(id, position, faction);
        if (health && !health.isAlive) {
          const npc = this.gameScene.npcs.get(id);
          if (npc) npc.applyHealthUpdate(health.health, health.isAlive);
        }
      });

      // Initialize any money pickups already on the ground
      (pickups || []).forEach(({ id, position }) => {
        this.gameScene.addMoneyPickup(id, position);
      });

      // Medkits and any airdrop already in the world
      (medkits || []).forEach(({ id, position }) => {
        this.gameScene.addMedkit(id, position);
      });
      if (airdrop) this.gameScene.addAirdrop(airdrop);

      // Current round snapshot for late joiners
      if (round) this.gameScene.hud.updateRoundHUD(round);
    });

    this.socket.on('spawnMedkit', ({ id, position }) => {
      this.gameScene.addMedkit(id, position);
    });

    this.socket.on('removeMedkit', (id) => {
      this.gameScene.removeMedkit(id);
    });

    this.socket.on('airdropSpawned', ({ id, position, amount }) => {
      sound.airdropAlert();
      this.gameScene.addAirdrop({ id, position, amount });
      this.gameScene.hud.showRoundBanner(`📦 Supply drop incoming: $${amount}! First one there keeps it.`, '#ffb300');
    });

    this.socket.on('airdropClaimed', ({ name, amount }) => {
      this.gameScene.removeAirdrop();
      this.gameScene.hud.showRoundBanner(`📦 ${name} claimed the supply drop ($${amount})!`, '#ffb300');
    });

    this.socket.on('wantedUpdate', ({ id, name, stars }) => {
      if (id === this.socket.id) {
        this.gameScene.hud.updateWantedStars(stars);
      }
      if (stars >= 3) {
        this.gameScene.hud.showRoundBanner(`🚨 ${name} is WANTED (${'★'.repeat(stars)}) — bounty $${stars * 30}!`, '#ff5252');
      }
    });

    this.socket.on('bountyClaimed', ({ hunter, target, amount }) => {
      this.gameScene.hud.showRoundBanner(`💰 ${hunter} collected the $${amount} bounty on ${target}!`, '#ffd54a');
    });

    this.socket.on('entityJailed', ({ isNPC, seconds, by, bounty }) => {
      const suffix = bounty ? ` (+$${bounty} bounty)` : '';
      this.gameScene.hud.showRoundBanner(
        `🚔 ${by} cuffed an Outlaw${isNPC ? ' NPC' : ''} — ${seconds}s in the cage${suffix}`,
        '#64b5f6'
      );
    });

    // You got arrested: snap to the cell and lock input until released
    this.socket.on('arrested', ({ seconds, position }) => {
      sound.arrest();
      this.gameScene.jailedUntil = Date.now() + seconds * 1000;
      if (this.gameScene.localPlayer) {
        this.gameScene.localPlayer.setPosition({ x: position.x, y: 1, z: position.z });
      }
      this.gameScene.hud.showJailOverlay(seconds);
    });

    this.socket.on('released', ({ position }) => {
      this.gameScene.jailedUntil = 0;
      if (this.gameScene.localPlayer) {
        this.gameScene.localPlayer.setPosition({ x: position.x, y: 1, z: position.z });
      }
      this.gameScene.hud.hideJailOverlay();
    });

    this.socket.on('emote', ({ id, type }) => {
      if (type === 'dance') {
        this.gameScene.dancingUntil.set(id, Date.now() + 2500);
      }
    });

    this.socket.on('spawnMoneyPickup', ({ id, position }) => {
      this.gameScene.addMoneyPickup(id, position);
    });

    this.socket.on('removeMoneyPickup', (id) => {
      this.gameScene.removeMoneyPickup(id);
    });

    // Character updates
    this.socket.on('characterUpdated', (characterData) => {
      console.log('Character updated:', characterData);
      this.gameScene.character = characterData;
      this.gameScene.hud.showCharacterInfo(characterData);
      if (this.gameScene.localPlayer) {
        this.gameScene.localPlayer.applyCharacter(characterData);
      }
    });

    // Death penalty: money reset to 0, reputation halved -- animate the
    // drop instead of just snapping to the new values.
    this.socket.on('characterPenalty', (characterData) => {
      const oldCharacter = this.gameScene.character;
      this.gameScene.character = characterData;
      this.gameScene.hud.animateCharacterPenalty(oldCharacter, characterData);
    });

    this.socket.on('chat', (data) => {
      this.gameScene.hud.addChatMessage(data);
    });

    // First login of the (UTC) day: streak bonus toast. The money itself
    // arrives via the characterUpdated the server sends right after.
    this.socket.on('loginBonus', ({ streak, bonus }) => {
      this.gameScene.hud.showLoginBonus(streak, bonus);
    });

    // Golden hour lifecycle: 10-minute heads-up, start, end. Banner +
    // chat line at each transition, persistent badge while it's live.
    this.socket.on('goldenHour', ({ phase, minutes }) => {
      const hud = this.gameScene.hud;
      if (phase === 'soon') {
        hud.showRoundBanner(`GOLDEN HOUR in ${minutes} min`, '#ffd54f');
        hud.addChatMessage({ isSystem: true, text: `Golden hour starts in ${minutes} minutes -- triple airdrops, double payouts!` });
      } else if (phase === 'start') {
        hud.showRoundBanner('GOLDEN HOUR -- triple airdrops, double payouts!', '#ffd54f');
        hud.showGoldenHourBadge();
        hud.addChatMessage({ isSystem: true, text: 'Golden hour is live! Airdrops rain until the top of the hour.' });
      } else if (phase === 'end') {
        hud.hideGoldenHourBadge();
        hud.showRoundBanner('Golden hour is over', '#b0bec5');
      }
    });

    this.socket.on('playerUpdated', ({ id, character }) => {
      // Update remote player's character data (and recolor them to match)
      const remotePlayer = this.gameScene.remotePlayers.get(id);
      if (remotePlayer) {
        remotePlayer.applyCharacter(character);
      }
    });

    this.socket.on('playerJoined', ({ id, position, character }) => {
      this.gameScene.addRemotePlayer(id, position, character);
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

    // An NPC landed a melee hit -- swing their baton/knife
    this.socket.on('npcSwing', ({ id }) => {
      const npc = this.gameScene.npcs.get(id);
      if (npc) npc.triggerMeleeSwing();
    });

    this.socket.on('removeNPC', (id) => {
      console.log(`Removing NPC ${id} from scene`);
      const npc = this.gameScene.npcs.get(id);
      if (npc) {
        this.gameScene.scene.remove(npc.mesh);
        this.gameScene.npcs.delete(id);
      }
    });

    this.socket.on('spawnNPC', ({ id, position, health, faction }) => {
      console.log(`Spawning new NPC ${id} (${faction || 'Unknown faction'}) at position:`, position);
      this.gameScene.addNPC(id, position, faction);
      // Update health if provided
      if (health) {
        const npc = this.gameScene.npcs.get(id);
        if (npc) npc.applyHealthUpdate(health.health, health.isAlive);
      }
    });

    this.socket.on('shoot', (data) => {
      // New format: { weapon, pellets: [{id, position, direction}] }.
      // Old single-projectile format kept as a fallback.
      const pellets = data.pellets || [{ id: data.id, position: data.position, direction: data.direction }];
      pellets.forEach(p => this.gameScene.handleRemoteShot(p.id, p.position, p.direction, data.weapon));

      // Muzzle flash + gun kick on the shooter, so shots read as coming
      // from their weapon and not just materializing mid-air.
      const shooter = this.gameScene.remotePlayers.get(data.playerId);
      if (shooter) shooter.triggerGunRecoil(1);
    });

    this.socket.on('leaderboard', (rankings) => {
      this.gameScene.hud.updateLeaderboard(rankings);
    });

    // Faction rounds
    this.socket.on('roundState', (state) => {
      this.gameScene.hud.updateRoundHUD(state);
    });

    this.socket.on('roundProgress', ({ scores }) => {
      this.gameScene.hud.updateRoundBars(scores);
    });

    this.socket.on('roundWarning', ({ faction }) => {
      const color = faction === 'Criminal' ? '#ff5252' : '#64b5f6';
      this.gameScene.hud.showRoundBanner(`⚠ The ${getFactionDisplayName(faction)}s are about to win the round!`, color);
    });

    this.socket.on('roundEnded', ({ winner, bonus }) => {
      if (winner) {
        const color = winner === 'Criminal' ? '#ff5252' : '#64b5f6';
        this.gameScene.hud.showRoundBanner(`🏆 The ${getFactionDisplayName(winner)}s win the round! (+$${bonus} for their faction)`, color);
      } else {
        this.gameScene.hud.showRoundBanner('Round ended in a draw', '#e0e0e0');
      }
    });

    // Missions
    this.socket.on('missionOffer', (offer) => {
      this.gameScene.hud.showMissionOffer(offer);
    });

    this.socket.on('missionUpdate', (update) => {
      this.gameScene.hud.showMissionTracker(update);
      this.gameScene.setMissionBeacon(update.beacon);
    });

    this.socket.on('missionCompleted', (data) => {
      sound.missionComplete();
      this.gameScene.clearMissionBeacon();
      this.gameScene.hud.showMissionCompleted(data);
    });

    this.socket.on('missionFailed', (data) => {
      sound.missionFail();
      this.gameScene.clearMissionBeacon();
      this.gameScene.hud.showMissionFailed(data);
    });

    this.socket.on('updateHealth', ({ id, health, isAlive, isNPC, faction, attackerPosition }) => {
      console.log(`Received health update: ${id} (${isNPC ? 'NPC' : 'Player'}) - Health: ${health}, Alive: ${isAlive}, Faction: ${faction || 'Unknown'}`);
      
      if (isNPC) {
        const npc = this.gameScene.npcs.get(id);
        if (npc) {
          // Update faction if provided
          if (faction && faction !== npc.faction) {
            npc.setFaction(faction);
          }

          // Handles recolor + death topple / stand-back-up transitions
          npc.applyHealthUpdate(health, isAlive);
        }
      } else {
        const player = id === this.socket.id ?
          this.gameScene.localPlayer :
          this.gameScene.remotePlayers.get(id);

        if (player) {
          const oldHealth = player.health;
          player.applyHealthUpdate(health, isAlive);
          console.log(`Player ${id} health changed from ${oldHealth} to ${health}`);

          // Camera shake/flash/knockback feedback for the local player getting hit
          if (id === this.socket.id && health < oldHealth) {
            this.gameScene.triggerHitFeedback(attackerPosition);
          }

          // Show death overlay for local player when they die
          if (id === this.socket.id && oldHealth > 0 && health <= 0) {
            console.log('Local player died, showing death overlay');
            sound.death();
            this.gameScene.hud.closeShop();
            this.gameScene.hud.showDeathOverlay();
          }
        }
      }
    });

    // Handle damage rejection (friendly fire, etc.)
    this.socket.on('damageRejected', ({ targetId, reason, message }) => {
      console.log(`Damage rejected: ${message}`);
      
      // Show a visual feedback for rejected damage
      if (reason === 'FRIENDLY_FIRE') {
        this.showFriendlyFireIndicator(message);
      }
    });
  }

  // Display a temporary message for friendly fire
  showFriendlyFireIndicator(message) {
    // Create or reuse the element
    let indicator = document.getElementById('friendly-fire-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'friendly-fire-indicator';
      indicator.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0, 0, 0, 0.7);
        color: #ff0000;
        padding: 15px 20px;
        border-radius: 5px;
        font-family: Arial, sans-serif;
        font-size: 18px;
        text-align: center;
        pointer-events: none;
        z-index: 1000;
        transition: opacity 0.5s;
      `;
      document.body.appendChild(indicator);
    }
    
    // Set the message
    indicator.textContent = message;
    indicator.style.opacity = '1';
    
    // Clear any existing timeout
    if (this.friendlyFireTimeout) {
      clearTimeout(this.friendlyFireTimeout);
    }
    
    // Hide after 2 seconds
    this.friendlyFireTimeout = setTimeout(() => {
      indicator.style.opacity = '0';
    }, 2000);
  }

  createCharacter(name, faction) {
    console.log(`Creating character: ${name} (${faction})`);
    this.socket.emit('createCharacter', { name, faction }, (response) => {
      if (response.success) {
        console.log('Character created successfully:', response.character);
        
        // Store character data in game scene
        this.gameScene.character = response.character;
        
        // Show character info in HUD
        this.gameScene.hud.showCharacterInfo(response.character);
        
        // Make local player visible and colored to match the chosen faction
        if (this.gameScene.localPlayer) {
          this.gameScene.localPlayer.mesh.visible = true;
          this.gameScene.localPlayer.applyCharacter(response.character);
          if (response.position) {
            this.gameScene.localPlayer.setPosition(response.position);
          }
        }

        this.gameScene.hud.closeFactionSelection();
      } else {
        console.error('Failed to create character:', response.error);
        // Keep the same overlay open (with whatever the player typed still
        // in the input) and surface why it was rejected, instead of
        // silently wiping the form.
        this.gameScene.hud.showFactionSelectionError(response.error || 'Could not create character');
      }
    });
  }

  // Send a chat message; rejections (rate limit, profanity, no character)
  // come back through the ack and show only to this player, as a gray
  // system line in the chat log.
  sendChat(text) {
    this.socket.emit('chat', text, (response) => {
      if (response && response.error) {
        this.gameScene.hud.addChatMessage({ isSystem: true, text: response.error });
      }
    });
  }

  changeFaction(faction) {
    this.socket.emit('changeFaction', faction, (response) => {
      if (response && response.success) {
        this.gameScene.character = response.character;
        this.gameScene.hud.showCharacterInfo(response.character);
        this.gameScene.hud.closeFactionChangeMenu();
        // Health/position/recolor arrive via the server's playerRespawned +
        // characterUpdated broadcasts (same path a normal respawn uses), so
        // there's nothing else to apply here.
      } else {
        this.gameScene.hud.showFactionChangeError((response && response.error) || 'Faction change failed');
      }
    });
  }

  buyWeapon(weaponId) {
    this.socket.emit('buyWeapon', weaponId, (response) => {
      if (response && response.success) {
        sound.buy();
        this.gameScene.character = response.character;
        this.gameScene.hud.showCharacterInfo(response.character);
        if (this.gameScene.localPlayer) {
          this.gameScene.localPlayer.applyCharacter(response.character);
        }
        this.gameScene.hud.renderShop(response.character);
      } else {
        this.gameScene.hud.showShopError((response && response.error) || 'Purchase failed');
      }
    });
  }

  buyCosmetic(cosmeticId) {
    this.socket.emit('buyCosmetic', cosmeticId, (response) => {
      if (response && response.success) {
        sound.buy();
        this.gameScene.character = response.character;
        this.gameScene.hud.showCharacterInfo(response.character);
        if (this.gameScene.localPlayer) {
          this.gameScene.localPlayer.applyCharacter(response.character);
        }
        this.gameScene.hud.renderShop(response.character);
      } else {
        this.gameScene.hud.showShopError((response && response.error) || 'Purchase failed');
      }
    });
  }

  // id + slot=null equips (server derives the slot from its catalog);
  // id=null + slot clears that slot.
  equipCosmetic(cosmeticId, slot) {
    this.socket.emit('equipCosmetic', { id: cosmeticId, slot }, (response) => {
      if (response && response.success) {
        this.gameScene.character = response.character;
        if (this.gameScene.localPlayer) {
          this.gameScene.localPlayer.applyCharacter(response.character);
        }
        this.gameScene.hud.renderShop(response.character);
      } else {
        this.gameScene.hud.showShopError((response && response.error) || 'Equip failed');
      }
    });
  }

  sendPosition(position) {
    const now = Date.now();
    if (this._lastPositionSend && now - this._lastPositionSend < 50) return;
    this._lastPositionSend = now;
    this.socket.emit('updatePosition', position);
  }

  sendShot(data) {
    this.socket.emit('shoot', data);
  }

  sendDamage(data) {
    console.log('Sending damage event:', data);
    if (!this.socket.connected) {
      console.error('Cannot send damage: Not connected to server');
      return;
    }
    this.socket.emit('damage', data, (response) => {
      // Add acknowledgment callback
      if (response && response.error) {
        console.error('Error sending damage:', response.error);
      } else {
        console.log('Damage event acknowledged by server');
      }
    });
  }
} 