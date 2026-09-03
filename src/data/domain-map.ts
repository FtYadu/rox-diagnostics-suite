/**
 * UI-only grouping. The canonical data carries the legacy globatROX `subSystem`
 * string; the sidebar / dashboard group ECUs by these coarser domains instead.
 */
export type EcuDomain =
  | "Body"
  | "Chassis"
  | "Powertrain"
  | "ADAS"
  | "Infotainment"
  | "Comfort"
  | "Connectivity"
  | "Safety";

export const DOMAIN_ORDER: EcuDomain[] = [
  "Body",
  "Chassis",
  "Powertrain",
  "ADAS",
  "Infotainment",
  "Comfort",
  "Connectivity",
  "Safety",
];

/** Legacy `subSystem` value (lower-cased) → UI domain. */
export const SUBSYSTEM_DOMAIN: Record<string, EcuDomain> = {
  body: "Body",
  "body control": "Body",
  bcm: "Body",
  chassis: "Chassis",
  brake: "Chassis",
  steering: "Chassis",
  suspension: "Chassis",
  powertrain: "Powertrain",
  engine: "Powertrain",
  transmission: "Powertrain",
  "electric drive": "Powertrain",
  battery: "Powertrain",
  charging: "Powertrain",
  adas: "ADAS",
  "driver assistance": "ADAS",
  camera: "ADAS",
  radar: "ADAS",
  infotainment: "Infotainment",
  audio: "Infotainment",
  display: "Infotainment",
  cluster: "Infotainment",
  comfort: "Comfort",
  hvac: "Comfort",
  seat: "Comfort",
  door: "Comfort",
  connectivity: "Connectivity",
  telematics: "Connectivity",
  gateway: "Connectivity",
  safety: "Safety",
  airbag: "Safety",
  restraint: "Safety",
};

export const domainForSubSystem = (subSystem: string | undefined): EcuDomain => {
  if (!subSystem) return "Body";
  return SUBSYSTEM_DOMAIN[subSystem.trim().toLowerCase()] ?? "Body";
};
