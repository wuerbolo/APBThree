import { NPCModel, randomNPCFaction } from '../models/NPCModel.js';
import { getSpawnPositionForFaction } from '../utils/collision.js';

export class NPCSpawner {
    constructor(networkSystem, targetPopulation = 5) {
        this.networkSystem = networkSystem;
        this.targetPopulation = targetPopulation;
        this.respawnQueue = [];
        // Date.now() alone isn't unique enough -- multiple NPCs spawning in
        // the same millisecond (e.g. the initial population burst) would
        // collide and silently overwrite each other in this.networkSystem.npcs.
        this.nextNpcSequence = 0;

        // Start queue check interval
        setInterval(this.checkQueue.bind(this), 1000);

        // Initial spawn
        this.spawnInitialNPCs();
    }

    spawnInitialNPCs() {
        const currentCount = this.networkSystem.npcs.size;
        for (let i = currentCount; i < this.targetPopulation; i++) {
            this.spawnNPC();
        }
    }

    onNPCDeath(npcId) {
        // Queue respawn in 10-30 seconds
        const respawnTime = Date.now() + (Math.random() * 20000) + 10000;
        this.respawnQueue.push({ id: npcId, time: respawnTime });
        console.log(`NPC ${npcId} queued for respawn at ${new Date(respawnTime).toLocaleTimeString()}`);
    }

    checkQueue() {
        const now = Date.now();
        const currentPopulation = this.networkSystem.npcs.size;

        // Process queue
        this.respawnQueue = this.respawnQueue.filter(entry => {
            if (now >= entry.time && currentPopulation < this.targetPopulation) {
                this.spawnNPC();
                return false;
            }
            return true;
        });

        // Spawn additional NPCs if population is low
        if (currentPopulation < this.targetPopulation && this.respawnQueue.length === 0) {
            this.spawnNPC();
        }
    }

    spawnNPC() {
        // Faction has to be picked before the position: Enforcers spawn at
        // their HQ, everyone else spawns anywhere on the open map.
        const faction = randomNPCFaction();
        const position = getSpawnPositionForFaction(faction);

        // Date.now() + an incrementing sequence -- guarantees uniqueness
        // even when several NPCs spawn within the same millisecond.
        const id = `npc-${Date.now()}-${this.nextNpcSequence++}`;

        const npc = new NPCModel(id, position, faction);
        
        // Set up despawn callback
        npc.setDespawnCallback((npcId) => {
            console.log(`NPC ${npcId} despawned after death`);
            this.networkSystem.npcs.delete(npcId);
            this.networkSystem.io.emit('removeNPC', npcId);
            // Queue for respawn
            this.onNPCDeath(npcId);
        });

        // Add to network system
        this.networkSystem.npcs.set(id, npc);
        
        // Notify clients
        this.networkSystem.io.emit('spawnNPC', {
            id,
            position,
            health: npc.getHealth(),
            faction: npc.faction
        });

        console.log(`Spawned new NPC ${id} (${npc.faction}) at position:`, position);
    }
} 