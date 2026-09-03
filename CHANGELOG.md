# Changelog

All notable changes to ROX Diagnostics are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-09-03

### Milestone M2 — Fix the foundations

#### Added

- **Canonical data contract.** `data/canonical/README.md` documents the ten files the
  globatROX extraction must produce (42 ECUs, 589 RDBI / 1,056 DRDBI / 81 WDBI DIDs,
  113 IO controls, 148 routines, 131 processes) and how they flow downstream.
- **`packages/canonical-schema`** — zod schemas and exported types for every canonical
  file: ECU, DID, routine, IO control, DTC, signal layout, and the discriminated
  process-step union (`ecuService` | `output` | `input` | `if` | `delay` | `setVar`).
- **Generators.** `tools/build-seed.ts` (`npm run build:seed`) writes
  `src/data/r11-oversea-data.json`; `tools/build-agent-config.ts`
  (`npm run build:agent-config`) writes `agent/config.json` with real per-ECU addresses,
  tester `0x0E80`, functional `0xE400`, bus flag, identification / live data / snapshot /
  routines and security levels. Both embed the same `dataChecksum` (sha256 of the
  canonical set) so the app and the agent can compare at connect time. Both fail loudly
  when canonical files are missing, and the committed seed is left untouched until they exist.
- **Agent startup safety check.** `agent/src/config.ts` validates `config.json` with zod
  and refuses to start when any ECU in the seed is unmapped, when the tester address is
  not `0x0E80`, or when the data checksums disagree — unless `ROX_AGENT_ALLOW_OVERRIDE=1`.
  Unmapped ECU ids are listed in the error.
- **Session keep-alive.** Every non-default `enterSession` starts `3E 80` every 2,000 ms
  (S3 = 5,000 ms) and stops on return to the default session, on disconnect, or after idle.
- **Typed DoIP errors.** Routing activation codes `0x00–0x05` and diagnostic negative
  acknowledge codes `0x02–0x08` are reported explicitly instead of as raw hex.
- **Vitest suite** (`npm test`): UDS request/response codec, DoIP framing and acknowledge
  codes, DID scaling (factor / offset / signed / enum), DTC status-bit decode and
  classification, canonical zod schemas, and the agent startup check.
- **CI** — `.github/workflows/ci.yml` runs lint, format check, typecheck and tests on
  pushes and pull requests to `main` and `feat/*`.
- **Docs** — `docs/SCOPE.md` (v1 / v2 scope freeze) and `docs/ROLLBACK.md`.

#### Changed

- `src/data/vehicle-data.ts` types now describe the canonical shapes (numeric addresses,
  DIDs, routine definitions, IO controls, snapshot layouts, `dataChecksum`) with the new
  fields optional so the current seed still type-checks. `domain` is now an explicitly
  UI-only mapping derived from the legacy `subSystem` field (`src/data/domain-map.ts`).
- P2 (100 ms) and P2* (5,000 ms) from config replace the fixed 5-second UDS timeout; NRC
  `0x78` (response pending) extends the wait to P2*.
- `sendUds` now matches responses on **both** the ECU source address and the tester target
  address, so a frame addressed to another tester on the same gateway is never mistaken
  for ours.
- `readDtcs` uses the per-ECU status mask (`19 02 <mask>`) and classifies current /
  pending / history from the real status bits instead of simulating them.

#### Removed

- All hand-written placeholder ECU entries with invented DoIP addresses in
  `agent/config.json`. The `ecus` map is now generated only.
