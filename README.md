# Rox Diagnostics Suite

Build "ROX Diagnostics" — a modern, Apple-inspired automotive dealer diagnostic & ECU-programming workstation web app for the ROX 01 vehicle (internal code R11_Oversea). This replaces a legacy Windows tool. The attached file r11_oversea_data.json contains the REAL vehicle data: 41 ECUs (with full names, domain, identification DIDs, DTC lists with code/name/severity, live-data counts, routines), 131 guided service processes (with category, UDS services, security level, and their step prompts/inputs), and 2 programming flow definitions. Load this JSON as the seed dataset (import it into src/data and type it properly) and drive the whole UI from it — no invented ECUs.

ARCHITECTURE: The browser cannot talk to car hardware, so design a "Bridge" abstraction: an interface `DiagnosticBridge` with methods connect(), readIdentification(ecu), readDtcs(ecu), clearDtcs(ecu), readLiveData(ecu, dids), runProcess(process, onStep), startProgramming(flow, pkg, onProgress). Ship two implementations: (1) `SimulatorBridge` — realistic in-browser simulation using the seed data (random plausible DTCs from each ECU's list, live values, timed step execution, negative-response scenarios), and (2) `LocalBridge` — a WebSocket client to ws://127.0.0.1:9097 for a future local hardware agent, with a clear "Bridge offline — using Simulator" state. A global toggle in Settings switches between them; default Simulator.

DESIGN — Apple inspired, premium, workshop-ready: San Francisco-style system font stack (-apple-system, Inter fallback), generous whitespace, large soft-rounded cards (16–20px radius), frosted-glass translucent sidebar and top bar (backdrop-blur), subtle 1px hairline borders, muted greys with one accent (deep blue #0A84FF) plus semantic green/amber/red for status. Light and dark mode (dark default: near-black #0B0B0F surfaces like macOS dark). Smooth micro-animations (framer-motion), pill segmented controls, macOS-style toolbars, SF-Symbols-like icons (lucide). Big readable numerals for status. It must look like a first-party Apple pro app (think Xcode/Instruments meets CarPlay), not a generic dashboard template.

SCREENS for this first build:
1. Sign-in screen (email/password, remember me, elegant hero on the left with the vehicle name).
2. App shell: collapsible left sidebar (Dashboard, Vehicle, Health Scan, ECUs, Service Functions, Programming, Live Data, Reports, Job History, Settings), top bar with vehicle/VIN chip, bridge status pill (Simulator / Hardware connected / offline), VCI status, theme toggle, user menu.
3. Dashboard: connection card (bridge + VCI + battery voltage), current vehicle card (VIN HJ4ABBHK4RN000080 example, model R11_Oversea), quick actions (Full Health Scan, Read All DTCs, Clear All DTCs, New Job), last 5 jobs, ECU domain overview donut (Body/Chassis/Powertrain/ADAS/Infotainment/Comfort/Connectivity/Safety).
4. Vehicle & ECUs: a grid/tree of the 41 ECUs grouped by domain, each card with status dot (OK / DTCs / No response / Not scanned), DTC count, and click-through to an ECU detail page with tabs: Identification (reads the DIDs F187/F188/F18C/F193/F195 via bridge), DTCs, Live Data, Routines, Service Functions, Programming.
5. Health Scan: a full-vehicle scan that iterates all ECUs via the bridge with an animated progress list (per-ECU state), then a results summary (total DTCs by severity, ECUs with faults), with "Clear all", "Rescan", and "Generate report" actions.

Use React Router, TanStack Query, Zustand for app state, framer-motion, lucide-react, shadcn/ui, Tailwind. Keep code well structured (features/ folders). Make it fully responsive including tablet landscape (this will run on shop tablets).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/184a8dbe-cfa0-40ed-b523-a49e86ff4a51).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
