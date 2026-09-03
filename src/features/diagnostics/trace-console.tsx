import { ChevronDown, Terminal } from "lucide-react";
import { useEffect, useRef } from "react";
import type { TraceLine } from "@/features/bridge/types";
import { cn } from "@/lib/utils";

const PREFIX: Record<TraceLine["direction"], string> = {
  tx: "Tx",
  rx: "Rx",
  info: "--",
};

const TONE: Record<TraceLine["direction"], string> = {
  tx: "text-primary",
  rx: "text-success",
  info: "text-muted-foreground",
};

export function TraceConsole({
  trace,
  open,
  onToggle,
  className,
}: {
  trace: TraceLine[];
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [trace.length, open]);

  return (
    <div className={cn("glass-chrome border-t", className)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Terminal className="size-4" />
        Trace
        <span className="numerals">({trace.length})</span>
        <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="max-h-52 overflow-y-auto bg-background/60 px-4 pb-4">
          {trace.length === 0 && (
            <p className="py-2 font-mono text-[11px] text-muted-foreground">
              Waiting for UDS traffic…
            </p>
          )}
          {trace.map((line) => (
            <p key={line.id} className="font-mono text-[11px] leading-5">
              <span className="text-muted-foreground/70">
                {new Date(line.at).toLocaleTimeString()}
              </span>{" "}
              <span className={TONE[line.direction]}>{PREFIX[line.direction]}</span>{" "}
              <span className="text-foreground/90">{line.text}</span>
            </p>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
