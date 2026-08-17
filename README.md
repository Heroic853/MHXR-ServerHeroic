# MHXR — Apypos Server (restoration work)

**Work in progress.** A private server for *Monster Hunter Explore* (モンスターハンター エクスプロア),
the Capcom mobile game whose official servers were shut down in 2020.

This repository is a working fork of [Forgotten-MH/apypos-server](https://github.com/Forgotten-MH/apypos-server),
focused on one goal: **making the event quests actually work**. Story/island quests already
ran fine upstream; event quests were largely broken or invisible. Most of the work here is
about bringing those back.

The long-term aim is to get the server stable enough to open it up so people can play together
again. It is not there yet — see [Current state](#current-state).

> **Owner:** [@Heroic853](https://github.com/Heroic853) — everyone else contributes.

---

## Current state

| Area | Status |
|---|---|
| Login, account creation, asset download | working |
| Story / island quests | working (unchanged from upstream) |
| Event quests — visibility | **fixed** — all 2189 event quest entries are now reachable in game |
| Event quests — correct monster | **~1490 assigned**, roughly 96% of event quests |
| Event quests — rewards | **fixed** — quests now grant their own reward materials |
| Multiplayer | working, lightly tested |
| Public/open server | not yet — still running privately on a home machine |

---

## What was fixed here

### Event quests were invisible

The game reads events from six collections (`tourevents`, `m16events`, `standingevents`,
`assualtevents`, `scoreevents`, `ticketevents`). Only 289 of the 983 event nodes had ever been
registered into any of them, so **74% of event content simply did not exist** as far as the client
was concerned. Mapping the remaining `mBannerPath` prefixes to their collections took reachable
quests from 561 to 2189.

### Boss and reward data was silently lost on import

Every event quest *does* carry its boss and reward list in the raw game files, but the XFS
converter wraps them as `{mAutoDelete, classref_: {mpArray: [...]}}` — and in some quests the key
is `array` instead, with the objects already merged. The Mongoose schema expects a plain array,
received an object, and wrote `[null]`.

Recovered: **1525 boss entries** and **1524 reward lists**.

### Rewards were hardcoded

Even after recovery, `questIsland.controller.ts` never read them: `other_list_add` was four fixed
slots all handing out the same material id. Rewards are now drawn from the quest's own
`mRewardItemList`, weighted by `mProbScale`.

### Wrong monsters

The monster is not sent by the server — it comes from the **map block** the server picks. Wrong
block, wrong monster. The quest→block mapping does not exist in any shipped file; upstream falls
back to `getBlockHashsFromQuestHash`, an approximate search that increments a suffix until
something matches.

Blocks are now chosen by scoring candidates against the quest's actual target: monster name and
variant (special species, elemental variants, collaboration monsters), continent, and difficulty,
while penalising arena maps, tutorial-island continents and low-HP test blocks.

### Two endpoints were never implemented

`/event/normal/end` and `/event/m16/end` were commented out in the router. The client calls them
when a hunt ends and retries forever without an answer, leaving the player stuck with no reward.
Both now route to the existing generic handler.

### An XFS v16 parser that works on the Android build

`tools-js/xfs-parse.cjs`. The upstream TypeScript parser is written for a 32-bit layout; MHXR
Android uses 64-bit. Four differences: `propNum` sits at +8 rather than +4, property entries are
80 bytes rather than 40, the `size` field after a classref is 64-bit, and strings are inline
NUL-terminated rather than length-prefixed. Validated at 250/250 records against `blocks.csv`.

### Smaller fixes

- `box.controller.ts` `PaymentGet` returned a fixed currency list without ever reading the
  database. It now reads the user's actual `box.payments`.
- Block count now respects the rule validated across all 1995 story quests: the number of blocks
  sent is always `>=` the highest `mAreaNo`. 167 event quests violated it.
- `Boolean("false") === true` in JavaScript — `API_NOT_AVAILABLE_MAINTENANCE` must be left
  *empty*, never set to `"false"`.

---

## What is **not** in this repository

This repo contains code only. It deliberately excludes:

- **game assets** (`src/public/res`, ~3.7 GB of FPK archives)
- **the game client / APK**
- anything extracted from the game binaries

Those are Capcom's. You need your own copy of the game to obtain them. Nothing here will run a
playable server on its own, by design.

---

## Running it

Requires Docker. Copy `.env.example` to `.env` and fill it in, then:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Two things that will bite you otherwise:

1. `IP` in `.env` is **not** a bind address, despite what `.env.example` suggests. The server
   interpolates it into the URLs it hands the client (`api: http://${IP}/api`). It must be the
   hostname players actually reach. `0.0.0.0` produces a client that cannot connect.
2. `yarn build` creates `dist/public` as a **symlink** to `../src/public`, and the runtime image
   only copies `/app/dist`. Mount your assets at `/app/src/public`, not `/app/dist/public`.

The database password must be **alphanumeric only** — it is interpolated into the Mongo
connection string without URL encoding, so an `@` breaks it. On Windows, write `.env` as UTF-8
**without BOM**, or compose reads the first key as `?IP`.

Maintenance scripts live in `tools-js/`, mounted at `/app/tools`:

```bash
docker compose -f docker-compose.prod.yml exec -T server node /app/tools/<script>.cjs
```

They use the `.cjs` extension on purpose: `package.json` declares `"type": "module"`, so any
`.js` file under `/app` would be parsed as ESM and every `require()` would fail.

---

## `tools/` — PowerShell helpers

| Script | What it does |
|---|---|
| `Patch-MhxrUrl.ps1` | Rewrites the dispatch URL in `libMHS.so`. Validates **both** architectures before writing either, so arm64 and armeabi-v7a can never end up pointing at different servers — a mismatch that produces a client which works in an emulator and fails on a real phone. `-Restore` reverts. |
| `Update-DuckDns.ps1` | Keeps a DuckDNS domain pointed at the current IP, public or LAN (`-UseLocalIp`). Token stored DPAPI-encrypted. Registers a scheduled task. |
| `Backup-Mhxr.ps1` | Dumps and restores the database through `docker cp`, never through a shell redirect (which corrupts the gzip archive on Windows). |

The reason the dispatch URL matters: the client has exactly **one** hardcoded address. Every other
endpoint is handed to it at runtime from the server's own `.env`. Put a *domain* in that one slot
and the client never needs repatching again — when the server moves, you update DNS.

The slot is fixed-width and cannot be extended: 55 bytes on arm64, **48 on armeabi-v7a**, which is
the real limit. On arm64 a pointer table sits immediately after it, so overrunning corrupts the library.

---

## Credits and licence

Upstream: [Forgotten-MH/apypos-server](https://github.com/Forgotten-MH/apypos-server) —
all the heavy lifting of the original server implementation is theirs.

Licensed under **AGPL-3.0**, same as upstream. If you run a modified version of this server and
let other people connect to it, the licence requires you to offer them the source.

This is a non-commercial preservation project for a game that is no longer sold or operated.
Not affiliated with Capcom.
