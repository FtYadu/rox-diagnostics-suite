import { ecus, type Dtc } from "@/data/vehicle-data";

export type DtcFamily = "P" | "C" | "B" | "U";

export type DtcGuidance = {
  family: DtcFamily;
  familyLabel: string;
  subtypeLabel: string;
  influence: string;
  causes: string[];
  steps: string[];
};

const FAMILY_LABEL: Record<DtcFamily, string> = {
  P: "Powertrain / propulsion",
  C: "Chassis / brakes & steering",
  B: "Body / comfort & lighting",
  U: "Network / communication",
};

const FAMILY_INFLUENCE: Record<DtcFamily, string> = {
  P: "Propulsion torque may be limited, charging can be interrupted and the vehicle may enter reduced-power mode until the fault is repaired.",
  C: "Brake assistance, stability control or steering assistance can be degraded. Driver warning lamps stay on and related ADAS features are inhibited.",
  B: "The affected body function (lighting, closures, seats, climate) is unavailable or works with reduced comfort. Vehicle remains drivable.",
  U: "The receiving control unit works with substitute values. Every function that depends on the missing signal is switched off until the bus fault is cleared.",
};

const FAMILY_CAUSES: Record<DtcFamily, string[]> = {
  P: [
    "High-voltage or 12 V supply out of tolerance at the control unit",
    "Sensor or actuator drift outside the calibrated window",
    "Cooling circuit performance loss causing derating",
  ],
  C: [
    "Wheel-speed, pressure or angle sensor signal implausible",
    "Hydraulic or electric actuator not reaching the commanded set point",
    "Missing calibration after suspension, steering or brake service",
  ],
  B: [
    "Load circuit interrupted or shorted in the harness or connector",
    "Actuator end-stop position not learned",
    "Voltage drop on the body supply line under load",
  ],
  U: [
    "Bus wiring fault, termination problem or corroded connector",
    "Transmitting control unit unpowered, asleep or itself in fault",
    "Software / configuration mismatch after a control unit replacement",
  ],
};

/** Subtype hints derived from the last two hex digits of the code. */
const SUBTYPES: Record<string, { label: string; causes: string[]; steps: string[] }> = {
  "08": {
    label: "Checksum / plausibility failure",
    causes: [
      "Signal checksum mismatch between sender and receiver",
      "Corrupted configuration data set in the transmitting node",
    ],
    steps: [
      "Read identification of both nodes and compare software and dataset versions",
      "Re-write the configuration / baseline data, then clear and re-read the fault memory",
    ],
  },
  "82": {
    label: "Alive counter error",
    causes: [
      "Cyclic message arriving with a frozen or skipping alive counter",
      "Bus load peaks or intermittent contact interrupting frames",
    ],
    steps: [
      "Record the bus load in Live Data while wiggling the harness at the connectors",
      "Check termination resistance and shield continuity on the affected CAN segment",
    ],
  },
  "87": {
    label: "Message missing / timeout",
    causes: [
      "Transmitting control unit not powered or not on the bus",
      "Open circuit on CAN-H / CAN-L between the nodes",
    ],
    steps: [
      "Run a Health Scan and note every ECU that does not respond",
      "Measure supply and ground at the silent node, then check bus continuity to the gateway",
    ],
  },
  "29": {
    label: "Signal invalid / out of range",
    causes: [
      "Sensor reporting an invalid or error value",
      "Substitute value sent because the source signal is unavailable",
    ],
    steps: [
      "Compare the raw signal in Live Data against the expected min/max window",
      "Replace or re-calibrate the source sensor and repeat the plausibility check",
    ],
  },
  "12": {
    label: "Short circuit to ground",
    causes: ["Chafed insulation against body metal", "Water ingress in a connector or splice"],
    steps: [
      "Disconnect the actuator and measure resistance from the signal pin to ground",
      "Inspect the harness along its routing for chafe points and repair the section",
    ],
  },
  "13": {
    label: "Open circuit",
    causes: ["Broken conductor or pushed-back terminal", "Actuator winding interrupted"],
    steps: [
      "Measure continuity of the circuit end to end with the connectors unplugged",
      "Check terminal retention in both connectors before replacing the component",
    ],
  },
  "11": {
    label: "Short circuit to battery",
    causes: [
      "Signal line contacting a permanent-live conductor",
      "Internal output-stage failure in the control unit",
    ],
    steps: [
      "Measure the circuit voltage with the connector unplugged and ignition on",
      "If battery voltage is present with the load disconnected, repair the harness before fitting parts",
    ],
  },
  "17": {
    label: "Signal above allowed range",
    causes: ["Reference voltage too high", "Sensor characteristic drifted upward"],
    steps: [
      "Verify the 5 V reference and ground offset at the sensor",
      "Substitute a known-good sensor and compare the readings",
    ],
  },
  "16": {
    label: "Signal below allowed range",
    causes: ["Contact resistance in the supply path", "Sensor characteristic drifted downward"],
    steps: [
      "Load-test the supply line and check the ground point torque",
      "Substitute a known-good sensor and compare the readings",
    ],
  },
  "00": {
    label: "General component fault",
    causes: ["Internal control unit fault", "Component outside its performance specification"],
    steps: [
      "Confirm the fault is current with ignition on and the component actuated",
      "Run the matching service function or actuator test before replacing the unit",
    ],
  },
};

const GENERIC_SUBTYPE = {
  label: "Component / function fault",
  causes: ["Component performance outside specification", "Wiring or connector problem"],
  steps: [
    "Confirm whether the fault is current or history and note the occurrence count",
    "Check supply, ground and signal at the component connector",
    "Run the matching service function or actuator test, then clear and re-read the fault memory",
  ],
};

const familyOf = (code: string): DtcFamily => {
  const first = code.charAt(0).toUpperCase();
  return first === "P" || first === "C" || first === "B" || first === "U" ? first : "U";
};

export const dtcGuidance = (code: string, name: string): DtcGuidance => {
  const family = familyOf(code);
  const tail = code.slice(-2).toUpperCase();
  const subtype = SUBTYPES[tail] ?? GENERIC_SUBTYPE;

  return {
    family,
    familyLabel: FAMILY_LABEL[family],
    subtypeLabel: subtype.label,
    influence: `${name}. ${FAMILY_INFLUENCE[family]}`,
    causes: [...subtype.causes, ...FAMILY_CAUSES[family]].slice(0, 5),
    steps: [
      "Verify battery voltage is above 12.4 V and the ignition is on before testing",
      ...subtype.steps,
      "Clear the code, run the affected function and re-read to confirm the repair",
    ],
  };
};

/** ECUs that also list this code, plus the gateway for network codes. */
export const relatedEcus = (code: string, ownerEcuId: string): string[] => {
  const sharing = ecus
    .filter((ecu) => ecu.id !== ownerEcuId && ecu.dtcs.some((dtc) => dtc.code === code))
    .map((ecu) => ecu.id);

  const owner = ecus.find((ecu) => ecu.id === ownerEcuId);
  const domainSiblings = owner
    ? ecus
        .filter((ecu) => ecu.domain === owner.domain && ecu.id !== owner.id)
        .slice(0, 3)
        .map((ecu) => ecu.id)
    : [];

  const gateway = familyOf(code) === "U" ? ["CCU"] : [];

  return Array.from(new Set([...sharing, ...gateway, ...domainSiblings]))
    .filter((id) => id !== ownerEcuId)
    .slice(0, 6);
};

export const severityTone = (severity: number): "critical" | "warning" | "info" =>
  severity >= 3 ? "critical" : severity === 2 ? "warning" : "info";

export const severityText = (severity: number): string =>
  severity >= 3 ? "3 Critical" : severity === 2 ? "2 Warning" : "1 Info";

export const dtcSortKey = (dtc: Dtc): number => -dtc.severity;
