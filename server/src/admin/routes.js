import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PANEL_FILE = path.join(__dirname, 'panel.html');

const COOKIE_NAME = 'bolo-admin';

// The session cookie is an HMAC derived from the secret, so it's stateless
// (survives restarts), can't be forged without the secret, and never
// contains the secret itself.
function sessionCookieValue(secret) {
  return crypto.createHmac('sha256', secret).update('bolo-admin-session').digest('hex');
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

// Mounts the admin panel (view/kick/ban players) on the game's Express app.
// Everything lives under /admin and is gated by ADMIN_SECRET -- if that env
// var isn't set, the whole panel is disabled rather than left open.
export function registerAdminRoutes(app, network) {
  const secret = process.env.ADMIN_SECRET;

  app.use('/admin', express.json());

  if (!secret) {
    app.use('/admin', (req, res) => {
      res.status(503).send('Admin panel disabled: set the ADMIN_SECRET environment variable to enable it.');
    });
    return;
  }

  const expectedCookie = sessionCookieValue(secret);

  const requireAuth = (req, res, next) => {
    const cookie = getCookie(req, COOKIE_NAME);
    if (cookie && timingSafeEqual(cookie, expectedCookie)) return next();
    res.status(401).json({ error: 'Unauthorized' });
  };

  app.get('/admin', (req, res) => {
    res.type('html').send(fs.readFileSync(PANEL_FILE, 'utf8'));
  });

  app.post('/admin/api/login', (req, res) => {
    const attempt = (req.body && req.body.secret) || '';
    if (!timingSafeEqual(attempt, secret)) {
      return res.status(401).json({ error: 'Wrong secret' });
    }
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=${expectedCookie}; HttpOnly; SameSite=Strict; Path=/admin${isHttps ? '; Secure' : ''}`);
    res.json({ ok: true });
  });

  app.get('/admin/api/players', requireAuth, (req, res) => {
    res.json(network.getAdminPlayerList());
  });

  app.post('/admin/api/kick', requireAuth, (req, res) => {
    const { socketId } = req.body || {};
    const result = network.kickPlayer(socketId);
    if (!result) return res.status(404).json({ error: 'Player not found' });
    res.json({ ok: true });
  });

  app.post('/admin/api/ban', requireAuth, (req, res) => {
    const { socketId, reason } = req.body || {};
    const entry = network.banPlayer(socketId, reason);
    if (!entry) return res.status(404).json({ error: 'Player not found' });
    res.json({ ok: true, ban: entry });
  });

  app.get('/admin/api/bans', requireAuth, (req, res) => {
    res.json(network.banSystem.list());
  });

  app.post('/admin/api/unban', requireAuth, (req, res) => {
    const { token } = req.body || {};
    if (!network.banSystem.unban(token)) {
      return res.status(404).json({ error: 'Ban not found' });
    }
    res.json({ ok: true });
  });
}
