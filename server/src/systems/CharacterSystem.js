import { CharacterModel } from '../models/CharacterModel.js';

export class CharacterSystem {
  constructor() {
    // In-memory storage for characters keyed by player ID
    this.charactersByPlayerId = new Map();
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
    return character;
  }

  // Delete a character
  deleteCharacter(playerId) {
    if (this.charactersByPlayerId.has(playerId)) {
      this.charactersByPlayerId.delete(playerId);
      return true;
    }
    return false;
  }

  // Update a character's data
  updateCharacter(playerId, data) {
    const character = this.charactersByPlayerId.get(playerId);
    if (character) {
      character.updateData(data);
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