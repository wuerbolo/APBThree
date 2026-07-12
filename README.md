# APBThree

A browser-playable multiplayer game inspired by APB: pick **Criminal** or
**Enforcer**, roam a low-poly city, fight the opposing faction (players and
NPCs), earn cash and reputation, and spend it at the STORE.

Live at **https://apb.wuerbo.com**.

## Stack

- **Client**: [Three.js](https://threejs.org/) + Vite
- **Server**: Node.js + Express + Socket.io (authoritative for damage,
  economy, NPC AI and spawning)
- **Monorepo**: pnpm workspace (`client/` + `server/`)

## Development

```sh
pnpm install
pnpm dev        # client on :5173 (Vite) + server on :3000, in parallel
```

When client and server run as separate dev processes, point the client at
the server with `VITE_SERVER_URL=http://localhost:3000`. In production the
server serves the built client from the same origin, so no URL config is
needed.

```sh
pnpm build      # builds client to client/dist
pnpm preview    # preview the built client
```

## Docker

```sh
docker build -t apb-three .
docker run -p 3000:3000 apb-three
```

`docker-compose.yml` is set up for the production VPS (Traefik labels,
external `proxy` network) -- for local testing use plain `docker build` +
`docker run` as above.

## Gameplay (current state)

- Two playable factions (Criminal / Enforcer) + neutral Civilian NPCs.
- Enforcers spawn at their HQ building; Criminals spawn anywhere.
- NPCs wander, and Criminal/Enforcer NPCs chase and attack
  opposing-faction targets (players and NPCs).
- Kills drop cash pickups; rival-faction kills also grant reputation, with
  a doubling level curve (30 / 60 / 120 / ...).
- Dying costs you all your cash and half your reputation.
- STORE building sells weapons (shotgun) -- walk up, press E.
- First-person view with weapon viewmodel, plus a top-down tactical view
  (V key, scroll to zoom).
- Characters persist across refreshes/restarts (localStorage token +
  server-side JSON persistence).

## Architecture notes

- `client/src/scenes/GameScene.js` -- scene, camera, input, render loop
- `client/src/systems/Network.js` / `server/src/systems/Network.js` --
  socket.io on both ends; the server file holds all game event handlers
- `server/src/systems/NPCSpawner.js` -- keeps a minimum population per
  faction alive (players count toward their faction's quota)
- `*/src/utils/collision.js` -- building layout + AABB collision, mirrored
  between client and server (keep both in sync; no shared package yet)

Task tracking lives in Trello, not in code TODOs -- see `CLAUDE.md`.
