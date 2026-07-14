# APBThree

Browser-playable multiplayer game inspired by APB (bounty-hunter online game).
Three.js (client) + Node/Express/Socket.io (server), pnpm workspace monorepo.

## Commands

pnpm dev       # client (vite, :5173) + server (node --watch, :3000) in parallel
pnpm build     # builds client to client/dist
pnpm preview   # preview the built client

## Architecture

- client/src/scenes/GameScene.js  - Three.js scene, camera, input, render loop
- client/src/components/          - Player.js, NPC.js (meshes + client-side behavior)
- client/src/systems/Network.js   - socket.io client
- client/src/utils/collision.js   - building AABB collision (mirrored in server/src/utils/collision.js -- keep both in sync, no shared package yet)
- server/src/systems/Network.js   - socket.io server, all game event handlers
- server/src/models/              - PlayerModel, NPCModel, CharacterModel (in-memory only, no persistence yet)
- server/server.js serves the built client via express.static('../client/dist')

## Task tracking: Trello, not code TODOs

**The backlog lives in Trello, not in source comments.** A grep for TODO/FIXME
across this repo returns nothing on purpose -- that's not a sign of a clean
backlog, it's a sign the backlog is elsewhere. Always check Trello before
assuming there's nothing to do next.

- Board is linked to this project via `.claude/trello-board.json`. Use the
  **trello-tasks** skill (`scripts/trello.py`) to read/write it -- don't guess
  card state from memory, it changes across sessions and across the two Claude
  instances working on this project (this local one + one running on the VPS).
- Lists: **Inbox** (unsorted/new) -> **Next** (queued up) -> **In Progress** ->
  **Done**. There's also a **NO PRIO** list for deprioritized big-ticket ideas.
- Convention: move a card to **In Progress** when you start it, **Done** when
  it's verified and pushed -- not just written. Don't leave cards stranded in
  In Progress across a session boundary; move back to Next if you stop before
  finishing.
- When you notice a bug or follow-up while working on something else, file it
  as a new Trello card instead of fixing it inline (unless trivial and in
  scope) -- keeps unrelated changes out of the current diff.
- Trello is the shared source of truth between this instance and the VPS
  instance -- if you moved/added cards, they'll see it, and vice versa. Don't
  assume a card's list reflects reality from memory alone; re-check the board,
  since the other instance may have moved things since you last looked.

## Gotchas

- packageManager is pinned to pnpm@10.4.0 in package.json -- corepack defaults to
  latest pnpm otherwise, which needs Node 22+ and breaks the Docker build.
- Client connects via `io(import.meta.env.VITE_SERVER_URL || undefined)` --
  undefined means same-origin (production/single-container). Set VITE_SERVER_URL
  only when running client/server as separate dev processes on different ports.
- docker-compose.yml expects an external `proxy` Docker network (for Traefik) --
  `docker compose up` fails without it. For local testing, use `docker build` +
  `docker run` directly instead.
- The embedded browser preview's screenshot/computer actions hang on this WebGL
  app in this sandbox (unrelated to app code). Fall back to: console messages,
  DOM read_page/find/click (both work fine), and `node --input-type=module -e`
  for testing pure logic (e.g. collision.js) directly.

## Workflow

- Deployed on a Hetzner VPS (apb.wuerbo.com) behind Traefik, managed by a
  separate Claude Code instance running there. This (local) instance does repo
  work; the VPS instance handles deploys and ops.
- Non-trivial changes go on a feature branch + PR rather than pushing straight
  to master, so the VPS instance can review/merge/deploy deliberately.

## Agent skills

### Issue tracker

Trello, via the `trello-tasks` skill (board linked at `.claude/trello-board.json`) --
see the "Task tracking" section above for the day-to-day convention. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), applied as Trello labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (one `CONTEXT.md` + `docs/adr/` at the repo root; `client/`+`server/` are one game, not separate domains). See `docs/agents/domain.md`.
