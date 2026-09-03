/**
 * data/canonical -> src/data/r11-oversea-data.json
 *
 * Fails loudly when the canonical set is missing so the committed seed stays in place.
 *   npm run build:seed
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { domainForSubSystem } from "../src/data/domain-map.ts";
import {
  CanonicalDataError,
  loadCanonical,
  mergedEcus,
  parseFlags,
  repoRoot,
} from "./canonical.ts";

const OUTPUT = resolve(repoRoot, "src/data/r11-oversea-data.json");

const didText = (did: number): string => did.toString(16).toUpperCase().padStart(4, "0");

const main = () => {
  const set = loadCanonical(parseFlags(process.argv.slice(2)));
  const ecus = mergedEcus(set);

  const seed = {
    generatedAt: new Date().toISOString(),
    dataChecksum: set.dataChecksum,
    vehicle: {
      ...set.ecus.vehicle,
      ecuCount: ecus.length,
    },
    ecus: ecus.map((ecu) => ({
      id: ecu.id,
      fullName: ecu.fullName,
      subSystem: ecu.subSystem ?? ecu.domain,
      domain: domainForSubSystem(ecu.subSystem ?? ecu.domain),
      bus: ecu.bus,
      address: ecu.address,
      secondaryAddresses: ecu.secondaryAddresses,
      saLevels: ecu.saLevels,
      dtcCount: ecu.dtcs.length,
      liveDataCount: ecu.liveDids.length,
      routines: ecu.routines.map((routine) => routine.name),
      routineDefinitions: ecu.routines,
      ioControls: ecu.ioControls,
      identificationDids: ecu.identDids.map((did) => didText(did.did)),
      identDids: ecu.identDids,
      liveDids: ecu.liveDids,
      writeDids: ecu.writeDids,
      snapshotLayout: ecu.snapshotLayout,
      dtcStatusMask: ecu.dtcStatusMask ?? 0xff,
      dtcs: ecu.dtcs.map((dtc) => ({
        code: dtc.codeText,
        codeValue: dtc.code,
        name: dtc.name,
        severity: dtc.severity,
      })),
    })),
    processes: set.processes.processes.map((process) => ({
      id: process.id,
      ecu: process.ecu,
      name: process.name,
      category: process.category,
      udsServices: process.udsServices,
      securityLevel: process.securityLevel,
      requiresVin: process.requiresVin ?? false,
      steps: process.steps,
    })),
    programmingFlows: set.flows.flows,
    menu: set.menu.root,
  };

  writeFileSync(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
  process.stdout.write(
    `[build:seed] wrote ${OUTPUT}\n` +
      `[build:seed] ${seed.ecus.length} ECUs, ${seed.processes.length} processes, checksum ${set.dataChecksum}\n`,
  );
};

try {
  main();
} catch (error) {
  if (error instanceof CanonicalDataError) {
    process.stderr.write(`[build:seed] ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
