import { NPCModel } from '../models/NPCModel.js';

export class NPCSpawner {
    constructor(networkSystem, targetPopulation = 5) {
        this.networkSystem = networkSystem;
        this.targetPopulation = targetPopulation;
        this.respawnQueue = [];
        this.spawnPoints = [
            { x: -40, z: -40 },
            { x: 40, z: -40 },
            { x: -40, z: 40 },
            { x: 40, z: 40 },
            { x: 0, z: 0 }
        ];

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
        // Get random spawn point
        const spawnPoint = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
        
        // Add some randomness to spawn position
        const position = {
            x: spawnPoint.x + (Math.random() * 10 - 5),
            y: 1,
            z: spawnPoint.z + (Math.random() * 10 - 5)
        };

        // Generate unique ID
        const id = `npc-${Date.now()}`;
        
        // Create new NPC
        const npc = new NPCModel(id, position);
        
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
            health: npc.getHealth()
        });

        console.log(`Spawned new NPC ${id} at position:`, position);
    }
} 