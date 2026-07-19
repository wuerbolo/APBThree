// Character name rules: 2-16 chars, letters/digits/underscore only (at
// least one letter so nobody ends up as "1234"), no profanity, unique
// across all characters (case-insensitive) so the leaderboard/roster/kill
// feed never show two indistinguishable names.

const NAME_PATTERN = /^[A-Za-z0-9_]{2,16}$/;

// Small curated blocklist -- this is a side project, not a moderation
// platform, so "catches the obvious stuff" is the bar, not exhaustive
// coverage. Matched against a leetspeak-normalized, non-alphanumeric-
// stripped version of the name so "f4ck", "f-u-c-k", etc. still hit.
const BLOCKED_SUBSTRINGS = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'faggot',
  'fag', 'nigger', 'nigga', 'retard', 'whore', 'slut', 'rape', 'nazi',
  'hitler', 'cock', 'twat', 'wanker', 'bastard'
];

function normalizeForProfanityCheck(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/4/g, 'a')
    .replace(/3/g, 'e')
    .replace(/1/g, 'i')
    .replace(/0/g, 'o')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a');
}

function containsProfanity(name) {
  const normalized = normalizeForProfanityCheck(name);
  return BLOCKED_SUBSTRINGS.some(word => normalized.includes(word));
}

// Returns { valid: true, name: <trimmed> } or { valid: false, error: <message> }.
// `characterSystem` + `excludePlayerId` are used for the uniqueness check;
// pass excludePlayerId so a player re-submitting their own current name
// (e.g. a future rename feature) doesn't collide with themselves.
export function validateCharacterName(rawName, characterSystem, excludePlayerId = null) {
  const name = String(rawName || '').trim();

  if (!NAME_PATTERN.test(name)) {
    return {
      valid: false,
      error: 'Name must be 2-16 characters: letters, numbers, underscore only'
    };
  }
  if (containsProfanity(name)) {
    return { valid: false, error: 'Name not allowed' };
  }

  const lower = name.toLowerCase();
  for (const [playerId, character] of characterSystem.charactersByPlayerId) {
    if (playerId === excludePlayerId) continue;
    if (character.name.toLowerCase() === lower) {
      return { valid: false, error: 'Name already taken' };
    }
  }

  return { valid: true, name };
}
