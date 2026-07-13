// 3-minute faction rounds: Criminals and Enforcers race to a reputation
// goal. First faction to the goal wins early; otherwise the higher score
// wins at time-up (tie = draw). Winners get a money bonus. Rounds cycle
// continuously, even with nobody online (a 0-0 draw is harmless).
//
// The goal escalates: each round's target is 5x whichever faction's score
// was highest last round, so the game doesn't stall at a fixed target
// forever as players get stronger -- it stays a stretch goal.

const ROUND_DURATION_MS = Number(process.env.ROUND_DURATION_MS) || 3 * 60 * 1000;
const INITIAL_ROUND_GOAL = Number(process.env.ROUND_GOAL) || 100;
const GOAL_MULTIPLIER = 5;
const WARN_FRACTION = 0.9;
const WIN_BONUS = 50;

export class RoundSystem {
  constructor(networkSystem) {
    this.networkSystem = networkSystem;
    this.roundId = 0;
    this.endsAt = 0;
    this.goal = INITIAL_ROUND_GOAL;
    this.scores = { Criminal: 0, Enforcer: 0 };
    this.warned = { Criminal: false, Enforcer: false };
    this.timer = null;
  }

  start() {
    this.startRound();
  }

  startRound() {
    this.roundId += 1;
    this.endsAt = Date.now() + ROUND_DURATION_MS;
    this.scores = { Criminal: 0, Enforcer: 0 };
    this.warned = { Criminal: false, Enforcer: false };
    this.timer = setTimeout(() => this.endByTime(), ROUND_DURATION_MS);
    this.networkSystem.io.emit('roundState', this.getClientState());
  }

  // Snapshot for clients: remainingMs instead of an absolute endsAt so
  // client clock skew doesn't matter.
  getClientState() {
    return {
      roundId: this.roundId,
      remainingMs: Math.max(0, this.endsAt - Date.now()),
      durationMs: ROUND_DURATION_MS,
      goal: this.goal,
      scores: this.scores
    };
  }

  // Called from awardReputation with positive deltas only, so bars are
  // monotonic within a round and the 90% warning can be one-shot.
  onRepGained(faction, amount) {
    if (!(faction in this.scores)) return;
    this.scores[faction] += amount;
    this.networkSystem.io.emit('roundProgress', { scores: this.scores });

    if (this.scores[faction] >= this.goal) {
      this.endRound(faction);
    } else if (!this.warned[faction] && this.scores[faction] >= WARN_FRACTION * this.goal) {
      this.warned[faction] = true;
      this.networkSystem.io.emit('roundWarning', { faction });
    }
  }

  endByTime() {
    let winner = null;
    if (this.scores.Criminal > this.scores.Enforcer) winner = 'Criminal';
    else if (this.scores.Enforcer > this.scores.Criminal) winner = 'Enforcer';
    this.endRound(winner);
  }

  endRound(winner) {
    clearTimeout(this.timer);
    this.networkSystem.io.emit('roundEnded', {
      winner,
      scores: this.scores,
      bonus: WIN_BONUS
    });

    if (winner) {
      this.networkSystem.players.forEach((player, socketId) => {
        if (!player.hasCharacter()) return;
        const character = player.getCharacter();
        if (character.faction !== winner) return;
        character.money += WIN_BONUS;
        this.networkSystem.characterSystem.save();
        this.networkSystem.io.to(socketId).emit('characterUpdated', character.getData());
      });
    }

    // Next round's goal is 5x this round's top score -- keeps escalating
    // instead of stalling at a fixed target. A scoreless round (nobody
    // online, or nobody gained rep) leaves the goal where it was.
    const topScore = Math.max(this.scores.Criminal, this.scores.Enforcer);
    if (topScore > 0) {
      this.goal = topScore * GOAL_MULTIPLIER;
    }

    this.startRound();
  }
}
