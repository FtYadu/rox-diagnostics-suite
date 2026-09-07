# Canonical extraction notes (generated 2026-09-07 from the legacy globatROX workspace)

Source: `LKWorkspace/Vehicle/113799ab-…/R11_Oversea/R11_Oversea.xml` (42 ECU definitions),
130 Oversea + 1 China service-process XMLs, 3 plaintext programming flows, `Menu/Menuinfo.xml`.
Generator: `tools/extract_canonical.py` (Python, kept in the repo for re-runs).

Counts: ecus 42 · rdbi 589 · drdbi 1056 · wdbi 81 · ioControls 113 · routines **64** · processes **131** · dtcs 3689 · flows 9 (6 encrypted).
`EXPECTED_COUNTS.routines` must change from 148 → 64 and `processes` stays 131.

## Fields the schema must learn (all optional, zod strips unknown keys today)
- `ecus[].timing {p2,p2Star,s3}`, `ecus[].doip {ip,port,gatewayAddress}`, `ecus[].ecuType`, `vehicle.doip`, `vehicle.securityAccessTable` (ECU → level → alg, taken from every FastSA node in the 131 processes).
- `snapshotLayout[].did` — the DID that identifies each freeze-frame field (`19 06` decoding needs it).
- Process steps: new kinds `securityAccess {ecuId, level, alg, session, negativeExit?}`, `loop {while, maxIterations, steps}`, `quit {error, text}`, `dllCallback {function, variables}` (must be shown as "unsupported, ask a dealer") and `programming {op, attrs}`; `setVar.expression: true` means `value` is an arithmetic expression over `{variables}`; `input.optionValues[]` pairs with `options[]`; `ecuService.saAlg`; `condition.extra[]` for AND/OR chains.
- `processes[].variables[]`, `market` ("Oversea" | "China"), `sourceFile`, `securityAlg`.

## Facts verified against the August–September 2026 vehicle traces
- DTC read is `19 02 0D` (confirmed | pending | testFailed) — 102 requests, every ECU answers `59 02`.
- Freeze frame `19 06 <dtc> 01` gets NRC 0x12 on ~13 ECUs; record `0xFF` works. Never fail a scan on 0x12/0x31.
- Clear DTC `14 FF FF FF` without security access → `7F 14 33` (76 times). Required sequence: `10 03` → `27 01/02` (alg 1; ESC also accepts alg 0) → `14 FF FF FF` → `19 02 0D` verify → `10 01`.
- Key learning / IMMO writes use level 17 (`27 11/12`) with alg 11 on IBCM, CCU, TBOX, BTM, MDCU.
- Security-access sub-functions the ECUs advertise: 01/02 extended, 03/04 development, 05/06 programming, 09/0A immobiliser, 61/62 supplier. The dealer tool additionally used 11/12, 13/14 and 07 on the CCU.
- `CDS` is defined twice at 0x1118; the second definition is exported as `CDS_I` (Intelligent CDC).
- Six codes seen on VIN HJ4ABBHK7SN075057 have no catalog entry: IBCM U015087/U015287, EMS U211200/U211300/U012100, ATC P102696.
