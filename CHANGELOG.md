# Changelog

All notable changes to ROX Diagnostics are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] — 2026-09-03

### Milestone M4 — App feature parity (read + safe writes)

#### Added

- **Unified guided-process event stream.** `SimulatorBridge` now speaks the same
  `runProcess` / `provideInput` / `abortProcess` protocol as the agent interpreter and
  emits `step-start`, `step-done`, `output`, `input-required`, `negative-response`,
  `trace`, `finished`, `aborted` and `error` events. `guided-runner.tsx` consumes that
  stream for both bridges with inline input forms, abort and a trace console; the old
  `executeStep` path is gone from `DiagnosticBridge`.
- **IO control screen** (`/ecus/$ecuId/io-control`): UDS `0x2F` with return control,
  reset to default, freeze and typed short-term adjust, gated by security access and the
  senior-technician role.
- **Configuration write screen** (`/ecus/$ecuId/configuration`): UDS `0x2E` behind the
  `features.configurationWrite` flag (default OFF, admin only) with old-vs-new byte
  review, double confirmation and automatic read-back diff.
- **Typed routine panel**: `31 01/02/03` by canonical RID with typed parameters and NRC
  meanings on failure.
- **Identification compare column** with expected-value match/mismatch badges and
  per-row copy.
- **Reports**: dealer header from Settings plus an XLSX workbook export (Summary,
  Control units, Fault codes) alongside the existing PDF.
- **Settings**: agent URL, dealer name/logo, vehicle variant, language (EN/ZH), access
  role and feature flags.
- **i18n** scaffolding with `react-i18next` and EN/ZH resources, persisted language.
- **Offline**: IndexedDB-backed write queue with a pure reducer and an offline pill in
  the top bar.
- **Access roles** (technician / senior / admin) enforced across clear-DTC, IO control,
  routines and configuration writes.
- **Tests**: DID decode/encode, CSV export, XLSX report, offline queue and role guards
  (97 unit tests total) plus a Playwright E2E scan → DTC → clear → report → history flow
  at 1440×900 and 1180×820.

#### Notes

- PDF generation stays on `jsPDF` + `jspdf-autotable` rather than
  `@react-pdf/renderer`; the existing generator already produces the required layout and
  swapping engines would have rewritten a working report for no user-visible gain.

## [0.3.0] — 2026-09-03

### Milestone M3 — Harden the hardware agent

#### Added

- **Transport abstraction** (`agent/src/transport/`). `Transport` exposes
  `open/close/send/onEvent/info` plus per-ECU tester-present control.
  `DoipTransport` wraps the existing `DoipClient` (routing activation, P2/P2\*,
  NRC `0x78`, source+target matching, typed NACKs). `J2534Transport` loads a vendor
  PassThru DLL through the optional `koffi` dependency and fails at `open()` with
  "J2534 not available on this platform" off Windows — never at import time.
  `ReplayTransport` replays JSONL recordings for tests and reports both hex strings
  on mismatch. `transport: { kind, j2534 }` selects one at startup, and `connect`
  now reports `vciName`, `vciSerial` and `protocolList`.
- **Recordings** — `tests/fixtures/recordings/` holds a CCU identification + DTC read
  session and an IBCM security/live-data session (`10 03`, `22 F1xx`, `19 02 FF`,
  `27 01/02`, `3E 80`).
- **Seed-key sidecar** (`agent/src/seedkey.ts`) with `dll`, `sidecar` and `test`
  backends and the canonical level → sub-function table (1→01/02, 3→03/04, 11→0B/0C,
  13→0D/0E, programming→11/12). The placeholder xor/add/invert algorithms are gone.
  Unlocked state is cached per ECU per session.
- **Guided-process interpreter** (`agent/src/process-interpreter.ts`) executing the
  canonical step tree — `ecuService`, `output`, `input`, `if`, `delay`, `setVar` —
  with `$variable` request fields, response layout decoding, `storeAs`, negative exits,
  comparators over variables and `$lastResponse.status` / `.nrc`, dry-run mode, and
  `runProcess` / `provideInput` / `abortProcess` streaming over the WebSocket.
- **Scan manager** (`agent/src/scan.ts`) — bounded concurrency, per-ECU
  `responded` / `silent` / `unmapped` classification and progress events.
- **Job logs** (`agent/src/job-log.ts`) — append-only JSONL under
  `~/.rox-agent/logs/<jobId>.jsonl`, VIN redacted unless `ROX_AGENT_LOG_FULL_VIN=1`,
  readable via `getJobLog`.
- **Protocol contract** — `packages/protocol` shares request/response/event types
  between agent and `LocalBridge`; `protocolVersion: 2` and `dataChecksum` travel in the
  `connect` handshake, and the app shows a non-blocking amber top-bar banner on
  mismatch. Documented in `agent/PROTOCOL.md`.
- **Docs** — `docs/ARCHITECTURE.md` (app ↔ bridge ↔ agent ↔ transport ↔ vehicle) and
  agent README sections for transport, seed-key backends, job logs and the ROX / Cihon
  IP note.
- **Tests** — ReplayTransport, DoipTransport against a fake in-process DoIP gateway,
  seed-key backends and SA table, interpreter behaviour, dry-run of all 131 seed
  processes, scan classification, JSONL logging and VIN redaction, protocol types.

#### Changed

- `VehicleSession` depends on `Transport` instead of `DoipClient`, keeps one session
  per ECU, and drives tester-present per target.

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
