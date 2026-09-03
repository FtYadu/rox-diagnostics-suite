import { Check, Loader2, ScanLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { VIN_LENGTH, checkVin, normalizeVin } from "./vin";

export type VinPickerProps = {
  value: string;
  onChange: (value: string) => void;
  /** Recently used VINs offered as one-tap chips. */
  recent?: string[];
  /** When provided, a "Read from vehicle" button asks the bridge for DID F190. */
  onReadFromVehicle?: () => Promise<string>;
  label?: string;
  hint?: string;
  autoFocus?: boolean;
  className?: string;
};

export function VinPicker({
  value,
  onChange,
  recent = [],
  onReadFromVehicle,
  label = "VIN",
  hint,
  autoFocus = false,
  className,
}: VinPickerProps) {
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const check = checkVin(value);
  const showError = touched && value.length > 0 && !check.ok;

  const readFromVehicle = async () => {
    if (!onReadFromVehicle) return;
    setReading(true);
    setReadError(null);
    try {
      const vin = await onReadFromVehicle();
      const parsed = checkVin(vin);
      if (!parsed.ok) {
        setReadError(`The vehicle returned "${vin || "no value"}" — enter the VIN manually.`);
        return;
      }
      onChange(parsed.vin);
      setTouched(true);
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "Could not read the VIN");
    } finally {
      setReading(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="vin-input">{label}</Label>
        <span className="text-[11px] text-muted-foreground numerals">
          {normalizeVin(value).length}/{VIN_LENGTH}
        </span>
      </div>

      <div className="flex gap-2">
        <Input
          id="vin-input"
          value={value}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          maxLength={VIN_LENGTH}
          placeholder="e.g. HJ4ABBHK4RN000080"
          aria-invalid={showError}
          aria-describedby="vin-help"
          onChange={(event) => onChange(normalizeVin(event.target.value))}
          onBlur={() => setTouched(true)}
          className="h-11 rounded-xl font-mono tracking-[0.12em] numerals"
        />
        {onReadFromVehicle && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void readFromVehicle()}
            disabled={reading}
            className="h-11 shrink-0 rounded-xl px-4"
          >
            {reading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ScanLine className="size-4" />
            )}
            <span className="hidden sm:inline">Read from vehicle</span>
          </Button>
        )}
      </div>

      <p id="vin-help" className="text-xs text-muted-foreground">
        {showError ? (
          <span className="text-destructive">{check.ok ? "" : check.error}</span>
        ) : readError ? (
          <span className="text-warning">{readError}</span>
        ) : check.ok ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <Check className="size-3.5" /> Valid VIN
          </span>
        ) : (
          (hint ?? "Type the 17-character VIN or read it from the gateway (DID F190).")
        )}
      </p>

      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-muted-foreground">Recent</span>
          {recent.slice(0, 6).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => {
                onChange(entry);
                setTouched(true);
              }}
              className={cn(
                "rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors hairline numerals",
                entry === normalizeVin(value)
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary/60 text-muted-foreground hover:bg-accent/40",
              )}
            >
              {entry}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
