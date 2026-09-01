import type { Ecu } from "@/data/vehicle-data";

type SignalTemplate = {
  label: string;
  unit: string;
  min: number;
  max: number;
};

const CATALOG: Record<string, SignalTemplate[]> = {
  Powertrain: [
    { label: "Motor speed", unit: "rpm", min: 0, max: 12000 },
    { label: "Motor torque", unit: "Nm", min: -300, max: 340 },
    { label: "Inverter temperature", unit: "°C", min: 15, max: 95 },
    { label: "DC link voltage", unit: "V", min: 280, max: 420 },
    { label: "Pack SOC", unit: "%", min: 5, max: 100 },
    { label: "Coolant temperature", unit: "°C", min: 10, max: 105 },
  ],
  Chassis: [
    { label: "Front left wheel speed", unit: "km/h", min: 0, max: 180 },
    { label: "Front right wheel speed", unit: "km/h", min: 0, max: 180 },
    { label: "Yaw rate", unit: "°/s", min: -40, max: 40 },
    { label: "Brake pressure", unit: "bar", min: 0, max: 160 },
    { label: "Steering angle", unit: "°", min: -540, max: 540 },
  ],
  Body: [
    { label: "Battery voltage", unit: "V", min: 10.5, max: 14.8 },
    { label: "Ambient temperature", unit: "°C", min: -20, max: 45 },
    { label: "Ignition status", unit: "", min: 0, max: 1 },
    { label: "Bus load", unit: "%", min: 2, max: 65 },
  ],
  ADAS: [
    { label: "Radar target count", unit: "", min: 0, max: 24 },
    { label: "Camera frame rate", unit: "fps", min: 10, max: 30 },
    { label: "Calibration offset", unit: "°", min: -3, max: 3 },
    { label: "Sensor temperature", unit: "°C", min: 15, max: 80 },
  ],
  Infotainment: [
    { label: "CPU load", unit: "%", min: 3, max: 92 },
    { label: "Display brightness", unit: "%", min: 10, max: 100 },
    { label: "Audio amplifier temperature", unit: "°C", min: 20, max: 78 },
  ],
  Comfort: [
    { label: "Cabin temperature", unit: "°C", min: 12, max: 38 },
    { label: "Blower duty", unit: "%", min: 0, max: 100 },
    { label: "Seat motor current", unit: "A", min: 0, max: 9 },
  ],
  Connectivity: [
    { label: "LTE signal strength", unit: "dBm", min: -110, max: -55 },
    { label: "GNSS satellites", unit: "", min: 0, max: 18 },
    { label: "Uplink rate", unit: "kB/s", min: 0, max: 900 },
  ],
  Safety: [
    { label: "Squib resistance", unit: "Ω", min: 1.6, max: 3.4 },
    { label: "Belt buckle status", unit: "", min: 0, max: 1 },
    { label: "Crash sensor supply", unit: "V", min: 8.5, max: 13.5 },
  ],
};

const FALLBACK: SignalTemplate[] = [
  { label: "Supply voltage", unit: "V", min: 9, max: 14.6 },
  { label: "Internal temperature", unit: "°C", min: 10, max: 90 },
  { label: "Operating counter", unit: "h", min: 0, max: 4000 },
];

export const liveDataCatalog = (ecu: Ecu): LiveDataDefinition[] => {
  const templates = CATALOG[ecu.domain] ?? FALLBACK;
  const count = Math.max(1, Math.min(ecu.liveDataCount, 24));
  const out: LiveDataDefinition[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = templates[i % templates.length] ?? FALLBACK[0]!;
    const cycle = Math.floor(i / templates.length);
    out.push({
      id: `${ecu.id}-D${(0x1000 + i).toString(16).toUpperCase()}`,
      label: cycle === 0 ? base.label : `${base.label} ${cycle + 1}`,
      unit: base.unit,
      min: base.min,
      max: base.max,
    });
  }
  return out;
};

export type LiveDataDefinition = SignalTemplate & { id: string };
