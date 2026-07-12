import { NPCModel } from '../models/NPCModel.js';
import { getSpawnPositionForFaction } from '../utils/collision.js';

// Always at least this many of each faction alive, NPCs and players
// combined (Civilians have no player equivalent, so it's NPC-only for them).
const MIN_PER_FACTION = { Civilian: 3, Criminal: 3, Enforcer: 3 };

export class NPCSpawner {
    constructor(networkSystem) {
        this.networkSystem = networkSystem;
        // Date.now() alone isn't unique enough -- multiple NPCs spawning in
        // the same millisecond (e.g. the initial population burst) would
        // collide and silently overwrite each other in this.networkSystem.npcs.
        this.nextNpcSequence = 0;

        // Every second, top off whichever faction(s) are under their
        // minimum -- covers NPC deaths, and players joining/leaving/dying.
        setInterval(() => this.fillDeficits(), 1000);

        this.fillDeficits();
    }

    countAlivePlayersByFaction() {
        const counts = { Criminal: 0, Enforcer: 0 };
        this.networkSystem.players.forEach(player => {
            if (player.isAlive && player.hasCharacter()) {
                const faction = player.getCharacter().faction;
                if (counts[faction] !== undefined) counts[faction]++;
            }
        });
        return counts;
    }

    countAliveNPCsByFaction() {
        const counts = { Civilian: 0, Criminal: 0, Enforcer: 0 };
        this.networkSystem.npcs.forEach(npc => {
            if (npc.isAlive && counts[npc.faction] !== undefined) counts[npc.faction]++;
        });
        return counts;
    }

    fillDeficits() {
        const playerCounts = this.countAlivePlayersByFaction();
        const npcCounts = this.countAliveNPCsByFaction();

        for (const faction of Object.keys(MIN_PER_FACTION)) {
            const total = npcCounts[faction] + (playerCounts[faction] || 0);
            const deficit = MIN_PER_FACTION[faction] - total;
            for (let i = 0; i < deficit; i++) this.spawnNPC(faction);
        }
    }

    spawnNPC(faction) {
        // Enforcers spawn at their HQ, everyone else spawns anywhere on the
        // open map.
        const position = getSpawnPositionForFaction(faction);

        // Date.now() + an incrementing sequence -- guarantees uniqueness
        // even when several NPCs spawn within the same millisecond.
        const id = `npc-${Date.now()}-${this.nextNpcSequence++}`;

        const npc = new NPCModel(id, position, faction);

        npc.setDespawnCallback((npcId) => {
            console.log(`NPC ${npcId} despawned after death`);
            this.networkSystem.npcs.delete(npcId);
            this.networkSystem.io.emit('removeNPC', npcId);
        });

        this.networkSystem.npcs.set(id, npc);

        this.networkSystem.io.emit('spawnNPC', {
            id,
            position,
            health: npc.getHealth(),
            faction: npc.faction
        });

        console.log(`Spawned new NPC ${id} (${npc.faction}) at position:`, position);
    }
}
