project-root/
├── client/                  # Client-side code (browser)
│   ├── src/
│   │   ├── assets/          # 3D models, textures, sounds
│   │   ├── components/      # Reusable game objects
│   │   │   ├── Player.js    # Player movement and rendering
│   │   │   ├── NPC.js       # NPC rendering (logic from server)
│   │   │   └── Car.js       # Car movement and rendering
│   │   ├── systems/         # Game logic modules
│   │   │   ├── Combat.js    # Health, damage, shooting
│   │   │   ├── Quests.js    # Mission handling and tracking
│   │   │   └── HUD.js       # Heads-up display rendering
│   │   ├── utils/           # Helper functions
│   │   │   └── InputHandler.js  # Keyboard/mouse input
│   │   ├── scenes/          # Game states/scenes
│   │   │   └── GameScene.js # Main game scene (Three.js setup)
│   │   └── main.js          # Entry point, initializes game
│   ├── index.html           # HTML file to load the game
│   └── vite.config.js       # Vite config (if using Vite)
├── server/                  # Server-side code (Node.js)
│   ├── src/
│   │   ├── models/          # Data structures
│   │   │   ├── PlayerModel.js  # Player data (position, health)
│   │   │   ├── NPCModel.js     # NPC data and logic
│   │   │   └── CarModel.js     # Car data (position, health)
│   │   ├── systems/         # Server-side logic
│   │   │   ├── MissionSystem.js   # Manages quests
│   │   │   └── ReputationSystem.js # Tracks fame/infamy
│   │   ├── utils/           # Server utilities
│   │   │   └── Pathfinding.js  # NPC movement logic
│   │   └── server.js        # Main server, handles connections
│   └── package.json         # Server dependencies
├── shared/                  # Code shared between client/server
│   ├── constants.js         # Game constants (e.g., max health)
│   └── enums.js             # Enums (e.g., faction types)
└── package.json             # Root dependencies and scripts