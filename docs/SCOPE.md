# Scope freeze

Agreed at Milestone M2 (2026-09-03). Anything not listed under v1 is out of scope for v1,
even when the canonical data would allow it.

## v1 — dealer diagnostics

1. **Connect** — VCI discovery, DoIP routing activation, data-checksum match between app
   and agent, live battery voltage and ignition state.
2. **Identification** — read identification DIDs per ECU (`0x22`).
3. **DTC read / clear** — `19 02 <mask>` with real status-bit classification, `14` clear
   (single code and all codes).
4. **Freeze frame** — `19 06` snapshot records decoded through the canonical snapshot layout.
5. **Live data** — multi-select parameters, rolling chart, CSV recording.
6. **IO control** — `2F` with returnControl / resetToDefault / freeze / shortTermAdjust.
7. **Routines** — `31` start / stop / requestResults with typed parameters.
8. **Guided processes** — the 131 canonical processes executed step by step, with security
   access, session handling and a UDS trace.
9. **Reports** — PDF health-scan report (VIN, ECUs scanned, DTC summary, technician notes).
10. **Job history** — one job per vehicle action, with events, trace and downloads.

### v1 status (0.4.1)

Cloud persistence, dealer roles, job attachments, offline queue replay and the offline app
shell are in place. Remaining v1 polish: full i18n extraction of the diagnostic panels and
an executed E2E run (blocked locally by Playwright's browser sandbox, runs in CI).

### v1 status (M4)

All ten v1 items are implemented against the Simulator and share one code path with
`LocalBridge`. IO control and routines are additionally gated by the senior-technician
role; clear-DTC needs the same role.

## v2 — deferred

- **Configuration writes (WDBI, `2E`)** — implemented behind the `features.configurationWrite`
  flag (default OFF, admin only) so it can be validated on a bench vehicle before release.
- **Programming / reprogramming** — `34/36/37` flash flows beyond the current reference
  implementation.
- **CAN viewer** — raw bus monitoring and frame capture.
- **TIS manual integration** — repair-manual lookup from a DTC.

## Non-goals

- Any hardware access from the browser or from server code: all bus traffic goes through
  the local agent on the technician's PC.
- Hand-written vehicle data. Addresses, DIDs, routine identifiers, fault-code names and
  processes come from `data/canonical` only.
