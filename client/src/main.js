import { GameScene } from './scenes/GameScene';

// Initialize game
const game = new GameScene();

// Game loop
function animate() {
  requestAnimationFrame(animate);
  game.update();
}

// Start the game loop
animate(); 