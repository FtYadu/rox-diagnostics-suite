import type { Ecu } from "@/data/vehicle-data";

export type SignalTemplate = {
  label: string;
  unit: string;
  min: number;
  max: number;
};

export type LiveDataDefinition = SignalTemplate & { id: string; did: string };

/** ECU-specific parameter lists, kept close to what the real control unit publishes. */
const BY_ECU: Record<string, SignalTemplate[]> = {
  BMS: [
    { label: "Pack voltage", unit: "V", min: 280, max: 430 },
    { label: "Pack current", unit: "A", min: -320, max: 240 },
    { label: "State of charge", unit: "%", min: 4, max: 100 },
    { label: "State of health", unit: "%", min: 88, max: 100 },
    { label: "Max cell voltage", unit: "V", min: 3.4, max: 4.2 },
    { label: "Min cell voltage", unit: "V", min: 3.2, max: 4.1 },
    { label: "Cell delta", unit: "mV", min: 4, max: 68 },
    { label: "Max cell temperature", unit: "°C", min: 12, max: 52 },
    { label: "Min cell temperature", unit: "°C", min: 8, max: 44 },
    { label: "Insulation resistance", unit: "kΩ", min: 120, max: 4000 },
    { label: "Contactor state", unit: "", min: 0, max: 1 },
    { label: "Available discharge power", unit: "kW", min: 0, max: 210 },
  ],
  PMS: [
    { label: "Charge port voltage", unit: "V", min: 0, max: 430 },
    { label: "Charge current", unit: "A", min: 0, max: 200 },
    { label: "AC input voltage", unit: "V", min: 0, max: 250 },
    { label: "DC fast charge power", unit: "kW", min: 0, max: 150 },
    { label: "Charge port temperature", unit: "°C", min: 10, max: 82 },
    { label: "Charge state", unit: "", min: 0, max: 5 },
  ],
  ESC: [
    { label: "Front left wheel speed", unit: "km/h", min: 0, max: 180 },
    { label: "Front right wheel speed", unit: "km/h", min: 0, max: 180 },
    { label: "Rear left wheel speed", unit: "km/h", min: 0, max: 180 },
    { label: "Rear right wheel speed", unit: "km/h", min: 0, max: 180 },
    { label: "Yaw rate", unit: "°/s", min: -45, max: 45 },
    { label: "Lateral acceleration", unit: "m/s²", min: -9, max: 9 },
    { label: "Longitudinal acceleration", unit: "m/s²", min: -9, max: 6 },
    { label: "Master cylinder pressure", unit: "bar", min: 0, max: 160 },
    { label: "Brake pedal switch", unit: "", min: 0, max: 1 },
  ],
  IB: [
    { label: "Booster rod travel", unit: "mm", min: 0, max: 42 },
    { label: "Booster motor current", unit: "A", min: 0, max: 60 },
    { label: "Circuit pressure", unit: "bar", min: 0, max: 180 },
  ],
  EMS: [
    { label: "Engine speed", unit: "rpm", min: 0, max: 5200 },
    { label: "Coolant temperature", unit: "°C", min: -10, max: 112 },
    { label: "Throttle position", unit: "%", min: 0, max: 100 },
    { label: "Intake air temperature", unit: "°C", min: -10, max: 68 },
    { label: "Manifold pressure", unit: "kPa", min: 22, max: 104 },
    { label: "Lambda actual", unit: "λ", min: 0.78, max: 1.24 },
    { label: "Ignition angle", unit: "°CA", min: -6, max: 34 },
    { label: "Fuel rail pressure", unit: "bar", min: 30, max: 210 },
    { label: "Generator load request", unit: "kW", min: 0, max: 68 },
  ],
  GCU: [
    { label: "Generator speed", unit: "rpm", min: 0, max: 5200 },
    { label: "Generator output power", unit: "kW", min: 0, max: 70 },
    { label: "Stator temperature", unit: "°C", min: 15, max: 140 },
  ],
  MDCU: [
    { label: "Coolant pump duty", unit: "%", min: 0, max: 100 },
    { label: "Radiator fan duty", unit: "%", min: 0, max: 100 },
    { label: "Battery inlet temperature", unit: "°C", min: 6, max: 48 },
    { label: "Battery outlet temperature", unit: "°C", min: 6, max: 54 },
    { label: "Motor circuit temperature", unit: "°C", min: 10, max: 88 },
    { label: "Chiller valve position", unit: "%", min: 0, max: 100 },
    { label: "Refrigerant high pressure", unit: "bar", min: 4, max: 28 },
    { label: "Refrigerant low pressure", unit: "bar", min: 1, max: 9 },
    { label: "Compressor speed", unit: "rpm", min: 0, max: 8000 },
    { label: "PTC heater power", unit: "kW", min: 0, max: 7 },
  ],
  RMC: [
    { label: "Rear motor speed", unit: "rpm", min: -1200, max: 15000 },
    { label: "Rear motor torque", unit: "Nm", min: -320, max: 340 },
    { label: "Inverter temperature", unit: "°C", min: 12, max: 96 },
    { label: "Stator temperature", unit: "°C", min: 12, max: 140 },
    { label: "DC link voltage", unit: "V", min: 280, max: 430 },
    { label: "Phase current", unit: "A", min: 0, max: 420 },
  ],
  FMC: [
    { label: "Front motor speed", unit: "rpm", min: -1200, max: 15000 },
    { label: "Front motor torque", unit: "Nm", min: -280, max: 300 },
    { label: "Inverter temperature", unit: "°C", min: 12, max: 96 },
    { label: "Stator temperature", unit: "°C", min: 12, max: 140 },
    { label: "DC link voltage", unit: "V", min: 280, max: 430 },
    { label: "Phase current", unit: "A", min: 0, max: 380 },
  ],
  IBS: [
    { label: "Battery voltage", unit: "V", min: 10.4, max: 14.9 },
    { label: "Battery current", unit: "A", min: -180, max: 120 },
    { label: "Battery temperature", unit: "°C", min: -14, max: 62 },
    { label: "State of charge (12 V)", unit: "%", min: 30, max: 100 },
    { label: "State of function", unit: "%", min: 40, max: 100 },
  ],
  ATC: [
    { label: "Cabin temperature", unit: "°C", min: 10, max: 46 },
    { label: "Ambient temperature", unit: "°C", min: -12, max: 52 },
    { label: "Evaporator temperature", unit: "°C", min: 1, max: 22 },
    { label: "Driver set temperature", unit: "°C", min: 16, max: 32 },
    { label: "Blower duty", unit: "%", min: 0, max: 100 },
    { label: "Mode damper position", unit: "%", min: 0, max: 100 },
    { label: "Blend damper position", unit: "%", min: 0, max: 100 },
    { label: "Recirculation damper", unit: "%", min: 0, max: 100 },
    { label: "Solar sensor intensity", unit: "W/m²", min: 0, max: 1100 },
  ],
  TBOX: [
    { label: "GNSS latitude", unit: "°", min: 24.2, max: 24.6 },
    { label: "GNSS longitude", unit: "°", min: 54.2, max: 54.7 },
    { label: "GNSS satellites", unit: "", min: 0, max: 20 },
    { label: "GNSS HDOP", unit: "", min: 0.6, max: 4.2 },
    { label: "LTE signal strength", unit: "dBm", min: -112, max: -54 },
    { label: "LTE registration state", unit: "", min: 0, max: 3 },
    { label: "Uplink rate", unit: "kB/s", min: 0, max: 900 },
    { label: "Downlink rate", unit: "kB/s", min: 0, max: 4200 },
    { label: "Backup battery voltage", unit: "V", min: 3.2, max: 4.3 },
  ],
  BTM: [
    { label: "BLE RSSI driver key", unit: "dBm", min: -98, max: -38 },
    { label: "Paired key count", unit: "", min: 0, max: 8 },
    { label: "NFC field detect", unit: "", min: 0, max: 1 },
  ],
  IBCM: [
    { label: "Battery voltage", unit: "V", min: 10.4, max: 14.9 },
    { label: "Driver window position", unit: "%", min: 0, max: 100 },
    { label: "Passenger window position", unit: "%", min: 0, max: 100 },
    { label: "Sunshade position", unit: "%", min: 0, max: 100 },
    { label: "Door ajar bitmask", unit: "", min: 0, max: 15 },
    { label: "Low-beam current", unit: "A", min: 0, max: 9 },
    { label: "Wiper park switch", unit: "", min: 0, max: 1 },
    { label: "TPMS front left pressure", unit: "kPa", min: 180, max: 280 },
    { label: "TPMS front right pressure", unit: "kPa", min: 180, max: 280 },
    { label: "TPMS rear left pressure", unit: "kPa", min: 180, max: 280 },
    { label: "TPMS rear right pressure", unit: "kPa", min: 180, max: 280 },
  ],
  CCU: [
    { label: "CAN bus load (vehicle)", unit: "%", min: 4, max: 68 },
    { label: "CAN bus load (chassis)", unit: "%", min: 4, max: 62 },
    { label: "Ethernet link state", unit: "", min: 0, max: 1 },
    { label: "Nodes online", unit: "", min: 30, max: 41 },
    { label: "Supply voltage", unit: "V", min: 10.4, max: 14.9 },
  ],
  EPS: [
    { label: "Steering wheel angle", unit: "°", min: -540, max: 540 },
    { label: "Steering torque", unit: "Nm", min: -8, max: 8 },
    { label: "Assist motor current", unit: "A", min: 0, max: 78 },
    { label: "Motor temperature", unit: "°C", min: 12, max: 108 },
  ],
  ACU: [
    { label: "Squib resistance driver", unit: "Ω", min: 1.6, max: 3.4 },
    { label: "Belt buckle driver", unit: "", min: 0, max: 1 },
    { label: "Crash sensor supply", unit: "V", min: 8.4, max: 13.6 },
    { label: "Seat occupancy passenger", unit: "", min: 0, max: 1 },
  ],
  ADCU_Soc: [
    { label: "Front camera frame rate", unit: "fps", min: 12, max: 30 },
    { label: "Surround camera frame rate", unit: "fps", min: 12, max: 30 },
    { label: "Calibration pitch offset", unit: "°", min: -3, max: 3 },
    { label: "Calibration yaw offset", unit: "°", min: -3, max: 3 },
    { label: "SoC temperature", unit: "°C", min: 24, max: 92 },
    { label: "Tracked objects", unit: "", min: 0, max: 32 },
  ],
  IDCU: [
    { label: "CPU load", unit: "%", min: 3, max: 94 },
    { label: "Memory usage", unit: "%", min: 20, max: 92 },
    { label: "Display brightness", unit: "%", min: 8, max: 100 },
    { label: "Panel temperature", unit: "°C", min: 20, max: 74 },
  ],
  AMP: [
    { label: "Amplifier temperature", unit: "°C", min: 20, max: 84 },
    { label: "Channel 1 output level", unit: "dB", min: -60, max: 6 },
    { label: "Channel 2 output level", unit: "dB", min: -60, max: 6 },
    { label: "Speaker impedance FL", unit: "Ω", min: 2.4, max: 4.6 },
    { label: "Supply voltage", unit: "V", min: 10.4, max: 14.9 },
  ],
};

const BY_DOMAIN: Record<string, SignalTemplate[]> = {
  Powertrain: [
    { label: "Supply voltage", unit: "V", min: 10.4, max: 14.9 },
    { label: "Internal temperature", unit: "°C", min: 10, max: 96 },
    { label: "HV interlock state", unit: "", min: 0, max: 1 },
  ],
  Chassis: [
    { label: "Supply voltage", unit: "V", min: 10.4, max: 14.9 },
    { label: "Vehicle speed", unit: "km/h", min: 0, max: 180 },
    { label: "Internal temperature", unit: "°C", min: 10, max: 92 },
  ],
  Body: [
    { label: "Supply voltage", unit: "V", min: 10.4, max: 14.9 },
    { label: "Output load current", unit: "A", min: 0, max: 12 },
    { label: "Ignition status", unit: "", min: 0, max: 1 },
  ],
  ADAS: [
    { label: "Radar target count", unit: "", min: 0, max: 24 },
    { label: "Sensor temperature", unit: "°C", min: 14, max: 82 },
    { label: "Blockage level", unit: "%", min: 0, max: 100 },
    { label: "Alignment offset", unit: "°", min: -3, max: 3 },
    { label: "Supply voltage", unit: "V", min: 10.4, max: 14.9 },
  ],
  Infotainment: [
    { label: "CPU load", unit: "%", min: 3, max: 92 },
    { label: "Internal temperature", unit: "°C", min: 20, max: 78 },
    { label: "Supply voltage", unit: "V", min: 10.4, max: 14.9 },
  ],
  Comfort: [
    { label: "Motor current", unit: "A", min: 0, max: 9 },
    { label: "Position feedback", unit: "%", min: 0, max: 100 },
    { label: "Supply voltage", unit: "V", min: 10.4, max: 14.9 },
  ],
  Connectivity: [
    { label: "Signal strength", unit: "dBm", min: -110, max: -54 },
    { label: "Supply voltage", unit: "V", min: 10.4, max: 14.9 },
  ],
  Safety: [
    { label: "Squib resistance", unit: "Ω", min: 1.6, max: 3.4 },
    { label: "Supply voltage", unit: "V", min: 8.4, max: 13.6 },
  ],
};

const FALLBACK: SignalTemplate[] = [
  { label: "Supply voltage", unit: "V", min: 9, max: 14.6 },
  { label: "Internal temperature", unit: "°C", min: 10, max: 90 },
  { label: "Operating counter", unit: "h", min: 0, max: 4000 },
];

const MAX_SIGNALS = 28;

export const liveDataCatalog = (ecu: Ecu): LiveDataDefinition[] => {
  const templates = BY_ECU[ecu.id] ?? BY_DOMAIN[ecu.domain] ?? FALLBACK;
  const seeded = Math.max(1, Math.min(ecu.liveDataCount || templates.length, MAX_SIGNALS));
  const count = Math.max(templates.length, seeded);
  const out: LiveDataDefinition[] = [];

  for (let i = 0; i < count; i += 1) {
    const base = templates[i % templates.length] ?? FALLBACK[0]!;
    const cycle = Math.floor(i / templates.length);
    const did = (0x1000 + i).toString(16).toUpperCase();
    out.push({
      id: `${ecu.id}-D${did}`,
      did,
      label: cycle === 0 ? base.label : `${base.label} (bank ${cycle + 1})`,
      unit: base.unit,
      min: base.min,
      max: base.max,
    });
  }
  return out;
};

export const defaultSignalIds = (ecu: Ecu): string[] =>
  liveDataCatalog(ecu)
    .slice(0, 6)
    .map((definition) => definition.id);
