/**
 * data/canonical -> agent/config.json
 *
 * Every address, DID, routine identifier and security level in the agent config comes
 * from here; nothing is hand-written. Fails loudly when the canonical set is missing.
 *   npm run build:agent-config
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CanonicalDataError,
  hexWord,
  loadCanonical,
  mergedEcus,
  parseFlags,
  repoRoot,
} from "./canonical.ts";
import type { Did, SignalLayout } from "../packages/canonical-schema/src/index.ts";

const OUTPUT = resolve(repoRoot, "agent/config.json");

const TESTER_ADDRESS = 0x0e80;
const FUNCTIONAL_ADDRESS = 0xe400;

const didHex = (did: number): string => did.toString(16).toUpperCase().padStart(4, "0");

const encodingFor = (type: Did["type"]): "number" | "ascii" | "hex" =>
  type === "ascii" ? "ascii" : type === "hex" || type === "bitfield" ? "hex" : "number";

const signalFromDid = (did: Did) => ({
  did: didHex(did.did),
  label: did.label,
  ...(did.unit ? { unit: did.unit } : {}),
  length: did.length,
  encoding: encodingFor(did.type),
  ...(did.factor === undefined ? {} : { factor: did.factor }),
  ...(did.offset === undefined ? {} : { offset: did.offset }),
  ...(did.signed === undefined ? {} : { signed: did.signed }),
  ...(did.min === undefined ? {} : { min: did.min }),
  ...(did.max === undefined ? {} : { max: did.max }),
  ...(did.session === undefined ? {} : { session: did.session }),
  ...(did.saLevel === undefined ? {} : { saLevel: did.saLevel }),
});

const signalFromLayout = (field: SignalLayout) => ({
  did: didHex(field.byteStart),
  label: field.name,
  ...(field.unit ? { unit: field.unit } : {}),
  length: field.length,
  encoding: encodingFor(field.type),
  ...(field.factor === undefined ? {} : { factor: field.factor }),
  ...(field.offset === undefined ? {} : { offset: field.offset }),
  ...(field.signed === undefined ? {} : { signed: field.signed }),
  byteStart: field.byteStart,
  ...(field.bitStart === undefined ? {} : { bitStart: field.bitStart }),
});

const main = () => {
  const set = loadCanonical(parseFlags(process.argv.slice(2)));
  const ecus = mergedEcus(set);

  if (set.addresses.testerAddress !== TESTER_ADDRESS) {
    throw new CanonicalDataError(
      `addresses.json testerAddress is ${hexWord(set.addresses.testerAddress)}, expected ${hexWord(TESTER_ADDRESS)}`,
    );
  }

  const config = {
    comment:
      "GENERATED FILE — do not edit by hand. Produced by tools/build-agent-config.ts from data/canonical. Run `npm run build:agent-config` after re-extracting the legacy data.",
    dataChecksum: set.dataChecksum,
    vci: { name: "ROX VCI (DoIP)", serial: "set-me", protocol: "DoIP / CAN FD" },
    tester: {
      sourceAddress: hexWord(set.addresses.testerAddress),
      functionalAddress: hexWord(set.addresses.functionalAddress || FUNCTIONAL_ADDRESS),
    },
    timing: { p2: 100, p2Star: 5000, s3: 5000 },
    ecus: Object.fromEntries(
      ecus.map((ecu) => [
        ecu.id,
        {
          address: hexWord(ecu.address),
          secondaryAddresses: ecu.secondaryAddresses.map(hexWord),
          bus: ecu.bus,
          dtcStatusMask: `0x${(ecu.dtcStatusMask ?? 0xff).toString(16).toUpperCase().padStart(2, "0")}`,
          identification: ecu.identDids.map(signalFromDid),
          liveData: ecu.liveDids.map(signalFromDid),
          snapshot: ecu.snapshotLayout.map(signalFromLayout),
          routines: Object.fromEntries(
            ecu.routines.map((routine) => [routine.name, hexWord(routine.rid)]),
          ),
          ioControls: Object.fromEntries(ecu.ioControls.map((io) => [io.label, didHex(io.did)])),
          security: { levels: ecu.saLevels },
        },
      ]),
    ),
  };

  writeFileSync(OUTPUT, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  process.stdout.write(
    `[build:agent-config] wrote ${OUTPUT}\n` +
      `[build:agent-config] ${ecus.length} ECUs mapped, tester ${config.tester.sourceAddress}, ` +
      `functional ${config.tester.functionalAddress}, checksum ${set.dataChecksum}\n`,
  );
};

try {
  main();
} catch (error) {
  if (error instanceof CanonicalDataError) {
    process.stderr.write(`[build:agent-config] ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
