# Issue tracker: Trello

Issues, backlog items, and specs for this repo live as cards on a Trello
board, managed through the `trello-tasks` skill (`scripts/trello.py`, a
stdlib-only Python CLI). The board is linked to this repo via
`.claude/trello-board.json` (already set up — see `board status` if you need
to confirm).

## Conventions

- **Lists** (workflow stage, not triage state): `Inbox` → `Next` →
  `In Progress` → `Implemented` → `Done`. `Implemented` is the handoff point
  when two Claude sessions share a board (e.g. one working locally, one on a
  deploy box): whoever writes the code attaches the PR link and moves the
  card to `Implemented`; whoever owns merging/deploying moves it to `Done`
  once it's live. See `CLAUDE.md` for the full local convention.
- **Create a card**: `python scripts/trello.py add "title" [label] [description]` —
  lands in `Inbox`. Write a real description (what, why, constraints), not
  just a title; cards often get picked up in a session with no memory of
  this one.
- **List open cards**: `python scripts/trello.py list [label]`, grouped by
  list, optionally filtered by label. Attached URLs show indented under each
  card.
- **Move a card**: `python scripts/trello.py move <card-id> "<list-name>"`
- **Attach a URL** (PR, commit, doc): `python scripts/trello.py attach <card-id> <url> [name]`
- **Archive** (reversible): `python scripts/trello.py archive <card-id>`
- **Labels**: `python scripts/trello.py labels` lists this board's labels;
  `add` creates a new one automatically the first time you use its name.
- Card ids are the short codes shown in brackets by `list`, e.g. `[aBc123]`.

## When a skill says "publish to the issue tracker"

`python scripts/trello.py add "title" [label] "description"` — creates the
card in `Inbox`.

## When a skill says "fetch the relevant ticket"

`python scripts/trello.py list` and find the card by its short id or title —
this shows the title and any attached URLs, but not the full description.
For the full description, call the Trello REST API directly with the
credentials in `~/.config/trello/env`:

```
GET https://api.trello.com/1/cards/<card-id>?key=<TRELLO_KEY>&token=<TRELLO_TOKEN>&fields=name,desc,shortUrl
```

(The CLI has no `show` subcommand; this is the same fallback the
`trello-tasks` skill itself uses for anything outside its handful of
commands — e.g. editing a card's description or deleting an attachment.)

## Wayfinding operations

Used by `/wayfinder`. Trello has no native sub-card or dependency graph, so
this is a best-effort mapping onto cards, lists, and description text —
closer in spirit to the local-markdown fallback than to GitHub's.

- **Map**: a single card in `Inbox`, holding the Notes / Decisions-so-far /
  Fog body in its description.
- **Child ticket**: a card with `Part of: <map-card-id>` as the first line of
  its description, and a `Type:` line (`research`/`prototype`/`grilling`/`task`).
  Since the CLI can't edit an existing description, set both lines when
  creating the card (`add` takes a description) or edit via the direct API
  call above.
- **Blocking**: a `Blocked by: <id>, <id>` line in the child's description
  (set at creation, same API-call caveat for later edits). A ticket is
  unblocked when every listed blocker card is in `Done`.
- **Frontier**: cards that are `Part of` the map, still in `Inbox` or `Next`
  (not yet claimed), with no unblocked-blocker still outstanding; first
  created wins.
- **Claim**: `move <card-id> "In Progress"` — the session's first write.
- **Resolve**: `attach <card-id> <url-or-summary-as-comment-via-API>` isn't
  a fit for prose answers — instead, append the answer to the card
  description via the direct API call, then `move <card-id> "Done"`, then
  append a context pointer (gist + link) to the map card's Decisions-so-far
  (also via the direct API call, since the CLI can't edit an existing
  description).
