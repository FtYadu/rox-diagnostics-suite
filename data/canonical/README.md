# Canonical vehicle data (`data/canonical`)

This folder is the **single source of truth** for everything ROX Diagnostics knows about
the ROX 01 (`R11_Oversea`). It is produced by the extraction scripts that read the legacy
globatROX dealer tool database, and it is consumed by two generators in this repo:

| Generator                     | Output                           | npm script                   |
| ----------------------------- | -------------------------------- | ---------------------------- |
| `tools/build-seed.ts`         | `src/data/r11-oversea-data.json` | `npm run build:seed`         |
| `tools/build-agent-config.ts` | `agent/config.json`              | `npm run build:agent-config` |

Nothing in this folder is hand-written. Nothing downstream of it may invent addresses,
DIDs, routine identifiers or fault-code names. Both generators fail loudly when a file is
missing or fails schema validation, and both embed the same `dataChecksum`
(sha256 over the canonical set) so the app and the local agent can detect a mismatch at
connect time.

## Expected files

| File             | Contents                                                    | Expected count                       |
| ---------------- | ----------------------------------------------------------- | ------------------------------------ |
| `ecus.json`      | ECU list: id, full name, legacy `subSystem`, bus, SA levels | **42 ECUs**                          |
| `addresses.json` | ECU id → primary + secondary DoIP/CAN logical addresses     | 42 entries                           |
| `services.json`  | Supported UDS SIDs and sub-functions per ECU                | 42 entries                           |
| `dids.json`      | Data identifiers, grouped by access class                   | **589 RDBI / 1,056 DRDBI / 81 WDBI** |
| `dtcs.json`      | Fault codes per ECU: 3-byte code, text form, name, severity | all DTCs                             |
| `routines.json`  | Routine identifiers with supported sub-functions            | **148 routines**                     |
| `iocontrol.json` | InputOutputControlByIdentifier entries                      | **113 IO controls**                  |
| `processes.json` | Guided service processes with typed step programs           | **131 processes**                    |
| `flows.json`     | Programming / reprogramming flows and their phases          | all flows                            |
| `menu.json`      | Legacy dealer-tool menu tree (navigation + grouping only)   | 1 tree                               |

Counts are asserted by the generators. A deviation means the extraction changed and must
be reviewed, not silently accepted — pass `--allow-count-drift` only while iterating on
the extractor.

## Shapes

Every file is validated with the zod schemas in `packages/canonical-schema`. That package
is the machine-readable version of this document; read `packages/canonical-schema/src/index.ts`
for the exact fields, and import the exported types instead of re-declaring them.

Notes that are easy to get wrong:

- **`address` is a number**, not a hex string (`0x1001` → `4097`). Hex only appears in
  generated `agent/config.json`, for human readability.
- **DTC `code` is the 3-byte numeric value** (`0x911716` → `9508118`); `codeText` is the
  dealer-facing form (`B111716`).
- **`domain`** (Body / Chassis / Powertrain / …) is _not_ canonical. It is a UI-only
  grouping derived from the legacy `subSystem` field through `SUBSYSTEM_DOMAIN` in
  `src/data/vehicle-data.ts`.
- **Session and security requirements travel with the data** (`session`, `saLevel`), so the
  UI can gate an action before it hits the bus.
- **Process steps are a discriminated union** on `kind`
  (`ecuService` | `output` | `input` | `if` | `delay` | `setVar`), which keeps guided
  processes executable rather than being a list of English sentences.
