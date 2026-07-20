import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { NetworkSystem } from './src/systems/Network.js';
import { registerAdminRoutes } from './src/admin/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Express app and HTTP server
const app = express();
const server = createServer(app);

// Initialize networking
const network = new NetworkSystem(server);

// Sessions/duration/D1 retention, last 30 days. If METRICS_SECRET is set,
// requires a matching ?key= -- keeps it off public view without needing a
// full auth system for a single read-only debug endpoint.
app.get('/metrics', (req, res) => {
  const secret = process.env.METRICS_SECRET;
  if (secret && req.query.key !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(network.metricsSystem.getSummary(30));
});

// Admin panel: view/kick/ban players. Gated by ADMIN_SECRET (disabled if unset).
registerAdminRoutes(app, network);

// Serve the built client (see client/vite.config.js outDir)
app.use(express.static(path.join(__dirname, '../client/dist')));

// Load persisted state (Postgres or JSON, see src/persistence/store.js)
// before accepting any connections -- socket handlers reference these
// systems by the time a real client can reach them, but not before.
const PORT = process.env.PORT || 3000;
network.init().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize persistence:', err);
  process.exit(1);
});
