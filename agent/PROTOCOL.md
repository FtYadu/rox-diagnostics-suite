# ROX agent protocol (v2)

Transport: a single WebSocket on `ws://127.0.0.1:9097`, one JSON object per message.
Shared TypeScript types live in `packages/protocol` and are imported by both the agent
and the browser `LocalBridge`, so a wire change breaks the typecheck instead of the car.

## Envelopes

Request (browser → agent):

```json
{ "id": "1757000000000-1", "method": "readDtcs", "params": { "ecu": "CCU" } }
```

Replies (agent → browser) reuse the request `id`:

| `type`   | Meaning                                                    |
| -------- | ---------------------------------------------------------- |
| `result` | Final value; `payload` is the method's response type.      |
| `event`  | Intermediate progress for long calls; more will follow.    |
| `error`  | Failure; `message` carries the technician-readable reason. |

Messages **without** an `id` are unsolicited pushes (status/battery/VCI changes).

## Handshake — `connect` / `status`

```json
{
  "mode": "local",
  "agentVersion": "0.3.0",
  "protocolVersion": 2,
  "dataChecksum": "9f0c…",
  "transport": "doip",
  "vci": { "vciName": "ROX VCI", "vciSerial": "RX-0042", "protocolList": ["DoIP", "CANFD"] },
  "vciName": "ROX VCI",
  "vciSerial": "RX-0042",
  "protocol": "DoIP / CANFD",
  "vin": "HJ4ABBHK4RN000123",
  "batteryVoltage": 12.6,
  "ignitionOn": true
}
```

The app compares `protocolVersion` with its own and `dataChecksum` with the checksum of
its seed. A mismatch shows an amber top-bar banner — it never blocks diagnostics.
The flat `vciName` / `vciSerial` / `protocol` fields are kept for v1 agents.

## Methods

| Method                  | Params                                      | Result                                        |
| ----------------------- | ------------------------------------------- | --------------------------------------------- |
| `connect`, `status`     | —                                           | handshake above                               |
| `readIdentification`    | `{ ecu }`                                   | `IdentificationEntry[]`                       |
| `readDtcs`              | `{ ecu }`                                   | `{ ecuId, responded, dtcs[] }`                |
| `clearDtcs`             | `{ ecu, codes \| null }`                    | `{ cleared }`                                 |
| `readFreezeFrame`       | `{ ecu, code }`                             | `FreezeFrame`                                 |
| `readLiveData`          | `{ ecu, dids }`                             | `LiveDataSignal[]`                            |
| `requestSecurityAccess` | `{ ecu, level }`                            | `{ granted, level, negative? }`               |
| `runRoutine`            | `{ ecu, routine, action }`                  | `RoutineExecution`                            |
| `runProcess`            | `{ processId, variables, dryRun, jobId }`   | `{ runId, ok, message, executed, prompts }`   |
| `provideInput`          | `{ runId, value }`                          | `{ accepted }`                                |
| `abortProcess`          | `{ runId }`                                 | `{ aborted }`                                 |
| `scanVehicle`           | `{ ecus?, concurrency?, jobId? }`           | `{ results[], startedAt, finishedAt }`        |
| `getJobLog`             | `{ jobId }`                                 | `{ jobId, path, entries[] }`                  |
| `startProgramming`      | `{ flow, pkg }`                             | `{ ok, message }`                             |
| `executeStep`           | `{ ecu, process, stepIndex, label, input }` | `StepExecution` (legacy; prefer `runProcess`) |

## Streaming examples

`runProcess` emits one `event` per interpreter step, then a single `result`:

```json
{ "id": "42", "type": "event", "payload": { "type": "processEvent", "runId": "run-1",
  "event": { "type": "output", "level": "information", "text": "Switch the ignition on" } } }
{ "id": "42", "type": "event", "payload": { "type": "processEvent", "runId": "run-1",
  "event": { "type": "input", "prompt": "Enter the new VIN", "inputType": "text", "variable": "vin" } } }
{ "id": "42", "type": "result", "payload": { "runId": "run-1", "ok": true,
  "message": "Process complete", "executed": 6, "prompts": 1 } }
```

While an `input` event is outstanding the run is paused; answer it with
`provideInput` (same `runId`) or end it with `abortProcess`.

`scanVehicle` emits `scanStart`, one `scanEcu` per controller
(`responded` | `silent` | `unmapped`), `scanProgress`, then `scanDone`.

## Errors

Vehicle refusals keep their real UDS negative response code, e.g.
`"0x33 securityAccessDenied"`, `"0x35 invalidKey"`, `"0x78 requestCorrectlyReceived-ResponsePending"`.
DoIP failures are typed: routing activation codes `0x00`–`0x05` and diagnostic
negative acknowledge codes `0x02`–`0x08` are named rather than printed as raw hex.
