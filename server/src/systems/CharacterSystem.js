import { CharacterModel } from '../models/CharacterModel.js';

export class CharacterSystem {
  constructor(store) {
    // Characters keyed by the client's persistent token (falls back to
    // socket.id for clients that don't send one), so a character survives
    // reconnects and server restarts.
    this.charactersByPlayerId = new Map();
    this.saveTimer = null;
    this.store = store;
  }

  // Call once, before accepting connections -- see NetworkSystem.init().
  async load() {
    try {
      const raw = await this.store.load('characters');
      if (!raw) return;
      for (const [key, data] of Object.entries(raw)) {
        const character = new CharacterModel(data.name, data.faction);
        character.updateData(data);
        this.charactersByPlayerId.set(key, character);
      }
      console.log(`Loaded ${this.charactersByPlayerId.size} character(s) from ${this.store.describe()}`);
    } catch (err) {
      console.error('Failed to load characters:', err.message);
    }
  }

  // Debounced write -- kills/pickups can mutate money several times a
  // second and each individual write is not worth a round-trip.
  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        const out = {};
        this.charactersByPlayerId.forEach((character, key) => {
          out[key] = {
            name: character.name,
            faction: character.faction,
            level: character.level,
            reputation: character.reputation,
            money: character.money,
            weapons: character.weapons,
            cosmetics: character.cosmetics,
            equippedCosmetic: character.equippedCosmetic,
            equippedBodyColor: character.equippedBodyColor,
            equippedTrail: character.equippedTrail,
            lastLoginDay: character.lastLoginDay,
            loginStreak: character.loginStreak,
            lastDailyMissionDay: character.lastDailyMissionDay
          };
        });
        await this.store.save('characters', out);
      } catch (err) {
        console.error('Failed to save characters:', err.message);
      }
    }, 2000);
  }

  // Check if a player has a character
  hasCharacter(playerId) {
    return this.charactersByPlayerId.has(playerId);
  }

  // Get a player's character
  getCharacter(playerId) {
    return this.charactersByPlayerId.get(playerId);
  }

  // Create a new character for a player
  createCharacter(playerId, name, faction) {
    const character = new CharacterModel(name, faction);
    this.charactersByPlayerId.set(playerId, character);
    this.save();
    return character;
  }

  // Delete a character
  deleteCharacter(playerId) {
    if (this.charactersByPlayerId.has(playerId)) {
      this.charactersByPlayerId.delete(playerId);
      this.save();
      return true;
    }
    return false;
  }

  // Update a character's data
  updateCharacter(playerId, data) {
    const character = this.charactersByPlayerId.get(playerId);
    if (character) {
      character.updateData(data);
      this.save();
      return true;
    }
    return false;
  }

  // Get all characters data (for admin purposes)
  getAllCharacters() {
    const characters = [];
    this.charactersByPlayerId.forEach((character, playerId) => {
      characters.push({
        playerId,
        ...character.getData()
      });
    });
    return characters;
  }
}
