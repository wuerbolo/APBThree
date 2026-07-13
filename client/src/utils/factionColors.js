// Single source of truth for faction color-coding. Player.js, NPC.js, and the
// network health/character sync handlers all used to compute this
// independently and had drifted out of sync -- most notably, a player's own
// character was never actually faction-colored at all, and every health
// update overwrote whatever color was there with a hardcoded local=green/
// remote=red regardless of faction. Route everything through here instead.
export const FACTION_COLORS = {
  Criminal: { base: 0xd32f2f, own: 0x8b0000 },
  Enforcer: { base: 0x1976d2, own: 0x00008b },
  Civilian: { base: 0x388e3c, own: 0x006400 },
};

export const DEAD_COLOR = 0x333333;

// Before a player has picked a faction (mesh is hidden during that window
// anyway, but keep this sane rather than undefined).
const UNASSIGNED = { base: 0xff0000, own: 0x00ff00 };

export function getFactionColor(faction, isOwn = false) {
  const entry = FACTION_COLORS[faction] || UNASSIGNED;
  return isOwn ? entry.own : entry.base;
}

// "Criminal" stays the internal faction key everywhere (data model, save
// files, faction comparisons) -- this is purely the player-facing label.
const FACTION_DISPLAY_NAMES = {
  Criminal: 'Outlaw',
};

export function getFactionDisplayName(faction) {
  return FACTION_DISPLAY_NAMES[faction] || faction;
}
