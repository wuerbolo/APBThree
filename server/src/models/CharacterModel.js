export class CharacterModel {
  constructor(name, faction) {
    this.name = name;
    this.faction = faction; // "Criminal" or "Enforcer"
    this.level = 1;
    this.reputation = 0;
    this.money = 0;
    this.weapons = ['pistol'];
    this.cosmetics = [];          // owned cosmetic ids
    this.equippedCosmetic = null; // currently worn, or null
  }

  hasWeapon(weaponId) {
    return this.weapons.includes(weaponId);
  }

  hasCosmetic(cosmeticId) {
    return this.cosmetics.includes(cosmeticId);
  }

  // Cumulative reputation needed to *reach* a given level. Doubles each
  // level (30, 60, 120, 240...) -- provisional, levels don't unlock
  // anything yet, just a grindy number to chase.
  getReputationForLevel(level) {
    if (level <= 1) return 0;
    return 30 * (2 ** (level - 2));
  }

  // Recompute level from current reputation. Call after any reputation
  // change.
  updateLevel() {
    while (this.reputation >= this.getReputationForLevel(this.level + 1)) {
      this.level++;
    }
  }

  // Get all character data as an object
  getData() {
    return {
      name: this.name,
      faction: this.faction,
      level: this.level,
      reputation: this.reputation,
      money: this.money,
      weapons: this.weapons,
      cosmetics: this.cosmetics,
      equippedCosmetic: this.equippedCosmetic,
      reputationForNextLevel: this.getReputationForLevel(this.level + 1)
    };
  }

  // Update character data
  updateData(data) {
    if (data.name) this.name = data.name;
    if (data.faction) this.faction = data.faction;
    if (data.level) this.level = data.level;
    if (data.reputation) this.reputation = data.reputation;
    if (data.money) this.money = data.money;
    if (Array.isArray(data.weapons)) this.weapons = data.weapons;
    if (Array.isArray(data.cosmetics)) this.cosmetics = data.cosmetics;
    if (data.equippedCosmetic !== undefined) this.equippedCosmetic = data.equippedCosmetic;
  }
} 