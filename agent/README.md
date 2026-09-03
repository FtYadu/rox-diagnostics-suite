# ROX VCI Agent

The local hardware agent that lets ROX Diagnostics talk to a real vehicle. It runs
on the technician's Windows PC or workshop tablet — not on the web server, because
DoIP/CAN access needs a real network stack and the VCI cable.

```
Browser (ROX Diagnostics)  ──ws://127.0.0.1:9097──►  rox-vci-agent  ──DoIP/UDS──►  ROX 01
```

When the agent is running and a vehicle answers, the app's top bar shows
**Hardware connected** and every DID, DTC, freeze frame and live-data value comes
from the car. With no agent, the app silently falls back to the Simulator.

## Run it

```bash
cd agent
npm install
npm start          # Node 22+ (type stripping)
# or: npm run start:bun
```

Environment overrides: `ROX_AGENT_PORT` (default 9097), `ROX_AGENT_CONFIG`
(path to a different config file), `ROX_AGENT_ALLOW_OVERRIDE=1` (start with an
incomplete config — bench use only), `ROX_AGENT_LOG_DIR`, `ROX_AGENT_LOG_FULL_VIN=1`.

## Transport

`config.json` selects how the agent reaches the car:

```json
{ "transport": { "kind": "doip" } }
{ "transport": { "kind": "j2534", "j2534": { "dllPath": "C:/vendor/PassThru.dll", "protocol": "ISO15765" } } }
```

`doip` is the default. `j2534` loads a vendor PassThru DLL through the optional
`koffi` dependency and is Windows-only: on any other platform, or with no
`dllPath`, `open()` fails with "J2534 not available on this platform" — it never
crashes at import time. Install it with `npm install koffi` on the workshop PC.

## Security access (seed & key)

The real algorithm ships as a licensed native `ROX_SeedKey.dll` that is **not** in this
repository. Point the agent at your copy:

```json
{
  "security": {
    "seedKey": { "backend": "dll", "dllPath": "C:/ROX/ROX_SeedKey.dll", "exportName": "ComputeKey" }
  }
}
```

Or run it out of process (any language, keeps the DLL out of the agent):

```json
{ "security": { "seedKey": { "backend": "sidecar", "command": "python", "args": ["seedkey.py"] } } }
```

The sidecar reads `level seedHex alg` on stdin and writes `keyHex` to stdout.
Level → sub-function pairs are fixed: 1→(01,02), 3→(03,04), 11→(0B,0C), 13→(0D,0E),
programming→(11,12); algorithm 0/1 for extended levels, 9 for programming.

## Job logs

Each job appends JSONL to `~/.rox-agent/logs/<jobId>.jsonl` and is readable with the
`getJobLog` method. VINs are redacted to the last six characters unless
`ROX_AGENT_LOG_FULL_VIN=1` is set.

## Legal

The ROX 01 vehicle data and the `ROX_SeedKey` library are ROX / Cihon intellectual
property. Never commit either — no DLL, no extracted dealer database — to this
repository or any public mirror.

## What it implements

| App call                | UDS                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `connect` / `status`    | DoIP vehicle identification (UDP 13400), routing activation, battery/ignition DIDs |
| `readIdentification`    | `10 03`, then `22 <DID>` per configured identification DID                         |
| `readDtcs`              | `19 02 FF`, decoded to `B111716`-style codes + status bits                         |
| `clearDtcs`             | `14 FF FF FF`, or `14 <DTC>` per selected code                                     |
| `readFreezeFrame`       | `19 06 <DTC> FF` snapshot record                                                   |
| `readLiveData`          | `22 <DID>` per selected parameter, scaled with factor/offset                       |
| `requestSecurityAccess` | `27 <odd>` seed → `27 <even>` key                                                  |
| `runRoutine`            | `31 01/02/03 <RID>`                                                                |
| `executeStep`           | raw request mapped per guided-process step                                         |
| `startProgramming`      | `10 02`, `27` L17, `34/36/37` transfer, `11 01` reset                              |

Negative responses are returned with the real NRC (`0x33 securityAccessDenied`,
`0x35 invalidKey`, …) and every frame is streamed to the app's Trace console.

## Configure the vehicle (`agent/config.json`)

Fault-code names and severities are read from `src/data/r11-oversea-data.json`, so
only the _addressing_ lives here. Per ECU:

- `address` — DoIP logical address (required; unmapped ECUs return a clear error
  instead of guessing).
- `identification` — DIDs shown on the Identification tab.
- `liveData` — parameter list: `did`, `label`, `unit`, `length`, `factor`,
  `offset`, `signed`, `min`, `max`.
- `snapshot` — layout of the 19 06 record.
- `routines` — routine name from the vehicle data → routine identifier.
- `security` — the levels this ECU supports. Keys are computed by the seed-key backend
  below, never by an in-repo algorithm.

`processes` maps a guided process step to a raw request, e.g.

```json
"processes": {
  "Steering angle sensor calibration": [
    { "step": 3, "request": "31 01 02 03", "description": "Calibration started" }
  ]
}
```

`{input}` in a request is replaced with the hex of the technician's input, which
covers VIN writes and sensor-ID entry.

> Addresses, DIDs, routine IDs and seed/key masks are OEM data. The shipped file
> contains the gateway (`CCU`) skeleton only — fill in the rest from the R11
> diagnostic specification before using the hardware bridge in a dealership.
