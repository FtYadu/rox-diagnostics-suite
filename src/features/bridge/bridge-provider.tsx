import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useAppStore } from "@/store/app-store";
import { LocalBridge } from "./local-bridge";
import { SimulatorBridge } from "./simulator-bridge";
import type { BridgeStatus, ConnectionInfo, DiagnosticBridge } from "./types";

type BridgeContextValue = {
  bridge: DiagnosticBridge;
  status: BridgeStatus;
  connection: ConnectionInfo | null;
  usingFallback: boolean;
  error: string | null;
  reconnect: () => void;
};

const BridgeContext = createContext<BridgeContextValue | null>(null);

export function BridgeProvider({ children }: { children: ReactNode }) {
  const bridgeMode = useAppStore((s) => s.bridgeMode);
  const simulator = useRef(new SimulatorBridge());
  const localRef = useRef<LocalBridge | null>(null);
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [activeBridge, setActiveBridge] = useState<DiagnosticBridge>(simulator.current);

  const reconnect = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;
    setStatus("connecting");
    setError(null);

    const fallbackToSimulator = async (reason: string) => {
      if (cancelled) return;
      setError(reason);
      setUsingFallback(true);
      const info = await simulator.current.connect();
      if (cancelled) return;
      setActiveBridge(simulator.current);
      setConnection({ ...info, vciName: "Simulator fallback" });
      setStatus("offline");
      // Keep probing for the hardware agent so plugging in the VCI recovers on its own.
      retry = setTimeout(() => {
        if (!cancelled) void connectLocal();
      }, 5000);
    };

    const connectLocal = async () => {
      unsubscribe?.();
      localRef.current?.close();
      const local = new LocalBridge();
      localRef.current = local;
      try {
        const info = await local.connect();
        if (cancelled) {
          local.close();
          return;
        }
        unsubscribe = local.subscribe((event) => {
          if (cancelled) return;
          if (event.type === "status") {
            setConnection(event.info);
            return;
          }
          void fallbackToSimulator(event.reason);
        });
        setActiveBridge(local);
        setConnection(info);
        setUsingFallback(false);
        setError(null);
        setStatus("connected");
      } catch (cause) {
        local.close();
        await fallbackToSimulator(
          cause instanceof Error ? cause.message : "Local bridge unavailable",
        );
      }
    };

    const run = async () => {
      if (bridgeMode === "local") {
        await connectLocal();
        return;
      }

      localRef.current?.close();
      localRef.current = null;
      const info = await simulator.current.connect();
      if (cancelled) return;
      setActiveBridge(simulator.current);
      setConnection(info);
      setUsingFallback(false);
      setStatus("connected");
    };

    void run();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      unsubscribe?.();
      localRef.current?.close();
      localRef.current = null;
    };
  }, [bridgeMode, attempt]);

  const value = useMemo<BridgeContextValue>(
    () => ({ bridge: activeBridge, status, connection, usingFallback, error, reconnect }),
    [activeBridge, status, connection, usingFallback, error, reconnect],
  );

  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

export function useBridge(): BridgeContextValue {
  const context = useContext(BridgeContext);
  if (!context) throw new Error("useBridge must be used inside BridgeProvider");
  return context;
}
