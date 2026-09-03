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
(path to a different config file).

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
- `security` — per level: `xor` / `add` / `invert` and a `mask`.

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
