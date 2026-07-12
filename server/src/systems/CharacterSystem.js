import { CharacterModel } from '../models/CharacterModel.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'characters.json');

export class CharacterSystem {
  constructor() {
    // Characters keyed by the client's persistent token (falls back to
    // socket.id for clients that don't send one), so a character survives
    // reconnects and server restarts.
    this.charactersByPlayerId = new Map();
    this.saveTimer = null;
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (!fs.existsSync(DATA_FILE)) return;
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      for (const [key, data] of Object.entries(raw)) {
        const character = new CharacterModel(data.name, data.faction);
        character.updateData(data);
        this.charactersByPlayerId.set(key, character);
      }
      console.log(`Loaded ${this.charactersByPlayerId.size} character(s) from disk`);
    } catch (err) {
      console.error('Failed to load characters from disk:', err.message);
    }
  }

  // Debounced write -- kills/pickups can mutate money several times a
  // second and each individual write is not worth an fsync.
  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const out = {};
        this.charactersByPlayerId.forEach((character, key) => {
          out[key] = {
            name: character.name,
            faction: character.faction,
            level: character.level,
            reputation: character.reputation,
            money: character.money,
            weapons: character.weapons
          };
        });
        fs.writeFileSync(DATA_FILE, JSON.stringify(out, null, 2));
      } catch (err) {
        console.error('Failed to save characters to disk:', err.message);
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
