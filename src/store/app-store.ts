import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BridgeMode, DtcRecord, EcuDtcResult } from "@/features/bridge/types";
import { pushJob, pushJobEvent } from "@/features/jobs/job-cloud";
import { jobEventId, jobId as newJobId } from "@/features/jobs/types";
import { isVinValid, normalizeVin } from "@/features/vehicle/vin";
import type { Role } from "@/lib/roles";
import type { Job, JobEvent, JobKind } from "@/features/jobs/types";

export type { Job, JobEvent, JobKind } from "@/features/jobs/types";

export type Theme = "light" | "dark";

export type EcuScanState = {
  status: "not-scanned" | "scanning" | "ok" | "faults" | "no-response";
  dtcCount: number;
  scannedAt?: string;
};

export type User = {
  email: string;
  name: string;
  cloud: boolean;
};

type NewJobInput = {
  title: string;
  kind: JobKind;
  vin?: string;
  technician?: string;
};

export type VehicleVariant = "R11" | "R11EN" | "R11h";

export type Language = "en" | "zh";

export type FeatureFlags = {
  /** WriteDataByIdentifier screen (v2 scope) — OFF by default, admin only. */
  configurationWrite: boolean;
};

export type Workstation = {
  agentUrl: string;
  dealerName: string;
  dealerLogo: string;
  variant: VehicleVariant;
};

type AppState = {
  user: User | null;
  role: Role;
  language: Language;
  workstation: Workstation;
  features: FeatureFlags;
  theme: Theme;
  bridgeMode: BridgeMode;
  sidebarCollapsed: boolean;
  vin: string;
  /** Most recently used VINs, newest first, for the VIN picker. */
  vinHistory: string[];
  scan: Record<string, EcuScanState>;
  /** DTC records collected by the most recent scan, used for reports. */
  scanDtcs: DtcRecord[];
  jobs: Job[];
  activeJobId: string | null;
  signIn: (email: string, cloud?: boolean) => void;
  setRole: (role: Role) => void;
  setLanguage: (language: Language) => void;
  setWorkstation: (patch: Partial<Workstation>) => void;
  setFeature: (flag: keyof FeatureFlags, enabled: boolean) => void;
  signOut: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setBridgeMode: (mode: BridgeMode) => void;
  toggleSidebar: () => void;
  setVin: (vin: string) => void;
  setEcuState: (ecuId: string, state: EcuScanState) => void;
  applyDtcResult: (result: EcuDtcResult) => void;
  resetScan: () => void;
  /** Returns the active job, creating one for the current VIN/user when needed. */
  ensureJob: (input: NewJobInput) => string;
  /** Closes the active job and opens a fresh one. */
  startNewJob: (input: NewJobInput) => string;
  appendEvent: (event: Omit<JobEvent, "id" | "at"> & { jobId?: string }) => string;
  updateJob: (jobId: string, patch: Partial<Omit<Job, "id" | "events">>) => void;
  closeJob: (jobId: string, patch?: Partial<Omit<Job, "id" | "events">>) => void;
  mergeJobs: (incoming: Job[]) => void;
};

const nameFromEmail = (email: string) => {
  const local = email.split("@")[0] ?? "technician";
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

/** No demo jobs: history only ever shows work actually performed on a real VIN. */
const seedJobs: Job[] = [];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      role: "senior",
      language: "en",
      workstation: {
        agentUrl: "ws://127.0.0.1:9097",
        dealerName: "ROX Dealer Workshop",
        dealerLogo: "",
        variant: "R11",
      },
      features: { configurationWrite: false },
      theme: "dark",
      bridgeMode: "simulator",
      sidebarCollapsed: false,
      vin: "",
      vinHistory: [],
      scan: {},
      scanDtcs: [],
      jobs: seedJobs,
      activeJobId: null,

      signIn: (email, cloud = false) => set({ user: { email, name: nameFromEmail(email), cloud } }),
      signOut: () => set({ user: null, activeJobId: null }),
      setRole: (role) => set({ role }),
      setLanguage: (language) => set({ language }),
      setWorkstation: (patch) => set({ workstation: { ...get().workstation, ...patch } }),
      setFeature: (flag, enabled) => set({ features: { ...get().features, [flag]: enabled } }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setBridgeMode: (bridgeMode) => set({ bridgeMode }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setVin: (raw) => {
        const vin = normalizeVin(raw);
        if (!isVinValid(vin)) {
          set({ vin });
          return;
        }
        set({
          vin,
          vinHistory: [vin, ...get().vinHistory.filter((entry) => entry !== vin)].slice(0, 8),
        });
      },

      setEcuState: (ecuId, state) => set({ scan: { ...get().scan, [ecuId]: state } }),

      applyDtcResult: (result) =>
        set({
          scanDtcs: [
            ...get().scanDtcs.filter((record) => record.ecuId !== result.ecuId),
            ...result.dtcs,
          ],
          scan: {
            ...get().scan,
            [result.ecuId]: {
              status: !result.responded ? "no-response" : result.dtcs.length > 0 ? "faults" : "ok",
              dtcCount: result.dtcs.length,
              scannedAt: new Date().toISOString(),
            },
          },
        }),

      resetScan: () => set({ scan: {}, scanDtcs: [] }),

      ensureJob: (input) => {
        const state = get();
        const active = state.jobs.find(
          (job) => job.id === state.activeJobId && job.status === "in-progress",
        );
        if (active) return active.id;

        const job: Job = {
          id: newJobId(),
          title: input.title,
          kind: input.kind,
          vin: normalizeVin(input.vin ?? state.vin) || "VIN NOT SET",
          technician: input.technician ?? state.user?.name ?? "Technician",
          createdAt: new Date().toISOString(),
          status: "in-progress",
          summary: "In progress",
          dtcTotal: 0,
          dtcCritical: 0,
          events: [],
        };
        set({ jobs: [job, ...state.jobs].slice(0, 60), activeJobId: job.id });
        void pushJob(job);
        return job.id;
      },

      startNewJob: (input) => {
        const { activeJobId, closeJob } = get();
        if (activeJobId) closeJob(activeJobId);
        return get().ensureJob(input);
      },

      appendEvent: ({ jobId, ...event }) => {
        const state = get();
        const targetId =
          jobId ?? state.activeJobId ?? get().ensureJob({ title: event.title, kind: "manual" });
        const record: JobEvent = { ...event, id: jobEventId(), at: new Date().toISOString() };

        set({
          jobs: get().jobs.map((job) =>
            job.id === targetId ? { ...job, events: [...job.events, record] } : job,
          ),
        });
        void pushJobEvent(targetId, record);
        const updated = get().jobs.find((job) => job.id === targetId);
        if (updated) void pushJob(updated);
        return record.id;
      },

      updateJob: (jobId, patch) => {
        set({ jobs: get().jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job)) });
        const updated = get().jobs.find((job) => job.id === jobId);
        if (updated) void pushJob(updated);
      },

      closeJob: (jobId, patch) => {
        set({
          jobs: get().jobs.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  status: "completed",
                  endedAt: new Date().toISOString(),
                  ...patch,
                }
              : job,
          ),
          activeJobId: get().activeJobId === jobId ? null : get().activeJobId,
        });
        const updated = get().jobs.find((job) => job.id === jobId);
        if (updated) void pushJob(updated);
      },

      mergeJobs: (incoming) => {
        const byId = new Map<string, Job>();
        [...incoming, ...get().jobs].forEach((job) => {
          const existing = byId.get(job.id);
          if (!existing || job.events.length > existing.events.length) byId.set(job.id, job);
        });
        set({
          jobs: [...byId.values()]
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
            .slice(0, 60),
        });
      },
    }),
    {
      name: "rox-diagnostics",
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        role: state.role,
        language: state.language,
        workstation: state.workstation,
        features: state.features,
        theme: state.theme,
        bridgeMode: state.bridgeMode,
        sidebarCollapsed: state.sidebarCollapsed,
        vin: state.vin,
        vinHistory: state.vinHistory,
        scanDtcs: state.scanDtcs,
        jobs: state.jobs,
        activeJobId: state.activeJobId,
      }),
    },
  ),
);

export const technicianName = (): string => useAppStore.getState().user?.name ?? "Technician";
