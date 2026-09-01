import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BridgeMode } from "@/features/bridge/types";
import type { EcuDtcResult } from "@/features/bridge/types";

export type Theme = "light" | "dark";

export type EcuScanState = {
  status: "not-scanned" | "scanning" | "ok" | "faults" | "no-response";
  dtcCount: number;
  scannedAt?: string;
};

export type Job = {
  id: string;
  title: string;
  kind: "health-scan" | "clear-dtc" | "service" | "programming" | "manual";
  vin: string;
  technician: string;
  createdAt: string;
  status: "completed" | "failed" | "in-progress";
  summary: string;
};

export type User = {
  email: string;
  name: string;
};

type AppState = {
  user: User | null;
  theme: Theme;
  bridgeMode: BridgeMode;
  sidebarCollapsed: boolean;
  vin: string;
  scan: Record<string, EcuScanState>;
  jobs: Job[];
  signIn: (email: string) => void;
  signOut: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setBridgeMode: (mode: BridgeMode) => void;
  toggleSidebar: () => void;
  setEcuState: (ecuId: string, state: EcuScanState) => void;
  applyDtcResult: (result: EcuDtcResult) => void;
  resetScan: () => void;
  addJob: (job: Omit<Job, "id" | "createdAt" | "vin"> & { vin?: string }) => void;
};

const nameFromEmail = (email: string) => {
  const local = email.split("@")[0] ?? "technician";
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const seedJobs: Job[] = [
  {
    id: "JOB-24817",
    title: "Full health scan",
    kind: "health-scan",
    vin: "HJ4ABBHK4RN000080",
    technician: "M. Halvorsen",
    createdAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    status: "completed",
    summary: "41 ECUs scanned · 3 stored DTCs",
  },
  {
    id: "JOB-24812",
    title: "ADCU_MCU reflash 0.98",
    kind: "programming",
    vin: "HJ4ABBHK4RN000080",
    technician: "M. Halvorsen",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    status: "completed",
    summary: "MCU Reflash Flow 0.98 · 5 phases",
  },
  {
    id: "JOB-24803",
    title: "IBCM brake bleeding",
    kind: "service",
    vin: "HJ4ABBHK4RN000080",
    technician: "K. Lund",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    status: "completed",
    summary: "Service routine finished, no faults",
  },
  {
    id: "JOB-24798",
    title: "Clear all DTCs",
    kind: "clear-dtc",
    vin: "HJ4ABBHK4RN000080",
    technician: "K. Lund",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    status: "completed",
    summary: "7 codes cleared across 4 ECUs",
  },
  {
    id: "JOB-24791",
    title: "ACU write VIN",
    kind: "service",
    vin: "HJ4ABBHK4RN000080",
    technician: "A. Osei",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 51).toISOString(),
    status: "failed",
    summary: "Readback mismatch — aborted",
  },
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      theme: "dark",
      bridgeMode: "simulator",
      sidebarCollapsed: false,
      vin: "HJ4ABBHK4RN000080",
      scan: {},
      jobs: seedJobs,

      signIn: (email) => set({ user: { email, name: nameFromEmail(email) } }),
      signOut: () => set({ user: null }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setBridgeMode: (bridgeMode) => set({ bridgeMode }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

      setEcuState: (ecuId, state) => set({ scan: { ...get().scan, [ecuId]: state } }),

      applyDtcResult: (result) =>
        set({
          scan: {
            ...get().scan,
            [result.ecuId]: {
              status: !result.responded ? "no-response" : result.dtcs.length > 0 ? "faults" : "ok",
              dtcCount: result.dtcs.length,
              scannedAt: new Date().toISOString(),
            },
          },
        }),

      resetScan: () => set({ scan: {} }),

      addJob: (job) =>
        set({
          jobs: [
            {
              ...job,
              vin: job.vin ?? get().vin,
              id: `JOB-${Math.floor(10000 + Math.random() * 89999)}`,
              createdAt: new Date().toISOString(),
            },
            ...get().jobs,
          ].slice(0, 40),
        }),
    }),
    {
      name: "rox-diagnostics",
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        theme: state.theme,
        bridgeMode: state.bridgeMode,
        sidebarCollapsed: state.sidebarCollapsed,
        jobs: state.jobs,
      }),
    },
  ),
);
