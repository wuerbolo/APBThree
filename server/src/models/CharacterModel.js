export class CharacterModel {
  constructor(name, faction) {
    this.name = name;
    this.faction = faction; // "Criminal" or "Enforcer"
    this.level = 1;
    this.reputation = 0;
    this.money = 0;
  }

  // Get all character data as an object
  getData() {
    return {
      name: this.name,
      faction: this.faction,
      level: this.level,
      reputation: this.reputation,
      money: this.money
    };
  }

  // Update character data
  updateData(data) {
    if (data.name) this.name = data.name;
    if (data.faction) this.faction = data.faction;
    if (data.level) this.level = data.level;
    if (data.reputation) this.reputation = data.reputation;
    if (data.money) this.money = data.money;
  }
} 