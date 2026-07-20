import { BUILDINGS, WORLD_HALF, resolveBuildingCollision } from '../utils/collision.js';
import { dayKey } from '../utils/timeBuckets.js';

const ENFORCER_HQ = BUILDINGS.find(b => b.label === 'ENFORCER HQ');

// Random point in the open, nudged out of any building it landed inside.
function randomOpenPoint() {
  const point = {
    x: Math.random() * (WORLD_HALF * 2 - 20) - (WORLD_HALF - 10),
    y: 1,
    z: Math.random() * (WORLD_HALF * 2 - 20) - (WORLD_HALF - 10)
  };
  resolveBuildingCollision(point);
  return point;
}

// Stage types:
//   { type: 'kill', faction, count }             -- eliminate N NPCs of a faction
//   { type: 'goto', label, x, z, radius, package? } -- reach a point (package = pickup flavor)
// Multi-stage missions are the point: they pull you across the map, and
// dying mid-mission fails it, so a longer run means real risk.
const TEMPLATES = {
  Criminal: [
    {
      id: 'supply-snatch',
      title: 'Supply Snatch',
      description: 'A stash of gear got dumped in the open. Grab it and run it to the drop point before the Enforcers sniff it out.',
      rewardMoney: 60,
      rewardRep: 20,
      buildStages: () => {
        const stash = randomOpenPoint();
        const drop = randomOpenPoint();
        return [
          { type: 'goto', label: 'Grab the stash', x: stash.x, z: stash.z, radius: 3, package: true },
          { type: 'goto', label: 'Deliver to the drop point', x: drop.x, z: drop.z, radius: 3 }
        ];
      }
    },
    {
      id: 'turf-war',
      title: 'Turf War',
      description: 'Enforcer patrols are squeezing our turf. Thin them out.',
      rewardMoney: 40,
      rewardRep: 30,
      buildStages: () => [
        { type: 'kill', faction: 'Enforcer', count: 3 }
      ]
    }
  ],
  Enforcer: [
    {
      id: 'contraband-recovery',
      title: 'Contraband Recovery',
      description: 'Intel places a contraband stash out in the open. Recover it and bring it back to HQ.',
      rewardMoney: 60,
      rewardRep: 20,
      buildStages: () => {
        const stash = randomOpenPoint();
        return [
          { type: 'goto', label: 'Recover the contraband', x: stash.x, z: stash.z, radius: 3, package: true },
          { type: 'goto', label: 'Return to the HQ', x: ENFORCER_HQ.x, z: ENFORCER_HQ.z + 18, radius: 5 }
        ];
      }
    },
    {
      id: 'crackdown',
      title: 'Crackdown',
      description: 'Outlaw activity is spiking. Put down their muscle.',
      rewardMoney: 40,
      rewardRep: 30,
      buildStages: () => [
        { type: 'kill', faction: 'Criminal', count: 3 }
      ]
    }
  ]
};

// Daily missions: longer/harder than the regular pool, roughly 3x the
// reward, completable once per UTC day (tracked on the character, so it
// survives reconnects). Which one is "today's" is derived from the day
// key, so every player of a faction gets the same daily.
const DAILY_TEMPLATES = {
  Criminal: [
    {
      id: 'daily-heist-run',
      title: 'Heist Run',
      description: "Today's big score: crack the stash, lose the heat, deliver across town. One shot at the bonus -- don't die holding the bag.",
      rewardMoney: 180,
      rewardRep: 60,
      buildStages: () => {
        const stash = randomOpenPoint();
        const heat = randomOpenPoint();
        const drop = randomOpenPoint();
        return [
          { type: 'goto', label: 'Crack the stash', x: stash.x, z: stash.z, radius: 3, package: true },
          { type: 'goto', label: 'Shake the heat at the safehouse', x: heat.x, z: heat.z, radius: 3 },
          { type: 'goto', label: 'Deliver the take', x: drop.x, z: drop.z, radius: 3 }
        ];
      }
    },
    {
      id: 'daily-purge-patrols',
      title: 'Purge the Patrols',
      description: "The day's bounty from the boss: clear serious Enforcer muscle off our streets, then report to the drop.",
      rewardMoney: 150,
      rewardRep: 75,
      buildStages: () => {
        const drop = randomOpenPoint();
        return [
          { type: 'kill', faction: 'Enforcer', count: 5 },
          { type: 'goto', label: 'Report to the drop point', x: drop.x, z: drop.z, radius: 3 }
        ];
      }
    }
  ],
  Enforcer: [
    {
      id: 'daily-evidence-chain',
      title: 'Evidence Chain',
      description: "Today's priority case: secure evidence at two scenes and log it all back at HQ. The DA wants it airtight.",
      rewardMoney: 180,
      rewardRep: 60,
      buildStages: () => {
        const sceneA = randomOpenPoint();
        const sceneB = randomOpenPoint();
        return [
          { type: 'goto', label: 'Secure the first scene', x: sceneA.x, z: sceneA.z, radius: 3, package: true },
          { type: 'goto', label: 'Secure the second scene', x: sceneB.x, z: sceneB.z, radius: 3, package: true },
          { type: 'goto', label: 'Log the evidence at HQ', x: ENFORCER_HQ.x, z: ENFORCER_HQ.z + 18, radius: 5 }
        ];
      }
    },
    {
      id: 'daily-major-sweep',
      title: 'Major Sweep',
      description: "The day's directive from the top: a full sweep of Outlaw enforcers, then debrief in the field.",
      rewardMoney: 150,
      rewardRep: 75,
      buildStages: () => {
        const debrief = randomOpenPoint();
        return [
          { type: 'kill', faction: 'Criminal', count: 5 },
          { type: 'goto', label: 'Reach the field debrief', x: debrief.x, z: debrief.z, radius: 3 }
        ];
      }
    }
  ]
};

// Same daily for everyone in a faction: pick from the pool by day key.
function todaysTemplate(faction, today) {
  const pool = DAILY_TEMPLATES[faction];
  if (!pool) return null;
  const hash = [...today].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return pool[hash % pool.length];
}

export class MissionSystem {
  constructor(networkSystem) {
    this.networkSystem = networkSystem;
    this.missions = new Map();     // socketId -> { template, state, stages, stageIndex, killCount }
  }

  // Jobs come from your faction's contact NPC now -- the caller
  // (NetworkSystem) validates the player is actually standing next to it.
  offer(socketId) {
    const player = this.networkSystem.players.get(socketId);
    if (!player || !player.hasCharacter()) return;
    const existing = this.missions.get(socketId);
    if (existing) return; // already offered or active

    const character = player.getCharacter();

    // The daily takes precedence until it's been completed today; after
    // that the contact goes back to handing out regular jobs. Failing the
    // daily doesn't burn it -- only completion does -- so you can retry.
    const today = dayKey();
    const isDaily = character.lastDailyMissionDay !== today;
    const template = isDaily
      ? todaysTemplate(character.faction, today)
      : TEMPLATES[character.faction]?.[Math.floor(Math.random() * TEMPLATES[character.faction].length)];
    if (!template) return;

    this.missions.set(socketId, { template, state: 'offered', isDaily });
    this.networkSystem.io.to(socketId).emit('missionOffer', {
      title: template.title,
      description: template.description,
      rewardMoney: template.rewardMoney,
      rewardRep: template.rewardRep,
      daily: isDaily
    });
  }

  accept(socketId) {
    const mission = this.missions.get(socketId);
    if (!mission || mission.state !== 'offered') return;

    mission.state = 'active';
    mission.stages = mission.template.buildStages();
    mission.stageIndex = 0;
    mission.killCount = 0;
    console.log(`Mission accepted by ${socketId}: ${mission.template.title}`);
    this.pushUpdate(socketId, mission);
  }

  currentStage(mission) {
    return mission.stages[mission.stageIndex];
  }

  objectiveText(mission) {
    const stage = this.currentStage(mission);
    if (stage.type === 'kill') {
      return `Eliminate ${stage.count} ${stage.faction} NPCs (${mission.killCount}/${stage.count})`;
    }
    return stage.label;
  }

  pushUpdate(socketId, mission) {
    const stage = this.currentStage(mission);
    this.networkSystem.io.to(socketId).emit('missionUpdate', {
      title: mission.template.title,
      objective: this.objectiveText(mission),
      beacon: stage.type === 'goto'
        ? { x: stage.x, z: stage.z, package: !!stage.package }
        : null
    });
  }

  advance(socketId, mission) {
    mission.stageIndex++;
    mission.killCount = 0;
    if (mission.stageIndex >= mission.stages.length) {
      this.complete(socketId, mission);
    } else {
      this.pushUpdate(socketId, mission);
    }
  }

  complete(socketId, mission) {
    this.missions.delete(socketId);

    const player = this.networkSystem.players.get(socketId);
    if (player && player.hasCharacter()) {
      const character = player.getCharacter();
      // Money first so the characterUpdated emitted inside awardReputation
      // carries both rewards in one message.
      character.money += mission.template.rewardMoney;

      // Completing the daily burns it for the rest of the UTC day
      if (mission.isDaily) {
        character.lastDailyMissionDay = dayKey();
        this.networkSystem.characterSystem.save();
      }

      this.networkSystem.awardReputation(socketId, mission.template.rewardRep);

      this.networkSystem.io.to(socketId).emit('missionCompleted', {
        title: mission.template.title,
        rewardMoney: mission.template.rewardMoney,
        rewardRep: mission.template.rewardRep,
        daily: !!mission.isDaily
      });
      console.log(`Mission completed by ${socketId}: ${mission.template.title}`);
    }
  }

  fail(socketId, reason) {
    const mission = this.missions.get(socketId);
    if (!mission || mission.state !== 'active') return;
    this.missions.delete(socketId);
    this.networkSystem.io.to(socketId).emit('missionFailed', { reason });
    console.log(`Mission failed for ${socketId}: ${reason}`);
  }

  // --- Progress hooks, called from NetworkSystem ---------------------------

  onNpcKill(socketId, npcFaction) {
    const mission = this.missions.get(socketId);
    if (!mission || mission.state !== 'active') return;
    const stage = this.currentStage(mission);
    if (stage.type !== 'kill' || stage.faction !== npcFaction) return;

    mission.killCount++;
    if (mission.killCount >= stage.count) {
      this.advance(socketId, mission);
    } else {
      this.pushUpdate(socketId, mission);
    }
  }

  onPosition(socketId, position) {
    const mission = this.missions.get(socketId);
    if (!mission || mission.state !== 'active') return;
    const stage = this.currentStage(mission);
    if (stage.type !== 'goto') return;

    const dx = position.x - stage.x;
    const dz = position.z - stage.z;
    if (Math.sqrt(dx * dx + dz * dz) <= stage.radius) {
      this.advance(socketId, mission);
    }
  }

  onDeath(socketId) {
    this.fail(socketId, 'You died. The job died with you.');
  }

  onDisconnect(socketId) {
    this.missions.delete(socketId);
  }
}
