import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BridgeMode, EcuDtcResult } from "@/features/bridge/types";
import { pushJob, pushJobEvent } from "@/features/jobs/job-cloud";
import { jobEventId, jobId as newJobId } from "@/features/jobs/types";
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

type AppState = {
  user: User | null;
  theme: Theme;
  bridgeMode: BridgeMode;
  sidebarCollapsed: boolean;
  vin: string;
  scan: Record<string, EcuScanState>;
  jobs: Job[];
  activeJobId: string | null;
  signIn: (email: string, cloud?: boolean) => void;
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

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const seedJobs: Job[] = [
  {
    id: "JOB-24817",
    title: "Full health scan",
    kind: "health-scan",
    vin: "HJ4ABBHK4RN000080",
    technician: "M. Halvorsen",
    createdAt: minutesAgo(42),
    endedAt: minutesAgo(38),
    status: "completed",
    summary: "41 ECUs scanned · 3 stored DTCs",
    dtcTotal: 3,
    dtcCritical: 1,
    events: [
      {
        id: "EVT-seed-1",
        kind: "scan",
        title: "Health scan started",
        detail: "Sequential 19 02 read across 41 control units",
        status: "info",
        at: minutesAgo(42),
      },
      {
        id: "EVT-seed-2",
        kind: "dtc-read",
        title: "3 stored DTCs found",
        detail: "ESC, IBCM, TBOX reported faults",
        status: "ok",
        at: minutesAgo(38),
      },
    ],
  },
  {
    id: "JOB-24812",
    title: "ADCU_MCU reflash 0.98",
    kind: "programming",
    vin: "HJ4ABBHK4RN000080",
    technician: "M. Halvorsen",
    createdAt: minutesAgo(300),
    endedAt: minutesAgo(288),
    status: "completed",
    summary: "MCU Reflash Flow 0.98 · 5 phases",
    dtcTotal: 0,
    dtcCritical: 0,
    events: [
      {
        id: "EVT-seed-3",
        kind: "programming",
        title: "MCU Reflash Flow 0.98 completed",
        detail: "5 phases · package MCU_0.98_release",
        status: "ok",
        at: minutesAgo(288),
      },
    ],
  },
  {
    id: "JOB-24803",
    title: "IBCM brake bleeding",
    kind: "service",
    vin: "HJ4ABBHK4RN000080",
    technician: "K. Lund",
    createdAt: minutesAgo(1560),
    endedAt: minutesAgo(1548),
    status: "completed",
    summary: "Service routine finished, no faults",
    dtcTotal: 0,
    dtcCritical: 0,
    events: [],
  },
  {
    id: "JOB-24798",
    title: "Clear all DTCs",
    kind: "clear-dtc",
    vin: "HJ4ABBHK4RN000080",
    technician: "K. Lund",
    createdAt: minutesAgo(1800),
    endedAt: minutesAgo(1798),
    status: "completed",
    summary: "7 codes cleared across 4 ECUs",
    dtcTotal: 7,
    dtcCritical: 2,
    events: [],
  },
  {
    id: "JOB-24791",
    title: "ACU write VIN",
    kind: "service",
    vin: "HJ4ABBHK4RN000080",
    technician: "A. Osei",
    createdAt: minutesAgo(3060),
    endedAt: minutesAgo(3054),
    status: "failed",
    summary: "Readback mismatch — aborted",
    dtcTotal: 0,
    dtcCritical: 0,
    events: [],
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
      activeJobId: null,

      signIn: (email, cloud = false) =>
        set({ user: { email, name: nameFromEmail(email), cloud } }),
      signOut: () => set({ user: null, activeJobId: null }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setBridgeMode: (bridgeMode) => set({ bridgeMode }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setVin: (vin) => set({ vin }),

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
          vin: input.vin ?? state.vin,
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
          jobId ??
          state.activeJobId ??
          get().ensureJob({ title: event.title, kind: "manual" });
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
        theme: state.theme,
        bridgeMode: state.bridgeMode,
        sidebarCollapsed: state.sidebarCollapsed,
        vin: state.vin,
        jobs: state.jobs,
        activeJobId: state.activeJobId,
      }),
    },
  ),
);

export const technicianName = (): string => useAppStore.getState().user?.name ?? "Technician";
