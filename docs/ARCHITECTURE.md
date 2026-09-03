# Architecture

ROX Diagnostics is a browser app that never touches vehicle hardware itself. Everything
physical happens in a local agent on the technician's machine, behind one interface.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Browser — ROX Diagnostics (TanStack Start, React 19)                     │
│   routes/  features/  store (Zustand)  TanStack Query                    │
│                        │                                                 │
│                 DiagnosticBridge  (src/features/bridge/types.ts)         │
│                    │                         │                           │
│           SimulatorBridge              LocalBridge                        │
│        (in-browser, default)     (ws://127.0.0.1:9097, protocol v2)      │
└──────────────────────────────────────────────────────────────────────────┘
                                            │  JSON messages
                                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ rox-vci-agent (Node 22 / Bun, technician's PC or tablet)                 │
│   main.ts        WebSocket server, method handlers, streaming events     │
│   session.ts     VehicleSession — per-ECU session, tester-present, SA    │
│   scan.ts        bounded-concurrency vehicle scan + progress events      │
│   process-interpreter.ts   canonical step tree (ecuService/if/input/…)   │
│   seedkey.ts     licensed DLL | sidecar | test backends                  │
│   job-log.ts     ~/.rox-agent/logs/<jobId>.jsonl, VIN redacted           │
│                        │                                                 │
│                    Transport  (agent/src/transport/types.ts)             │
│        ┌───────────────┼────────────────────┬─────────────────┐          │
│  DoipTransport   J2534Transport      ReplayTransport                     │
│  (DoipClient)    (koffi PassThru,    (tests, JSONL recordings)           │
│                   Windows only)                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                            │  DoIP / ISO 15765 · UDS
                                            ▼
                                  ROX 01 (R11_Oversea) gateway → 42 ECUs
```

## Rules that keep this honest

- The UI only ever calls `DiagnosticBridge` through the bridge provider/hook. No screen
  imports `SimulatorBridge` or `LocalBridge` directly.
- The agent only ever talks to `Transport`. Swapping DoIP for J2534, or for a recorded
  session in tests, changes one config field and nothing else.
- Vehicle addressing, DIDs, routine IDs and processes are **generated** from
  `data/canonical/` into `src/data/r11-oversea-data.json` and `agent/config.json`,
  with the same `dataChecksum` in both. Nothing is hand-written; an invented address
  would silently talk to the wrong controller.
- The app and agent compare `protocolVersion` and `dataChecksum` at connect time and
  warn (amber banner) rather than block.
- Every module added in M3 is testable without a car: `ReplayTransport` replays the
  JSONL recordings in `tests/fixtures/recordings/`, and the seed-key `test` backend
  maps seed → key from a table.
